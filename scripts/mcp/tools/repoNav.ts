/**
 * Internal MCP server — Phase-A repo-navigation tools.
 *
 *   repo_file_search    → filename/glob search across allow-listed code/doc
 *                         roots. PATHS ONLY (no content), bounded.
 *   find_route_handlers → enumerate app/api/**\/route.ts with detected HTTP
 *                         methods + auth/gate marker identifiers.
 *   find_tests_for_file → map a source path → likely test paths by convention
 *                         (and which actually exist). PATHS ONLY.
 *   get_file_outline    → STRUCTURAL outline of one allow-listed file (markdown
 *                         headings / exported symbols / route methods / test
 *                         names). Never the full body; byte-capped + redacted.
 *
 * All four are READ-ONLY and bounded. Every path input is validated through the
 * whitelist-first `resolveAllowedPath`/`readAllowedFile` seam (traversal,
 * absolute, percent-encoded, null-byte, blocked-segment and secret/env/key
 * filename patterns are all refused). No app code is imported; no shell is run.
 */
import { basename, dirname, extname } from "node:path";
import {
  ALLOWED_CODE_ROOTS,
  CLAUDE_MD_FILE,
  LIMITS,
  NAV_FILE_EXTENSIONS,
} from "../config";
import { existsAllowed, listFilesUnder, readAllowedFile } from "../lib/files";
import { PathNotAllowedError, resolveAllowedPath } from "../security/paths";
import type { ToolDefinition } from "../registry";

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests)
// ---------------------------------------------------------------------------

/** HTTP method exports Next.js route handlers may define. */
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

/**
 * Detect which HTTP methods a route file exports. Matches both
 * `export async function POST(` and `export const POST = ...`. Returns the
 * methods in canonical order, de-duplicated.
 */
export function detectRouteMethods(src: string): string[] {
  const found = new Set<string>();
  for (const method of HTTP_METHODS) {
    const re = new RegExp(
      `export\\s+(?:async\\s+function|function|const|let)\\s+${method}\\b`,
    );
    if (re.test(src)) found.add(method);
  }
  return HTTP_METHODS.filter((m) => found.has(m));
}

/**
 * Detect auth/gate guard identifiers referenced in a route file. Reports the
 * actual identifier names that appear (e.g. `requireUser`, `applyDiagnosticsGate`,
 * `requireCronAuth`, `requireUserWithAccount`, `authorizeFolderAccess`) rather
 * than asserting a verdict — it is a heuristic surface for security review, not
 * an authz proof. De-duplicated, sorted.
 */
export function detectAuthMarkers(src: string): string[] {
  const found = new Set<string>();
  const patterns: RegExp[] = [
    /\b(require[A-Z][A-Za-z0-9]*)\b/g,
    /\b(authorize[A-Z][A-Za-z0-9]*)\b/g,
    /\b(assert[A-Z][A-Za-z0-9]*)\b/g,
    /\b(applyDiagnosticsGate)\b/g,
    /\b(verifyApiKey|requireApiKey)\b/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      if (m[1]) found.add(m[1]);
    }
  }
  return [...found].sort();
}

/**
 * Compute conventional unit-test path candidates for a source path. Mirrors the
 * V2 convention: `tests/unit/<dir>/<base>.test.ts(x)`, and for Next route files
 * the flattened `tests/unit/<dir>/<parent>-route.test.ts`.
 */
export function testCandidatesFor(relPath: string): string[] {
  const posix = relPath.split("\\").join("/");
  const ext = extname(posix);
  const noExt = posix.slice(0, posix.length - ext.length);
  const base = basename(noExt);
  const dir = dirname(posix);
  const candidates = new Set<string>();

  // Direct mirror under tests/unit.
  candidates.add(`tests/unit/${noExt}.test.ts`);
  candidates.add(`tests/unit/${noExt}.test.tsx`);

  // Route files commonly flatten to <parent>-route.test.ts.
  if (base === "route") {
    candidates.add(`tests/unit/${dir}-route.test.ts`);
    candidates.add(`tests/unit/${dir}-route.test.tsx`);
  }

  // If the input already lives under tests/, it is its own candidate.
  if (posix.startsWith("tests/")) candidates.add(posix);

  return [...candidates];
}

/** Build a case-insensitive matcher from a query that may contain `*` globs. */
function queryToRegExp(query: string): RegExp {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const globbed = escaped.split("\\*").join(".*");
  return new RegExp(globbed, "i");
}

