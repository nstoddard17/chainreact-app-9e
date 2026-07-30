import { act, render, screen } from "@testing-library/react";
import { useBuilderLayout } from "@/features/workflow-builder/layout/useBuilderLayout";
import {
  installBuilderViewport,
  OWNER_VIEWPORTS,
} from "../../../../helpers/builderViewport";

/**
 * BUILDER-RESPONSIVE-LAYOUT-1 — the builder's single source of viewport truth.
 *
 * The behaviours worth protecting here are (a) the mode is correct at every
 * viewport the owner named, (b) it UPDATES on a real boundary crossing rather
 * than latching at mount, (c) it falls back to the untouched desktop layout when
 * the browser can't answer, and (d) it cleans up its subscriptions.
 */

function Probe() {
  const layout = useBuilderLayout();
  return (
    <div
      data-testid="probe"
      data-mode={layout.mode}
      data-rail={layout.rail}
      data-config={layout.config}
      data-header={layout.header}
      data-rail-width={String(layout.railWidth)}
      data-exclusive={String(layout.oneSurfaceAtATime)}
    />
  );
}

describe("useBuilderLayout", () => {
  let viewport: ReturnType<typeof installBuilderViewport> | null = null;

  afterEach(() => {
    viewport?.restore();
    viewport = null;
  });

  it.each(OWNER_VIEWPORTS)(
    "resolves $label to the $mode tier",
    ({ width, mode }) => {
      viewport = installBuilderViewport(width);
      render(<Probe />);
      expect(screen.getByTestId("probe")).toHaveAttribute("data-mode", mode);
    },
  );

  it("follows a live resize across a boundary instead of latching at mount", () => {
    viewport = installBuilderViewport(1440);
    render(<Probe />);
    const probe = screen.getByTestId("probe");
    expect(probe).toHaveAttribute("data-mode", "wide");

    act(() => viewport!.set(1024));
    expect(probe).toHaveAttribute("data-mode", "medium");
    expect(probe).toHaveAttribute("data-config", "overlay");
    expect(probe).toHaveAttribute("data-rail", "panel");

    act(() => viewport!.set(390));
    expect(probe).toHaveAttribute("data-mode", "narrow");
    expect(probe).toHaveAttribute("data-rail", "overlay");
    expect(probe).toHaveAttribute("data-exclusive", "true");

    // ...and back. A user dragging a window wider must get the desktop layout
    // returned, not a latched "we were narrow once" state.
    act(() => viewport!.set(1440));
    expect(probe).toHaveAttribute("data-mode", "wide");
    expect(probe).toHaveAttribute("data-config", "panel");
    expect(probe).toHaveAttribute("data-exclusive", "false");
  });

  it("does not re-render for a resize that stays inside one tier", () => {
    viewport = installBuilderViewport(1000);
    let renders = 0;
    function Counting() {
      renders += 1;
      const layout = useBuilderLayout();
      return <span data-testid="mode">{layout.mode}</span>;
    }
    render(<Counting />);
    const before = renders;
    // 1000 → 1100 → 1200: three different widths, all medium. A media-query
    // subscription must produce no updates here; a `resize` listener would have
    // produced three.
    act(() => viewport!.set(1100));
    act(() => viewport!.set(1200));
    expect(renders).toBe(before);
    expect(screen.getByTestId("mode")).toHaveTextContent("medium");
  });

  /**
   * Regression guard for a bug REAL-BROWSER verification caught and jsdom could
   * not. The first implementation used exclusive bands — `(max-width: 1279.99px)`
   * for medium, `(max-width: 899.99px)` for narrow. Chromium ROUNDS fractional
   * media-query lengths, so at a viewport of exactly 1280px the "max-width:
   * 1279.99px" query matched too; both bands were true, and first-match ordering
   * handed 1280px the medium layout and 900px the narrow one. Those are precisely
   * the two viewports the owner named as tier boundaries.
   *
   * The stub below emulates that rounding so the hazard is testable here. The
   * implementation must resolve the boundaries correctly even under a browser
   * that rounds — which is what using `min-width` only guarantees.
   */
  it("resolves boundaries correctly even on a browser that rounds fractional media lengths", () => {
    const previous = window.matchMedia;
    let width = 1280;
    window.matchMedia = ((query: string) => {
      const clauses = query.split(" and ").map((c) => c.trim());
      const matchesAll = clauses.every((clause) => {
        const min = /^\(\s*min-width:\s*([\d.]+)px\s*\)$/.exec(clause);
        // The rounding: a fractional threshold is snapped to the nearest integer,
        // exactly as Chromium's layout units do.
        if (min) return width >= Math.round(Number(min[1]));
        const max = /^\(\s*max-width:\s*([\d.]+)px\s*\)$/.exec(clause);
        if (max) return width <= Math.round(Number(max[1]));
        return false;
      });
      return {
        matches: matchesAll,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      } as unknown as MediaQueryList;
    }) as unknown as typeof window.matchMedia;

    try {
      const resolved: Array<[number, string | null]> = [];
      for (const w of [1280, 1279, 900, 899]) {
        width = w;
        const { unmount } = render(<Probe />);
        resolved.push([w, screen.getByTestId("probe").getAttribute("data-mode")]);
        unmount();
      }
      // Asserted as one table so a failure names every boundary at once.
      expect(resolved).toEqual([
        [1280, "wide"],
        [1279, "medium"],
        [900, "medium"],
        [899, "narrow"],
      ]);
    } finally {
      window.matchMedia = previous;
    }
  });

  it("falls back to the untouched desktop layout when matchMedia is unavailable", () => {
    const previous = window.matchMedia;
    // @ts-expect-error — deliberately removing the API to model a locked-down
    // browser / SSR-shaped environment.
    delete window.matchMedia;
    try {
      render(<Probe />);
      const probe = screen.getByTestId("probe");
      // An unknown environment gets the desktop builder — never a phone layout
      // on a 27" monitor.
      expect(probe).toHaveAttribute("data-mode", "wide");
      expect(probe).toHaveAttribute("data-header", "full");
    } finally {
      window.matchMedia = previous;
    }
  });

  it("falls back to wide when matchMedia exists but evaluates nothing (jsdom's stub)", () => {
    // This is the environment EVERY pre-existing builder test runs in, and the
    // reason none of them had to change: a stub answering `false` to every query
    // must read as "we don't know", not as "this is a phone".
    const previous = window.matchMedia;
    window.matchMedia = ((query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList) as unknown as typeof window.matchMedia;
    try {
      render(<Probe />);
      const probe = screen.getByTestId("probe");
      expect(probe).toHaveAttribute("data-mode", "wide");
      expect(probe).toHaveAttribute("data-rail", "panel");
      expect(probe).toHaveAttribute("data-config", "panel");
    } finally {
      window.matchMedia = previous;
    }
  });

  it("falls back to wide when matchMedia throws", () => {
    const previous = window.matchMedia;
    window.matchMedia = (() => {
      throw new Error("blocked");
    }) as unknown as typeof window.matchMedia;
    try {
      render(<Probe />);
      expect(screen.getByTestId("probe")).toHaveAttribute("data-mode", "wide");
    } finally {
      window.matchMedia = previous;
    }
  });

  it("removes every media-query listener on unmount", () => {
    const previous = window.matchMedia;
    let added = 0;
    let removed = 0;
    window.matchMedia = ((query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {
          added += 1;
        },
        removeEventListener: () => {
          removed += 1;
        },
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList) as unknown as typeof window.matchMedia;
    try {
      const { unmount } = render(<Probe />);
      expect(added).toBeGreaterThan(0);
      unmount();
      expect(removed).toBe(added);
    } finally {
      window.matchMedia = previous;
    }
  });
});
