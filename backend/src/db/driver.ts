/**
 * CognoDB (Bolt / openCypher) driver access for the Worker.
 *
 * IMPORTANT — why there is no driver singleton here.
 *
 * The obvious optimization is to cache the Driver at module scope so warm
 * isolates skip the TCP/TLS handshake. That is wrong on Cloudflare Workers:
 * the runtime forbids reusing an I/O object (here, the driver's pooled
 * sockets) across *different* requests. A cached driver works for whichever
 * request happened to create it and then throws
 * "Cannot perform I/O on behalf of a different request object" for later
 * ones — which surfaces as an intermittent HTTP 500 / error 1101 that passes
 * on retry and is thoroughly confusing to debug.
 *
 * So: one driver per request, always closed in a `finally`. The handshake
 * cost (~200ms, measured) is the price of correctness here.
 *
 * CognoDB speaks openCypher over Bolt 5.0–5.4, which is exactly what the
 * official `neo4j-driver` package targets — no special client needed. See the
 * README's "Running neo4j-driver on Cloudflare Workers" section for the three
 * runtime patches that make the driver work here at all.
 */
import neo4j, { Driver, Session } from "neo4j-driver";
import type { Env } from "../types";

export class DatabaseUnavailableError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "DatabaseUnavailableError";
  }
}

/** Creates a driver for a single request. The caller must close it. */
export function getDriver(env: Env): Driver {
  if (!env.COGNODB_URI || !env.COGNODB_USER || !env.COGNODB_PASSWORD) {
    throw new DatabaseUnavailableError(
      "Missing COGNODB_URI / COGNODB_USER / COGNODB_PASSWORD environment variables."
    );
  }

  return neo4j.driver(
    env.COGNODB_URI,
    neo4j.auth.basic(env.COGNODB_USER, env.COGNODB_PASSWORD),
    {
      // A single request never needs a large pool, and an oversized one just
      // opens sockets we immediately discard when the driver closes.
      maxConnectionPoolSize: 5,
      connectionTimeout: 10000,
      disableLosslessIntegers: true,
    }
  );
}

/** Translates driver connectivity failures into DatabaseUnavailableError. */
function asDatabaseError(err: any): unknown {
  const code = String(err?.code ?? "");
  const message = String(err?.message ?? err);

  const isConnectivityIssue =
    code.includes("ServiceUnavailable") ||
    code.includes("SessionExpired") ||
    code.includes("Neo.ClientError.Security") ||
    /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|WebSocket|connect/i.test(message);

  if (isConnectivityIssue) {
    return new DatabaseUnavailableError(
      "CognoDB is unreachable — it may be paused, misconfigured, or the credentials are invalid.",
      err
    );
  }
  return err;
}

/**
 * Runs `work` against a read session, guaranteeing both the session and the
 * per-request driver are closed, and normalizing connectivity failures so
 * route handlers can uniformly return a 503 the frontend renders as a banner.
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
  } catch (err) {
    throw asDatabaseError(err);
  } finally {
    await session.close().catch(() => void 0);
    await driver.close().catch(() => void 0);
  }
}

/** Write-mode equivalent of withSession. */
export async function withWriteSession<T>(
  env: Env,
  work: (session: Session) => Promise<T>
): Promise<T> {
  const driver = getDriver(env);
  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    return await work(session);
  } catch (err) {
    throw asDatabaseError(err);
  } finally {
    await session.close().catch(() => void 0);
    await driver.close().catch(() => void 0);
  }
}
