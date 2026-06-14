/**
 * Tests for AI-CONFIG-ASSIST CS-2 — local pending-fill action
 * (features/workflow-builder/ai/chatFillAction.ts).
 *
 * The inert code path a later chat/UI will call to place a chat-typed value into
 * the currently-targeted config DRAFT. It writes ONLY the configSlice draft (the
 * same path a manual keystroke uses) — never graphSlice (canvas-pending), never
 * save, never run, never a node/edge mutation, never Apply. CS-1 guardrails are
 * reused for eligibility + value validation.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { FieldMeta } from "@/contracts/actionMeta";
import {
  prepareChatFill,
  applyChatFillToDraft,
  type ChatFillInput,
} from "@/features/workflow-builder/ai/chatFillAction";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

function field(name: string, type: FieldMeta["type"] = "textarea"): FieldMeta {
  return { name, label: name, type, required: false } as FieldMeta;
}

const SAFE_ACTION = { isDestructive: false, requiresConfirmation: false };

const SLACK_NODE = {
  id: "slack1",
  kind: "action" as const,
  provider: "slack",
  type: "send_channel_message",
  config: { channel: "C123", text: "" },
  position: { x: 0, y: 0 },
};

/** A valid, highlighted, eligible chat-fill input targeting slack1.text. */
function validInput(overrides: Partial<ChatFillInput> = {}): ChatFillInput {
  return {
    nodeId: "slack1",
    fieldKey: "text",
    field: field("text", "textarea"),
    action: SAFE_ACTION,
    value: "hello from ChainReact",
    currentValue: "",
    nodeLabel: "Send Channel Message",
    fieldLabel: "Message",
    nodeExists: true,
    highlightedFieldKey: "text",
    requireHighlightMatch: true,
    ...overrides,
  };
}

beforeEach(() => {
  useConfigSlice.getState().reset();
  useGraphSlice.getState().reset();
});

describe("prepareChatFill — pure validation (no write)", () => {
  it("returns an ok before/after proposal for a valid eligible target", () => {
    const res = prepareChatFill(validInput({ currentValue: "old text" }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.proposal).toMatchObject({
        nodeId: "slack1",
        fieldKey: "text",
        nodeLabel: "Send Channel Message",
        fieldLabel: "Message",
        previousValue: "old text",
        newValue: "hello from ChainReact",
      });
    }
  });

  it("preserves the EXACT typed value (no trimming)", () => {
    const res = prepareChatFill(validInput({ value: "  spaced  " }));
    expect(res.ok && res.proposal.newValue).toBe("  spaced  ");
  });

  it("does NOT write to the draft (pure)", () => {
    useConfigSlice.getState().revealNode({ nodeId: "slack1", initialValues: { text: "" }, fieldKey: "text" });
    prepareChatFill(validInput());
    expect(useConfigSlice.getState().drafts.slack1!.values.text).toBe("");
    expect(useConfigSlice.getState().drafts.slack1!.isDirty).toBe(false);
  });

  it("rejects a stale/missing node target", () => {
    expect(prepareChatFill(validInput({ nodeExists: false }))).toEqual({ ok: false, reason: "STALE_NODE_TARGET" });
  });

  it("rejects a stale/missing field target", () => {
    expect(prepareChatFill(validInput({ field: undefined }))).toEqual({ ok: false, reason: "STALE_FIELD_TARGET" });
    // field/key mismatch is also stale.
    expect(prepareChatFill(validInput({ field: field("other", "textarea") }))).toEqual({
      ok: false,
      reason: "STALE_FIELD_TARGET",
    });
  });

  it("rejects when the target is not the highlighted field (requireHighlightMatch)", () => {
    expect(prepareChatFill(validInput({ highlightedFieldKey: "channel" }))).toEqual({
      ok: false,
      reason: "TARGET_NOT_HIGHLIGHTED",
    });
    expect(prepareChatFill(validInput({ highlightedFieldKey: null }))).toEqual({
      ok: false,
      reason: "TARGET_NOT_HIGHLIGHTED",
    });
  });

  it("allows a non-highlighted target when requireHighlightMatch is false", () => {
    const res = prepareChatFill(validInput({ highlightedFieldKey: null, requireHighlightMatch: false }));
    expect(res.ok).toBe(true);
  });

  it("rejects an ineligible field via CS-1 (secret) with the underlying reason", () => {
    const res = prepareChatFill(validInput({ fieldKey: "apiKey", field: field("apiKey", "text"), highlightedFieldKey: "apiKey" }));
    expect(res).toEqual({ ok: false, reason: "FIELD_NOT_ELIGIBLE", eligibilityReason: "SECRET_FIELD" });
  });

  it("rejects an ineligible field via CS-1 (recipient + unsupported type)", () => {
    const recipient = prepareChatFill(validInput({ fieldKey: "to", field: field("to", "text"), highlightedFieldKey: "to" }));
    expect(recipient).toEqual({ ok: false, reason: "FIELD_NOT_ELIGIBLE", eligibilityReason: "RECIPIENT_OR_DESTINATION_FIELD" });

    const structured = prepareChatFill(validInput({ field: field("text", "select") }));
    expect(structured).toEqual({ ok: false, reason: "FIELD_NOT_ELIGIBLE", eligibilityReason: "UNSUPPORTED_FIELD_TYPE" });
  });

  it("rejects a destructive / confirmation-required action via CS-1", () => {
    expect(prepareChatFill(validInput({ action: { isDestructive: true, requiresConfirmation: false } }))).toEqual({
      ok: false,
      reason: "FIELD_NOT_ELIGIBLE",
      eligibilityReason: "DESTRUCTIVE_ACTION",
    });
  });

  it("rejects an invalid value via CS-1 with the underlying reason", () => {
    expect(prepareChatFill(validInput({ value: "   " }))).toEqual({ ok: false, reason: "VALUE_INVALID", valueReason: "EMPTY_VALUE" });
    expect(prepareChatFill(validInput({ value: 42 }))).toEqual({ ok: false, reason: "VALUE_INVALID", valueReason: "NON_STRING_VALUE" });
  });
});

