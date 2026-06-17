/**
 * Internal ChainReact CLI — changed-file discovery seam (read-only git).
 *
 * `verify --changed` recommends a verification batch tailored to the local diff.
 * Collecting that diff shells out to git (`git diff --name-only`, `--cached`, and
 * `ls-files --others --exclude-standard`), but ONLY through this injectable
 * `ChangedFilesReader` seam — tests inject a fake so they never spawn git. These
 * are read-only porcelain reads: no fetch, no write, no network, no mutation.
 *
 * `mergeChangedPaths` is a pure dedupe+sort over the three lists, separately
 * unit-tested. The default reader is the only part that touches the process.
 */
import { spawnSync } from "node:child_process";

export interface ChangedFilesResult {
  /** False when git is unavailable or the dir is not a git repo. */
  readonly ok: boolean;
  /** Deduped, sorted repo-relative paths (working tree + staged + untracked). */
  readonly files: readonly string[];
  /** Present only when `ok` is false — a human/agent-readable reason. */
  readonly error?: string;
}

/** Collect changed files. Injectable so tests don't execute git. */
export type ChangedFilesReader = () => ChangedFilesResult;

/** Dedupe + sort the three path lists deterministically. Pure. */
export function mergeChangedPaths(lists: readonly (readonly string[])[]): string[] {
  const set = new Set<string>();
  for (const list of lists) {
    for (const raw of list) {
      const p = raw.trim();
      if (p) set.add(p);
    }
  }
  return [...set].sort();
}

const GIT_TIMEOUT_MS = 30_000;

function gitLines(args: readonly string[]): { ok: boolean; lines: string[]; error?: string } {
  const isWin = process.platform === "win32";
  const r = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024,
    shell: isWin,
  });
  if (r.error) {
    const code = (r.error as { code?: string }).code;
    return { ok: false, lines: [], error: code === "ENOENT" ? "git not found on PATH" : r.error.message };
  }
  if (r.status !== 0) {
    return { ok: false, lines: [], error: (r.stderr || "").trim() || `git ${args.join(" ")} exited ${r.status}` };
  }
  return { ok: true, lines: (r.stdout ?? "").split("\n") };
}

/**
 * Default reader — combines working-tree, staged, and untracked changes. Fails
 * gracefully (`ok:false` + message) when git is missing or this is not a repo.
 */
export const defaultChangedFiles: ChangedFilesReader = (): ChangedFilesResult => {
  // Cheap guard: confirm we're inside a work tree first (clear error otherwise).
  const inside = gitLines(["rev-parse", "--is-inside-work-tree"]);
  if (!inside.ok) {
    return { ok: false, files: [], error: `not a git repository (or git unavailable): ${inside.error ?? "unknown"}` };
  }

  const unstaged = gitLines(["diff", "--name-only"]);
  const staged = gitLines(["diff", "--cached", "--name-only"]);
  const untracked = gitLines(["ls-files", "--others", "--exclude-standard"]);
  const failed = [unstaged, staged, untracked].find((x) => !x.ok);
  if (failed) {
    return { ok: false, files: [], error: `git diff failed: ${failed.error ?? "unknown"}` };
  }

  return { ok: true, files: mergeChangedPaths([unstaged.lines, staged.lines, untracked.lines]) };
};
