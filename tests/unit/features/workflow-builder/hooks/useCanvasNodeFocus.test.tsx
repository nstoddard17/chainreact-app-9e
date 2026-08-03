/**
 * Tests for useCanvasNodeFocus (Slice 4.AI-REPAIR-2F).
 *
 * The hook centers the React Flow viewport on the node the configSlice
 * canvas-focus signal points at, whenever the focus sequence advances. React
 * Flow's runtime is mocked at the `useReactFlow` boundary so we can assert the
 * `setCenter` call without standing up a full canvas. Navigation only — the
 * hook never mutates graph/config state.
 */
import { act, renderHook } from "@testing-library/react";

const mockSetCenter = jest.fn();
const mockGetNode = jest.fn();
// Current viewport zoom the hook reads via getViewport(). Tests set `currentZoom`
// to model an already-zoomed-in vs zoomed-out canvas. Default 1 = a normal view.
let currentZoom = 1;

jest.mock("@xyflow/react", () => ({
  useReactFlow: () => ({
    setCenter: mockSetCenter,
    getNode: mockGetNode,
    getViewport: () => ({ x: 0, y: 0, zoom: currentZoom }),
  }),
}));

import { useCanvasNodeFocus } from "@/features/workflow-builder/hooks/useCanvasNodeFocus";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";

beforeEach(() => {
  // Fake timers make the hook's two-frame defer DETERMINISTIC: jsdom has no
  // real rAF, so jest.setup.ts polyfills it as setTimeout(cb, 0), which fake
  // timers control exactly. No test here uses userEvent or waitFor, so no
  // real-timer machinery is starved by this.
  jest.useFakeTimers();
  useConfigSlice.getState().reset();
  mockSetCenter.mockReset();
  mockGetNode.mockReset();
  currentZoom = 1;
});

afterEach(() => {
  jest.useRealTimers();
});

/**
 * BUILDER-CANVAS-ZOOM-FOCUS-1 — the pan is deferred two animation frames so React Flow's resize
 * observer can report the canvas width the config panel just changed (rAF nested inside rAF; under
 * fake timers Jest fakes requestAnimationFrame itself, scheduling frames on its virtual clock).
 * Advancing TO THE NEXT TIMER twice runs exactly frame 1 (which schedules frame 2) and then frame
 * 2 — no duration guessing at all. Deterministic both ways: a frame that never runs leaves
 * setCenter uncalled and the caller's assertion fails, and no amount of CI worker pressure can
 * make the virtual clock miss a frame (JEST-DETERMINISTIC-WAITS-1; the old 50ms real sleep lost
 * this race under parallel load).
 */
async function flushFocusFrames(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersToNextTimerAsync();
    await jest.advanceTimersToNextTimerAsync();
  });
}

describe("useCanvasNodeFocus", () => {
  it("does not pan on mount (seq 0, no target)", async () => {
    renderHook(() => useCanvasNodeFocus());
    expect(mockSetCenter).not.toHaveBeenCalled();
  });

  it("pans to the node center when a reveal advances the focus sequence", async () => {
    mockGetNode.mockReturnValue({
      id: "slack1",
      position: { x: 100, y: 200 },
      measured: { width: 280, height: 120 },
    });
    const { rerender } = renderHook(() => useCanvasNodeFocus());

    useConfigSlice.getState().revealNode({ nodeId: "slack1", initialValues: {}, fieldKey: "text" });
    rerender();
    await flushFocusFrames();

    expect(mockGetNode).toHaveBeenCalledWith("slack1");
    // Centered on node center: x + w/2, y + h/2.
    expect(mockSetCenter).toHaveBeenCalledTimes(1);
    const [cx, cy, opts] = mockSetCenter.mock.calls[0]!;
    expect(cx).toBe(100 + 140);
    expect(cy).toBe(200 + 60);
    // CS-4 — zoom CLOSER than the prior 1.2 so the focused node is easy to inspect,
    // with a smooth (non-zero) animation. Stays below a disorienting tight zoom.
    expect(opts.zoom).toBeGreaterThanOrEqual(1.5);
    expect(opts.zoom).toBeLessThanOrEqual(2);
    expect(opts.duration).toBeGreaterThan(0);
  });

  it("re-pans when the SAME node is revealed again (seq advances)", async () => {
    mockGetNode.mockReturnValue({ id: "slack1", position: { x: 0, y: 0 }, measured: { width: 200, height: 100 } });
    const { rerender } = renderHook(() => useCanvasNodeFocus());

    useConfigSlice.getState().revealNode({ nodeId: "slack1", initialValues: {}, fieldKey: "text" });
    rerender();
    await flushFocusFrames();
    useConfigSlice.getState().revealNode({ nodeId: "slack1", initialValues: {}, fieldKey: "text" });
    rerender();
    await flushFocusFrames();

    expect(mockSetCenter).toHaveBeenCalledTimes(2);
  });

  it("no-ops safely when the target node is not on the canvas (stale)", async () => {
    mockGetNode.mockReturnValue(undefined);
    const { rerender } = renderHook(() => useCanvasNodeFocus());

    useConfigSlice.getState().revealNode({ nodeId: "ghost", initialValues: {}, fieldKey: "text" });
    rerender();
    await flushFocusFrames();

    expect(mockGetNode).toHaveBeenCalledWith("ghost");
    expect(mockSetCenter).not.toHaveBeenCalled();
  });
});

