/**
 * Parameterized openCypher query library.
 *
 * Every query here uses Cypher parameters ($foo) rather than string
 * interpolation — this is what makes them injection-safe, and it's also
 * what lets CognoDB cache query plans across calls.
 */
import type { Session } from "neo4j-driver";
import { withSession } from "./driver";
import type { Env, ConceptNode, ResourceNode, GraphOverviewResponse } from "../types";

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
// 1. Full graph overview — powers the interactive canvas.
// ---------------------------------------------------------------------------
export async function getGraphOverview(env: Env): Promise<GraphOverviewResponse> {
  return withSession(env, async (session: Session) => {
    const result = await session.run(
      `
      MATCH (n:Concept)
      OPTIONAL MATCH (n)-[r:REQUIRES]->(m:Concept)
      RETURN n, r, m
      LIMIT 200
      `
    );

    const nodesById = new Map<string, GraphOverviewResponse["nodes"][number]>();
    const edges: GraphOverviewResponse["edges"] = [];

    for (const record of result.records) {
      const n = record.get("n");
      const c = toConcept(n);
      nodesById.set(c.id, { ...c, label: "Concept" });

      const m = record.get("m");
      const r = record.get("r");
      if (m && r) {
        const target = toConcept(m);
        nodesById.set(target.id, { ...target, label: "Concept" });
        edges.push({ source: c.id, target: target.id, type: "REQUIRES" });
      }
    }

    // Pull in Resource nodes and their TEACHES edges too, so the canvas can
    // render the whole ecosystem, not just the prerequisite backbone.
    const resourceResult = await session.run(
      `
      MATCH (c:Concept)-[:TEACHES]->(res:Resource)
      RETURN c.id AS conceptId, res AS resource
      LIMIT 200
      `
    );
    for (const record of resourceResult.records) {
      const res = toResource(record.get("resource"));
      nodesById.set(res.id, { ...res, label: "Resource" });
      edges.push({ source: record.get("conceptId"), target: res.id, type: "TEACHES" });
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
 * Shortest study route from where a learner is now (`sourceId`) to what they
 * want to learn (`targetId`), returned in the order they should study it.
 *
 * Note the direction flip. `REQUIRES` points from an advanced concept *down*
 * to its prerequisite (Quantum Mechanics -[:REQUIRES]-> Linear Algebra), so a
 * learner's forward journey runs against the arrows. We therefore traverse
 * from the goal down to their starting point and `reverse()` the result, which
 * yields a path reading source -> ... -> target. Traversing source -> target
 * directly would only ever match when the caller passed the advanced concept
 * as the source — i.e. it would fail for exactly the intuitive input.
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
