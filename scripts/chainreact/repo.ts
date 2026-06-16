/**
 * Internal ChainReact CLI — repo location + filesystem introspection seam.
 *
 * All filesystem access used by `status` and `app validate` goes through the
 * `FsDeps` interface so the pure command logic can be unit-tested with an
 * in-memory fake (no disk, deterministic). `defaultFsDeps` is the real,
 * read-only implementation. Nothing here writes, executes, or reaches the
 * network; reads are confined under the resolved repo root.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** Read-only filesystem surface (repo-relative paths). */
export interface FsDeps {
  /** True if a repo-relative path exists. */
  exists(relPath: string): boolean;
  /** True if a repo-relative path is a directory. */
  isDirectory(relPath: string): boolean;
  /** Immediate entry names of a repo-relative directory ([] if missing). */
  listDir(relPath: string): string[];
  /** UTF-8 text of a repo-relative file ("" if missing/unreadable). */
  readText(relPath: string): string;
}

/**
 * Walk up from a start dir to the ChainReactV2 repo root (markers: package.json
 * + docs + integrations). Falls back to the start dir. Mirrors the marker-walk
 * used by scripts/mcp/config.ts.
 */
export function findRepoRoot(startDir: string): string {
  let dir = resolve(startDir);
  for (let i = 0; i < 10; i += 1) {
    const hasMarkers =
      existsSync(resolve(dir, "package.json")) &&
      existsSync(resolve(dir, "docs")) &&
      existsSync(resolve(dir, "integrations"));
    if (hasMarkers) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(startDir);
}

/** Real read-only FsDeps rooted at `repoRoot`. */
export function defaultFsDeps(repoRoot: string): FsDeps {
  const abs = (relPath: string): string => resolve(repoRoot, relPath);
  return {
    exists: (relPath) => existsSync(abs(relPath)),
    isDirectory: (relPath) => {
      try {
        return statSync(abs(relPath)).isDirectory();
      } catch {
        return false;
      }
    },
    listDir: (relPath) => {
      try {
        return readdirSync(abs(relPath));
      } catch {
        return [];
      }
    },
    readText: (relPath) => {
      try {
        return readFileSync(abs(relPath), "utf8");
      } catch {
        return "";
      }
    },
  };
}

/** Join repo-relative path segments with forward slashes (stable across OS). */
export function relJoin(...segments: string[]): string {
  return join(...segments).split("\\").join("/");
}
