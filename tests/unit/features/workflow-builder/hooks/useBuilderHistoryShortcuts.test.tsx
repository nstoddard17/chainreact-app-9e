/**
 * BUILDER-TOPBAR-UNDO-REDO (keyboard) — builder-scoped undo/redo keyboard shortcuts.
 *
 * Proves: Ctrl/Cmd+Z undo, Ctrl+Y / Cmd+Shift+Z / Ctrl+Shift+Z redo, all reusing the toolbar's
 * historyNav orchestrators (graph history + open-config-panel resync); no-op when stacks are empty
 * (and crucially, a no-op never wipes an in-progress config draft); editable fields (input / textarea /
 * select / contenteditable / chat composer) keep native undo (shortcut ignored); no save route called.
 */
const mockUpdateWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return { ...actual, updateWorkflow: (...args: unknown[]) => mockUpdateWorkflow(...args) };
});

import { fireEvent, render, screen } from "@testing-library/react";
import { useBuilderHistoryShortcuts } from "@/features/workflow-builder/hooks/useBuilderHistoryShortcuts";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import type { WorkflowDefinition } from "@/contracts/workflow";

const DEF: WorkflowDefinition = {
  nodes: [{ id: "t1", kind: "trigger", provider: "slack", type: "message_received", config: {}, position: { x: 0, y: 0 } }],
  edges: [],
};

/** Harness mounting the hook + a non-editing focus target and representative editable fields. */
function Harness() {
  useBuilderHistoryShortcuts();
  return (
    <div>
      <div data-testid="canvas" tabIndex={0}>
        canvas
      </div>
      <input data-testid="text-input" />
      <textarea data-testid="composer" />
      <select data-testid="select">
        <option>a</option>
      </select>
      <div data-testid="editable" contentEditable suppressContentEditableWarning />
    </div>
  );
}

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", DEF);
});

function press(target: Element, key: string, mods: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }) {
  fireEvent.keyDown(target, { key, ...mods });
}

describe("useBuilderHistoryShortcuts — from non-editing builder focus", () => {
  it("Ctrl+Z undoes the last draft edit", () => {
    render(<Harness />);
    useGraphSlice.getState().updateNodeConfig("t1", { channel: "C1" });
    expect(useGraphSlice.getState().pendingNodes[0]!.config).toEqual({ channel: "C1" });

    press(screen.getByTestId("canvas"), "z", { ctrlKey: true });
    expect(useGraphSlice.getState().pendingNodes[0]!.config).toEqual({});
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("Cmd+Z (metaKey) undoes", () => {
    render(<Harness />);
    useGraphSlice.getState().updateNodeConfig("t1", { channel: "C1" });
    press(screen.getByTestId("canvas"), "z", { metaKey: true });
    expect(useGraphSlice.getState().pendingNodes[0]!.config).toEqual({});
  });

  it("Ctrl+Y redoes", () => {
    render(<Harness />);
    useGraphSlice.getState().updateNodeConfig("t1", { channel: "C1" });
    press(screen.getByTestId("canvas"), "z", { ctrlKey: true }); // undo
    expect(useGraphSlice.getState().pendingNodes[0]!.config).toEqual({});

    press(screen.getByTestId("canvas"), "y", { ctrlKey: true }); // redo
    expect(useGraphSlice.getState().pendingNodes[0]!.config).toEqual({ channel: "C1" });
  });

  it("Cmd+Shift+Z redoes", () => {
    render(<Harness />);
    useGraphSlice.getState().updateNodeConfig("t1", { channel: "C1" });
    press(screen.getByTestId("canvas"), "z", { metaKey: true });
    press(screen.getByTestId("canvas"), "z", { metaKey: true, shiftKey: true });
    expect(useGraphSlice.getState().pendingNodes[0]!.config).toEqual({ channel: "C1" });
  });

  it("Ctrl+Shift+Z redoes", () => {
    render(<Harness />);
    useGraphSlice.getState().updateNodeConfig("t1", { channel: "C1" });
    press(screen.getByTestId("canvas"), "z", { ctrlKey: true });
    press(screen.getByTestId("canvas"), "z", { ctrlKey: true, shiftKey: true });
    expect(useGraphSlice.getState().pendingNodes[0]!.config).toEqual({ channel: "C1" });
  });

  it("no-ops when there is nothing to undo/redo", () => {
    render(<Harness />);
    const before = useGraphSlice.getState().pendingNodes;
    press(screen.getByTestId("canvas"), "z", { ctrlKey: true });
    press(screen.getByTestId("canvas"), "y", { ctrlKey: true });
    expect(useGraphSlice.getState().pendingNodes).toBe(before);
    expect(useGraphSlice.getState().isDirty).toBe(false);
  });

  it("a no-op undo does NOT wipe an in-progress config draft", () => {
    render(<Harness />);
    // Open the config panel and type an UNSAVED edit; history is empty (no graph edit yet).
    useConfigSlice.getState().openNode({ nodeId: "t1", initialValues: {} });
    useConfigSlice.getState().updateField({ name: "channel", value: "typing…" });
    press(screen.getByTestId("canvas"), "z", { ctrlKey: true }); // empty history → guarded no-op
    expect(useConfigSlice.getState().drafts.t1!.values).toEqual({ channel: "typing…" });
  });

  it("syncs the open config panel after a keyboard undo (parity with the toolbar)", () => {
    render(<Harness />);
    useConfigSlice.getState().openNode({ nodeId: "t1", initialValues: {} });
    useGraphSlice.getState().updateNodeConfig("t1", { channel: "C1" });
    useConfigSlice.getState().applyExternalConfig({ nodeId: "t1", values: { channel: "C1" } });

    press(screen.getByTestId("canvas"), "z", { ctrlKey: true });

    expect(useGraphSlice.getState().pendingNodes[0]!.config).toEqual({});
    expect(useConfigSlice.getState().drafts.t1!.values).toEqual({}); // panel re-synced, no stale value
  });

  it("never calls the workflow save route", () => {
    render(<Harness />);
    useGraphSlice.getState().updateNodeConfig("t1", { channel: "C1" });
    press(screen.getByTestId("canvas"), "z", { ctrlKey: true });
    press(screen.getByTestId("canvas"), "z", { ctrlKey: true, shiftKey: true });
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });
});

describe("useBuilderHistoryShortcuts — editable fields keep native undo (shortcut ignored)", () => {
  it.each([
    ["text input", "text-input"],
    ["Agent-rail / chat composer textarea", "composer"],
    ["select / combobox", "select"],
    ["contenteditable editor", "editable"],
  ])("does NOT trigger builder undo when focus is in a %s", (_label, testid) => {
    render(<Harness />);
    useGraphSlice.getState().updateNodeConfig("t1", { channel: "C1" }); // something IS undoable
    press(screen.getByTestId(testid), "z", { ctrlKey: true });
    // The builder history is untouched — the field's native undo handles it instead.
    expect(useGraphSlice.getState().pendingNodes[0]!.config).toEqual({ channel: "C1" });
  });
});