/**
 * Structural outline of a file's text. Returns ONLY structural tokens — markdown
 * headings, exported symbol declarations (name only, never initializer values),
 * route methods, and test/describe names. Never returns raw body lines. Bounded
 * by `LIMITS.outlineMaxItems`.
 */
export function outlineForFile(relPath: string, text: string): string[] {
  const ext = extname(relPath).toLowerCase();
  const out: string[] = [];
  const push = (s: string): void => {
    if (out.length < LIMITS.outlineMaxItems) out.push(s);
  };

  if (ext === ".md") {
    for (const line of text.split("\n")) {
      const m = line.match(/^(#{1,6})\s+(.+)$/);
      if (m && m[1] && m[2]) push(`${"#".repeat(m[1].length)} ${m[2].trim()}`);
    }
    return out;
  }

  const isTest = /\.(test|spec)\.[tj]sx?$/.test(relPath);
  if (isTest) {
    const re = /\b(describe|it|test)\s*\(\s*(['"`])([^'"`]{1,160})\2/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[1] && m[3]) push(`${m[1]}: ${m[3].trim()}`);
    }
    if (out.length) return out;
    // fall through to symbol extraction if no test names matched
  }

  if ([".ts", ".tsx", ".js", ".jsx", ".mjs"].includes(ext)) {
    // Route methods first (if this is a route file).
    if (basename(relPath) === "route.ts" || basename(relPath) === "route.tsx") {
      for (const method of detectRouteMethods(text)) push(`route method: ${method}`);
    }
    // Exported declarations — NAME ONLY (the capture stops at the identifier;
    // no initializer value is ever emitted).
    const declRe =
      /^export\s+(?:default\s+)?(?:async\s+)?(function|const|let|var|class|interface|type|enum)\s+([A-Za-z0-9_$]+)/gm;
    let m: RegExpExecArray | null;
    while ((m = declRe.exec(text)) !== null) {
      if (m[1] && m[2]) push(`export ${m[1]} ${m[2]}`);
    }
    if (/^export\s+default\s+(?!function|class)/m.test(text)) {
      push("export default");
    }
    return out;
  }

  // Unsupported type — no structural outline, only a note (never the body).
  push(`(no structural outline for ${ext || "extensionless"} files)`);
  return out;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function repoFileSearch(args: Record<string, unknown>): string {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (query.length < 2) return "Error: 'query' must be at least 2 characters.";
  const matcher = queryToRegExp(query);

  const all: string[] = [];
  for (const root of ALLOWED_CODE_ROOTS) {
    if (all.length >= LIMITS.navMaxFiles) break;
    const remaining = LIMITS.navMaxFiles - all.length;
    all.push(...listFilesUnder(root, NAV_FILE_EXTENSIONS, remaining));
  }

  const matched = all.filter((p) => matcher.test(p));
  const capped = matched.slice(0, LIMITS.navMaxResults);
  if (!capped.length) return `No files match "${query}" in the allow-listed roots.`;
  const note =
    matched.length > capped.length
      ? `\n…[${matched.length - capped.length} more match(es) not shown; cap ${LIMITS.navMaxResults}]`
      : "";
  return `${capped.length} path(s) for "${query}":\n${capped.join("\n")}${note}`;
}

function findRouteHandlers(args: Record<string, unknown>): string {
  const prefix = typeof args.pathPrefix === "string" ? args.pathPrefix.trim() : "";
  const routeFiles = listFilesUnder("app", [".ts", ".tsx"], LIMITS.navMaxFiles)
    .filter((p) => {
      const b = basename(p);
      return b === "route.ts" || b === "route.tsx";
    })
    .filter((p) => (prefix ? p.includes(prefix) : true))
    .slice(0, LIMITS.navMaxRoutes);

  if (!routeFiles.length) {
    return prefix
      ? `No route handlers under app/ matching "${prefix}".`
      : "No route handlers found under app/.";
  }

  const lines = routeFiles.map((rel) => {
    let methods: string[] = [];
    let markers: string[] = [];
    try {
      const { text } = readAllowedFile(rel, ALLOWED_CODE_ROOTS);
      methods = detectRouteMethods(text);
      markers = detectAuthMarkers(text);
    } catch {
      // unreadable → report path only
    }
    const methodStr = methods.length ? methods.join(",") : "(none detected)";
    const authStr = markers.length ? markers.join(",") : "(no guard marker)";
    return `- ${rel}\n    methods: ${methodStr}\n    auth markers: ${authStr}`;
  });

  return `${routeFiles.length} route handler(s):\n${lines.join("\n")}`;
}

function findTestsForFile(args: Record<string, unknown>): string {
  const filePath = typeof args.filePath === "string" ? args.filePath.trim() : "";
  if (!filePath) return "Error: 'filePath' is required (a repo-relative source path).";

  // Validate the input path through the whitelist (rejects traversal / absolute /
  // blocked names). It need not exist — we map it to test paths.
  try {
    resolveAllowedPath(filePath, ALLOWED_CODE_ROOTS, [CLAUDE_MD_FILE]);
  } catch (e) {
    if (e instanceof PathNotAllowedError) return `Error: ${e.message}`;
    return `Error: invalid 'filePath'.`;
  }

  const candidates = testCandidatesFor(filePath);
  const existing = candidates.filter((c) => existsAllowed(c, ["tests"]));
  const proposed = candidates.filter((c) => !existing.includes(c));

  const parts: string[] = [];
  parts.push(
    existing.length
      ? `Existing test(s):\n${existing.map((p) => `- ${p}`).join("\n")}`
      : "Existing test(s): none found by convention.",
  );
  if (proposed.length) {
    parts.push(
      `Conventional candidate path(s) (not present):\n${proposed
        .map((p) => `- ${p}`)
        .join("\n")}`,
    );
  }
  return parts.join("\n\n");
}

function getFileOutline(args: Record<string, unknown>): string {
  const filePath = typeof args.filePath === "string" ? args.filePath.trim() : "";
  if (!filePath) return "Error: 'filePath' is required (a repo-relative path).";

  let result;
  try {
    result = readAllowedFile(filePath, ALLOWED_CODE_ROOTS, [CLAUDE_MD_FILE]);
  } catch (e) {
    if (e instanceof PathNotAllowedError) return `Error: ${e.message}`;
    return `Error: cannot read '${filePath}'.`;
  }

  const items = outlineForFile(result.relPath, result.text);
  const header = `Outline of ${result.relPath} (${items.length} item(s)${
    result.truncated ? "; file body was byte-capped before parse" : ""
  }):`;
  const capNote =
    items.length >= LIMITS.outlineMaxItems
      ? `\n…[outline capped at ${LIMITS.outlineMaxItems} items]`
      : "";
  return `${header}\n${items.join("\n")}${capNote}`;
}

export const repoNavTools: ToolDefinition[] = [
  {
    name: "repo_file_search",
    description:
      "Search for files by name/glob across allow-listed source + doc roots. Returns PATHS ONLY (no content), bounded. Use '*' as a wildcard. Read-only; orientation aid, not a substitute for reading code.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Filename/path substring or glob (min 2 chars), e.g. 'diagnostics' or 'services/*/run*'.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    handler: repoFileSearch,
  },
  {
    name: "find_route_handlers",
    description:
      "List app/api route handlers (app/**/route.ts) with detected HTTP methods and auth/gate marker identifiers. Heuristic (marker presence, not an authz proof). Read-only; great for security-review orientation.",
    inputSchema: {
      type: "object",
      properties: {
        pathPrefix: {
          type: "string",
          description: "Optional substring filter on the route path, e.g. 'api/internal' or 'integrations'.",
        },
      },
      additionalProperties: false,
    },
    handler: findRouteHandlers,
  },
  {
    name: "find_tests_for_file",
    description:
      "Given a repo-relative source path, return the conventional unit-test path(s) — which exist, and which are the naming-convention candidates. PATHS ONLY. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Repo-relative source path, e.g. 'services/diagnostics/runReport.ts'.",
        },
      },
      required: ["filePath"],
      additionalProperties: false,
    },
    handler: findTestsForFile,
  },
  {
    name: "get_file_outline",
    description:
      "Structural outline of one allow-listed file: markdown headings / exported symbol names / route methods / test names. NEVER returns the full file body; byte-capped + redacted. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Repo-relative path under an allow-listed root (source, tests, docs, or CLAUDE.md).",
        },
      },
      required: ["filePath"],
      additionalProperties: false,
    },
    handler: getFileOutline,
  },
];
