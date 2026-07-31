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
import { existsSync, readdirSync } from "node:fs";
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
 * DOC-FINAL-ACCEPTANCE-1 — respect nested Git worktree / repository boundaries.
 *
 * The structure lint enforces the REAL project source, never nested temporary
 * Git worktrees (e.g. `.claude/worktrees/*`, which each contain a full checkout
 * — including an append-only `supabase/migrations` ledger — that legitimately
 * exceeds the cap and is not this repo's source to reorganize). A linked Git
 * worktree is marked by a `.git` ENTRY (a file for a linked worktree, a dir for
 * a nested repo) at its root; the main repo's own `.git` sits at ROOT and is
 * never treated as a boundary. This keeps authoritative checked-in `.claude`
 * content (skills, agents, commands) IN scope while excluding only nested
 * worktree checkouts — it does not globally ignore `.claude`.
 */
function isNestedGitBoundary(dirAbs) {
  if (dirAbs === ROOT) return false;
  return existsSync(join(dirAbs, ".git"));
}

/**
 * Explicit temporary-worktree exclusions (repo-relative, POSIX). `.claude/worktrees`
 * is the gitignored parent this repo parks temporary Git worktrees under; a leftover
 * checkout there (including an orphaned one whose `.git` marker was already removed by
 * a partial `git worktree remove`) is never this repo's source. Excluding the parent
 * makes the traversal robust to those leftovers WITHOUT touching authoritative `.claude`
 * content (skills / agents / commands), which live in sibling folders.
 */
const EXCLUDED_PATHS = new Set([
  ".claude/worktrees",
  // `owner-review/` is GENERATED, gitignored review evidence — rendered HTML
  // fixtures and screenshots written by `npm run verify:responsive`. It is not
  // this repo's source, and the cap's remedy ("split the folder / add structure")
  // is meaningless for machine-written output whose shape the generator decides.
  // Certifying every surface in one run legitimately emits 100+ fragments, which
  // tripped the cap on a directory nobody hand-maintains. (RESPONSIVE-CERTIFICATION-10)
  "owner-review",
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
      const childAbs = join(dir, entry.name);
      const childRelPosix = (childAbs.slice(ROOT.length + 1) || ".").split(sep).join("/");
      // Skip explicit temporary-worktree parents and any nested Git worktree /
      // repository — neither is this repo's source tree.
      if (EXCLUDED_PATHS.has(childRelPosix)) continue;
      if (isNestedGitBoundary(childAbs)) continue;
      walk(childAbs);
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
