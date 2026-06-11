/**
 * Internal MCP server — path whitelist + traversal guard.
 *
 * Every file read by every tool routes through `resolveAllowedPath`. There is
 * no other file-reading seam. The function is whitelist-first: a path is
 * accepted only if it normalizes to inside the repo root, sits under an
 * explicitly allowed root/file, and matches none of the blocked segments or
 * filename patterns below.
 */
import { resolve, relative, isAbsolute, basename, sep } from "node:path";
import { REPO_ROOT } from "../config";

/** Path segments that are never traversed, even under an allowed root. */
const BLOCKED_SEGMENTS: readonly string[] = [
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".vercel",
  "test-results",
  "playwright-report",
];

/**
 * Filename patterns that are never readable (defense-in-depth — the whitelist
 * roots already exclude these, but a doc/file that looks secret-bearing is
 * refused regardless of where it sits).
 */
const BLOCKED_NAME_PATTERNS: readonly RegExp[] = [
  /(^|\.)env($|\.)/i, // .env, env.local, .env.production, foo.env
  /secret/i,
  /credential/i,
  /\btoken\b/i,
  /password/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /id_rsa/i,
  /service[-_]?role/i,
  /\.dump$/i, // db data dumps
];

export class PathNotAllowedError extends Error {
  constructor(reason: string) {
    super(`Path not allowed: ${reason}`);
    this.name = "PathNotAllowedError";
  }
}

function isUnderRoot(relRoot: string, target: string): boolean {
  const rootAbs = resolve(REPO_ROOT, relRoot);
  const rel = relative(rootAbs, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * Resolve a repo-relative path against an allowlist and return the absolute
 * path, or throw `PathNotAllowedError`.
 *
 * @param relPath   Repo-relative path (e.g. `docs/rules/provider-registry.md`).
 * @param allowedRoots  Repo-relative dirs the path must sit under.
 * @param allowedFiles  Repo-relative exact files that are also acceptable.
 */
export function resolveAllowedPath(
  relPath: string,
  allowedRoots: readonly string[],
  allowedFiles: readonly string[] = [],
): string {
  if (typeof relPath !== "string" || relPath.length === 0) {
    throw new PathNotAllowedError("empty path");
  }
  if (isAbsolute(relPath)) {
    throw new PathNotAllowedError("absolute paths are rejected");
  }
  if (relPath.includes("\0")) {
    throw new PathNotAllowedError("null byte in path");
  }

  const abs = resolve(REPO_ROOT, relPath);

  // Containment: must stay inside the repo root (blocks ../ traversal).
  if (!isUnderRoot(".", abs)) {
    throw new PathNotAllowedError("path escapes repo root");
  }

  // Blocked directory segments anywhere in the resolved path.
  const relFromRoot = relative(REPO_ROOT, abs);
  const segments = relFromRoot.split(sep);
  for (const segment of segments) {
    if (BLOCKED_SEGMENTS.includes(segment)) {
      throw new PathNotAllowedError(`blocked segment '${segment}'`);
    }
  }

  // Blocked filename patterns.
  const name = basename(abs);
  for (const pattern of BLOCKED_NAME_PATTERNS) {
    if (pattern.test(name)) {
      throw new PathNotAllowedError(`blocked filename pattern (${pattern})`);
    }
  }

  // Whitelist: under an allowed root, or an exact allowed file.
  const underAllowedRoot = allowedRoots.some((root) => isUnderRoot(root, abs));
  const isAllowedFile = allowedFiles.some(
    (file) => resolve(REPO_ROOT, file) === abs,
  );
  if (!underAllowedRoot && !isAllowedFile) {
    throw new PathNotAllowedError("path is not in the whitelist");
  }

  return abs;
}

/** True if `name` is one the blocklist would refuse (used by the doc walker). */
export function isBlockedName(name: string): boolean {
  if (BLOCKED_SEGMENTS.includes(name)) return true;
  return BLOCKED_NAME_PATTERNS.some((p) => p.test(name));
}
