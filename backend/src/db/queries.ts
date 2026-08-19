/*
 * openCypher queries. Everything is passed as a Cypher parameter ($foo) rather
 * than interpolated, which keeps them injection-safe and lets CognoDB reuse
 * query plans.
 */
import type { Session } from "neo4j-driver";
import { withSession, withWriteSession } from "./driver";
import type { Env, ConceptNode, ResourceNode, GraphOverviewResponse, Domain } from "../types";

function toConcept(node: any): ConceptNode {
  const p = node.properties;
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    domain: p.domain,
    difficulty: p.difficulty,
  };
}

function toResource(node: any): ResourceNode {
  const p = node.properties;
  return { id: p.id, title: p.title, url: p.url, type: p.type };
}

// ---------------------------------------------------------------------------
// 1. Full graph overview, powers the interactive canvas.
// ---------------------------------------------------------------------------
export async function getGraphOverview(env: Env): Promise<GraphOverviewResponse> {
  return withSession(env, async (session: Session) => {
    // Nodes and edges are fetched separately on purpose. Doing it in one
    // MATCH + OPTIONAL MATCH returns a row per edge, so a LIMIT there counts
    // rows rather than nodes and starts dropping concepts mid-way once the
    // graph grows past the cap.
    const nodesById = new Map<string, GraphOverviewResponse["nodes"][number]>();
    const edges: GraphOverviewResponse["edges"] = [];

    const conceptRows = await session.run(`MATCH (c:Concept) RETURN c LIMIT 1000`);
    for (const record of conceptRows.records) {
      const c = toConcept(record.get("c"));
      nodesById.set(c.id, { ...c, label: "Concept" });
    }

    const resourceRows = await session.run(`MATCH (r:Resource) RETURN r LIMIT 1000`);
    for (const record of resourceRows.records) {
      const r = toResource(record.get("r"));
      nodesById.set(r.id, { ...r, label: "Resource" });
    }

    const edgeRows = await session.run(
      `
      MATCH (a:Concept)-[rel:REQUIRES|TEACHES]->(b)
      RETURN a.id AS source, b.id AS target, type(rel) AS type
      LIMIT 4000
      `
    );
    for (const record of edgeRows.records) {
      const source = record.get("source");
      const target = record.get("target");
      // Skip dangling edges rather than handing the canvas a link whose
      // endpoint was cut off by the node limits above.
      if (!nodesById.has(source) || !nodesById.has(target)) continue;
      edges.push({ source, target, type: record.get("type") });
    }

    return { nodes: Array.from(nodesById.values()), edges };
  });
}

// ---------------------------------------------------------------------------
// 2. Single-hop concept detail.
// ---------------------------------------------------------------------------
export async function getConceptById(env: Env, conceptId: string): Promise<ConceptNode | null> {
  return withSession(env, async (session) => {
    const result = await session.run(
      `MATCH (c:Concept {id: $conceptId}) RETURN c LIMIT 1`,
      { conceptId }
    );
    if (result.records.length === 0) return null;
    return toConcept(result.records[0].get("c"));
  });
}

export async function listConcepts(env: Env, domain?: string): Promise<ConceptNode[]> {
  return withSession(env, async (session) => {
    const result = await session.run(
      `
      MATCH (c:Concept)
      WHERE $domain IS NULL OR c.domain = $domain
      RETURN c
      ORDER BY c.name
      `,
      { domain: domain ?? null }
    );
    return result.records.map((r) => toConcept(r.get("c")));
  });
}

// ---------------------------------------------------------------------------
// 3. Multi-hop prerequisite tree (>= 2 hops).
// ---------------------------------------------------------------------------
export interface PrerequisiteEntry extends ConceptNode {
  hopDistance: number;
}

export async function getPrerequisiteTree(
  env: Env,
  conceptId: string,
  maxHops = 4
): Promise<PrerequisiteEntry[]> {
  return withSession(env, async (session) => {
    const result = await session.run(
      `
      MATCH path = (c:Concept {id: $conceptId})-[:REQUIRES*1..${maxHops}]->(prereq:Concept)
      RETURN prereq, min(length(path)) AS hopDistance
      ORDER BY hopDistance ASC, prereq.name ASC
      `,
      { conceptId }
    );
    return result.records.map((r) => ({
      ...toConcept(r.get("prereq")),
      hopDistance: r.get("hopDistance"),
    }));
  });
}

