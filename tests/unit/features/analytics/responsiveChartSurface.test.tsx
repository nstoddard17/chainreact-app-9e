import { act, render, screen } from "@testing-library/react";
import {
  ResponsiveChartSurface,
  type ChartSurfaceSize,
} from "@/components/analytics/ResponsiveChartSurface";

/**
 * The one Analytics chart measurement seam
 * (ANALYTICS-RESPONSIVE-CHART-SURFACES-1).
 *
 * These tests assert the RESULTING dimensions the surface hands its child, not
 * that `ResizeObserver` was constructed — "the observer was called" would pass
 * while every chart still drew at the wrong size.
 */

type ObserverCallback = (entries: ResizeObserverEntry[], observer: ResizeObserver) => void;

let observers: { el: Element; cb: ObserverCallback }[] = [];
let disconnects = 0;

/** Drive every live observer with a real content box. */
function resizeTo(width: number, height: number) {
  act(() => {
    for (const { el, cb } of observers) {
      cb(
        [{ target: el, contentRect: { width, height } } as unknown as ResizeObserverEntry],
        {} as ResizeObserver,
      );
    }
  });
}

beforeEach(() => {
  observers = [];
  disconnects = 0;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    constructor(private readonly cb: ObserverCallback) {}
    observe(el: Element) {
      observers.push({ el, cb: this.cb });
    }
    disconnect() {
      disconnects += 1;
      observers = [];
    }
    unobserve() {}
  };
  // Synchronous frames: the surface coalesces into one animation frame, and a
  // resize has to be observable inside the same `act`.
  jest.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
    cb(0);
    return 0;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Records every size the surface reported, in order. */
function Probe({ sizes }: { sizes: ChartSurfaceSize[] }) {
  return (
    <div style={{ position: "relative" }}>
      <ResponsiveChartSurface fallbackWidth={400} fallbackHeight={120}>
        {(size) => {
          sizes.push(size);
          return (
            <div data-testid="probe" data-w={size.width} data-h={size.height}>
              {size.width}×{size.height}
            </div>
          );
        }}
      </ResponsiveChartSurface>
    </div>
  );
}

const probe = () => screen.getByTestId("probe");

describe("ResponsiveChartSurface", () => {
  it("observes its own element", () => {
    render(<Probe sizes={[]} />);
    expect(observers).toHaveLength(1);
    expect(observers[0]!.el).toBe(screen.getByTestId("analytics-chart-surface"));
  });

  it("reports both width and height, not width alone", () => {
    render(<Probe sizes={[]} />);
    resizeTo(660, 321);
    expect(probe().getAttribute("data-w")).toBe("660");
    expect(probe().getAttribute("data-h")).toBe("321");
  });

  it("uses the fallback box until the first real measurement", () => {
    render(<Probe sizes={[]} />);
    // Nothing observed yet — the chart is drawable rather than blank, which is
    // what keeps SSR and the first client paint agreeing.
    expect(probe().getAttribute("data-w")).toBe("400");
    expect(screen.getByTestId("analytics-chart-surface").dataset["chartMeasured"]).toBe("false");
    resizeTo(660, 200);
    expect(screen.getByTestId("analytics-chart-surface").dataset["chartMeasured"]).toBe("true");
  });

  it("ignores a repeated identical size", () => {
    const sizes: ChartSurfaceSize[] = [];
    render(<Probe sizes={sizes} />);
    resizeTo(660, 200);
    const afterFirst = sizes.length;
    resizeTo(660, 200);
    resizeTo(660.2, 200.1); // rounds to the same whole pixels
    expect(sizes.length).toBe(afterFirst);
  });

  it("updates after a width-only change", () => {
    render(<Probe sizes={[]} />);
    resizeTo(660, 200);
    resizeTo(330, 200);
    expect(probe().getAttribute("data-w")).toBe("330");
    expect(probe().getAttribute("data-h")).toBe("200");
  });

  it("updates after a height-only change", () => {
    render(<Probe sizes={[]} />);
    resizeTo(660, 200);
    resizeTo(660, 321);
    expect(probe().getAttribute("data-h")).toBe("321");
  });

  it("survives an initial 0×0 box without emitting a degenerate size", () => {
    render(<Probe sizes={[]} />);
    resizeTo(0, 0);
    expect(probe().getAttribute("data-w")).toBe("400");
    expect(probe().getAttribute("data-h")).toBe("120");
    resizeTo(500, 150);
    expect(probe().getAttribute("data-w")).toBe("500");
  });

  it("ignores a non-finite box", () => {
    render(<Probe sizes={[]} />);
    resizeTo(Number.NaN, 200);
    expect(probe().getAttribute("data-w")).toBe("400");
  });

  it("renders nothing below the minimum drawable size", () => {
    render(
      <div style={{ position: "relative" }}>
        <ResponsiveChartSurface fallbackWidth={400} fallbackHeight={120} minimumHeight={60}>
          {() => <div data-testid="tiny-probe" />}
        </ResponsiveChartSurface>
      </div>,
    );
    expect(screen.queryByTestId("tiny-probe")).not.toBeNull();
    resizeTo(400, 20);
    expect(screen.queryByTestId("tiny-probe")).toBeNull();
  });

  it("disconnects its observer on unmount", () => {
    const view = render(<Probe sizes={[]} />);
    expect(disconnects).toBe(0);
    view.unmount();
    expect(disconnects).toBe(1);
    expect(observers).toHaveLength(0);
  });

  it("suppresses animation for a beat after a resize, then re-enables it", () => {
    // `requestAnimationFrame` stays the synchronous spy from `beforeEach` — only
    // the settle timer is faked, which is the thing under test here.
    jest.useFakeTimers({ doNotFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    try {
      const sizes: ChartSurfaceSize[] = [];
      render(<Probe sizes={sizes} />);
      resizeTo(660, 200);
      expect(sizes[sizes.length - 1]!.animate).toBe(false);
      act(() => {
        jest.advanceTimersByTime(400);
      });
      expect(sizes[sizes.length - 1]!.animate).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it("keeps animation off entirely when the user prefers reduced motion", () => {
    const original = window.matchMedia;
    const matchMedia = jest.fn().mockReturnValue({ matches: true });
    Object.defineProperty(window, "matchMedia", { value: matchMedia, configurable: true });
    try {
      const sizes: ChartSurfaceSize[] = [];
      render(<Probe sizes={sizes} />);
      resizeTo(660, 200);
      expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
      expect(sizes[sizes.length - 1]!.animate).toBe(false);
    } finally {
      Object.defineProperty(window, "matchMedia", { value: original, configurable: true });
    }
  });

  it("touches no persistence or network path", () => {
    const calls: unknown[] = [];
    const original = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch?: unknown }).fetch = (...args: unknown[]) => {
      calls.push(args);
      throw new Error("the chart surface must never fetch");
    };
    try {
      render(<Probe sizes={[]} />);
      resizeTo(660, 200);
      resizeTo(330, 100);
      expect(calls).toEqual([]);
    } finally {
      (globalThis as { fetch?: unknown }).fetch = original;
    }
  });
});
