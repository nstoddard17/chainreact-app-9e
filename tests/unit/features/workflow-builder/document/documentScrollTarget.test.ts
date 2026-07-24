/**
 * DOC-REACT-AGENT-2 — the scroll offset that keeps a referenced sentence out
 * from under the sticky agent dock.
 *
 * The three viewport cases below use GEOMETRY MEASURED IN CHROMIUM on the real
 * rendered Document (a 12-step workflow with the agent workspace expanded over a
 * live proposal), so this locks the shipped formula against what the browser
 * actually produced. Before the fix, `scrollIntoView({block:"center"})` left the
 * sentence fully covered at every width (49 / 53 / 55px of a 46px sentence).
 */
import {
  SCROLL_TOP_MARGIN,
  computeScrollTarget,
  measureBottomInset,
} from "@/features/workflow-builder/document/documentScrollTarget";

/** Measured in Chromium: container, target and dock for one referenced step. */
const VIEWPORTS = [
  { label: "1440px", containerHeight: 900, dockHeight: 464, scrollHeight: 2222 },
  { label: "1024px", containerHeight: 800, dockHeight: 418, scrollHeight: 2176 },
  { label: "820px", containerHeight: 740, dockHeight: 390.39, scrollHeight: 2148 },
] as const;
const TARGET_TOP = 1457.23; // viewport coords, container at scrollTop 0
const TARGET_HEIGHT = 45.55;
const CONTAINER_TOP = 0;
const STICKY_GAP = 12; // the dock's `bottom-3`

describe("computeScrollTarget keeps the sentence above the agent dock", () => {
  for (const v of VIEWPORTS) {
    it(`${v.label}: the revealed sentence clears the dock entirely`, () => {
      const bottomInset = v.dockHeight + STICKY_GAP;
      const top = computeScrollTarget({
        containerHeight: v.containerHeight,
        containerScrollTop: 0,
        containerTop: CONTAINER_TOP,
        targetTop: TARGET_TOP,
        targetHeight: TARGET_HEIGHT,
        bottomInset,
        scrollHeight: v.scrollHeight,
      });

      // Where the sentence ends up on screen after scrolling there.
      const onScreenTop = TARGET_TOP - top;
      const onScreenBottom = onScreenTop + TARGET_HEIGHT;
      const dockTop = v.containerHeight - bottomInset + STICKY_GAP;

      expect(onScreenTop).toBeGreaterThanOrEqual(SCROLL_TOP_MARGIN);
      // Fully above the dock — this is the regression the browser pass caught.
      expect(onScreenBottom).toBeLessThanOrEqual(dockTop);
    });

    it(`${v.label}: the OLD centring would have hidden it (regression guard)`, () => {
      // scrollIntoView({block:"center"}) ≙ centring in the FULL container.
      const legacyTop = TARGET_TOP - (v.containerHeight - TARGET_HEIGHT) / 2;
      const onScreenBottom = TARGET_TOP - legacyTop + TARGET_HEIGHT;
      const dockTop = v.containerHeight - v.dockHeight;
      expect(onScreenBottom).toBeGreaterThan(dockTop);
    });
  }

  it("with nothing docked it behaves like plain centring", () => {
    const top = computeScrollTarget({
      containerHeight: 900,
      containerScrollTop: 0,
      containerTop: 0,
      targetTop: 1457,
      targetHeight: 46,
      bottomInset: 0,
      scrollHeight: 2222,
    });
    expect(top).toBeCloseTo(1457 - (900 - 46) / 2, 1);
  });

  it("never scrolls past the content or above the top", () => {
    // Target near the very end of the content.
    expect(
      computeScrollTarget({
        containerHeight: 900,
        containerScrollTop: 0,
        containerTop: 0,
        targetTop: 5000,
        targetHeight: 46,
        bottomInset: 400,
        scrollHeight: 2222,
      }),
    ).toBe(2222 - 900);
    // Target already at the top.
    expect(
      computeScrollTarget({
        containerHeight: 900,
        containerScrollTop: 0,
        containerTop: 0,
        targetTop: 0,
        targetHeight: 46,
        bottomInset: 400,
        scrollHeight: 2222,
      }),
    ).toBe(0);
  });

  it("degrades safely when the target is taller than the usable band", () => {
    const top = computeScrollTarget({
      containerHeight: 500,
      containerScrollTop: 0,
      containerTop: 0,
      targetTop: 800,
      targetHeight: 400,
      bottomInset: 460,
      scrollHeight: 3000,
    });
    // Usable band is tiny → pin the target near the top rather than centring it.
    expect(800 - top).toBe(SCROLL_TOP_MARGIN);
  });
});

describe("measureBottomInset", () => {
  const container = () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    return el;
  };

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("is zero when no agent dock is present (plain centring restored)", () => {
    expect(measureBottomInset(container())).toBe(0);
  });

  it("is the dock height plus its sticky offset", () => {
    const el = container();
    const dock = document.createElement("div");
    dock.setAttribute("data-testid", "document-agent-workspace");
    dock.getBoundingClientRect = () => ({ height: 464 }) as DOMRect;
    el.appendChild(dock);
    expect(measureBottomInset(el)).toBe(476);
  });

  it("ignores a zero-height dock (jsdom / not laid out)", () => {
    const el = container();
    const dock = document.createElement("div");
    dock.setAttribute("data-testid", "document-agent-workspace");
    el.appendChild(dock);
    expect(measureBottomInset(el)).toBe(0);
  });
});
