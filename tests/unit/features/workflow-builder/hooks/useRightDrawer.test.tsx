/**
 * Tests for features/workflow-builder/hooks/useRightDrawer.
 *
 * Pure local-state hook (Slice 4.BUILDER-INSPECTOR-1, narrowed in
 * Slice 4.BUILDER-LEFT-AGENT-1). Covers the mode union, mutual
 * exclusion, the stable-callback contract that lets consumers list
 * openDrawer/closeDrawer in useEffect deps, and the typed-union
 * assertion that the drawer cannot host AI (the React Agent lives in
 * the left rail; see port plan §0 / §4).
 */
import { act, render } from "@testing-library/react";
import {
  useRightDrawer,
  type RightDrawerMode,
  type UseRightDrawerResult,
} from "@/features/workflow-builder/hooks/useRightDrawer";

function Harness({
  onState,
}: {
  onState: (state: UseRightDrawerResult) => void;
}) {
  const state = useRightDrawer();
  onState(state);
  return null;
}

describe("useRightDrawer", () => {
  it("starts closed (mode === null, isOpen === false)", () => {
    let last!: UseRightDrawerResult;
    render(<Harness onState={(s) => (last = s)} />);
    expect(last.mode).toBeNull();
    expect(last.isOpen).toBe(false);
  });

  it("openDrawer(mode) sets mode and flips isOpen to true", () => {
    let last!: UseRightDrawerResult;
    render(<Harness onState={(s) => (last = s)} />);
    act(() => last.openDrawer("inspector"));
    expect(last.mode).toBe("inspector");
    expect(last.isOpen).toBe(true);
  });

  it("openDrawer is mutually exclusive — opening a new mode replaces the previous one", () => {
    let last!: UseRightDrawerResult;
    render(<Harness onState={(s) => (last = s)} />);
    act(() => last.openDrawer("inspector"));
    expect(last.mode).toBe("inspector");
    act(() => last.openDrawer("results"));
    expect(last.mode).toBe("results");
    act(() => last.openDrawer("validation"));
    expect(last.mode).toBe("validation");
  });

  it("closeDrawer drops mode back to null", () => {
    let last!: UseRightDrawerResult;
    render(<Harness onState={(s) => (last = s)} />);
    act(() => last.openDrawer("inspector"));
    act(() => last.closeDrawer());
    expect(last.mode).toBeNull();
    expect(last.isOpen).toBe(false);
  });

  it("toggleDrawer opens when closed; closes when already on that mode; switches when on a different mode", () => {
    let last!: UseRightDrawerResult;
    render(<Harness onState={(s) => (last = s)} />);
    // closed → open
    act(() => last.toggleDrawer("inspector"));
    expect(last.mode).toBe("inspector");
    // same mode → close
    act(() => last.toggleDrawer("inspector"));
    expect(last.mode).toBeNull();
    // open inspector, then toggle to results → switch (different mode)
    act(() => last.openDrawer("inspector"));
    act(() => last.toggleDrawer("results"));
    expect(last.mode).toBe("results");
  });

  it("RightDrawerMode union does NOT include 'ai' — the React Agent lives in the left rail (LEFT-AGENT-1)", () => {
    // Compile-time + structural guard. The union must be exactly
    // 'inspector' | 'results' | 'validation' (in some order). Any
    // future reintroduction of an `"ai"` mode would break this test
    // and must be paired with a port-plan update explaining why.
    const sample: RightDrawerMode[] = ["inspector", "results", "validation"];
    // Building this list mechanically by exhausting the union forces
    // TS to fail if a mode is added without the test being updated.
    const exhaust = (m: RightDrawerMode): RightDrawerMode => {
      switch (m) {
        case "inspector":
          return "inspector";
        case "results":
          return "results";
        case "validation":
          return "validation";
      }
    };
    expect(sample.map(exhaust)).toEqual(["inspector", "results", "validation"]);
    // Runtime check: any string literal that compiles to RightDrawerMode
    // must be one of these three. The compile-time guard above is what
    // catches a new mode being added; this assertion just documents intent.
    const allowed = new Set(sample);
    expect(allowed.has("inspector")).toBe(true);
    expect(allowed.has("results")).toBe(true);
    expect(allowed.has("validation")).toBe(true);
    expect(allowed.has("ai" as unknown as RightDrawerMode)).toBe(false);
  });

  it("callbacks are stable across renders (so consumers can list them in useEffect deps)", () => {
    const states: UseRightDrawerResult[] = [];
    const { rerender } = render(<Harness onState={(s) => states.push(s)} />);
    rerender(<Harness onState={(s) => states.push(s)} />);
    rerender(<Harness onState={(s) => states.push(s)} />);
    expect(states.length).toBeGreaterThanOrEqual(3);
    expect(states[0]!.openDrawer).toBe(states[1]!.openDrawer);
    expect(states[1]!.openDrawer).toBe(states[2]!.openDrawer);
    expect(states[0]!.closeDrawer).toBe(states[1]!.closeDrawer);
    expect(states[0]!.toggleDrawer).toBe(states[1]!.toggleDrawer);
  });
});
