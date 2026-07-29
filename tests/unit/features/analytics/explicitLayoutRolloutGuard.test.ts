import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * The explicit-layout writer guard
 * (S2 → widened in S3 → narrowed to ownership in S4).
 *
 * S2 banned writing outright, because persisting `layout` is a ONE-WAY DOOR:
 * once production rows carry the field, rolling back below the compatibility
 * release is unsafe. That release is now live, and S4 deliberately introduces a
 * controlled writer — so a blanket ban would either be deleted (losing all
 * protection) or lie.
 *
 * It is replaced with OWNERSHIP guards. The question is no longer "does anything
 * write?" but "does anything OTHER THAN the one place that is allowed to decide
 * write?" Concretely:
 *
 *   - Only the save orchestration may name `persist-explicit-layout`.
 *   - No read path may reach the serializer at all.
 *   - Routes must not decide persistence intent — the client sends widgets, the
 *     server validates them.
 *   - No component may hand-build persisted widget JSON; placement is written by
 *     the serializer, which validates the whole board first.
 *
 * When a new call site is genuinely required, add it to the allow-list here on
 * purpose — do not widen the pattern and do not delete the test.
 */

const REPO_ROOT = process.cwd();

function walk(root: string): string[] {
  const absolute = join(REPO_ROOT, root);
  let entries;
  try {
    entries = readdirSync(absolute, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(absolute, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      files.push(...walk(relative(REPO_ROOT, full)));
    } else if (/\.tsx?$/.test(entry.name)) {
      files.push(relative(REPO_ROOT, full));
    }
  }
  return files;
}

const read = (file: string) => readFileSync(join(REPO_ROOT, file), "utf8");

const SHIPPING_ROOTS = [
  "app",
  "components",
  "features",
  "lib",
  "services",
  "stores",
  "core",
  "contracts",
];

/** The serializer itself, its barrel, and the ONE module that decides intent. */
const INTENT_OWNERS = [
  join("core", "analytics", "layout", "serializeDashboardWidgets.ts"),
  join("core", "analytics", "layout", "index.ts"),
  join("features", "analytics", "grid", "layoutEditState.ts"),
];

/** Modules that only ever READ a dashboard. */
const READ_PATHS = [
  join("core", "analytics", "layout", "normalizeDashboardWidgets.ts"),
  join("core", "analytics", "layout", "legacyMigration.ts"),
  join("services", "analytics", "dashboards.ts"),
];

describe("only the save orchestration decides to write explicit layout", () => {
  it("nothing else names `persist-explicit-layout`", () => {
    const offenders = SHIPPING_ROOTS.flatMap(walk).filter((file) => {
      if (INTENT_OWNERS.some((allowed) => file.endsWith(allowed))) return false;
      return read(file).includes("persist-explicit-layout");
    });
    expect(offenders).toEqual([]);
  });

  it("the decision is made by comparing rectangles, not by a layout merely existing", () => {
    const source = read(join("features", "analytics", "grid", "layoutEditState.ts"));
    // `saveIntent` must consult dirtiness; a version that always returns the
    // explicit intent would convert every legacy board on its first save.
    expect(source).toMatch(/saveIntent[\s\S]{0,400}isLayoutDirty/);
    expect(source).toContain('"preserve-source"');
  });

  it("no read path can reach the serializer", () => {
    const offenders = READ_PATHS.filter((file) =>
      /serializeDashboardWidgets|persist-explicit-layout/.test(read(file)),
    );
    expect(offenders).toEqual([]);
  });
});

describe("the write boundary keeps its shape", () => {
  it("API routes never decide persistence intent", () => {
    const offenders = walk(join("app", "api")).filter((file) =>
      /persist-explicit-layout|preserve-source|serializeDashboardWidgets/.test(read(file)),
    );
    expect(offenders).toEqual([]);
  });

  it("no component or hook hand-builds a persisted `layout` field", () => {
    // Placement reaches storage through the serializer, which validates the
    // whole board first. A stray `layout: { x: … }` literal in a component would
    // bypass that check entirely.
    const offenders = ["features", "components", "stores"]
      .flatMap(walk)
      .filter((file) => !file.includes(join("features", "analytics", "grid") + sep))
      // The browser-test harness builds fixture boards; it ships nothing, and
      // is unreachable in a production build.
      .filter((file) => !file.includes(join("features", "analytics", "testing") + sep))
      // A TYPE annotation (`layout: { x: number … }`) declares a shape; it does
      // not construct a value.
      .filter((file) => /\blayout:\s*\{\s*x:\s*(?!number)/.test(read(file)));
    expect(offenders).toEqual([]);
  });

  it("the serializer still validates the complete board before emitting it", () => {
    const source = read(join("core", "analytics", "layout", "serializeDashboardWidgets.ts"));
    expect(source).toContain("validateLayout");
    expect(source).toContain("missing-placement");
  });

  it("the editor sends the serializer's output, never a hand-assembled array", () => {
    const dashboard = read(join("features", "analytics", "AnalyticsDashboard.tsx"));
    expect(dashboard).toContain("edit.buildSavePayload");
    expect(dashboard).toContain("widgets: payload.widgets");
  });
});

describe("the shipping page is on the explicit renderer", () => {
  it("renders through AnalyticsExplicitGrid", () => {
    const dashboard = read(join("features", "analytics", "AnalyticsDashboard.tsx"));
    expect(dashboard).toContain("AnalyticsExplicitGrid");
  });

  it("no longer positions widgets with CSS auto-placement or span classes", () => {
    const dashboard = read(join("features", "analytics", "AnalyticsDashboard.tsx"));
    expect(dashboard).not.toContain("lg:grid-cols-3");
    expect(dashboard).not.toContain("grid-auto-rows");
    const card = read(join("features", "analytics", "Widget.tsx"));
    expect(card).not.toContain("col-span-");
    expect(card).not.toContain("row-span-");
  });

  it("the ordered drag model is gone from production code", () => {
    const offenders = SHIPPING_ROOTS.flatMap(walk).filter((file) =>
      /useWidgetDragSession|useGridReflow/.test(read(file)),
    );
    expect(offenders).toEqual([]);
  });
});
