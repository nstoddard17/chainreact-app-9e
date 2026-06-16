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

/**
 * Recursively list files under a whitelisted root whose extension is in
 * `extensions`, skipping any blocked directory/filename segment. Returns
 * repo-relative posix paths, bounded by `maxFiles`. Mirrors `listMarkdownFiles`
 * but with a configurable extension set and explicit cap — used by the Phase-A
 * repo-navigation tools. Reads no file contents; returns paths only.
 */
export function listFilesUnder(
  relRoot: string,
  extensions: readonly string[],
  maxFiles: number,
): string[] {
  let rootAbs: string;
  try {
    rootAbs = resolveAllowedPath(relRoot, [relRoot]);
  } catch {
    return [];
  }
  const lowerExts = extensions.map((e) => e.toLowerCase());
  const out: string[] = [];

  const walk = (dirAbs: string): void => {
    if (out.length >= maxFiles) return;
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
        if (out.length >= maxFiles) return;
      } else if (s.isFile()) {
        const lower = name.toLowerCase();
        if (lowerExts.some((ext) => lower.endsWith(ext))) {
          out.push(relative(REPO_ROOT, childAbs).split("\\").join("/"));
          if (out.length >= maxFiles) return;
        }
      }
    }
  };

  walk(rootAbs);
  return out.sort();
}

/**
 * True if `relPath` resolves to an existing file inside the allowed roots and
 * passes the blocklist. Returns false (never throws) for blocked/missing paths —
 * convenient for "does this conventional test file exist?" checks.
 */
export function existsAllowed(
  relPath: string,
  allowedRoots: readonly string[],
  allowedFiles: readonly string[] = [],
): boolean {
  try {
    const abs = resolveAllowedPath(relPath, allowedRoots, allowedFiles);
    return statSync(abs).isFile();
  } catch {
    return false;
  }
}
