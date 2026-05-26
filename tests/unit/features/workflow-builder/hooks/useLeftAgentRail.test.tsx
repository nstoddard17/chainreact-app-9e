/**
 * Tests for features/workflow-builder/hooks/useLeftAgentRail.
 *
 * Slice 4.BUILDER-LEFT-AGENT-1 — local state hook with localStorage
 * persistence. Covers default-expanded behavior, the localStorage round
 * trip, the toggle / collapse / expand callbacks, and graceful
 * degradation when storage is unavailable.
 */
import { act, render } from "@testing-library/react";
import {
  useLeftAgentRail,
  __LEFT_AGENT_RAIL_STORAGE_KEY__,
  type UseLeftAgentRailResult,
} from "@/features/workflow-builder/hooks/useLeftAgentRail";

function Harness({
  onState,
}: {
  onState: (state: UseLeftAgentRailResult) => void;
}) {
  const state = useLeftAgentRail();
  onState(state);
  return null;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("useLeftAgentRail — initial state", () => {
  it("defaults to expanded when nothing is persisted", () => {
    let last!: UseLeftAgentRailResult;
    render(<Harness onState={(s) => (last = s)} />);
    expect(last.isCollapsed).toBe(false);
  });

  it("reads `collapsed=true` from localStorage on mount", () => {
    window.localStorage.setItem(__LEFT_AGENT_RAIL_STORAGE_KEY__, "true");
    let last!: UseLeftAgentRailResult;
    render(<Harness onState={(s) => (last = s)} />);
    expect(last.isCollapsed).toBe(true);
  });

  it("treats any non-'true' value (including 'false', empty, garbage) as expanded", () => {
    window.localStorage.setItem(__LEFT_AGENT_RAIL_STORAGE_KEY__, "false");
    let last!: UseLeftAgentRailResult;
    const { unmount } = render(<Harness onState={(s) => (last = s)} />);
    expect(last.isCollapsed).toBe(false);
    unmount();

    window.localStorage.setItem(__LEFT_AGENT_RAIL_STORAGE_KEY__, "yolo");
    render(<Harness onState={(s) => (last = s)} />);
    expect(last.isCollapsed).toBe(false);
  });
});

describe("useLeftAgentRail — callbacks", () => {
  it("collapse() flips to collapsed and writes 'true' to localStorage", () => {
    let last!: UseLeftAgentRailResult;
    render(<Harness onState={(s) => (last = s)} />);
    act(() => last.collapse());
    expect(last.isCollapsed).toBe(true);
    expect(
      window.localStorage.getItem(__LEFT_AGENT_RAIL_STORAGE_KEY__),
    ).toBe("true");
  });

  it("expand() flips to expanded and writes 'false' to localStorage", () => {
    window.localStorage.setItem(__LEFT_AGENT_RAIL_STORAGE_KEY__, "true");
    let last!: UseLeftAgentRailResult;
    render(<Harness onState={(s) => (last = s)} />);
    expect(last.isCollapsed).toBe(true);
    act(() => last.expand());
    expect(last.isCollapsed).toBe(false);
    expect(
      window.localStorage.getItem(__LEFT_AGENT_RAIL_STORAGE_KEY__),
    ).toBe("false");
  });

  it("toggle() flips state on each call and persists each flip", () => {
    let last!: UseLeftAgentRailResult;
    render(<Harness onState={(s) => (last = s)} />);
    expect(last.isCollapsed).toBe(false);

    act(() => last.toggle());
    expect(last.isCollapsed).toBe(true);
    expect(
      window.localStorage.getItem(__LEFT_AGENT_RAIL_STORAGE_KEY__),
    ).toBe("true");

    act(() => last.toggle());
    expect(last.isCollapsed).toBe(false);
    expect(
      window.localStorage.getItem(__LEFT_AGENT_RAIL_STORAGE_KEY__),
    ).toBe("false");
  });

  it("callbacks are stable across renders so consumers can list them in effect deps", () => {
    const states: UseLeftAgentRailResult[] = [];
    const { rerender } = render(<Harness onState={(s) => states.push(s)} />);
    rerender(<Harness onState={(s) => states.push(s)} />);
    rerender(<Harness onState={(s) => states.push(s)} />);
    expect(states.length).toBeGreaterThanOrEqual(3);
    expect(states[0]!.toggle).toBe(states[1]!.toggle);
    expect(states[1]!.toggle).toBe(states[2]!.toggle);
    expect(states[0]!.collapse).toBe(states[1]!.collapse);
    expect(states[0]!.expand).toBe(states[1]!.expand);
  });
});

describe("useLeftAgentRail — storage failure resilience", () => {
  it("still updates UI state when localStorage.setItem throws (e.g. quota)", () => {
    const setItemSpy = jest
      .spyOn(window.localStorage.__proto__, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
    try {
      let last!: UseLeftAgentRailResult;
      render(<Harness onState={(s) => (last = s)} />);
      expect(last.isCollapsed).toBe(false);
      act(() => last.toggle());
      // Even though persisting failed, the in-memory state advanced.
      expect(last.isCollapsed).toBe(true);
    } finally {
      setItemSpy.mockRestore();
    }
  });

  it("falls back to expanded when localStorage.getItem throws on mount", () => {
    const getItemSpy = jest
      .spyOn(window.localStorage.__proto__, "getItem")
      .mockImplementation(() => {
        throw new Error("SecurityError");
      });
    try {
      let last!: UseLeftAgentRailResult;
      render(<Harness onState={(s) => (last = s)} />);
      expect(last.isCollapsed).toBe(false);
    } finally {
      getItemSpy.mockRestore();
    }
  });
});
