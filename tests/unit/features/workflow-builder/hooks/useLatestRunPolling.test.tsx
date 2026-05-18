/**
 * Tests for features/workflow-builder/hooks/useLatestRunPolling.ts.
 *
 * Covers timer lifecycle invariants per the Slice 3.8 plan:
 *   - One active interval per (workflowId, runId).
 *   - Cleanup on unmount.
 *   - Cleanup on terminal status.
 *   - Cleanup on workflow change.
 *   - No duplicate pollers.
 */

const mockPollOnce = jest.fn();
const mockUseRunSlice = jest.fn();

jest.mock("@/features/workflow-builder/state/runSlice", () => ({
  useRunSlice: Object.assign(
    (selector: (s: unknown) => unknown) => mockUseRunSlice(selector),
    {
      getState: () => ({ pollOnce: mockPollOnce }),
    },
  ),
}));

import { render } from "@testing-library/react";
import { useLatestRunPolling } from "@/features/workflow-builder/hooks/useLatestRunPolling";

function Harness() {
  useLatestRunPolling();
  return null;
}

function configureSlice(state: {
  workflowId: string | null;
  runId: string | null;
  status: "idle" | "pending" | "succeeded" | "failed" | "lost";
}): void {
  mockUseRunSlice.mockImplementation((selector: (s: unknown) => unknown) =>
    selector(state),
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  mockPollOnce.mockReset();
  mockUseRunSlice.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("useLatestRunPolling", () => {
  it("installs no interval when no run is being tracked", () => {
    configureSlice({ workflowId: null, runId: null, status: "idle" });
    render(<Harness />);
    jest.advanceTimersByTime(5000);
    expect(mockPollOnce).not.toHaveBeenCalled();
  });

  it("polls every 1s while pending", () => {
    configureSlice({ workflowId: "wf-1", runId: "run-1", status: "pending" });
    render(<Harness />);
    jest.advanceTimersByTime(3000);
    expect(mockPollOnce).toHaveBeenCalledTimes(3);
  });

  it("installs no interval once status is terminal (succeeded)", () => {
    configureSlice({ workflowId: "wf-1", runId: "run-1", status: "succeeded" });
    render(<Harness />);
    jest.advanceTimersByTime(5000);
    expect(mockPollOnce).not.toHaveBeenCalled();
  });

  it("installs no interval once status is terminal (failed)", () => {
    configureSlice({ workflowId: "wf-1", runId: "run-1", status: "failed" });
    render(<Harness />);
    jest.advanceTimersByTime(5000);
    expect(mockPollOnce).not.toHaveBeenCalled();
  });

  it("installs no interval once status is terminal (lost)", () => {
    configureSlice({ workflowId: "wf-1", runId: "run-1", status: "lost" });
    render(<Harness />);
    jest.advanceTimersByTime(5000);
    expect(mockPollOnce).not.toHaveBeenCalled();
  });

  it("clears the interval on unmount", () => {
    configureSlice({ workflowId: "wf-1", runId: "run-1", status: "pending" });
    const view = render(<Harness />);
    jest.advanceTimersByTime(1000);
    expect(mockPollOnce).toHaveBeenCalledTimes(1);
    view.unmount();
    jest.advanceTimersByTime(5000);
    expect(mockPollOnce).toHaveBeenCalledTimes(1); // no ticks after unmount.
  });

  it("does not duplicate pollers across re-renders with identical deps", () => {
    configureSlice({ workflowId: "wf-1", runId: "run-1", status: "pending" });
    const view = render(<Harness />);
    // Same deps → rerender should not install a second interval.
    view.rerender(<Harness />);
    jest.advanceTimersByTime(1000);
    expect(mockPollOnce).toHaveBeenCalledTimes(1);
  });

  it("tears down the old interval when (workflowId, runId) changes", () => {
    configureSlice({ workflowId: "wf-1", runId: "run-1", status: "pending" });
    const view = render(<Harness />);
    jest.advanceTimersByTime(1000);
    expect(mockPollOnce).toHaveBeenCalledTimes(1);
    // Switch to a new run — the dep change tears down + reinstalls.
    configureSlice({ workflowId: "wf-1", runId: "run-2", status: "pending" });
    view.rerender(<Harness />);
    jest.advanceTimersByTime(1000);
    expect(mockPollOnce).toHaveBeenCalledTimes(2);
    // Confirm only ONE active timer fires per tick (the old one was cleared).
    jest.advanceTimersByTime(1000);
    expect(mockPollOnce).toHaveBeenCalledTimes(3);
  });
});
