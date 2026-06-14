/**
 * Tests for AI-CONFIG-ASSIST CS-4 target resolver (useRepairFieldTarget).
 *
 * Given a diagnosed node id, resolves the node (graphSlice) → meta (mocked) →
 * the FIRST still-empty required field, returning its key (target) + label
 * (display). Returns null when the node is absent, meta is unresolved, or no
 * required field is empty (e.g. already filled). Read-only — never mutates state.
 */
import type { ActionMeta } from "@/contracts/actionMeta";

const SLACK_META = {
  key: "slack:send_channel_message",
  provider: "slack",
  type: "send_channel_message",
  displayName: "Send Channel Message",
  description: "Post a message",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    { name: "channel", label: "Channel", type: "combobox", required: true },
    { name: "text", label: "Message", type: "textarea", required: true },
  ],
  outputs: [],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: null,
  isDestructive: false,
  requiresConfirmation: false,
} as unknown as ActionMeta;

jest.mock("@/features/workflow-builder/hooks/useNativeActions", () => ({
  useNativeActions: () => ({ actions: [], loading: false, error: null }),
  findNativeActionByKey: () => undefined,
}));
jest.mock("@/features/workflow-builder/hooks/useNativeTriggers", () => ({
  useNativeTriggers: () => ({ triggers: [], loading: false, error: null }),
  findNativeTriggerByKey: () => undefined,
}));
jest.mock("@/features/workflow-builder/hooks/useProviderActions", () => ({
  useProviderActions: () => ({ actions: [SLACK_META], loading: false, error: null }),
  findProviderActionByKey: (actions: ActionMeta[], key: string) => actions.find((a) => a.key === key),
}));
jest.mock("@/features/workflow-builder/hooks/useProviderTriggers", () => ({
  useProviderTriggers: () => ({ triggers: [], loading: false, error: null }),
  findProviderTriggerByKey: () => undefined,
}));

import { renderHook } from "@testing-library/react";
import { useRepairFieldTarget } from "@/features/workflow-builder/ai/useRepairFieldTarget";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

const SLACK_NODE = {
  id: "slack1",
  kind: "action" as const,
  provider: "slack",
  type: "send_channel_message",
  // channel filled, Message (text) still empty → Message is the targetable field.
  config: { channel: "C1", text: "" },
  position: { x: 0, y: 0 },
};

beforeEach(() => {
  useConfigSlice.getState().reset();
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf1", { nodes: [SLACK_NODE], edges: [] }, "rev-1");
});

describe("useRepairFieldTarget", () => {
  it("returns null when nodeId is null", () => {
    const { result } = renderHook(() => useRepairFieldTarget(null));
    expect(result.current).toBeNull();
  });

  it("returns null when the node is not on the canvas (stale target)", () => {
    const { result } = renderHook(() => useRepairFieldTarget("ghost"));
    expect(result.current).toBeNull();
  });

  it("resolves the first empty required field with key + display labels", () => {
    const { result } = renderHook(() => useRepairFieldTarget("slack1"));
    const t = result.current!;
    expect(t.nodeId).toBe("slack1");
    expect(t.fieldKey).toBe("text");
    expect(t.fieldLabel).toBe("Message");
    expect(t.nodeLabel).toBe("Send Channel Message");
    // Live config threaded for revealNode's initialValues (navigation only).
    expect(t.initialValues).toEqual({ channel: "C1", text: "" });
  });

  it("returns null when all required fields are filled (nothing to open)", () => {
    useGraphSlice.getState().reset();
    useGraphSlice.getState().hydrate(
      "wf1",
      { nodes: [{ ...SLACK_NODE, config: { channel: "C1", text: "hi" } }], edges: [] },
      "rev-1",
    );
    const { result } = renderHook(() => useRepairFieldTarget("slack1"));
    expect(result.current).toBeNull();
  });

  it("prefers the in-progress draft value (a chat-filled draft hides the field)", () => {
    // Live node config still empty, but the config draft now has a value → not missing.
    useConfigSlice.getState().revealNode({ nodeId: "slack1", initialValues: { channel: "C1", text: "" }, fieldKey: "text" });
    useConfigSlice.getState().updateField({ nodeId: "slack1", name: "text", value: "drafted" });
    const { result } = renderHook(() => useRepairFieldTarget("slack1"));
    expect(result.current).toBeNull();
  });
});
