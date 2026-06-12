/**
 * Internal MCP server — configuration & whitelist.
 *
 * Purpose: central, auditable definition of EVERYTHING the internal developer
 * MCP server is allowed to touch. This is a local developer tool. It is NOT
 * user-facing, NOT connected to production data, and has NO database access.
 *
 * Security model: WHITELIST-FIRST. A path is readable only if it resolves
 * inside the repo root AND sits under one of `ALLOWED_DOC_ROOTS` /
 * `ALLOWED_FILES` / `INTEGRATIONS_DIR`, AND passes the blocklist in
 * `security/paths.ts`. Nothing else is reachable.
 *
 * Safe execution: no inputs are required to run. Adding a new readable root or
 * runnable command is a deliberate edit to THIS file plus a tool in
 * `tools/`. There is no generic "read any file" or "run any command" path.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** Walk up from a start dir to the ChainReactV2 repo root (markers present). */
function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 8; i += 1) {
    const hasMarkers =
      existsSync(resolve(dir, "package.json")) &&
      existsSync(resolve(dir, "docs")) &&
      existsSync(resolve(dir, "integrations"));
    if (hasMarkers) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fall back to cwd (npm scripts run from the package root). Still subject to
  // every downstream whitelist + blocklist check, so this is not a hole.
  return resolve(process.cwd());
}

/**
 * Repo root. `CHAINREACT_REPO_ROOT` allows an explicit override (e.g. when a
 * desktop MCP host launches the server with an unrelated cwd). Otherwise the
 * marker-walk locates the root from this file's location, so it works from both
 * the compiled `scripts/mcp/dist/` output and the ts-jest source tree.
 */
export const REPO_ROOT: string = process.env.CHAINREACT_REPO_ROOT
  ? resolve(process.env.CHAINREACT_REPO_ROOT)
  : findRepoRoot(__dirname);

/** Root docs directory (repo-relative). */
export const DOCS_ROOT = "docs";

/** Repo-relative directories whose `*.md` files may be read / searched. */
export const ALLOWED_DOC_ROOTS: readonly string[] = [DOCS_ROOT];

/** Specific repo-relative files that may be read outside the doc roots. */
export const ALLOWED_FILES: readonly string[] = ["CLAUDE.md"];

/** Curated rolling project-memory file. */
export const PROJECT_MEMORY_FILE = "docs/PROJECT_MEMORY.md";

/** Rule docs directory. */
export const RULE_DOCS_DIR = "docs/rules";

/** Root Claude instruction file. */
export const CLAUDE_MD_FILE = "CLAUDE.md";

/** Provider integration root — only `<provider>/manifest.ts` is read, as text. */
export const INTEGRATIONS_DIR = "integrations";

/** Builder-metadata launch-gap tracker (read as text if present). */
export const BUILDER_GAP_TRACKER_FILE =
  "docs/slices/phase-4/provider-metadata-launch-gap-tracker.md";

/**
 * Stage-2A diagnostics — narrow, purpose-built readable locations.
 *
 * These are deliberately NOT folded into `ALLOWED_DOC_ROOTS` (so the docs
 * search can never sweep them) and NOT into `INTEGRATIONS_DIR`. Each tool
 * passes the exact root below to `readAllowedFile`, so the path whitelist +
 * byte cap + redaction still gate every read. Both files are plain JSON.
 */

/** Committed, generated option-source manifest (read as JSON text; NEVER imports app code). */
export const MCP_DATA_DIR = "scripts/mcp/data";
export const OPTION_SOURCE_MANIFEST_FILE =
  "scripts/mcp/data/option-source-manifest.json";

/**
 * Sanitized smoke-result artifact root. Runtime-produced + gitignored. The MCP
 * server reads ONLY the single sanitized JSON below — never `test-results/` or
 * `playwright-report/`, which remain blocked segments in `security/paths.ts`.
 */
export const SMOKE_ARTIFACT_DIR = "artifacts/mcp";
export const SMOKE_ARTIFACT_FILE = "artifacts/mcp/smoke-latest.json";

/** Output / read limits — guard against accidental huge payloads. */
export const LIMITS = {
  /** Max bytes read from any single file. */
  maxFileBytes: 256 * 1024,
  /** Max characters returned in any single tool result (post-redaction). */
  maxOutputChars: 100_000,
  /** Max files scanned by a docs search. */
  searchMaxFiles: 2_000,
  /** Max match results returned by a docs search. */
  searchMaxResults: 80,
  /** Per-command wall-clock timeout for the allowlisted command wrappers. */
  commandTimeoutMs: 180_000,
  /** Max characters of captured command stdout/stderr returned. */
  commandMaxChars: 40_000,
} as const;

/**
 * Allowlist of EXACT npm scripts the command wrappers may run. Each is local,
 * read-only, and non-mutating. No db:push, no migrations, no deploy, no git
 * push, no PR creation, no arbitrary shell — those are deliberately absent.
 */
export const ALLOWED_NPM_SCRIPTS: Readonly<Record<string, string>> = {
  typecheck: "typecheck",
  lint: "lint",
  "lint:structure": "lint:structure",
} as const;
