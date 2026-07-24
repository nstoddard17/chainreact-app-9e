/**
 * Tests for features/workflow-builder/hooks/useLeftAgentRail.
 *
 * Slice 4.BUILDER-LEFT-AGENT-1 — local state hook with localStorage
 * persistence. Covers default-expanded behavior, the localStorage round
 * trip, the toggle / collapse / expand callbacks, and graceful
 * degradation when storage is unavailable.
 *
 * DOC-RAIL-LAYOUT-1 — builder-mode-aware state: Document mode defaults to
 * collapsed (session-only, never persisted), re-collapses on every entry,
 * and never overwrites the persisted Visual preference.
 */
import { act, render } from "@testing-library/react";
import {
  useLeftAgentRail,
  __LEFT_AGENT_RAIL_STORAGE_KEY__,
  type UseLeftAgentRailResult,
} from "@/features/workflow-builder/hooks/useLeftAgentRail";

function Harness({
  view,
  onState,
}: {
  view?: "visual" | "document";
  onState: (state: UseLeftAgentRailResult) => void;
}) {
  const state = useLeftAgentRail(view ?? "visual");
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

describe("useLeftAgentRail — Document mode (DOC-RAIL-LAYOUT-1)", () => {
  it("defaults to collapsed in Document mode even when nothing is persisted", () => {
    let last!: UseLeftAgentRailResult;
    render(<Harness view="document" onState={(s) => (last = s)} />);
    expect(last.isCollapsed).toBe(true);
  });

  it("defaults to collapsed in Document mode even when the Visual preference is expanded", () => {
    window.localStorage.setItem(__LEFT_AGENT_RAIL_STORAGE_KEY__, "false");
    let last!: UseLeftAgentRailResult;
    render(<Harness view="document" onState={(s) => (last = s)} />);
    expect(last.isCollapsed).toBe(true);
  });

  it("expand()/toggle() work in Document mode but never touch localStorage", () => {
    let last!: UseLeftAgentRailResult;
    render(<Harness view="document" onState={(s) => (last = s)} />);
    act(() => last.expand());
    expect(last.isCollapsed).toBe(false);
    expect(window.localStorage.getItem(__LEFT_AGENT_RAIL_STORAGE_KEY__)).toBeNull();
    act(() => last.toggle());
    expect(last.isCollapsed).toBe(true);
    expect(window.localStorage.getItem(__LEFT_AGENT_RAIL_STORAGE_KEY__)).toBeNull();
  });

  it("Visual → Document collapses; Document → Visual restores the Visual state untouched", () => {
    let last!: UseLeftAgentRailResult;
    const { rerender } = render(<Harness view="visual" onState={(s) => (last = s)} />);
    expect(last.isCollapsed).toBe(false); // Visual default: expanded

    rerender(<Harness view="document" onState={(s) => (last = s)} />);
    expect(last.isCollapsed).toBe(true); // Document default: collapsed

    // Open + close + open the rail in Document — Visual state must not move.
    act(() => last.expand());
    expect(last.isCollapsed).toBe(false);
    act(() => last.collapse());
    act(() => last.expand());

    rerender(<Harness view="visual" onState={(s) => (last = s)} />);
    expect(last.isCollapsed).toBe(false); // Visual still expanded
    // Document toggling never persisted anything over the Visual preference.
    expect(window.localStorage.getItem(__LEFT_AGENT_RAIL_STORAGE_KEY__)).toBeNull();
  });

  it("a persisted collapsed Visual preference survives a Document round-trip", () => {
    window.localStorage.setItem(__LEFT_AGENT_RAIL_STORAGE_KEY__, "true");
    let last!: UseLeftAgentRailResult;
    const { rerender } = render(<Harness view="visual" onState={(s) => (last = s)} />);
    expect(last.isCollapsed).toBe(true);

    rerender(<Harness view="document" onState={(s) => (last = s)} />);
    act(() => last.expand()); // explicit open in Document
    expect(last.isCollapsed).toBe(false);

    rerender(<Harness view="visual" onState={(s) => (last = s)} />);
    expect(last.isCollapsed).toBe(true); // persisted Visual collapse restored
    expect(window.localStorage.getItem(__LEFT_AGENT_RAIL_STORAGE_KEY__)).toBe("true");
  });

  it("re-entering Document mode resets an explicitly opened rail back to collapsed", () => {
    let last!: UseLeftAgentRailResult;
    const { rerender } = render(<Harness view="document" onState={(s) => (last = s)} />);
    act(() => last.expand());
    expect(last.isCollapsed).toBe(false);

    rerender(<Harness view="visual" onState={(s) => (last = s)} />);
    rerender(<Harness view="document" onState={(s) => (last = s)} />);
    expect(last.isCollapsed).toBe(true);
  });

  it("an explicitly opened Document rail stays open across unrelated re-renders", () => {
    let last!: UseLeftAgentRailResult;
    const { rerender } = render(<Harness view="document" onState={(s) => (last = s)} />);
    act(() => last.expand());
    rerender(<Harness view="document" onState={(s) => (last = s)} />);
    rerender(<Harness view="document" onState={(s) => (last = s)} />);
    expect(last.isCollapsed).toBe(false);
  });

  it("callbacks remain referentially stable across view switches", () => {
    const states: UseLeftAgentRailResult[] = [];
    const { rerender } = render(<Harness view="visual" onState={(s) => states.push(s)} />);
    rerender(<Harness view="document" onState={(s) => states.push(s)} />);
    rerender(<Harness view="visual" onState={(s) => states.push(s)} />);
    expect(states.length).toBeGreaterThanOrEqual(3);
    expect(states[0]!.toggle).toBe(states[states.length - 1]!.toggle);
    expect(states[0]!.expand).toBe(states[states.length - 1]!.expand);
    expect(states[0]!.collapse).toBe(states[states.length - 1]!.collapse);
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
