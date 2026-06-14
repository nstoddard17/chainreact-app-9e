/**
 * Tests for AI-CONFIG-ASSIST CS-3 target resolver (useChatFillTarget).
 *
 * Resolves the highlighted field (configSlice) → live node (graphSlice) → meta
 * (mocked here) → CS-1 eligibility. Returns null when nothing is highlighted.
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
import { useChatFillTarget } from "@/features/workflow-builder/ai/useChatFillTarget";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

const SLACK_NODE = {
  id: "slack1",
  kind: "action" as const,
  provider: "slack",
  type: "send_channel_message",
  config: { channel: "C1", text: "" },
  position: { x: 0, y: 0 },
};

beforeEach(() => {
  useConfigSlice.getState().reset();
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf1", { nodes: [SLACK_NODE], edges: [] }, "rev-1");
});

describe("useChatFillTarget", () => {
  it("returns null when no field is highlighted", () => {
    const { result } = renderHook(() => useChatFillTarget());
    expect(result.current).toBeNull();
  });

  it("resolves the highlighted eligible Message field with labels + eligibility", () => {
    useConfigSlice.getState().revealNode({ nodeId: "slack1", initialValues: { channel: "C1", text: "" }, fieldKey: "text" });
    const { result } = renderHook(() => useChatFillTarget());
    const t = result.current!;
    expect(t.nodeId).toBe("slack1");
    expect(t.fieldKey).toBe("text");
    expect(t.fieldLabel).toBe("Message");
    expect(t.nodeLabel).toBe("Send Channel Message");
    expect(t.field?.type).toBe("textarea");
    expect(t.action).toEqual({ isDestructive: false, requiresConfirmation: false });
    expect(t.eligibility.ok).toBe(true);
  });

  it("marks a highlighted recipient field ineligible (not fillable)", () => {
    useConfigSlice.getState().revealNode({ nodeId: "slack1", initialValues: { channel: "C1", text: "" }, fieldKey: "channel" });
    const { result } = renderHook(() => useChatFillTarget());
    expect(result.current?.eligibility.ok).toBe(false);
  });
});
