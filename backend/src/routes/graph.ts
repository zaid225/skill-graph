import { Hono } from "hono";
import type { Env } from "../types";
import { getGraphOverview } from "../db/queries";

export const graphRoute = new Hono<{ Bindings: Env }>();

/** GET /api/graph/overview — full graph dump for the interactive canvas */
graphRoute.get("/overview", async (c) => {
  const overview = await getGraphOverview(c.env);
  return c.json(overview);
});
