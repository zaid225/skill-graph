#!/usr/bin/env node
/**
 * Cloudflare Workers / Wrangler bundle esbuild in "browser" platform mode,
 * which makes it honor each dependency's package.json `"browser"` field
 * remap. `neo4j-driver` and `neo4j-driver-bolt-connection` both ship one
 * that swaps their raw-socket "node" channel for a WebSocket channel meant
 * for actual web browsers — and CognoDB (like most Bolt servers) doesn't
 * speak Bolt-over-WebSocket, so every query would fail with a WebSocket
 * connection error at runtime.
 *
 * `compatibility_flags = ["nodejs_compat"]` in wrangler.toml gives the
 * Worker real `node:net` / `node:tls` (backed by the Workers `connect()`
 * TCP API), so the "node" channel actually works here — we just need to
 * stop esbuild from swapping it out. Deleting the `"browser"` field from
 * these two packages' package.json does exactly that.
 *
 * Runs automatically via the `postinstall` script so a plain `npm install`
 * is enough to pick it up (including on Cloudflare's own build pipeline).
 */
const fs = require("node:fs");
const path = require("node:path");

const targets = [
  "neo4j-driver-bolt-connection/package.json",
  "neo4j-driver/package.json",
];

for (const rel of targets) {
  const pkgPath = path.join(__dirname, "..", "node_modules", rel);
  if (!fs.existsSync(pkgPath)) {
    console.warn(`[patch-neo4j-driver] ${rel} not found, skipping`);
    continue;
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  if ("browser" in pkg) {
    delete pkg.browser;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
    console.log(`[patch-neo4j-driver] removed "browser" field from ${rel}`);
  } else {
    console.log(`[patch-neo4j-driver] ${rel} already patched`);
  }
}
