#!/usr/bin/env node
/**
 * Publish-artifact gate for @chainreact/mobile-contracts
 * (MOBILE-COMPANION-M0-CONTRACTS-FOUNDATION-1).
 *
 * Proves — WITHOUT publishing — that the tarball npm would ship contains only
 * the intended distributable files and that the compiled output is
 * self-contained. Two layers:
 *
 *   1. Inventory (npm pack --dry-run --json): every entry must match an
 *      explicit allowlist; anything else — sources, source maps, tests, env
 *      files, repo internals — fails the run and is named.
 *   2. Content: every emitted dist/*.js must be free of `process.env`,
 *      ChainReact `@/` path aliases, and supabase/service-role references,
 *      and must import nothing but zod and its own relative siblings.
 *
 * Runs after `mobile-contracts:build` (see root package.json). Prints the
 * full file inventory so a human can eyeball what would publish.
 */
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const PKG_DIR = "packages/mobile-contracts";

const ALLOWLIST = [
  /^package\.json$/,
  /^README\.md$/,
  /^CHANGELOG\.md$/,
  /^dist\/[A-Za-z0-9._/-]+\.js$/,
  /^dist\/[A-Za-z0-9._/-]+\.d\.ts$/,
  /^fixtures\/v1\/(?:negative\/)?[a-z0-9-]+\.json$/,
];

// Named, human-readable rejections for the classes we care most about.
const DENY = [
  { re: /\.map$/, why: "source maps must not ship" },
  { re: /^src\//, why: "TypeScript sources must not ship" },
  { re: /\.test\.|\.spec\./, why: "tests must not ship" },
  { re: /\.env/, why: "env files must never ship" },
  { re: /\.npmrc$/, why: ".npmrc (registry auth) must never ship" },
  { re: /\.tsbuildinfo$/, why: "build metadata must not ship" },
  { re: /tsconfig/, why: "build config must not ship" },
  { re: /PUBLISHING\.md$/, why: "internal ops doc is not part of the artifact" },
];

const CONTENT_DENY = [
  { re: /process\.env/, why: "compiled output must not read the environment" },
  { re: /["']@\//, why: "ChainReact path aliases will not resolve in the mobile repo" },
  { re: /service_role|serviceRole|SUPABASE/i, why: "server-only concepts must not appear" },
];

function fail(messages) {
  console.error("mobile-contracts pack check: FAIL");
  for (const m of messages) console.error(`  - ${m}`);
  process.exit(1);
}

if (!existsSync(join(PKG_DIR, "dist", "index.js"))) {
  fail([`missing ${PKG_DIR}/dist/index.js — run npm run mobile-contracts:build first`]);
}

let report;
try {
  const out = execSync(`npm pack ./${PKG_DIR} --dry-run --json`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  report = JSON.parse(out);
} catch (err) {
  fail([`npm pack --dry-run failed: ${err.message}`]);
}

const entry = Array.isArray(report) ? report[0] : undefined;
const files = entry?.files?.map((f) => f.path) ?? [];
if (files.length === 0) fail(["npm pack reported an empty file list"]);

const problems = [];
for (const path of files) {
  const denied = DENY.find((d) => d.re.test(path));
  if (denied) {
    problems.push(`${path} — ${denied.why}`);
    continue;
  }
  if (!ALLOWLIST.some((re) => re.test(path))) {
    problems.push(`${path} — not on the artifact allowlist`);
  }
}

for (const required of ["package.json", "README.md", "CHANGELOG.md", "dist/index.js", "dist/index.d.ts"]) {
  if (!files.includes(required)) problems.push(`missing required artifact file: ${required}`);
}

// Layer 2 — compiled-output content checks (read from disk; dry-run has no bytes).
const distDir = join(PKG_DIR, "dist");
for (const name of readdirSync(distDir)) {
  if (!name.endsWith(".js")) continue;
  const body = readFileSync(join(distDir, name), "utf8");
  for (const { re, why } of CONTENT_DENY) {
    if (re.test(body)) problems.push(`dist/${name} — ${why}`);
  }
  for (const match of body.matchAll(/require\(["']([^"']+)["']\)/g)) {
    const spec = match[1];
    if (spec !== "zod" && !spec.startsWith("./")) {
      problems.push(`dist/${name} — unexpected runtime dependency "${spec}"`);
    }
  }
}

console.log(`mobile-contracts pack inventory (${files.length} files):`);
for (const path of [...files].sort()) console.log(`  ${path}`);

if (problems.length > 0) fail(problems);
console.log("mobile-contracts pack check: PASS");
