/*
 * CognoDB access for the Worker.
 *
 * Deliberately no driver singleton. Caching the Driver at module scope looks
 * like an easy win (warm isolates skip the handshake) but Workers forbids
 * reusing an I/O object across requests, so the pooled sockets blow up with
 * "Cannot perform I/O on behalf of a different request object" on whichever
 * request didn't create them. That shows up as an intermittent 500 that
 * passes on retry. One driver per request, always closed, costs ~200ms and
 * actually works.
 *
 * See the README for the driver patches needed to run this on Workers at all.
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
      "CognoDB is unreachable. It may be paused, misconfigured, or the credentials are invalid.",
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
