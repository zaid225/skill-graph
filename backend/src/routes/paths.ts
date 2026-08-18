import { Hono } from "hono";
import type { Env } from "../types";
import { getShortestLearningPath } from "../db/queries";

export const pathsRoute = new Hono<{ Bindings: Env }>();

/** GET /api/paths/shortest?source=<id>&target=<id> */
pathsRoute.get("/shortest", async (c) => {
  const source = c.req.query("source");
  const target = c.req.query("target");

  if (!source || !target) {
    return c.json(
      { error: "BAD_REQUEST", message: "Both `source` and `target` query params are required." },
      400
    );
  }

  if (source === target) {
    return c.json(
      { error: "BAD_REQUEST", message: "`source` and `target` must be different concepts." },
      400
    );
  }

  const path = await getShortestLearningPath(c.env, source, target);
  if (!path) {
    return c.json(
      {
        error: "NO_PATH_FOUND",
        message: `No learning path exists from "${source}" to "${target}" via REQUIRES relationships.`,
      },
      404
    );
  }

  return c.json({ source, target, hops: path.length - 1, path });
});
