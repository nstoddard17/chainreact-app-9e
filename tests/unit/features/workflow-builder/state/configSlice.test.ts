/** @jest-environment node */
/**
 * Tests for features/workflow-builder/state/configSlice.
 *
 * Covers the documented action surface: openNode, closeNode,
 * updateField, setFieldError, resetNode, markSaved, dropNode, reset.
 *
 * Tests use the real slice (no mocks); each test resets state in
 * beforeEach so the global Zustand store stays consistent across runs.
 */
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";

beforeEach(() => {
  useConfigSlice.getState().reset();
});

describe("configSlice — openNode / closeNode", () => {
  it("openNode initializes a fresh draft when no draft exists", () => {
    useConfigSlice
      .getState()
      .openNode({ nodeId: "n1", initialValues: { url: "https://x" } });
    const state = useConfigSlice.getState();
    expect(state.activeNodeId).toBe("n1");
    expect(state.drafts.n1).toMatchObject({
      nodeId: "n1",
      values: { url: "https://x" },
      isDirty: false,
      initialValues: { url: "https://x" },
    });
  });

  it("openNode preserves an existing draft on a second open", () => {
    useConfigSlice
      .getState()
      .openNode({ nodeId: "n1", initialValues: { url: "https://x" } });
    useConfigSlice.getState().updateField({ name: "url", value: "https://edited" });
    useConfigSlice.getState().closeNode();
    useConfigSlice
      .getState()
      .openNode({ nodeId: "n1", initialValues: { url: "https://x" } });
    const draft = useConfigSlice.getState().drafts.n1!;
    expect(draft.values).toEqual({ url: "https://edited" });
    expect(draft.isDirty).toBe(true);
  });

  it("closeNode preserves drafts but clears activeNodeId", () => {
    useConfigSlice
      .getState()
      .openNode({ nodeId: "n1", initialValues: { url: "https://x" } });
    useConfigSlice.getState().closeNode();
    const state = useConfigSlice.getState();
    expect(state.activeNodeId).toBeNull();
    expect(state.drafts.n1).toBeDefined();
  });
});

describe("configSlice — revealNode / field + canvas focus (AI-REPAIR-2F)", () => {
  it("revealNode opens the node, sets field highlight, and bumps the canvas focus", () => {
    useConfigSlice.getState().revealNode({
      nodeId: "slack1",
      initialValues: { channel: "C1" },
      fieldKey: "text",
    });
    const s = useConfigSlice.getState();
    expect(s.activeNodeId).toBe("slack1");
    expect(s.drafts.slack1).toMatchObject({ values: { channel: "C1" }, isDirty: false });
    expect(s.focusFieldKey).toBe("text");
    expect(s.canvasFocusNodeId).toBe("slack1");
    expect(s.canvasFocusSeq).toBe(1);
  });

  it("revealNode is navigation-only — the draft mirrors initialValues (no value change, not dirty)", () => {
    useConfigSlice.getState().revealNode({
      nodeId: "slack1",
      initialValues: { channel: "C1", text: "" },
      fieldKey: "text",
    });
    const draft = useConfigSlice.getState().drafts.slack1!;
    expect(draft.values).toEqual({ channel: "C1", text: "" });
    expect(draft.initialValues).toEqual({ channel: "C1", text: "" });
    expect(draft.isDirty).toBe(false);
  });

  it("revealing the SAME node twice re-bumps canvasFocusSeq so the canvas re-pans", () => {
    useConfigSlice.getState().revealNode({ nodeId: "slack1", initialValues: {}, fieldKey: "text" });
    useConfigSlice.getState().revealNode({ nodeId: "slack1", initialValues: {}, fieldKey: "text" });
    expect(useConfigSlice.getState().canvasFocusSeq).toBe(2);
  });

  it("revealNode preserves an existing draft's in-progress edits", () => {
    useConfigSlice.getState().openNode({ nodeId: "slack1", initialValues: { text: "" } });
    useConfigSlice.getState().updateField({ name: "text", value: "wip" });
    useConfigSlice.getState().revealNode({ nodeId: "slack1", initialValues: { text: "" }, fieldKey: "text" });
    const draft = useConfigSlice.getState().drafts.slack1!;
    expect(draft.values).toEqual({ text: "wip" });
    expect(draft.isDirty).toBe(true);
  });

  it("editing the highlighted field clears the highlight", () => {
    useConfigSlice.getState().revealNode({ nodeId: "slack1", initialValues: { text: "" }, fieldKey: "text" });
    expect(useConfigSlice.getState().focusFieldKey).toBe("text");
    useConfigSlice.getState().updateField({ name: "text", value: "hello" });
    expect(useConfigSlice.getState().focusFieldKey).toBeNull();
  });

  it("editing a DIFFERENT field keeps the highlight", () => {
    useConfigSlice.getState().revealNode({ nodeId: "slack1", initialValues: { text: "", channel: "" }, fieldKey: "text" });
    useConfigSlice.getState().updateField({ name: "channel", value: "C9" });
    expect(useConfigSlice.getState().focusFieldKey).toBe("text");
  });

  it("clearFieldFocus + closeNode clear the field highlight", () => {
    useConfigSlice.getState().revealNode({ nodeId: "slack1", initialValues: {}, fieldKey: "text" });
    useConfigSlice.getState().clearFieldFocus();
    expect(useConfigSlice.getState().focusFieldKey).toBeNull();

    useConfigSlice.getState().revealNode({ nodeId: "slack1", initialValues: {}, fieldKey: "text" });
    useConfigSlice.getState().closeNode();
    expect(useConfigSlice.getState().focusFieldKey).toBeNull();
  });

  it("revealNode without a fieldKey still selects + focuses the node (node-only guidance)", () => {
    useConfigSlice.getState().revealNode({ nodeId: "slack1", initialValues: {} });
    const s = useConfigSlice.getState();
    expect(s.activeNodeId).toBe("slack1");
    expect(s.focusFieldKey).toBeNull();
    expect(s.canvasFocusNodeId).toBe("slack1");
  });
});

