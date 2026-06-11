/**
 * Internal MCP server — shared, safe file helpers.
 *
 * The single read seam used by every tool. Combines the path whitelist, the
 * byte cap, and secret redaction so no tool can bypass any one of them.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { LIMITS, REPO_ROOT } from "../config";
import {
  isBlockedName,
  resolveAllowedPath,
} from "../security/paths";
import { redactSecrets } from "../security/redact";
import { truncateBuffer } from "../security/truncate";

export interface SafeFileResult {
  /** Repo-relative path that was read. */
  relPath: string;
  /** Redacted, byte-capped UTF-8 contents. */
  text: string;
  /** True if the file was larger than the byte cap. */
  truncated: boolean;
}

/**
 * Read a whitelisted file as redacted text, capped at `LIMITS.maxFileBytes`.
 * Throws `PathNotAllowedError` for anything outside the whitelist.
 */
export function readAllowedFile(
  relPath: string,
  allowedRoots: readonly string[],
  allowedFiles: readonly string[] = [],
): SafeFileResult {
  const abs = resolveAllowedPath(relPath, allowedRoots, allowedFiles);
  const buf = readFileSync(abs);
  const { text, truncated } = truncateBuffer(buf, LIMITS.maxFileBytes);
  return {
    relPath: relative(REPO_ROOT, abs).split("\\").join("/"),
    text: redactSecrets(text),
    truncated,
  };
}

/**
 * Recursively list `*.md` files under a whitelisted doc root, skipping any
 * blocked directory/filename. Returns repo-relative posix paths, bounded by
 * `LIMITS.searchMaxFiles`.
 */
export function listMarkdownFiles(relRoot: string): string[] {
  const rootAbs = resolveAllowedPath(relRoot, [relRoot]);
  const out: string[] = [];

  const walk = (dirAbs: string): void => {
    if (out.length >= LIMITS.searchMaxFiles) return;
    let entries: string[];
    try {
      entries = readdirSync(dirAbs);
    } catch {
      return;
    }
    for (const name of entries) {
      if (isBlockedName(name)) continue;
      const childAbs = join(dirAbs, name);
      let s;
      try {
        s = statSync(childAbs);
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        walk(childAbs);
      } else if (s.isFile() && name.toLowerCase().endsWith(".md")) {
        out.push(relative(REPO_ROOT, childAbs).split("\\").join("/"));
        if (out.length >= LIMITS.searchMaxFiles) return;
      }
    }
  };

  walk(rootAbs);
  return out.sort();
}

/** Extract the first markdown H1 (`# Title`) from text, or null. */
export function firstHeading(text: string): string | null {
  const match = text.match(/^#\s+(.+)$/m);
  const captured = match?.[1];
  return captured !== undefined ? captured.trim() : null;
}
