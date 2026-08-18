#!/usr/bin/env node
/**
 * Makes `neo4j-driver` work inside the Cloudflare Workers runtime.
 *
 * Two independent incompatibilities need patching, both in node_modules, so
 * this runs automatically via `postinstall` — a plain `npm install` is enough
 * to pick it up (including on Cloudflare's own build pipeline). Both patches
 * are idempotent and safe to re-run.
 *
 * ---------------------------------------------------------------------------
 * 1. The `"browser"` field remap  ->  wrong transport
 * ---------------------------------------------------------------------------
 * Wrangler bundles Workers with esbuild in "browser" platform mode, which
 * honors each dependency's package.json `"browser"` field. `neo4j-driver` and
 * `neo4j-driver-bolt-connection` both ship one that swaps their raw-socket
 * "node" channel for a WebSocket channel meant for actual web browsers — and
 * CognoDB (like virtually every Bolt server) doesn't speak Bolt-over-
 * WebSocket, so every query fails with a WebSocket connection error.
 *
 * `compatibility_flags = ["nodejs_compat"]` gives the Worker real node:net /
 * node:tls, so the "node" channel genuinely works here; we just need esbuild
 * to stop swapping it out. Deleting the `"browser"` field does that.
 *
 * ---------------------------------------------------------------------------
 * 2. `rejectUnauthorized`  ->  ERR_OPTION_NOT_IMPLEMENTED
 * ---------------------------------------------------------------------------
 * With the node channel restored, the driver builds its `tls.connect()`
 * options with a hardcoded `rejectUnauthorized: false`. Workers' node:tls
 * doesn't implement that option and throws ERR_OPTION_NOT_IMPLEMENTED, so
 * every connection dies during the TLS handshake.
 *
 * Removing the option is both the fix and a security improvement: instead of
 * the driver's "skip certificate verification", the connection falls back to
 * the Workers runtime's default TLS behaviour, which *does* verify the
 * server certificate against public CAs.
 */
const fs = require("node:fs");
const path = require("node:path");

const nodeModules = path.join(__dirname, "..", "node_modules");
let changed = 0;

// --- Patch 1: drop the "browser" field remap --------------------------------
for (const rel of ["neo4j-driver-bolt-connection/package.json", "neo4j-driver/package.json"]) {
  const pkgPath = path.join(nodeModules, rel);
  if (!fs.existsSync(pkgPath)) {
    console.warn(`[patch-neo4j-driver] ${rel} not found, skipping`);
    continue;
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  if ("browser" in pkg) {
    delete pkg.browser;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
    console.log(`[patch-neo4j-driver] removed "browser" field from ${rel}`);
    changed++;
  }
}

// --- Patch 2: strip the unsupported rejectUnauthorized TLS option -----------
const channelPath = path.join(
  nodeModules,
  "neo4j-driver-bolt-connection/lib/channel/node/node-channel.js"
);

if (!fs.existsSync(channelPath)) {
  console.warn("[patch-neo4j-driver] node-channel.js not found, skipping TLS patch");
} else {
  const source = fs.readFileSync(channelPath, "utf8");
  const needle = "rejectUnauthorized: false, ";

  if (source.includes(needle)) {
    fs.writeFileSync(channelPath, source.split(needle).join(""));
    console.log("[patch-neo4j-driver] removed rejectUnauthorized from node-channel.js TLS options");
    changed++;
  } else if (!source.includes("rejectUnauthorized")) {
    // already patched
  } else {
    // The option is still present but in a shape we don't recognize — fail
    // loudly rather than silently shipping a Worker that can't connect.
    console.error(
      "[patch-neo4j-driver] WARNING: 'rejectUnauthorized' present in node-channel.js " +
        "but not in the expected form. The TLS patch did NOT apply — connections from " +
        "Cloudflare Workers will likely fail with ERR_OPTION_NOT_IMPLEMENTED."
    );
    process.exitCode = 1;
  }
}

if (changed === 0) {
  console.log("[patch-neo4j-driver] already patched, nothing to do");
}
