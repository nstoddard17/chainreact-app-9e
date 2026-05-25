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
