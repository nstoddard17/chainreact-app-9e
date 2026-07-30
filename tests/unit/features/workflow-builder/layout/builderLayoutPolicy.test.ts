import {
  BUILDER_MEDIUM_MIN_WIDTH,
  BUILDER_WIDE_MIN_WIDTH,
  configPresentation,
  headerDensity,
  railPanelWidth,
  railPresentation,
  resolveBuilderLayoutMode,
  surfacesAreMutuallyExclusive,
  type BuilderLayoutMode,
} from "@/features/workflow-builder/layout/builderLayoutPolicy";

/**
 * BUILDER-RESPONSIVE-LAYOUT-1 — the layout policy as a table.
 *
 * These are the boundaries the whole slice is built on, so they are pinned
 * against the exact viewport widths the owner asked to be validated. The
 * policy is pure, so this needs no DOM, no `matchMedia` stub, and no mount —
 * which is the reason the thresholds live in their own module instead of inline
 * in a component.
 */

describe("resolveBuilderLayoutMode — the owner's validation viewports", () => {
  const cases: ReadonlyArray<[number, BuilderLayoutMode, string]> = [
    [1440, "wide", "1440×900 desktop"],
    [1280, "wide", "1280×800 — exactly the wide boundary"],
    [1279, "medium", "one pixel below wide"],
    [1024, "medium", "1024×768 small laptop / landscape tablet"],
    [900, "medium", "900×700 — exactly the medium boundary"],
    [899, "narrow", "one pixel below medium"],
    [820, "narrow", "820×1180 tablet portrait"],
    [768, "narrow", "768×1024 tablet portrait"],
    [390, "narrow", "390×844 phone"],
  ];

  it.each(cases)("%ipx → %s (%s)", (width, expected) => {
    expect(resolveBuilderLayoutMode(width)).toBe(expected);
  });

  it("treats a fractional width just under a boundary as the lower tier", () => {
    // Browser zoom and devtools produce fractional viewport widths; a width must
    // never fall between two tiers.
    expect(resolveBuilderLayoutMode(BUILDER_WIDE_MIN_WIDTH - 0.5)).toBe("medium");
    expect(resolveBuilderLayoutMode(BUILDER_MEDIUM_MIN_WIDTH - 0.5)).toBe("narrow");
  });

  it("never returns a mode outside the three known values, at any width", () => {
    for (const width of [0, 1, 320, 599, 1919, 3840]) {
      expect(["wide", "medium", "narrow"]).toContain(
        resolveBuilderLayoutMode(width),
      );
    }
  });
});

describe("surface presentation", () => {
  it("keeps the agent rail an in-flow column until there is no room for one", () => {
    expect(railPresentation("wide")).toBe("panel");
    expect(railPresentation("medium")).toBe("panel");
    expect(railPresentation("narrow")).toBe("overlay");
  });

  it("moves node configuration to an overlay one tier EARLIER than the rail", () => {
    // The specific failure this ordering fixes: a 320px rail plus a 380px config
    // column at 1024px leaves the canvas ~324px — narrower than one 280px node
    // card plus its handles. Config must stop being a column first.
    expect(configPresentation("wide")).toBe("panel");
    expect(configPresentation("medium")).toBe("overlay");
    expect(configPresentation("narrow")).toBe("overlay");
  });

  it("narrows the in-flow rail at the medium tier so the canvas keeps priority", () => {
    expect(railPanelWidth("medium")).toBeLessThan(railPanelWidth("wide"));
  });

  it("leaves the canvas at least half the width at the tightest panel tier", () => {
    // At 900px with a medium-tier rail open and config overlaid, the canvas gets
    // the whole remainder. Guard the arithmetic rather than trusting the constant.
    const canvasAt900 = BUILDER_MEDIUM_MIN_WIDTH - railPanelWidth("medium");
    expect(canvasAt900).toBeGreaterThan(BUILDER_MEDIUM_MIN_WIDTH / 2);
  });
});

describe("header density", () => {
  it("only spends the full inline toolbar where there is width for it", () => {
    expect(headerDensity("wide")).toBe("full");
    expect(headerDensity("medium")).toBe("compact");
    expect(headerDensity("narrow")).toBe("minimal");
  });
});

describe("one surface at a time", () => {
  it("applies only at narrow, where two stacked sheets would hide the canvas entirely", () => {
    expect(surfacesAreMutuallyExclusive("wide")).toBe(false);
    // Medium deliberately allows both: the rail is still a column beside a
    // config sheet, and discarding the transcript a user is working from is a
    // worse outcome than a slightly smaller canvas.
    expect(surfacesAreMutuallyExclusive("medium")).toBe(false);
    expect(surfacesAreMutuallyExclusive("narrow")).toBe(true);
  });
});
