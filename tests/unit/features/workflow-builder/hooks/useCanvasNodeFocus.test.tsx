/**
 * Tests for useCanvasNodeFocus (Slice 4.AI-REPAIR-2F).
 *
 * The hook centers the React Flow viewport on the node the configSlice
 * canvas-focus signal points at, whenever the focus sequence advances. React
 * Flow's runtime is mocked at the `useReactFlow` boundary so we can assert the
 * `setCenter` call without standing up a full canvas. Navigation only — the
 * hook never mutates graph/config state.
 */
import { renderHook } from "@testing-library/react";

const mockSetCenter = jest.fn();
const mockGetNode = jest.fn();

jest.mock("@xyflow/react", () => ({
  useReactFlow: () => ({ setCenter: mockSetCenter, getNode: mockGetNode }),
}));

import { useCanvasNodeFocus } from "@/features/workflow-builder/hooks/useCanvasNodeFocus";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";

beforeEach(() => {
  useConfigSlice.getState().reset();
  mockSetCenter.mockReset();
  mockGetNode.mockReset();
});

describe("useCanvasNodeFocus", () => {
  it("does not pan on mount (seq 0, no target)", () => {
    renderHook(() => useCanvasNodeFocus());
    expect(mockSetCenter).not.toHaveBeenCalled();
  });

  it("pans to the node center when a reveal advances the focus sequence", () => {
    mockGetNode.mockReturnValue({
      id: "slack1",
      position: { x: 100, y: 200 },
      measured: { width: 280, height: 120 },
    });
    const { rerender } = renderHook(() => useCanvasNodeFocus());

    useConfigSlice.getState().revealNode({ nodeId: "slack1", initialValues: {}, fieldKey: "text" });
    rerender();

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

  it("re-pans when the SAME node is revealed again (seq advances)", () => {
    mockGetNode.mockReturnValue({ id: "slack1", position: { x: 0, y: 0 }, measured: { width: 200, height: 100 } });
    const { rerender } = renderHook(() => useCanvasNodeFocus());

    useConfigSlice.getState().revealNode({ nodeId: "slack1", initialValues: {}, fieldKey: "text" });
    rerender();
    useConfigSlice.getState().revealNode({ nodeId: "slack1", initialValues: {}, fieldKey: "text" });
    rerender();

    expect(mockSetCenter).toHaveBeenCalledTimes(2);
  });

  it("no-ops safely when the target node is not on the canvas (stale)", () => {
    mockGetNode.mockReturnValue(undefined);
    const { rerender } = renderHook(() => useCanvasNodeFocus());

    useConfigSlice.getState().revealNode({ nodeId: "ghost", initialValues: {}, fieldKey: "text" });
    rerender();

    expect(mockGetNode).toHaveBeenCalledWith("ghost");
    expect(mockSetCenter).not.toHaveBeenCalled();
  });
});

describe("useCanvasNodeFocus — config-open focus (BUILDER-CANVAS-FOCUS-SELECTED-NODE-1)", () => {
  it("opening a node's config pans with a gentle context zoom + a LEFT offset (clears the right panel)", () => {
    mockGetNode.mockReturnValue({
      id: "n1",
      position: { x: 100, y: 200 },
      measured: { width: 280, height: 120 },
    });
    const { rerender } = renderHook(() => useCanvasNodeFocus());

    useConfigSlice.getState().openNode({ nodeId: "n1", initialValues: {} });
    rerender();

    expect(mockSetCenter).toHaveBeenCalledTimes(1);
    const [cx, cy, opts] = mockSetCenter.mock.calls[0]!;
    // Node center is 100 + 140 = 240. Config-open centers to the RIGHT of the node so
    // the node sits LEFT of viewport center (clear of the right config panel) → cx > 240.
    expect(cx).toBeGreaterThan(240);
    expect(cy).toBe(200 + 60);
    // Conservative / context zoom — clearly gentler than the close 1.75 reveal.
    expect(opts.zoom).toBeGreaterThan(0.8);
    expect(opts.zoom).toBeLessThan(1.5);
    expect(opts.duration).toBeGreaterThan(0);
  });

  it("re-opening the SAME already-active node does NOT re-pan (no repeated zoom loop)", () => {
    mockGetNode.mockReturnValue({ id: "n1", position: { x: 0, y: 0 }, measured: { width: 200, height: 100 } });
    const { rerender } = renderHook(() => useCanvasNodeFocus());

    useConfigSlice.getState().openNode({ nodeId: "n1", initialValues: {} });
    rerender();
    useConfigSlice.getState().openNode({ nodeId: "n1", initialValues: {} });
    rerender();

    expect(mockSetCenter).toHaveBeenCalledTimes(1);
  });

  it("opening a DIFFERENT node pans again toward the new node", () => {
    mockGetNode.mockReturnValue({ id: "any", position: { x: 0, y: 0 }, measured: { width: 200, height: 100 } });
    const { rerender } = renderHook(() => useCanvasNodeFocus());

    useConfigSlice.getState().openNode({ nodeId: "n1", initialValues: {} });
    rerender();
    useConfigSlice.getState().openNode({ nodeId: "n2", initialValues: {} });
    rerender();

    expect(mockSetCenter).toHaveBeenCalledTimes(2);
  });
});
