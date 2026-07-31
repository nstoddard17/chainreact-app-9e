#!/usr/bin/env node
/**
 * SUPABASE-ENV-PIPELINE-1 — canonical generated database types.
 *
 *   npm run db:types        # regenerate types/database.types.ts from the LOCAL stack
 *   npm run db:types:check  # regenerate to a temp buffer and fail on drift
 *
 * The committed types/database.types.ts is generated from a CLEAN local reset
 * of supabase/migrations — it is a derived artifact of the migration chain and
 * the schema half of the "migrations are the source of truth" contract:
 * db-ci regenerates it in CI and fails when a migration changed the schema
 * without the committed types following.
 *
 * Local-stack only: `supabase gen types --local` reads the loopback database.
 * No cloud project, no keys, nothing printed but a pass/fail.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

const OUT_PATH = resolve(process.cwd(), "types", "database.types.ts");
const CLI = ["--yes", "supabase@2.109.1"];

function generate() {
  const out = execFileSync("npx", [...CLI, "gen", "types", "typescript", "--local"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    shell: process.platform === "win32",
    maxBuffer: 64 * 1024 * 1024,
  });
  // Normalize to LF so Windows/CI runs produce byte-identical output.
  return out.replace(/\r\n/g, "\n");
}

const mode = process.argv[2];
if (mode === "gen") {
  const types = generate();
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, types);
  console.log(`✅ wrote types/database.types.ts (${types.length} bytes) from the local schema.`);
} else if (mode === "check") {
  if (!existsSync(OUT_PATH)) {
    console.error("DRIFT — types/database.types.ts does not exist. Run `npm run db:types` against a clean local reset and commit it.");
    process.exit(1);
  }
  const fresh = generate();
  const committed = readFileSync(OUT_PATH, "utf8").replace(/\r\n/g, "\n");
  if (fresh !== committed) {
    console.error(
      "DRIFT — generated types differ from committed types/database.types.ts.\n" +
        "A migration changed the schema without regenerating types. Fix: `npm run supabase:test:reset && npm run db:types`, review, commit.",
    );
    process.exit(1);
  }
  console.log("✅ types/database.types.ts matches the local schema (no drift).");
} else {
  console.error("Usage: node scripts/db-types.mjs <gen|check>");
  process.exit(1);
}
