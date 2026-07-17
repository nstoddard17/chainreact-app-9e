/**
 * @jest-environment node
 *
 * Clean-checkout guard: no TRACKED file may import an UNTRACKED one.
 *
 * Why this exists — this bug class has shipped to v2-main three times, and it
 * is invisible to every other gate:
 *
 *   1. 225826fb2 registered `github/options/{labels,assignees}.ts` but left the
 *      `_shared.ts` defining `parseRepositoryDep` untracked.
 *   2. The same commit registered 21 `microsoft-powerbi/options/*` resolvers
 *      whose sources stayed untracked for days.
 *   3. eb62221c8 registered 5 more resolvers (slack:channels_archived,
 *      microsoft-outlook:categories, microsoft-excel:table_columns,
 *      microsoft-teams:chats, microsoft-onenote:target_sections) with the same
 *      omission.
 *
 * Every one was a `git add` that took the registry edit and missed the new
 * files. Locally everything passes — tsc, lint, and jest all read the DIRTY
 * WORKING TREE, where the untracked file is sitting right there on disk. Only a
 * fresh clone of the branch fails, with `TS2307: cannot find module`. So CI,
 * a teammate, and the production build are the first to find out.
 *
 * This test is the one check that reads git's index instead of the filesystem,
 * which is why it catches what tsc structurally cannot. A failure means: run
 * `git add` on the named file(s), or delete the import.
 *
 * Scope: every tracked `.ts`/`.tsx` file's relative and `@/`-aliased imports.
 * Bare package specifiers are node_modules' business, not ours. An import that
 * resolves to NOTHING is left to tsc — this guard only reports the
 * exists-on-disk-but-not-in-git case, which is the silent one.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../..");

/** Files git actually knows about, repo-relative with forward slashes. */
function trackedFiles(): Set<string> {
  const out = execFileSync("git", ["ls-files", "-z"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return new Set(out.split("\0").filter(Boolean));
}

/**
 * Every import/export/require specifier in a source file. Covers
 * `from "x"`, bare `import "x"`, `require("x")`, and dynamic `import("x")`.
 */
function specifiersIn(src: string): string[] {
  const specs: string[] = [];
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) specs.push(m[1]!);
  }
  return specs;
}

/** Resolve a specifier to a repo-relative file, mirroring the tsconfig `@/*` alias. */
function resolveSpecifier(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) {
    base = spec.slice(2);
  } else if (spec.startsWith(".")) {
    base = path
      .join(path.dirname(fromFile), spec)
      .split(path.sep)
      .join("/");
  } else {
    return null; // bare package specifier
  }
  base = path.posix.normalize(base);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.d.ts`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ];
  for (const c of candidates) {
    const abs = path.join(REPO_ROOT, c);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return c;
  }
  return null; // unresolvable — tsc's job, not ours
}

describe("clean-checkout guard — tracked code never imports untracked code", () => {
  it("every import from a tracked .ts/.tsx file resolves to a tracked file", () => {
    const tracked = trackedFiles();
    const sources = [...tracked].filter(
      (f) => /\.tsx?$/.test(f) && !f.endsWith(".d.ts"),
    );
    // Sanity: prove we actually walked the repo rather than an empty list.
    expect(sources.length).toBeGreaterThan(1000);

    const offenders: string[] = [];
    for (const file of sources) {
      const src = fs.readFileSync(path.join(REPO_ROOT, file), "utf8");
      for (const spec of specifiersIn(src)) {
        const resolved = resolveSpecifier(file, spec);
        if (resolved !== null && !tracked.has(resolved)) {
          offenders.push(`${file}\n      imports "${spec}"\n      -> ${resolved} (EXISTS ON DISK, NOT TRACKED BY GIT)`);
        }
      }
    }

    if (offenders.length > 0) {
      throw new Error(
        `${offenders.length} tracked file(s) import a file git does not track.\n\n` +
          offenders.map((o) => `  • ${o}`).join("\n\n") +
          "\n\nThis compiles for YOU (tsc reads your working tree, where the file " +
          "exists) but a clean checkout of this branch fails with TS2307, so CI / a " +
          "teammate / the production build is the first to find out.\n" +
          "Fix: `git add` the file(s) above, or drop the import.",
      );
    }
    expect(offenders).toEqual([]);
  });
});