export async function getUnlockedConcepts(
  env: Env,
  conceptId: string,
  maxHops = 4
): Promise<PrerequisiteEntry[]> {
  return withSession(env, async (session) => {
    const result = await session.run(
      `
      MATCH path = (c:Concept {id: $conceptId})<-[:REQUIRES*1..${maxHops}]-(dependent:Concept)
      RETURN dependent, min(length(path)) AS hopDistance
      ORDER BY hopDistance ASC, dependent.name ASC
      `,
      { conceptId }
    );
    return result.records.map((r) => ({
      ...toConcept(r.get("dependent")),
      hopDistance: r.get("hopDistance"),
    }));
  });
}

// ---------------------------------------------------------------------------
// 4. Shortest learning path between two arbitrary concepts.
//    This is the canonical "graph-native, awkward-in-SQL" query: computing
//    shortestPath in relational SQL would require a recursive CTE with
//    manual cycle-guarding and no native shortest-path primitive.
// ---------------------------------------------------------------------------
export interface LearningPathStep {
  concept: ConceptNode;
  hop: number;
}

/**
 * Shortest study route from what a learner knows (sourceId) to what they want
 * to learn (targetId), in the order they should study it.
 *
 * Watch the direction. REQUIRES points from an advanced concept down to its
 * prerequisite, so the learner's forward journey runs against the arrows. We
 * traverse goal -> start and reverse the result. Matching source -> target
 * directly only works if the caller passes the advanced concept as the source,
 * i.e. it fails on exactly the input people expect to give it.
 */
export async function getShortestLearningPath(
  env: Env,
  sourceId: string,
  targetId: string
): Promise<LearningPathStep[] | null> {
  return withSession(env, async (session) => {
    const result = await session.run(
      `
      MATCH (start:Concept {id: $sourceId}), (target:Concept {id: $targetId})
      MATCH p = shortestPath((target)-[:REQUIRES*..10]->(start))
      RETURN [n IN reverse(nodes(p)) | n] AS pathNodes
      `,
      { sourceId, targetId }
    );

    if (result.records.length === 0) return null;
    const pathNodes: any[] = result.records[0].get("pathNodes");
    return pathNodes.map((n, i) => ({ concept: toConcept(n), hop: i }));
  });
}

// ---------------------------------------------------------------------------
// 5. Learning resources (notes/tests) attached to a concept.
// ---------------------------------------------------------------------------
export async function getResourcesForConcept(env: Env, conceptId: string): Promise<ResourceNode[]> {
  return withSession(env, async (session) => {
    const result = await session.run(
      `MATCH (c:Concept {id: $conceptId})-[:TEACHES]->(res:Resource) RETURN res`,
      { conceptId }
    );
    return result.records.map((r) => toResource(r.get("res")));
  });
}

