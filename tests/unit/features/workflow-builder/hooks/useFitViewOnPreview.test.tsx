/**
 * useFitViewOnPreview (HERMES-AGENT-PREVIEW-CANVAS-STATE-AND-FIT).
 *
 * Proves the canvas fits the viewport ONCE per newly-shown preview and never on unrelated re-renders:
 *   - fits when the token changes null → number;
 *   - re-fits when a superseding preview supplies a NEW token;
 *   - does NOT re-fit when the same token re-renders;
 *   - does NOT fit while the token is null (no preview);
 *   - resets after the token goes back to null (discard) so the next show fits again.
 *
 * Navigation only — the hook calls React Flow `fitView` and touches no graph/draft state. `useReactFlow`
 * is mocked so the test asserts the fit call without a real canvas.
 */
const mockFitView = jest.fn();
jest.mock("@xyflow/react", () => ({
  useReactFlow: () => ({ fitView: mockFitView }),
}));

import { renderHook } from "@testing-library/react";
import { useFitViewOnPreview } from "@/features/workflow-builder/hooks/useFitViewOnPreview";

beforeEach(() => {
  jest.useFakeTimers();
  mockFitView.mockReset();
});
afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

function flush() {
  // The hook defers the fit one tick; advance timers to run it.
  jest.runOnlyPendingTimers();
}

describe("useFitViewOnPreview", () => {
  it("does not fit while the token is null (no preview)", () => {
    renderHook(({ token }) => useFitViewOnPreview(token), { initialProps: { token: null as number | null } });
    flush();
    expect(mockFitView).not.toHaveBeenCalled();
  });

  it("fits once when the token changes null → number", () => {
    const { rerender } = renderHook(({ token }) => useFitViewOnPreview(token), {
      initialProps: { token: null as number | null },
    });
    flush();
    expect(mockFitView).not.toHaveBeenCalled();

    rerender({ token: 1 });
    flush();
    expect(mockFitView).toHaveBeenCalledTimes(1);
  });

  it("does NOT re-fit when the same token re-renders", () => {
    const { rerender } = renderHook(({ token }) => useFitViewOnPreview(token), { initialProps: { token: 1 as number | null } });
    flush();
    expect(mockFitView).toHaveBeenCalledTimes(1);

    rerender({ token: 1 }); // unrelated re-render, same show
    flush();
    expect(mockFitView).toHaveBeenCalledTimes(1);
  });

  it("re-fits when a superseding preview supplies a NEW token", () => {
    const { rerender } = renderHook(({ token }) => useFitViewOnPreview(token), { initialProps: { token: 1 as number | null } });
    flush();
    rerender({ token: 2 });
    flush();
    expect(mockFitView).toHaveBeenCalledTimes(2);
  });

  it("resets after discard (null) so the next show fits again", () => {
    const { rerender } = renderHook(({ token }) => useFitViewOnPreview(token), { initialProps: { token: 3 as number | null } });
    flush();
    expect(mockFitView).toHaveBeenCalledTimes(1);

    rerender({ token: null }); // discard
    flush();
    rerender({ token: 4 }); // a later show
    flush();
    expect(mockFitView).toHaveBeenCalledTimes(2);
  });
});
