#!/usr/bin/env node
/**
 * Leaf-folder file-count check.
 * Per project-structure-and-module-boundaries.md §6 + §10:
 *   No directory leaf may exceed 50 source files.
 *
 * A "leaf" is any directory that contains files (regardless of subdirectories).
 * Counts files directly in the directory (non-recursive). Excludes node_modules,
 * .next, .git, build/, dist/, coverage/, playwright-report/, test-results/.
 */
import { readdirSync } from "node:fs";
import { join, resolve, sep } from "node:path";

const ROOT = resolve(process.cwd());
const LIMIT = 50;
const IGNORED = new Set([
  "node_modules",
  ".next",
  ".git",
  "build",
  "dist",
  "coverage",
  "playwright-report",
  "test-results",
  ".turbo",
]);

/**
 * Leaf folders exempt from the file-count cap because the "split the folder / add
 * structure" remedy structurally cannot apply.
 *
 * - `supabase/migrations` is an APPEND-ONLY, FORWARD-ONLY ledger that MUST remain a
 *   single flat directory: the Supabase CLI applies `supabase/migrations/*.sql` and
 *   does not recurse subfolders, so the files cannot be reorganized into subdirs.
 *   The 50-file leaf limit is documented as tunable
 *   (project-structure-and-module-boundaries.md §"Tunable post-Slice 1"); this
 *   carves out the one directory that legitimately grows without bound.
 */
const COUNT_EXEMPT_LEAVES = new Set(["supabase/migrations"]);

let violations = 0;

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  let fileCount = 0;
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED.has(entry.name)) continue;
      walk(join(dir, entry.name));
    } else if (entry.isFile() && !entry.name.startsWith(".")) {
      fileCount += 1;
    }
  }

  const rel = dir.slice(ROOT.length + 1) || ".";
  const relPosix = rel.split(sep).join("/");
  if (fileCount > LIMIT && !COUNT_EXEMPT_LEAVES.has(relPosix)) {
    console.error(
      `LEAF-COUNT VIOLATION: ${rel} contains ${fileCount} files (limit ${LIMIT}).`,
    );
    violations += 1;
  }
}

walk(ROOT);

if (violations > 0) {
  console.error(
    `\n${violations} leaf-folder violation(s). Split the folder or add structure.`,
  );
  process.exit(1);
}

console.log(`OK — every leaf folder has ≤ ${LIMIT} files.`);
