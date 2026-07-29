import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * ANALYTICS-EXPLICIT-LAYOUT-S2-CONTRACT-1 — the rollout guard.
 *
 * Persisting `layout` is a ONE-WAY DOOR: once production rows carry the field,
 * rolling back to a build whose parser rejects it is no longer safe. The plan is
 * expand-then-write — ship a release that can READ the field, verify it live,
 * and only then ship a release that writes it.
 *
 * This test is what keeps that sequence honest. It fails the moment shipping
 * code asks the serializer to write explicit placement, or the renderer starts
 * reading explicit coordinates, so crossing either boundary has to be a
 * deliberate edit to this file rather than something that arrives with a drag
 * or resize change.
 *
 * When the writer release is intentionally prepared, update the allow-list
 * below to name the call sites that may do it — do not simply delete the test.
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
  join("features", "analytics", "layout", "serializeDashboardWidgets.ts"),
  join("features", "analytics", "layout", "index.ts"),
];

const SHIPPING_ROOTS = ["app", "components", "features", "lib", "services", "stores", "core", "contracts"];
/** Where a widget is turned into pixels. */
const RENDER_ROOTS = ["features", "components", "stores"];

describe("no shipping code writes explicit layout yet", () => {
  it("nothing outside the serializer asks for `persist-explicit-layout`", () => {
    const offenders = SHIPPING_ROOTS.flatMap(walk).filter((file) => {
      if (INTENT_ALLOWED.some((allowed) => file.endsWith(allowed))) return false;
      return readFileSync(join(REPO_ROOT, file), "utf8").includes("persist-explicit-layout");
    });
    expect(offenders).toEqual([]);
  });

  it("no component, hook or store reads a widget's explicit coordinates yet", () => {
    // The renderer still derives position from array order and CSS auto-flow.
    // A stray `widget.layout.x` outside the engine would mean the two models
    // had quietly started to mix — the exact failure S2 exists to prevent.
    const layoutModule = join("features", "analytics", "layout") + sep;
    const offenders = RENDER_ROOTS.flatMap(walk).filter((file) => {
      if (file.includes(layoutModule)) return false;
      return /\.layout[!?]?\.[xy]\b/.test(readFileSync(join(REPO_ROOT, file), "utf8"));
    });
    expect(offenders).toEqual([]);
  });
});
