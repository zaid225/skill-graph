#!/usr/bin/env node
/*
 * Patches neo4j-driver so it works inside the Cloudflare Workers runtime.
 * Runs on postinstall; both patches are idempotent.
 *
 * 1. package.json "browser" field. Wrangler bundles with esbuild in browser
 *    mode, so it honours the remap that swaps the driver's raw-socket channel
 *    for a WebSocket one. CognoDB doesn't speak Bolt over WebSocket, so every
 *    query fails. nodejs_compat gives us real node:net/node:tls, so we just
 *    need esbuild to stop swapping the channel out.
 *
 * 2. rejectUnauthorized. The driver hardcodes it in its tls.connect() options
 *    and Workers' node:tls throws ERR_OPTION_NOT_IMPLEMENTED on it. Dropping
 *    it also means we get the runtime's default TLS behaviour, which verifies
 *    the server cert instead of skipping verification.
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
    // The option is still present but in a shape we don't recognize, fail
    // loudly rather than silently shipping a Worker that can't connect.
    console.error(
      "[patch-neo4j-driver] WARNING: 'rejectUnauthorized' present in node-channel.js " +
        "but not in the expected form. The TLS patch did NOT apply, so connections from " +
        "Cloudflare Workers will likely fail with ERR_OPTION_NOT_IMPLEMENTED."
    );
    process.exitCode = 1;
  }
}

if (changed === 0) {
  console.log("[patch-neo4j-driver] already patched, nothing to do");
}