describe("configSlice — updateField", () => {
  beforeEach(() => {
    useConfigSlice
      .getState()
      .openNode({ nodeId: "n1", initialValues: { url: "https://x", method: "GET" } });
  });

  it("patches the named field and sets isDirty when value diverges", () => {
    useConfigSlice
      .getState()
      .updateField({ name: "url", value: "https://updated" });
    const draft = useConfigSlice.getState().drafts.n1!;
    expect(draft.values).toEqual({ url: "https://updated", method: "GET" });
    expect(draft.isDirty).toBe(true);
    expect(draft.lastUpdatedAt).not.toBeNull();
  });

  it("isDirty flips back to false when the user reverts the value", () => {
    useConfigSlice
      .getState()
      .updateField({ name: "url", value: "https://updated" });
    expect(useConfigSlice.getState().drafts.n1!.isDirty).toBe(true);
    useConfigSlice
      .getState()
      .updateField({ name: "url", value: "https://x" });
    expect(useConfigSlice.getState().drafts.n1!.isDirty).toBe(false);
  });

  it("clears any inline error on the same field at edit time", () => {
    useConfigSlice
      .getState()
      .setFieldError({ name: "url", error: "URL is required." });
    expect(useConfigSlice.getState().drafts.n1!.errors.url).toBe(
      "URL is required.",
    );
    useConfigSlice.getState().updateField({ name: "url", value: "https://y" });
    expect(useConfigSlice.getState().drafts.n1!.errors.url).toBeUndefined();
  });

  it("is a no-op when there is no active node and no nodeId is supplied", () => {
    useConfigSlice.getState().closeNode();
    useConfigSlice.getState().updateField({ name: "url", value: "https://z" });
    expect(useConfigSlice.getState().drafts.n1!.values).toEqual({
      url: "https://x",
      method: "GET",
    });
  });

  it("accepts an explicit nodeId override", () => {
    useConfigSlice
      .getState()
      .openNode({ nodeId: "n2", initialValues: { other: "" } });
    useConfigSlice
      .getState()
      .updateField({ nodeId: "n1", name: "url", value: "https://override" });
    expect(useConfigSlice.getState().drafts.n1!.values.url).toBe(
      "https://override",
    );
    expect(useConfigSlice.getState().drafts.n2!.values.other).toBe("");
  });
});

describe("configSlice — setFieldError", () => {
  beforeEach(() => {
    useConfigSlice
      .getState()
      .openNode({ nodeId: "n1", initialValues: { url: "" } });
  });

  it("sets and then clears the error for a field", () => {
    useConfigSlice
      .getState()
      .setFieldError({ name: "url", error: "bad" });
    expect(useConfigSlice.getState().drafts.n1!.errors.url).toBe("bad");
    useConfigSlice
      .getState()
      .setFieldError({ name: "url", error: undefined });
    expect(useConfigSlice.getState().drafts.n1!.errors.url).toBeUndefined();
  });
});

describe("configSlice — resetNode / markSaved / dropNode", () => {
  beforeEach(() => {
    useConfigSlice
      .getState()
      .openNode({ nodeId: "n1", initialValues: { url: "https://x" } });
    useConfigSlice
      .getState()
      .updateField({ name: "url", value: "https://edited" });
  });

  it("resetNode reverts values to initialValues and clears isDirty", () => {
    useConfigSlice.getState().resetNode();
    const draft = useConfigSlice.getState().drafts.n1!;
    expect(draft.values).toEqual({ url: "https://x" });
    expect(draft.isDirty).toBe(false);
    expect(draft.lastUpdatedAt).toBeNull();
  });

  it("markSaved makes the current values the new baseline", () => {
    useConfigSlice.getState().markSaved();
    const draft = useConfigSlice.getState().drafts.n1!;
    expect(draft.initialValues).toEqual({ url: "https://edited" });
    expect(draft.isDirty).toBe(false);
  });

  it("dropNode removes the draft and clears activeNodeId if it was active", () => {
    useConfigSlice.getState().dropNode("n1");
    const state = useConfigSlice.getState();
    expect(state.drafts.n1).toBeUndefined();
    expect(state.activeNodeId).toBeNull();
  });

  it("dropNode leaves activeNodeId alone when a different node is active", () => {
    useConfigSlice
      .getState()
      .openNode({ nodeId: "n2", initialValues: { other: "" } });
    useConfigSlice.getState().dropNode("n1");
    expect(useConfigSlice.getState().activeNodeId).toBe("n2");
    expect(useConfigSlice.getState().drafts.n1).toBeUndefined();
    expect(useConfigSlice.getState().drafts.n2).toBeDefined();
  });
});

