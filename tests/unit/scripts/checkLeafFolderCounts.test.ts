/**
 * DOC-FINAL-ACCEPTANCE-1 — structure-lint traversal respects nested Git worktree
 * boundaries WITHOUT weakening the real source rule.
 *
 * Runs the actual `scripts/check-leaf-folder-counts.mjs` against throwaway fixture
 * trees (cwd-scoped, so it never touches the real repo):
 *   - a legitimate source leaf over the cap IS flagged (exit 1),
 *   - a nested Git worktree (a dir with a `.git` entry) over the cap is SKIPPED,
 *   - but a real source leaf SIBLING to that worktree is still flagged.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(process.cwd(), "scripts/check-leaf-folder-counts.mjs");

function makeFiles(dir: string, count: number): void {
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < count; i++) writeFileSync(join(dir, `f${i}.ts`), "export {};\n");
}

/** Run the script with cwd=fixture. Returns { code, stderr }. */
function runLint(cwd: string): { code: number; output: string } {
  try {
    const out = execFileSync("node", [SCRIPT], { cwd, encoding: "utf8" });
    return { code: 0, output: out };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "leaf-lint-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("check-leaf-folder-counts nested-worktree handling", () => {
  it("flags a legitimate source leaf over the 50-file cap", () => {
    makeFiles(join(root, "features", "big"), 51);
    const { code, output } = runLint(root);
    expect(code).toBe(1);
    expect(output).toMatch(/LEAF-COUNT VIOLATION/);
    expect(output).toMatch(/features[\\/]big/);
  });

  it("passes when every real leaf is within the cap", () => {
    makeFiles(join(root, "features", "ok"), 10);
    const { code, output } = runLint(root);
    expect(code).toBe(0);
    expect(output).toMatch(/OK/);
  });

  it("SKIPS a nested Git worktree over the cap but still flags a real sibling leaf", () => {
    // A nested worktree: a directory with a `.git` file (linked-worktree marker)
    // whose migrations ledger blows past the cap — must be ignored.
    const worktree = join(root, ".claude", "worktrees", "wt");
    mkdirSync(worktree, { recursive: true });
    writeFileSync(join(worktree, ".git"), "gitdir: /somewhere/else\n");
    makeFiles(join(worktree, "supabase", "migrations"), 106);

    // A real source leaf under the cap → fine.
    makeFiles(join(root, "features", "fine"), 5);
    const okRun = runLint(root);
    expect(okRun.code).toBe(0);
    expect(okRun.output).toMatch(/OK/);

    // Now add a REAL over-cap source leaf: it must still be flagged, proving the
    // exclusion is scoped to the worktree, not a blanket pass.
    makeFiles(join(root, "features", "toobig"), 51);
    const badRun = runLint(root);
    expect(badRun.code).toBe(1);
    expect(badRun.output).toMatch(/features[\\/]toobig/);
    // The nested worktree's migrations must NOT appear as a violation.
    expect(badRun.output).not.toMatch(/worktrees[\\/]wt[\\/]supabase/);
  });

  it("SKIPS an orphaned .claude/worktrees leftover with NO .git marker (explicit exclusion)", () => {
    // A partial `git worktree remove` can leave a checkout whose `.git` marker is
    // already gone; the explicit `.claude/worktrees` exclusion must still skip it.
    const orphan = join(root, ".claude", "worktrees", "leftover");
    makeFiles(join(orphan, "supabase", "migrations"), 106);
    const { code, output } = runLint(root);
    expect(code).toBe(0);
    expect(output).not.toMatch(/worktrees[\\/]leftover/);
  });

  it("still scans authoritative .claude content that is NOT a worktree (e.g. skills)", () => {
    // A .claude subtree with no `.git` marker is real project content and stays
    // in scope — an over-cap leaf there is flagged.
    makeFiles(join(root, ".claude", "skills", "huge"), 51);
    const { code, output } = runLint(root);
    expect(code).toBe(1);
    expect(output).toMatch(/\.claude[\\/]skills[\\/]huge/);
  });
});
