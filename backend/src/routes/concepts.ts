import { Hono } from "hono";
import type { Env, Domain } from "../types";
import {
  getConceptById,
  listConcepts,
  getPrerequisiteTree,
  getUnlockedConcepts,
  getResourcesForConcept,
  searchConcepts,
  slugify,
  conceptExists,
  wouldCreateCycle,
  createConcept,
  addPrerequisite,
  addResource,
} from "../db/queries";

export const conceptsRoute = new Hono<{ Bindings: Env }>();

/** GET /api/concepts?domain=Mathematics&q=gradient */
conceptsRoute.get("/", async (c) => {
  const domain = c.req.query("domain");
  const q = c.req.query("q");

  const concepts = q ? await searchConcepts(c.env, q) : await listConcepts(c.env, domain);
  return c.json({ concepts });
});

/** GET /api/concepts/:id, single-hop concept detail */
conceptsRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const concept = await getConceptById(c.env, id);
  if (!concept) {
    return c.json({ error: "NOT_FOUND", message: `No concept with id "${id}"` }, 404);
  }
  return c.json({ concept });
});

/** GET /api/concepts/:id/prerequisites?hops=4, multi-hop prerequisite tree */
conceptsRoute.get("/:id/prerequisites", async (c) => {
  const id = c.req.param("id");
  const hops = clampHops(c.req.query("hops"));
  const prerequisites = await getPrerequisiteTree(c.env, id, hops);
  return c.json({ conceptId: id, hops, prerequisites });
});

/** GET /api/concepts/:id/unlocks?hops=4, reverse multi-hop traversal */
conceptsRoute.get("/:id/unlocks", async (c) => {
  const id = c.req.param("id");
  const hops = clampHops(c.req.query("hops"));
  const unlocks = await getUnlockedConcepts(c.env, id, hops);
  return c.json({ conceptId: id, hops, unlocks });
});

/** GET /api/concepts/:id/resources */
conceptsRoute.get("/:id/resources", async (c) => {
  const id = c.req.param("id");
  const resources = await getResourcesForConcept(c.env, id);
  return c.json({ conceptId: id, resources });
});

const DOMAINS: Domain[] = [
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "Computer Science",
  "Design",
];
const DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;
const RESOURCE_TYPES = ["note", "test", "article", "video", "course"] as const;

/** POST /api/concepts, add a concept, optionally with prerequisites */
conceptsRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json({ error: "BAD_REQUEST", message: "Expected a JSON body." }, 400);
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const domain = body.domain;
  const difficulty = body.difficulty;
  const prerequisiteIds: unknown = body.prerequisiteIds ?? [];

  if (name.length < 2 || name.length > 80) {
    return c.json({ error: "BAD_REQUEST", message: "Name must be 2–80 characters." }, 400);
  }
  if (description.length < 10 || description.length > 400) {
    return c.json({ error: "BAD_REQUEST", message: "Description must be 10–400 characters." }, 400);
  }
  if (!DOMAINS.includes(domain)) {
    return c.json({ error: "BAD_REQUEST", message: `Domain must be one of: ${DOMAINS.join(", ")}.` }, 400);
  }
  if (!DIFFICULTIES.includes(difficulty)) {
    return c.json({ error: "BAD_REQUEST", message: `Difficulty must be one of: ${DIFFICULTIES.join(", ")}.` }, 400);
  }
  if (!Array.isArray(prerequisiteIds) || prerequisiteIds.some((p) => typeof p !== "string")) {
    return c.json({ error: "BAD_REQUEST", message: "prerequisiteIds must be an array of strings." }, 400);
  }

  const id = slugify(name);
  if (!id) {
    return c.json({ error: "BAD_REQUEST", message: "Name must contain at least one letter or number." }, 400);
  }
  if (await conceptExists(c.env, id)) {
    return c.json(
      { error: "ALREADY_EXISTS", message: `A concept called "${name}" already exists.` },
      409
    );
  }

  // Reject unknown prerequisites up front rather than silently dropping the
  // edges, MATCH would just not match and the caller would never know.
  for (const prereqId of prerequisiteIds as string[]) {
    if (!(await conceptExists(c.env, prereqId))) {
      return c.json(
        { error: "BAD_REQUEST", message: `Unknown prerequisite: "${prereqId}".` },
        400
      );
    }
  }

  const concept = await createConcept(c.env, {
    name,
    description,
    domain,
    difficulty,
    prerequisiteIds: prerequisiteIds as string[],
  });

  return c.json({ concept }, 201);
});

/** POST /api/concepts/:id/prerequisites, link two existing concepts */
conceptsRoute.post("/:id/prerequisites", async (c) => {
  const conceptId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const prereqId = body && typeof body.prerequisiteId === "string" ? body.prerequisiteId : "";

  if (!prereqId) {
    return c.json({ error: "BAD_REQUEST", message: "prerequisiteId is required." }, 400);
  }
  if (!(await conceptExists(c.env, conceptId)) || !(await conceptExists(c.env, prereqId))) {
    return c.json({ error: "NOT_FOUND", message: "Both concepts must exist." }, 404);
  }
  if (await wouldCreateCycle(c.env, conceptId, prereqId)) {
    return c.json(
      {
        error: "WOULD_CREATE_CYCLE",
        message:
          "That link would create a circular prerequisite. The target already depends on this concept.",
      },
      409
    );
  }

  await addPrerequisite(c.env, conceptId, prereqId);
  return c.json({ conceptId, prerequisiteId: prereqId }, 201);
});

/** POST /api/concepts/:id/resources, attach a note/test/article */
conceptsRoute.post("/:id/resources", async (c) => {
  const conceptId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json({ error: "BAD_REQUEST", message: "Expected a JSON body." }, 400);
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const type = body.type;

  if (title.length < 2 || title.length > 120) {
    return c.json({ error: "BAD_REQUEST", message: "Title must be 2–120 characters." }, 400);
  }
  if (!/^https?:\/\/\S+$/i.test(url)) {
    return c.json({ error: "BAD_REQUEST", message: "URL must start with http:// or https://." }, 400);
  }
  if (!RESOURCE_TYPES.includes(type)) {
    return c.json({ error: "BAD_REQUEST", message: `Type must be one of: ${RESOURCE_TYPES.join(", ")}.` }, 400);
  }
  if (!(await conceptExists(c.env, conceptId))) {
    return c.json({ error: "NOT_FOUND", message: `No concept with id "${conceptId}".` }, 404);
  }

  const resource = await addResource(c.env, conceptId, { title, url, type });
  return c.json({ resource }, 201);
});

/** Clamp the requested hop count to a sane [1, 6] range, this value is
 * interpolated directly into the Cypher variable-length pattern (Cypher has
 * no way to parameterize `*1..N`), so we must validate it ourselves rather
 * than trust the query string. */
function clampHops(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "4", 10);
  if (Number.isNaN(n)) return 4;
  return Math.min(Math.max(n, 1), 6);
}
