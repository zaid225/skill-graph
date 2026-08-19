import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { DatabaseUnavailableError } from "./db/driver";
import { conceptsRoute } from "./routes/concepts";
import { pathsRoute } from "./routes/paths";
import { graphRoute } from "./routes/graph";

const app = new Hono<{ Bindings: Env }>();

app.use(
  "*",
  cors({
    origin: "*", // tighten to your deployed frontend origin in production
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  })
);

app.get("/", (c) =>
  c.json({
    service: "skillgraph-backend",
    status: "ok",
    routes: ["/api/concepts", "/api/paths", "/api/graph/overview", "/api/health"],
  })
);

/** Lightweight connectivity probe the frontend polls to drive the status banner. */
app.get("/api/health", async (c) => {
  try {
    const { getConceptById } = await import("./db/queries");
    // Cheapest possible query: look up a concept that may or may not exist.
    // A successful round-trip (hit or miss) proves connectivity either way.
    await getConceptById(c.env, "__healthcheck__");
    return c.json({ status: "connected" });
  } catch (err) {
    if (err instanceof DatabaseUnavailableError) {
      return c.json({ status: "disconnected", message: err.message }, 503);
    }
    return c.json({ status: "disconnected", message: "Unknown error" }, 503);
  }
});

app.route("/api/concepts", conceptsRoute);
app.route("/api/paths", pathsRoute);
app.route("/api/graph", graphRoute);

/** Global error handler, translates DB connectivity failures into a
 * structured 503 the frontend recognizes and renders as a recovery banner,
 * instead of letting the Worker crash with a 500. */
app.onError((err, c) => {
  if (err instanceof DatabaseUnavailableError && err.cause) {
    // Log the underlying driver error too, DatabaseUnavailableError's own
    // message is intentionally generic for API consumers, but the cause
    // (e.g. "Failed to establish connection in 10000ms") is what actually
    // tells you whether this is bad credentials, a paused instance, or a
    // network/firewall issue between the Worker and CognoDB.
    const cause = err.cause as { message?: string; code?: string; name?: string };
    console.error(`${err.message} cause: ${cause?.name ?? "Error"}: ${cause?.message ?? cause} (code=${cause?.code})`);
  } else {
    console.error(err);
  }

  if (err instanceof DatabaseUnavailableError) {
    return c.json(
      {
        error: "DATABASE_UNAVAILABLE",
        message:
          "CognoDB is unreachable right now. It may be paused, misconfigured, or the credentials are invalid. Please try again shortly.",
      },
      503
    );
  }

  return c.json(
    { error: "INTERNAL_ERROR", message: "Something went wrong processing your request." },
    500
  );
});

app.notFound((c) =>
  c.json({ error: "NOT_FOUND", message: `No route matches ${c.req.method} ${c.req.path}` }, 404)
);

export default app;
