/**
 * Neo4j / CognoDB driver singleton.
 *
 * Cloudflare Workers are stateless-per-request by default, but the isolate
 * itself is reused across requests as long as it stays warm. We cache the
 * driver instance on the module scope, keyed by connection URI, so we don't
 * pay the TCP/TLS handshake cost on every request.
 *
 * CognoDB speaks openCypher over Bolt 5.0–5.4, which is exactly what the
 * official `neo4j-driver` package targets — no special client needed.
 */
import neo4j, { Driver, Session } from "neo4j-driver";
import type { Env } from "../types";

let cachedDriver: Driver | null = null;
let cachedUri: string | null = null;

export class DatabaseUnavailableError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "DatabaseUnavailableError";
  }
}

/**
 * Lazily creates (or reuses) the CognoDB driver instance for this isolate.
 */
export function getDriver(env: Env): Driver {
  if (!env.COGNODB_URI || !env.COGNODB_USER || !env.COGNODB_PASSWORD) {
    throw new DatabaseUnavailableError(
      "Missing COGNODB_URI / COGNODB_USER / COGNODB_PASSWORD environment variables."
    );
  }

  if (cachedDriver && cachedUri === env.COGNODB_URI) {
    return cachedDriver;
  }

  // Connection settings changed (or first boot) — (re)create the driver.
  if (cachedDriver) {
    // Fire-and-forget close of the stale driver; don't block the new request.
    cachedDriver.close().catch(() => void 0);
  }

  cachedDriver = neo4j.driver(
    env.COGNODB_URI,
    neo4j.auth.basic(env.COGNODB_USER, env.COGNODB_PASSWORD),
    {
      maxConnectionPoolSize: 50,
      connectionTimeout: 10000,
      // Workers don't support the driver's background connection-liveness
      // pinging the same way a long-lived Node process does, so keep pooled
      // connections short-lived to avoid handing back dead sockets.
      maxConnectionLifetime: 60_000,
      disableLosslessIntegers: true,
    }
  );
  cachedUri = env.COGNODB_URI;

  return cachedDriver;
}

/**
 * Opens a session, runs `work`, and guarantees the session is closed —
 * translating any connectivity failure into a DatabaseUnavailableError so
 * route handlers can uniformly return a 503 with a recovery banner payload.
 */
export async function withSession<T>(
  env: Env,
  work: (session: Session) => Promise<T>
): Promise<T> {
  let driver: Driver;
  try {
    driver = getDriver(env);
  } catch (err) {
    if (err instanceof DatabaseUnavailableError) throw err;
    throw new DatabaseUnavailableError("Failed to initialize CognoDB driver.", err);
  }

  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    return await work(session);
  } catch (err: any) {
    // neo4j-driver surfaces connectivity issues via these error codes/names.
    const code = err?.code ?? "";
    const message = String(err?.message ?? err);
    const isConnectivityIssue =
      code.includes("ServiceUnavailable") ||
      code.includes("SessionExpired") ||
      code.includes("Neo.ClientError.Security") ||
      /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|WebSocket|connect/i.test(message);

    if (isConnectivityIssue) {
      throw new DatabaseUnavailableError(
        "CognoDB is unreachable — it may be paused, misconfigured, or the credentials are invalid.",
        err
      );
    }
    throw err;
  } finally {
    await session.close().catch(() => void 0);
  }
}

/** Same as withSession but opens a WRITE session (used only by the seed script). */
export async function withWriteSession<T>(
  env: Env,
  work: (session: Session) => Promise<T>
): Promise<T> {
  const driver = getDriver(env);
  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    return await work(session);
  } finally {
    await session.close().catch(() => void 0);
  }
}