describe("configSlice — reset", () => {
  it("clears all drafts and activeNodeId", () => {
    useConfigSlice
      .getState()
      .openNode({ nodeId: "n1", initialValues: {} });
    useConfigSlice.getState().reset();
    expect(useConfigSlice.getState().drafts).toEqual({});
    expect(useConfigSlice.getState().activeNodeId).toBeNull();
  });
});

// BUILDER-AGENT-RAIL-EXISTING-NODE-SETUP-SYNC — syncing an OPEN config draft after the node config was
// changed externally (the Agent rail "Update step"). The visible field must reflect the new value, the
// field highlight must persist, and the synced keys must NOT read as pending edits.
describe("configSlice — applyExternalConfig", () => {
  it("patches an open draft's value + baseline so the field shows the new value and is not dirty", () => {
    useConfigSlice.getState().revealNode({ nodeId: "n1", initialValues: { text: "old" }, fieldKey: "text" });
    useConfigSlice.getState().applyExternalConfig({ nodeId: "n1", values: { text: "new" } });
    const draft = useConfigSlice.getState().drafts.n1!;
    expect(draft.values.text).toBe("new");
    expect(draft.initialValues.text).toBe("new");
    expect(draft.isDirty).toBe(false); // it's the committed baseline now, not a pending edit
  });

  it("preserves the field highlight (focusFieldKey) — unlike a manual edit", () => {
    useConfigSlice.getState().revealNode({ nodeId: "n1", initialValues: { text: "old" }, fieldKey: "text" });
    useConfigSlice.getState().applyExternalConfig({ nodeId: "n1", values: { text: "new" } });
    expect(useConfigSlice.getState().focusFieldKey).toBe("text");
  });

  it("does NOT overwrite an unrelated in-progress edit on another field", () => {
    useConfigSlice.getState().openNode({ nodeId: "n1", initialValues: { text: "", channel: "" } });
    useConfigSlice.getState().updateField({ name: "text", value: "wip message" }); // manual edit
    useConfigSlice.getState().applyExternalConfig({ nodeId: "n1", values: { channel: "C1" } });
    const draft = useConfigSlice.getState().drafts.n1!;
    expect(draft.values).toEqual({ text: "wip message", channel: "C1" });
    // The manual text edit is still pending (diverges from its baseline); channel is committed.
    expect(draft.isDirty).toBe(true);
    expect(draft.initialValues.channel).toBe("C1");
    expect(draft.initialValues.text).toBe("");
  });

  it("is a no-op when no draft exists for the node (panel not open)", () => {
    useConfigSlice.getState().applyExternalConfig({ nodeId: "ghost", values: { text: "x" } });
    expect(useConfigSlice.getState().drafts.ghost).toBeUndefined();
  });

  // BUILDER-TOPBAR-UNDO-REDO — full-replace sync used after undo/redo restores the node config.
  describe("resyncDraftFromConfig", () => {
    it("REPLACES values + baseline so undone keys disappear and the field is not dirty", () => {
      useConfigSlice.getState().revealNode({ nodeId: "n1", initialValues: { text: "new", extra: "x" }, fieldKey: "text" });
      useConfigSlice.getState().resyncDraftFromConfig({ nodeId: "n1", config: { text: "old" } });
      const draft = useConfigSlice.getState().drafts.n1!;
      expect(draft.values).toEqual({ text: "old" }); // `extra` removed (full replace, not merge)
      expect(draft.initialValues).toEqual({ text: "old" });
      expect(draft.isDirty).toBe(false);
    });

    it("preserves the field highlight (focusFieldKey)", () => {
      useConfigSlice.getState().revealNode({ nodeId: "n1", initialValues: { text: "new" }, fieldKey: "text" });
      useConfigSlice.getState().resyncDraftFromConfig({ nodeId: "n1", config: { text: "old" } });
      expect(useConfigSlice.getState().focusFieldKey).toBe("text");
    });

    it("is a no-op when no draft exists", () => {
      useConfigSlice.getState().resyncDraftFromConfig({ nodeId: "ghost", config: { text: "x" } });
      expect(useConfigSlice.getState().drafts.ghost).toBeUndefined();
    });
  });

  it("clears a stale inline error on a synced field", () => {
    useConfigSlice.getState().openNode({ nodeId: "n1", initialValues: { text: "" } });
    useConfigSlice.getState().setFieldError({ name: "text", error: "Message is required." });
    useConfigSlice.getState().applyExternalConfig({ nodeId: "n1", values: { text: "filled" } });
    expect(useConfigSlice.getState().drafts.n1!.errors.text).toBeUndefined();
  });
});
