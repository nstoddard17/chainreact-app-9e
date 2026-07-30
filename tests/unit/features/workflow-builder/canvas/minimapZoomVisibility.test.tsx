/**
 * BUILDER-CANVAS-ZOOM-FOCUS-1 — the minimap hides while the canvas is zoomed in.
 *
 * It earns its corner of the canvas when you are zoomed OUT and need to know where you are in a
 * large workflow. Zoomed IN — which is exactly what opening a node's config does — you are working
 * on one node and it sits over the area you are looking at.
 */
import {
  MINIMAP_HIDE_ZOOM,
  shouldShowMiniMap,
} from "@/features/workflow-builder/canvas/WorkflowCanvas";

// React Flow caps `fitView` at zoom 1.0; the focus hook's floors are 1.4 (config-open) and 1.75
// (reveal). The threshold has to land strictly between them or the feature misfires in one
// direction or the other.
const FIT_VIEW_MAX_ZOOM = 1.0;
const CONFIG_MIN_ZOOM = 1.4;
const REVEAL_ZOOM = 1.75;

describe("minimap visibility threshold", () => {
  it("sits above any zoom a fitted canvas produces, so a normal view always shows it", () => {
    expect(MINIMAP_HIDE_ZOOM).toBeGreaterThan(FIT_VIEW_MAX_ZOOM);
    expect(shouldShowMiniMap(FIT_VIEW_MAX_ZOOM)).toBe(true);
    expect(shouldShowMiniMap(0.5)).toBe(true);
  });

  it("sits below both focus zooms, so opening a config or revealing a field always hides it", () => {
    expect(MINIMAP_HIDE_ZOOM).toBeLessThanOrEqual(CONFIG_MIN_ZOOM);
    expect(shouldShowMiniMap(CONFIG_MIN_ZOOM)).toBe(false);
    expect(shouldShowMiniMap(REVEAL_ZOOM)).toBe(false);
  });

  it("comes BACK on zoom out — the predicate has no memory of having hidden", () => {
    // The failure mode worth guarding: a latched flag that hides the minimap on the first zoom-in
    // and never restores it. Same input, same answer, regardless of what came before.
    expect(shouldShowMiniMap(0.8)).toBe(true);
    expect(shouldShowMiniMap(REVEAL_ZOOM)).toBe(false);
    expect(shouldShowMiniMap(0.8)).toBe(true);
  });

  it("hides exactly AT the threshold, not just past it", () => {
    expect(shouldShowMiniMap(MINIMAP_HIDE_ZOOM)).toBe(false);
    expect(shouldShowMiniMap(MINIMAP_HIDE_ZOOM - 0.01)).toBe(true);
  });
});

describe("minimap footprint by layout tier (BUILDER-RESPONSIVE-LAYOUT-1)", () => {
  it("defaults to the pre-slice zoom-only behaviour when no tier is given", () => {
    expect(shouldShowMiniMap(0.8)).toBe(true);
    expect(shouldShowMiniMap(REVEAL_ZOOM)).toBe(false);
  });

  it("keeps the minimap on the tiers that have a canvas big enough to spare the corner", () => {
    expect(shouldShowMiniMap(0.8, "wide")).toBe(true);
    expect(shouldShowMiniMap(0.8, "medium")).toBe(true);
  });

  it("hides it entirely on a narrow canvas, at ANY zoom", () => {
    // Real-browser measurement at 390×844: the minimap is a fixed-size overlay,
    // so it covered a large share of the canvas while conveying almost nothing at
    // that scale. Pan and pinch-zoom are the navigation on a phone. This is a
    // width decision, not a zoom decision, so zooming out must not bring it back.
    for (const zoom of [0.25, 0.5, 0.8, 1.0, MINIMAP_HIDE_ZOOM, REVEAL_ZOOM]) {
      expect(shouldShowMiniMap(zoom, "narrow")).toBe(false);
    }
  });

  it("brings it back when the viewport grows again — no latching", () => {
    expect(shouldShowMiniMap(0.8, "narrow")).toBe(false);
    expect(shouldShowMiniMap(0.8, "medium")).toBe(true);
    expect(shouldShowMiniMap(0.8, "narrow")).toBe(false);
  });
});