describe("applyChatFillToDraft — writes ONLY the config draft", () => {
  it("applies a valid value via configSlice.updateField and marks the draft dirty/unsaved", () => {
    // Open the node (creates the draft + highlights the field), then fill.
    useConfigSlice.getState().revealNode({ nodeId: "slack1", initialValues: { channel: "C123", text: "" }, fieldKey: "text" });
    const updateSpy = jest.spyOn(useConfigSlice.getState(), "updateField");

    const res = applyChatFillToDraft(validInput({ currentValue: "" }));

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.proposal.previousValue).toBe("");
      expect(res.proposal.newValue).toBe("hello from ChainReact");
    }
    // Wrote through the SAME path manual typing uses.
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledWith({ nodeId: "slack1", name: "text", value: "hello from ChainReact" });
    const draft = useConfigSlice.getState().drafts.slack1!;
    expect(draft.values.text).toBe("hello from ChainReact");
    expect(draft.isDirty).toBe(true);

    updateSpy.mockRestore();
  });

  it("does NOT call graphSlice.updateNodeConfig or graphSlice.save, and does NOT mutate nodes/edges", () => {
    useGraphSlice.getState().hydrate("wf1", { nodes: [SLACK_NODE], edges: [] }, "rev-1");
    useConfigSlice.getState().revealNode({ nodeId: "slack1", initialValues: { channel: "C123", text: "" }, fieldKey: "text" });

    const nodesBefore = useGraphSlice.getState().pendingNodes;
    const edgesBefore = useGraphSlice.getState().pendingEdges;
    const savedBefore = useGraphSlice.getState().savedNodes;
    const updateNodeConfigSpy = jest.spyOn(useGraphSlice.getState(), "updateNodeConfig");
    const saveSpy = jest.spyOn(useGraphSlice.getState(), "save");

    const res = applyChatFillToDraft(validInput());
    expect(res.ok).toBe(true);

    expect(updateNodeConfigSpy).not.toHaveBeenCalled();
    expect(saveSpy).not.toHaveBeenCalled();
    // Graph structure + saved/server-confirmed config untouched (no commit, no persist).
    expect(useGraphSlice.getState().pendingNodes).toEqual(nodesBefore);
    expect(useGraphSlice.getState().pendingEdges).toEqual(edgesBefore);
    expect(useGraphSlice.getState().savedNodes).toEqual(savedBefore);
    // The node's saved config (what would persist) is unchanged.
    expect(useGraphSlice.getState().pendingNodes.find((n) => n.id === "slack1")!.config).toEqual({ channel: "C123", text: "" });

    updateNodeConfigSpy.mockRestore();
    saveSpy.mockRestore();
  });

  it("re-validates: a failing input is returned without any write", () => {
    useConfigSlice.getState().revealNode({ nodeId: "slack1", initialValues: { text: "" }, fieldKey: "text" });
    const res = applyChatFillToDraft(validInput({ value: "" }));
    expect(res).toEqual({ ok: false, reason: "VALUE_INVALID", valueReason: "EMPTY_VALUE" });
    expect(useConfigSlice.getState().drafts.slack1!.values.text).toBe("");
    expect(useConfigSlice.getState().drafts.slack1!.isDirty).toBe(false);
  });

  it("returns STALE_NODE_TARGET when no draft is open for the node (avoids a silent no-op)", () => {
    // No revealNode / openNode → no draft exists.
    const res = applyChatFillToDraft(validInput());
    expect(res).toEqual({ ok: false, reason: "STALE_NODE_TARGET" });
  });
});

describe("client-safety", () => {
  it("imports no server-only modules (no `import … from @/services|@/repositories`)", () => {
    const src = readFileSync(
      path.join(process.cwd(), "features/workflow-builder/ai/chatFillAction.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/\bfrom\s+["']@\/(services|repositories)\//);
    expect(src).not.toMatch(/\brequire\(\s*["']@\/(services|repositories)\//);
  });
});
