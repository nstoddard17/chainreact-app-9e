/**
 * STRUCTURE-TEST-CONSOLIDATION-1 — the one repository walker for structure
 * suites.
 *
 * Before this existed, 25 of the 50 structure suites each declared their own
 * recursive walker and re-scanned the same trees (features/ was walked ~12x
 * per full run, supabase/migrations ~7x). This helper walks a root ONCE PER
 * TEST PROCESS and serves every rule in that suite from the same index.
 *
 * Deliberate properties:
 *   - Node-only, assertion-free: it lists and reads, it never judges.
 *   - Per-process memo ONLY (plain module state). Jest gives every suite a
 *     fresh module registry, so nothing here can leak between suites or hide
 *     a file change between runs — there is no cross-run cache to go stale.
 *   - Lazy content: nothing is read until a caller asks; reads are memoized
 *     per process for the suites that check many rules against one corpus.
 *   - Deterministic: results are sorted, paths repo-relative with forward
 *     slashes on every OS (local Windows and the GitHub Linux runners agree).
 *   - Excludes exactly the trees the hand-rolled walkers excluded (plus git
 *     metadata): dependency, build, cache, and VCS directories. Nothing else.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

export const REPO_ROOT = resolve(__dirname, "../../..");

const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".jest-cache",
  "dist",
  "build",
  "coverage",
  ".vercel",
  ".supabase",
]);

const toPosix = (p: string): string => p.split(sep).join("/");

/** Per-process memo of walked roots (repo-relative posix root -> files). */
const walkMemo = new Map<string, readonly string[]>();
/** Per-process memo of file contents. */
const contentMemo = new Map<string, string>();

function walk(absDir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(absDir, { withFileTypes: true });
  } catch {
    return; // a root that does not exist yields an empty listing, never a throw
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) walk(join(absDir, entry.name), out);
    } else {
      out.push(toPosix(relative(REPO_ROOT, join(absDir, entry.name))));
    }
  }
}

export interface ListFilesOptions {
  /** Repo-relative roots to walk, e.g. ["features", "app"]. */
  readonly roots: readonly string[];
  /** Keep only files whose BASENAME matches (e.g. /\.tsx?$/). */
  readonly filename?: RegExp;
  /** Keep only files whose repo-relative PATH matches. */
  readonly pathMatches?: RegExp;
}

/**
 * List files under the given roots (walked once per process each), filtered,
 * sorted, repo-relative, forward-slash.
 */
export function listRepoFiles(options: ListFilesOptions): string[] {
  const files: string[] = [];
  for (const root of options.roots) {
    const key = toPosix(root);
    let listed = walkMemo.get(key);
    if (listed === undefined) {
      const walked: string[] = [];
      walk(resolve(REPO_ROOT, root), walked);
      walked.sort();
      walkMemo.set(key, walked);
      listed = walked;
    }
    files.push(...listed);
  }
  files.sort();
  return files.filter(
    (f) =>
      (options.filename === undefined ||
        options.filename.test(f.slice(f.lastIndexOf("/") + 1))) &&
      (options.pathMatches === undefined || options.pathMatches.test(f)),
  );
}

/** Read a repo-relative file (memoized per process). */
export function readRepoFile(relPath: string): string {
  const key = toPosix(relPath);
  let content = contentMemo.get(key);
  if (content === undefined) {
    content = readFileSync(resolve(REPO_ROOT, key), "utf8");
    contentMemo.set(key, content);
  }
  return content;
}

/**
 * Read a repo-relative file with block/line comments stripped — the shared
 * form of the "never fire on prose that discusses the pattern" helper the
 * responsive guards each hand-rolled.
 */
export function readRepoFileCode(relPath: string): string {
  return readRepoFile(relPath)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/[^\n]*$/gm, "");
}
