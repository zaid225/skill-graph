import { Hono } from "hono";
import type { Env } from "../types";
import {
  getConceptById,
  listConcepts,
  getPrerequisiteTree,
  getUnlockedConcepts,
  getResourcesForConcept,
  searchConcepts,
} from "../db/queries";

export const conceptsRoute = new Hono<{ Bindings: Env }>();

/** GET /api/concepts?domain=Mathematics&q=gradient */
conceptsRoute.get("/", async (c) => {
  const domain = c.req.query("domain");
  const q = c.req.query("q");

  const concepts = q ? await searchConcepts(c.env, q) : await listConcepts(c.env, domain);
  return c.json({ concepts });
});

/** GET /api/concepts/:id — single-hop concept detail */
conceptsRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const concept = await getConceptById(c.env, id);
  if (!concept) {
    return c.json({ error: "NOT_FOUND", message: `No concept with id "${id}"` }, 404);
  }
  return c.json({ concept });
});

/** GET /api/concepts/:id/prerequisites?hops=4 — multi-hop prerequisite tree */
conceptsRoute.get("/:id/prerequisites", async (c) => {
  const id = c.req.param("id");
  const hops = clampHops(c.req.query("hops"));
  const prerequisites = await getPrerequisiteTree(c.env, id, hops);
  return c.json({ conceptId: id, hops, prerequisites });
});

/** GET /api/concepts/:id/unlocks?hops=4 — reverse multi-hop traversal */
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

/** Clamp the requested hop count to a sane [1, 6] range — this value is
 * interpolated directly into the Cypher variable-length pattern (Cypher has
 * no way to parameterize `*1..N`), so we must validate it ourselves rather
 * than trust the query string. */
function clampHops(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "4", 10);
  if (Number.isNaN(n)) return 4;
  return Math.min(Math.max(n, 1), 6);
}
