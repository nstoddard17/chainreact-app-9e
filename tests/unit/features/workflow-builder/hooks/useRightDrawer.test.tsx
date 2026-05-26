/**
 * Tests for features/workflow-builder/hooks/useRightDrawer.
 *
 * Pure local-state hook (Slice 4.BUILDER-INSPECTOR-1). Covers the mode
 * union, mutual exclusion, and the stable-callback contract that lets
 * consumers list openDrawer/closeDrawer in useEffect deps.
 */
import { act, render } from "@testing-library/react";
import {
  useRightDrawer,
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
    act(() => last.openDrawer("ai"));
    expect(last.mode).toBe("ai");
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
    // open inspector, then toggle to ai → switch
    act(() => last.openDrawer("inspector"));
    act(() => last.toggleDrawer("ai"));
    expect(last.mode).toBe("ai");
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
