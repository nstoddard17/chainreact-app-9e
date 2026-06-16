/**
 * Internal MCP server — verification advisory tool.
 *
 *   suggest_verification_for_changed_files → recommends which local checks to
 *   run for a set of changed files. It RECOMMENDS only; it never executes a
 *   check, never pushes, never mutates anything.
 *
 * Changed files come from a read-only `git diff --name-only HEAD` (+ untracked
 * via `git ls-files --others --exclude-standard`) unless the caller passes an
 * explicit `paths` array. The git invocation uses a fixed argv with
 * `shell: false` — no tool argument ever reaches a command line, so there is no
 * shell-interpolation or argument-injection surface (mirrors the `commands.ts`
 * npm-wrapper safety model).
 */
import { spawnSync } from "node:child_process";
import { LIMITS, REPO_ROOT } from "../config";
import type { ToolDefinition } from "../registry";

export interface VerificationRecommendation {
  readonly check: string;
  readonly reason: string;
}

const norm = (p: string): string => p.split("\\").join("/").trim();

/**
 * Pure mapping: changed file paths → recommended checks. Deterministic and
 * side-effect-free (exported for tests). Order is stable; duplicates collapsed.
 */
export function recommendChecksForPaths(
  paths: readonly string[],
): VerificationRecommendation[] {
  const files = paths.map(norm).filter((p) => p.length > 0);
  if (!files.length) return [];

  const recs: VerificationRecommendation[] = [];
  const seen = new Set<string>();
  const add = (check: string, reason: string): void => {
    if (seen.has(check)) return;
    seen.add(check);
    recs.push({ check, reason });
  };

  const has = (pred: (p: string) => boolean): boolean => files.some(pred);
  const isTs = (p: string): boolean => /\.(ts|tsx)$/.test(p);
  const underSource = (p: string): boolean =>
    /^(app|services|repositories|integrations|contracts|core|features|lib|stores|utils|workflow-engine|components|middleware)/.test(
      p,
    );

  if (has(isTs)) {
    add("npm run typecheck", "TypeScript files changed (tsc --noEmit).");
    add("npm run lint", "JS/TS files changed (eslint).");
  }
  if (has((p) => underSource(p) && isTs(p))) {
    // already covered by typecheck; nothing extra
  }
  if (has((p) => /\/route\.ts$/.test(p) && p.startsWith("app/api/"))) {
    add(
      "npm test tests/structure/api-route-authorization.test.ts",
      "An app/api route handler changed — re-run the route authorization structure test.",
    );
    add(
      "find_route_handlers (MCP)",
      "Review the changed route's detected methods + auth/gate markers.",
    );
  }
  if (has((p) => p.startsWith("integrations/") || p.startsWith("services/discovery/"))) {
    add(
      "npm test tests/structure/discovery-meta-coverage.test.ts",
      "Provider/integration metadata changed — re-run the discovery-meta coverage gate.",
    );
  }
  if (has((p) => p.startsWith("supabase/migrations/"))) {
    add(
      "npm run lint:migrations",
      "A migration changed — re-run the migration RLS/GRANT lint (read-only; does NOT apply migrations).",
    );
  }
  if (has((p) => p.startsWith("scripts/mcp/"))) {
    add("npm run mcp:smoke", "MCP server changed — build + stdio smoke.");
    add("npm test tests/unit/mcp", "MCP server changed — run the MCP unit suite.");
  }
  if (has((p) => p.startsWith("tests/"))) {
    add("npm test <changed test path>", "Test files changed — run them directly.");
  }
  // Structure lint is cheap and catches leaf-folder caps when files are added/moved.
  add(
    "npm run lint:structure",
    "Baseline: cheap leaf-folder cap check; always safe to run before a commit.",
  );

  return recs;
}

/** Read changed files via two fixed, read-only git invocations (no shell). */
function gitChangedFiles(): { files: string[]; note: string | null } {
  const run = (gitArgs: string[]): string[] => {
    const r = spawnSync("git", gitArgs, {
      cwd: REPO_ROOT,
      timeout: LIMITS.gitTimeoutMs,
      encoding: "utf8",
      shell: false,
      maxBuffer: 8 * 1024 * 1024,
    });
    if (r.error || typeof r.stdout !== "string") return [];
    return r.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  };
  try {
    const tracked = run(["diff", "--name-only", "HEAD"]);
    const untracked = run(["ls-files", "--others", "--exclude-standard"]);
    const files = [...new Set([...tracked, ...untracked])];
    return { files, note: null };
  } catch {
    return { files: [], note: "git unavailable" };
  }
}

function suggestVerification(args: Record<string, unknown>): string {
  let files: string[];
  let source: string;
  if (Array.isArray(args.paths)) {
    files = args.paths.filter((p): p is string => typeof p === "string");
    source = "provided paths";
  } else {
    const { files: changed, note } = gitChangedFiles();
    files = changed;
    source = note ? `git (${note})` : "git diff vs HEAD + untracked";
  }

  if (!files.length) {
    return `No changed files detected (${source}). Nothing to recommend.`;
  }

  const recs = recommendChecksForPaths(files);
  const fileList = files
    .slice(0, 50)
    .map((p) => `  - ${p}`)
    .join("\n");
  const more = files.length > 50 ? `\n  …(${files.length - 50} more)` : "";
  const recLines = recs.map((r) => `- ${r.check}\n    why: ${r.reason}`).join("\n");
  return [
    `Changed files (${source}, ${files.length}):`,
    `${fileList}${more}`,
    "",
    `Recommended checks (advisory — this tool does NOT run them):`,
    recLines,
  ].join("\n");
}

export const verifyTools: ToolDefinition[] = [
  {
    name: "suggest_verification_for_changed_files",
    description:
      "Recommend which local checks to run for the currently changed files (git diff vs HEAD + untracked, or an explicit 'paths' list). ADVISORY ONLY — it never executes a check, pushes, or mutates anything.",
    inputSchema: {
      type: "object",
      properties: {
        paths: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional explicit list of changed repo-relative paths. If omitted, the tool reads changed files from git (read-only).",
        },
      },
      additionalProperties: false,
    },
    handler: suggestVerification,
  },
];