describe("useCanvasNodeFocus — config-open focus (BUILDER-CANVAS-FOCUS-SELECTED-NODE-1 / -TUNE-1)", () => {
  it("opening a node's config zooms IN (gentle) and centers the node exactly", async () => {
    currentZoom = 1; // normal zoomed-out canvas
    mockGetNode.mockReturnValue({
      id: "n1",
      position: { x: 100, y: 200 },
      measured: { width: 280, height: 120 },
    });
    const { rerender } = renderHook(() => useCanvasNodeFocus());

    useConfigSlice.getState().openNode({ nodeId: "n1", initialValues: {} });
    rerender();
    await flushFocusFrames();

    expect(mockSetCenter).toHaveBeenCalledTimes(1);
    const [cx, cy, opts] = mockSetCenter.mock.calls[0]!;
    // BUILDER-CANVAS-ZOOM-FOCUS-1 — the node's TRUE center, with no left bias. `setCenter` works
    // against React Flow's own container, and both rails are non-overlapping flex columns, so
    // centering there is already centering in the visible canvas for any combination of open
    // rails. The old 60px nudge just put the node off-centre.
    expect(cx).toBe(100 + 140);
    expect(cy).toBe(200 + 60);
    // TUNE-1 — zooms IN to the config floor (1.4): clearly STRONGER than the old flat 1.2,
    // and still gentler than the close 1.75 reveal so context around the node remains.
    expect(opts.zoom).toBeGreaterThanOrEqual(1.4);
    expect(opts.zoom).toBeLessThan(1.75);
    expect(opts.duration).toBeGreaterThan(0);
  });

  it("does NOT zoom out when the canvas is already zoomed in above the config floor", async () => {
    currentZoom = 1.6; // user already zoomed past the 1.4 config floor
    mockGetNode.mockReturnValue({
      id: "n1",
      position: { x: 0, y: 0 },
      measured: { width: 280, height: 120 },
    });
    const { rerender } = renderHook(() => useCanvasNodeFocus());

    useConfigSlice.getState().openNode({ nodeId: "n1", initialValues: {} });
    rerender();
    await flushFocusFrames();

    const [, , opts] = mockSetCenter.mock.calls[0]!;
    // Preserve the current (higher) zoom — opening config must NOT zoom away from a node
    // the user already zoomed into. This is the core "feels like it zooms out" fix.
    expect(opts.zoom).toBe(1.6);
  });

  it("zooms IN to the config floor from a zoomed-out canvas", async () => {
    currentZoom = 0.7; // zoomed out below the floor
    mockGetNode.mockReturnValue({
      id: "n1",
      position: { x: 0, y: 0 },
      measured: { width: 280, height: 120 },
    });
    const { rerender } = renderHook(() => useCanvasNodeFocus());

    useConfigSlice.getState().openNode({ nodeId: "n1", initialValues: {} });
    rerender();
    await flushFocusFrames();

    const [, , opts] = mockSetCenter.mock.calls[0]!;
    expect(opts.zoom).toBe(1.4); // raised up to the floor (zoom-in), never below it
  });

  it("reveal forces its closer zoom and is unaffected by the config floor / current zoom", async () => {
    currentZoom = 1.6;
    mockGetNode.mockReturnValue({
      id: "n1",
      position: { x: 0, y: 0 },
      measured: { width: 280, height: 120 },
    });
    const { rerender } = renderHook(() => useCanvasNodeFocus());

    useConfigSlice.getState().revealNode({ nodeId: "n1", initialValues: {}, fieldKey: "text" });
    rerender();
    await flushFocusFrames();

    const [cx, , opts] = mockSetCenter.mock.calls[0]!;
    // Reveal stays CLOSER than config-open and centered (no left bias).
    expect(opts.zoom).toBe(1.75);
    expect(cx).toBe(0 + 140); // dead-centered on the node
  });

  it("re-opening the SAME already-active node does NOT re-pan (no repeated zoom loop)", async () => {
    mockGetNode.mockReturnValue({ id: "n1", position: { x: 0, y: 0 }, measured: { width: 200, height: 100 } });
    const { rerender } = renderHook(() => useCanvasNodeFocus());

    useConfigSlice.getState().openNode({ nodeId: "n1", initialValues: {} });
    rerender();
    await flushFocusFrames();
    useConfigSlice.getState().openNode({ nodeId: "n1", initialValues: {} });
    rerender();
    await flushFocusFrames();

    expect(mockSetCenter).toHaveBeenCalledTimes(1);
  });

  it("opening a DIFFERENT node pans again toward the new node", async () => {
    mockGetNode.mockReturnValue({ id: "any", position: { x: 0, y: 0 }, measured: { width: 200, height: 100 } });
    const { rerender } = renderHook(() => useCanvasNodeFocus());

    useConfigSlice.getState().openNode({ nodeId: "n1", initialValues: {} });
    rerender();
    await flushFocusFrames();
    useConfigSlice.getState().openNode({ nodeId: "n2", initialValues: {} });
    rerender();
    await flushFocusFrames();

    expect(mockSetCenter).toHaveBeenCalledTimes(2);
  });
});
