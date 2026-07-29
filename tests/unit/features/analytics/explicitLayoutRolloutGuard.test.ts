import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * The explicit-layout rollout guard
 * (ANALYTICS-EXPLICIT-LAYOUT-S2-CONTRACT-1, widened in S3).
 *
 * Persisting `layout` is a ONE-WAY DOOR: once production rows carry the field,
 * rolling back to a build whose parser rejects it is no longer safe. The plan is
 * expand-then-write — ship a release that can READ the field, verify it live,
 * and only then ship a release that writes it.
 *
 * S3 built the explicit renderer, so the guard now distinguishes THREE states
 * rather than two. Reading coordinates inside the prepared renderer seam is
 * allowed; putting that renderer on the shipping page is not; writing is still
 * not:
 *
 *   ALLOWED NOW   — `features/analytics/grid/` reads x/y and renders from them.
 *   BLOCKED (S4)  — the shipping Analytics page importing that renderer.
 *                   Rendering and dragging must switch together, or edit mode
 *                   spends a release half-converted.
 *   BLOCKED (S4+) — any code asking the serializer to persist explicit layout,
 *                   until the compatibility reader is live and verified.
 *
 * Each boundary has to be crossed by a deliberate edit to the allow-lists here,
 * not by something that arrives with a drag or resize change. When a stage is
 * intentionally reached, MOVE the path into the right allow-list — do not delete
 * the test.
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

/** The serializer's own definition and its barrel are not call sites. */
const INTENT_ALLOWED = [
  join("core", "analytics", "layout", "serializeDashboardWidgets.ts"),
  join("core", "analytics", "layout", "index.ts"),
];

const SHIPPING_ROOTS = ["app", "components", "features", "lib", "services", "stores", "core", "contracts"];
/** Where a widget is turned into pixels. */
const RENDER_ROOTS = ["features", "components", "stores"];

/** The prepared, not-yet-activated explicit renderer seam (S3). */
const RENDERER_SEAM = join("features", "analytics", "grid") + sep;
/** The engine, which has always been allowed to read coordinates. */
const ENGINE = join("core", "analytics", "layout") + sep;

describe("writing explicit layout is still blocked", () => {
  it("nothing outside the serializer asks for `persist-explicit-layout`", () => {
    const offenders = SHIPPING_ROOTS.flatMap(walk).filter((file) => {
      if (INTENT_ALLOWED.some((allowed) => file.endsWith(allowed))) return false;
      return readFileSync(join(REPO_ROOT, file), "utf8").includes("persist-explicit-layout");
    });
    expect(offenders).toEqual([]);
  });
});

describe("reading explicit coordinates is confined to the prepared seam", () => {
  it("only the renderer seam and the engine read a widget's x/y", () => {
    // The SHIPPING page still derives position from array order and CSS
    // auto-flow. A stray `widget.layout.x` anywhere else would mean the two
    // models had quietly started to mix — the failure S2 exists to prevent.
    const offenders = RENDER_ROOTS.flatMap(walk).filter((file) => {
      if (file.includes(RENDERER_SEAM) || file.includes(ENGINE)) return false;
      return /\.layout[!?]?\.[xy]\b/.test(readFileSync(join(REPO_ROOT, file), "utf8"));
    });
    expect(offenders).toEqual([]);
  });
});

describe("the explicit renderer is built but not yet on the shipping page", () => {
  /**
   * Only these may import the seam today. S4 adds the dashboard here in the same
   * batch that converts the drag session — never before it.
   */
  const SEAM_CONSUMERS_ALLOWED = [RENDERER_SEAM];

  it("no shipping module imports the explicit renderer", () => {
    const offenders = SHIPPING_ROOTS.flatMap(walk).filter((file) => {
      if (SEAM_CONSUMERS_ALLOWED.some((allowed) => file.includes(allowed))) return false;
      return /from\s+["'][^"']*features\/analytics\/grid/.test(
        readFileSync(join(REPO_ROOT, file), "utf8"),
      );
    });
    expect(offenders).toEqual([]);
  });

  it("the shipping dashboard still renders the ordered auto-flow grid", () => {
    // Positive assertion, so the guard cannot be satisfied by the page simply
    // rendering nothing at all.
    const page = readFileSync(
      join(REPO_ROOT, "features", "analytics", "AnalyticsDashboard.tsx"),
      "utf8",
    );
    expect(page).toContain("grid-cols-1");
    expect(page).toContain("lg:grid-cols-3");
    expect(page).not.toContain("AnalyticsExplicitGrid");
  });

  it("the seam exists and is ready for S4 to select", () => {
    const seam = walk(join("features", "analytics", "grid"));
    expect(seam.length).toBeGreaterThan(0);
  });
});