export async function searchConcepts(env: Env, query: string): Promise<ConceptNode[]> {
  return withSession(env, async (session) => {
    const result = await session.run(
      `
      MATCH (c:Concept)
      WHERE toLower(c.name) CONTAINS toLower($query)
         OR toLower(c.description) CONTAINS toLower($query)
      RETURN c
      ORDER BY c.name
      LIMIT 20
      `,
      { query }
    );
    return result.records.map((r) => toConcept(r.get("c")));
  });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Turns "Discrete Mathematics" into "discrete-mathematics". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function conceptExists(env: Env, id: string): Promise<boolean> {
  return withSession(env, async (session) => {
    const r = await session.run(`MATCH (c:Concept {id: $id}) RETURN count(c) AS n`, { id });
    return r.records[0].get("n") > 0;
  });
}

/**
 * Would adding (concept)-[:REQUIRES]->(prereq) close a loop? A curriculum
 * where A needs B and B needs A is unlearnable, so we reject it up front.
 * The question is just whether prereq can already reach concept, which is a
 * variable-length path check.
 *
 * Uses OPTIONAL MATCH + count() rather than the more obvious
 * EXISTS((prereq)-[:REQUIRES*]->(concept)). On CognoDB 0.9.x, EXISTS() ignores
 * the already-bound prereq/concept and returns true whenever any REQUIRES path
 * exists anywhere, which rejects every legitimate link. Both EXISTS(pattern)
 * and EXISTS { ... } behave this way.
 */
export async function wouldCreateCycle(
  env: Env,
  conceptId: string,
  prereqId: string
): Promise<boolean> {
  if (conceptId === prereqId) return true;
  return withSession(env, async (session) => {
    const r = await session.run(
      `
      MATCH (prereq:Concept {id: $prereqId})
      OPTIONAL MATCH path = (prereq)-[:REQUIRES*1..]->(concept:Concept {id: $conceptId})
      RETURN count(path) > 0 AS wouldCycle
      `,
      { conceptId, prereqId }
    );
    return r.records.length > 0 && r.records[0].get("wouldCycle") === true;
  });
}

export interface NewConcept {
  name: string;
  description: string;
  domain: Domain;
  difficulty: ConceptNode["difficulty"];
  prerequisiteIds: string[];
}

/**
 * Creates a concept and its prerequisite edges in one transaction so a partial
 * failure can't leave the node stranded without them. No cycle check needed:
 * nothing points at a brand-new node yet, so its outgoing edges can't close a
 * loop.
 */
export async function createConcept(env: Env, input: NewConcept): Promise<ConceptNode> {
  const id = slugify(input.name);

  return withWriteSession(env, async (session) => {
    return session.executeWrite(async (tx) => {
      const created = await tx.run(
        `
        CREATE (c:Concept {
          id: $id, name: $name, description: $description,
          domain: $domain, difficulty: $difficulty
        })
        RETURN c
        `,
        {
          id,
          name: input.name.trim(),
          description: input.description.trim(),
          domain: input.domain,
          difficulty: input.difficulty,
        }
      );

      if (input.prerequisiteIds.length > 0) {
        await tx.run(
          `
          MATCH (c:Concept {id: $id})
          UNWIND $prerequisiteIds AS prereqId
          MATCH (p:Concept {id: prereqId})
          MERGE (c)-[:REQUIRES]->(p)
          `,
          { id, prerequisiteIds: input.prerequisiteIds }
        );
      }

      return toConcept(created.records[0].get("c"));
    });
  });
}

/** Links an existing concept to an existing prerequisite. Caller must have
 * already run wouldCreateCycle. MERGE keeps the edge idempotent. */
export async function addPrerequisite(env: Env, conceptId: string, prereqId: string): Promise<void> {
  await withWriteSession(env, async (session) => {
    await session.run(
      `
      MATCH (c:Concept {id: $conceptId}), (p:Concept {id: $prereqId})
      MERGE (c)-[:REQUIRES]->(p)
      `,
      { conceptId, prereqId }
    );
  });
}

export interface NewResource {
  title: string;
  url: string;
  type: ResourceNode["type"];
}

export async function addResource(
  env: Env,
  conceptId: string,
  input: NewResource
): Promise<ResourceNode> {
  const id = `res-${slugify(input.title)}-${Date.now().toString(36)}`;

  return withWriteSession(env, async (session) => {
    const r = await session.run(
      `
      MATCH (c:Concept {id: $conceptId})
      CREATE (res:Resource {id: $id, title: $title, url: $url, type: $type})
      CREATE (c)-[:TEACHES]->(res)
      RETURN res
      `,
      { conceptId, id, title: input.title.trim(), url: input.url.trim(), type: input.type }
    );
    return toResource(r.records[0].get("res"));
  });
}

/**
 * Which concepts can be used at each end of a path search involving this one?
 *
 * Lets the UI grey out impossible pairings instead of letting someone pick a
 * combination and get a dead end. Bounds match getShortestLearningPath, so a
 * pair the picker offers is always a pair the path query can actually solve.
 *
 * validTargets: goals reachable if the learner already knows this concept,
 * i.e. everything that transitively requires it.
 * validSources: starting points that lead here if this concept is the goal,
 * i.e. everything it transitively requires.
 */
export async function getReachability(
  env: Env,
  conceptId: string
): Promise<{ validTargets: string[]; validSources: string[] }> {
  return withSession(env, async (session) => {
    const result = await session.run(
      `
      MATCH (c:Concept {id: $conceptId})
      OPTIONAL MATCH (dependent:Concept)-[:REQUIRES*1..10]->(c)
      WITH c, collect(DISTINCT dependent.id) AS validTargets
      OPTIONAL MATCH (c)-[:REQUIRES*1..10]->(prereq:Concept)
      RETURN validTargets, collect(DISTINCT prereq.id) AS validSources
      `,
      { conceptId }
    );
    if (result.records.length === 0) return { validTargets: [], validSources: [] };
    const row = result.records[0];
    return {
      validTargets: (row.get("validTargets") as string[]).filter(Boolean),
      validSources: (row.get("validSources") as string[]).filter(Boolean),
    };
  });
}

export interface ConceptUpdate {
  name?: string;
  description?: string;
  domain?: Domain;
  difficulty?: ConceptNode["difficulty"];
}

/**
 * Updates a concept's display fields. The id is deliberately left alone even
 * when the name changes: it is the key every REQUIRES and TEACHES edge points
 * at, so re-slugging a rename would orphan the node's relationships.
 */
export async function updateConcept(
  env: Env,
  conceptId: string,
  fields: ConceptUpdate
): Promise<ConceptNode | null> {
  return withWriteSession(env, async (session) => {
    const result = await session.run(
      `
      MATCH (c:Concept {id: $conceptId})
      SET c.name        = coalesce($name, c.name),
          c.description = coalesce($description, c.description),
          c.domain      = coalesce($domain, c.domain),
          c.difficulty  = coalesce($difficulty, c.difficulty)
      RETURN c
      `,
      {
        conceptId,
        name: fields.name ?? null,
        description: fields.description ?? null,
        domain: fields.domain ?? null,
        difficulty: fields.difficulty ?? null,
      }
    );
    if (result.records.length === 0) return null;
    return toConcept(result.records[0].get("c"));
  });
}

/** Removes a concept along with its edges and any resources only it taught. */
export async function deleteConcept(env: Env, conceptId: string): Promise<void> {
  await withWriteSession(env, async (session) => {
    await session.executeWrite(async (tx) => {
      // Resources exist to teach a concept, so one left with no concept is
      // unreachable in the UI. Clean those up rather than leaking orphans.
      await tx.run(
        `
        MATCH (c:Concept {id: $conceptId})-[:TEACHES]->(res:Resource)
        WHERE NOT EXISTS { MATCH (other:Concept)-[:TEACHES]->(res) WHERE other.id <> $conceptId }
        DETACH DELETE res
        `,
        { conceptId }
      );
      await tx.run(`MATCH (c:Concept {id: $conceptId}) DETACH DELETE c`, { conceptId });
    });
  });
}

export async function removePrerequisite(
  env: Env,
  conceptId: string,
  prereqId: string
): Promise<void> {
  await withWriteSession(env, async (session) => {
    await session.run(
      `
      MATCH (c:Concept {id: $conceptId})-[r:REQUIRES]->(p:Concept {id: $prereqId})
      DELETE r
      `,
      { conceptId, prereqId }
    );
  });
}

export interface ResourceUpdate {
  title?: string;
  url?: string;
  type?: ResourceNode["type"];
}

export async function updateResource(
  env: Env,
  resourceId: string,
  fields: ResourceUpdate
): Promise<ResourceNode | null> {
  return withWriteSession(env, async (session) => {
    const result = await session.run(
      `
      MATCH (res:Resource {id: $resourceId})
      SET res.title = coalesce($title, res.title),
          res.url   = coalesce($url, res.url),
          res.type  = coalesce($type, res.type)
      RETURN res
      `,
      {
        resourceId,
        title: fields.title ?? null,
        url: fields.url ?? null,
        type: fields.type ?? null,
      }
    );
    if (result.records.length === 0) return null;
    return toResource(result.records[0].get("res"));
  });
}

export async function deleteResource(env: Env, resourceId: string): Promise<void> {
  await withWriteSession(env, async (session) => {
    await session.run(`MATCH (res:Resource {id: $resourceId}) DETACH DELETE res`, { resourceId });
  });
}

export async function resourceExists(env: Env, resourceId: string): Promise<boolean> {
  return withSession(env, async (session) => {
    const r = await session.run(`MATCH (res:Resource {id: $resourceId}) RETURN count(res) AS n`, {
      resourceId,
    });
    return r.records[0].get("n") > 0;
  });
}
