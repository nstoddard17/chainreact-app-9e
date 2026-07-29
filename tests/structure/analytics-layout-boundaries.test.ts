import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

/**
 * Structure boundary test for the Analytics layout engine
 * (ANALYTICS-EXPLICIT-LAYOUT-S2.5-BOUNDARY-REALIGN-1).
 *
 * The engine landed under `features/analytics/layout/` in S1, which forced the
 * server to reach into a feature folder — the first such import in the repo. S2.5
 * moved it to `core/analytics/layout/` and fixed the direction of every edge:
 *
 *   contracts/            persisted shape + canonical constants (owns nothing else)
 *   core/analytics/layout pure placement arithmetic; imports only contracts/
 *   services/analytics    orchestration + board-level write validation
 *   app/api/analytics     auth, parse, call a service, format the response
 *   features/analytics    UI; consumes the core engine for preview/rendering
 *
 * These tests are what stop the boundary drifting back as S3/S4 add call sites.
 */

const ROOT = resolve(__dirname, "../..");

function collect(dir: string, predicate: (name: string) => boolean = () => true): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(join(ROOT, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      out.push(...collect(rel, predicate));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name) && predicate(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

/**
 * Every module specifier a file actually resolves — `from "…"`, `import("…")`
 * and `require("…")`. Deliberately NOT a plain substring search over the source:
 * a comment recording where a module used to live is history, not an import.
 */
function importSpecifiers(source: string): string[] {
  const found: string[] = [];
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) found.push(match[1]!);
  }
  return found;
}

/** Every source root that ships or tests code (docs are deliberately excluded). */
const ALL_SOURCE_ROOTS = [
  "app",
  "components",
  "contracts",
  "core",
  "features",
  "lib",
  "repositories",
  "scripts",
  "services",
  "stores",
  "tests",
  "utils",
];

const CORE_LAYOUT = join("core", "analytics", "layout");

describe("the Analytics layout engine has one home", () => {
  it("no source file imports the retired feature-owned path", () => {
    // IMPORT SPECIFIERS only. Prose may still name the old path as history —
    // the supersession notes in this repo deliberately do — but no module may
    // resolve to it. Both the `@/`-aliased and relative spellings are checked.
    const offenders = ALL_SOURCE_ROOTS.flatMap((r) => collect(r)).filter((file) =>
      importSpecifiers(read(file)).some((s) => s.includes("features/analytics/layout")),
    );
    expect(offenders).toEqual([]);
  });

  it("leaves no implementation or compatibility barrel under features/", () => {
    expect(collect(join("features", "analytics", "layout"))).toEqual([]);
  });

  it.each([
    "placeWidget",
    "resizeWidget",
    "validateLayout",
    "findFirstAvailableRect",
    "migrateLegacyOrderedLayout",
    "normalizeDashboardWidgets",
    "serializeDashboardWidgets",
  ])("declares %s exactly once, and inside core/analytics/layout", (symbol) => {
    const declaration = new RegExp(`export\\s+function\\s+${symbol}\\b`);
    const sites = ALL_SOURCE_ROOTS.flatMap((r) => collect(r)).filter((file) =>
      declaration.test(read(file)),
    );
    expect(sites).toHaveLength(1);
    expect(sites[0]!.startsWith(CORE_LAYOUT + sep)).toBe(true);
  });

  it.each(["ANALYTICS_SIZE_FOOTPRINT", "ANALYTICS_CANONICAL_COLUMNS"])(
    "declares %s exactly once, and inside contracts/",
    (constant) => {
      // Re-exports are fine — a second `const` is not.
      const declaration = new RegExp(`export\\s+const\\s+${constant}\\b`);
      const sites = ALL_SOURCE_ROOTS.flatMap((r) => collect(r)).filter((file) =>
        declaration.test(read(file)),
      );
      expect(sites).toEqual([join("contracts", "analytics.ts")]);
    },
  );
});

describe("core/analytics/layout stays pure", () => {
  const files = collect(CORE_LAYOUT);

  it("contains the engine", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("imports nothing but contracts/ and its own siblings", () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const line of read(file).split("\n")) {
        const match = /from\s+["']([^"']+)["']/.exec(line);
        const specifier = match?.[1];
        if (!specifier) continue;
        if (specifier.startsWith("./") || specifier.startsWith("../")) continue;
        if (specifier.startsWith("@/contracts/")) continue;
        offenders.push(`${file} → ${specifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never touches React, Next, the DOM or CSS", () => {
    const banned = /\b(react|next\/|document\.|window\.|getBoundingClientRect|\.css)\b/;
    const offenders = files.filter((file) => banned.test(read(file)));
    expect(offenders).toEqual([]);
  });
});

describe("Analytics API routes reach layout rules through a service", () => {
  const routeFiles = collect(join("app", "api", "analytics"));

  it("finds the analytics routes", () => {
    expect(routeFiles.some((f) => f.endsWith(`${sep}route.ts`))).toBe(true);
  });

  it.each([
    ["a feature module", /from\s+["']@\/features\//],
    ["the layout engine directly", /from\s+["']@\/core\/analytics\/layout/],
    ["a repository", /from\s+["']@\/repositories\//],
  ])("imports no %s", (_what, pattern) => {
    const offenders = routeFiles.filter((file) => pattern.test(read(file)));
    expect(offenders).toEqual([]);
  });

  it("owns no board-validation arithmetic of its own", () => {
    // `validateLayout` / `rectsOverlap` appearing here would mean a layout rule
    // had climbed back above the service layer.
    const offenders = routeFiles.filter((file) =>
      /\b(validateLayout|rectsOverlap|findFirstAvailableRect|placeWidget)\s*\(/.test(read(file)),
    );
    expect(offenders).toEqual([]);
  });
});

describe("the engine's consumers sit on the right side of the boundary", () => {
  it("services import the core engine, never a feature", () => {
    const files = collect(join("services", "analytics"));
    const offenders = files.filter((file) => /from\s+["']@\/features\//.test(read(file)));
    expect(offenders).toEqual([]);
  });

  it("no Analytics feature file re-implements placement arithmetic", () => {
    const files = collect(join("features", "analytics"));
    const offenders = files.filter((file) =>
      /export\s+function\s+(placeWidget|resizeWidget|validateLayout|rectsOverlap)\b/.test(
        read(file),
      ),
    );
    expect(offenders).toEqual([]);
  });
});

/** Keeps `relative` honest if the harness ever runs from another cwd. */
expect(relative(ROOT, join(ROOT, "core"))).toBe("core");
