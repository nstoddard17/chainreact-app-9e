/**
 * Tests for AI-CONFIG-ASSIST CS-3 orchestration (useChatFill).
 *
 * propose() turns explicit chat text into a pending-fill proposal (or safe
 * guidance); confirmFill() writes the pending config DRAFT via CS-2 + appends a
 * summary; cancelFill() does not write. No graphSlice mutation, no save, no run.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderHook, act } from "@testing-library/react";
import type { FieldMeta } from "@/contracts/actionMeta";
import { useChatFill } from "@/features/workflow-builder/panels/useChatFill";
import type { ChatFillTarget } from "@/features/workflow-builder/ai/useChatFillTarget";
import type { ChatMessage } from "@/features/workflow-builder/panels/_BuilderAiPanelChat";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

function field(name: string, type: FieldMeta["type"] = "textarea"): FieldMeta {
  return { name, label: name === "text" ? "Message" : name, type, required: false } as FieldMeta;
}

function target(overrides: Partial<ChatFillTarget> = {}): ChatFillTarget {
  const f = overrides.field ?? field("text", "textarea");
  return {
    nodeId: "slack1",
    fieldKey: "text",
    field: f,
    action: { isDestructive: false, requiresConfirmation: false },
    nodeLabel: "Send Channel Message",
    fieldLabel: f?.label ?? "Message",
    currentValue: "",
    eligibility: { ok: true, field: f! },
    ...overrides,
  };
}

function setup(getTarget: () => ChatFillTarget | null = () => target()) {
  const messages: ChatMessage[] = [];
  const appendMessage = (m: ChatMessage) => messages.push(m);
  const hook = renderHook(() =>
    useChatFill({ appendMessage, getCurrentTarget: getTarget }),
  );
  return { messages, hook };
}

function lastFill(messages: ChatMessage[]) {
  const m = messages[messages.length - 1]!;
  if (m.role !== "assistant" || m.kind !== "chat_fill") throw new Error("expected chat_fill");
  return m.fill;
}

beforeEach(() => {
  useConfigSlice.getState().reset();
  useGraphSlice.getState().reset();
});

describe("useChatFill.propose", () => {
  it("creates a pending-fill proposal from plain chat text", () => {
    const { messages, hook } = setup();
    act(() => hook.result.current.propose(target(), "hello from ChainReact"));
    const fill = lastFill(messages);
    expect(fill.phase).toBe("proposal");
    if (fill.phase === "proposal") {
      expect(fill.proposal).toMatchObject({
        nodeId: "slack1",
        fieldKey: "text",
        fieldLabel: "Message",
        nodeLabel: "Send Channel Message",
        newValue: "hello from ChainReact",
      });
    }
  });

  it("preserves exact quoted value in the proposal", () => {
    const { messages, hook } = setup();
    act(() => hook.result.current.propose(target(), 'put "hello from ChainReact" in message'));
    const fill = lastFill(messages);
    expect(fill.phase === "proposal" && fill.proposal.newValue).toBe("hello from ChainReact");
  });

  it("asks for clarification on ambiguous input — no proposal", () => {
    const { messages, hook } = setup();
    act(() => hook.result.current.propose(target(), "put hello in the message field"));
    const fill = lastFill(messages);
    expect(fill.phase).toBe("blocked");
    if (fill.phase === "blocked") expect(fill.message).toMatch(/quotes|exact value/i);
  });

  it("blocks a secret field with safe guidance — never echoes the value", () => {
    const { messages, hook } = setup();
    const secret = target({ fieldKey: "apiKey", field: field("apiKey", "text"), fieldLabel: "" });
    act(() => hook.result.current.propose(secret, "super-secret-token-123"));
    const fill = lastFill(messages);
    expect(fill.phase).toBe("blocked");
    if (fill.phase === "blocked") {
      expect(fill.message).toMatch(/sensitive/i);
      expect(fill.message).not.toContain("super-secret-token-123");
      expect(fill.message).not.toContain("apiKey");
    }
  });

  it("blocks a recipient/destination field", () => {
    const { messages, hook } = setup();
    const recip = target({ fieldKey: "to", field: field("to", "text"), fieldLabel: "" });
    act(() => hook.result.current.propose(recip, "person@example.com"));
    const fill = lastFill(messages);
    expect(fill.phase === "blocked" && /recipient|destination/i.test(fill.message)).toBe(true);
  });
});

describe("useChatFill.fillNow (CS-9 — direct fill, no confirmation)", () => {
  it("writes the pending draft IMMEDIATELY + appends a SUMMARY (no proposal/confirm)", () => {
    useConfigSlice.getState().revealNode({ nodeId: "slack1", initialValues: { text: "" }, fieldKey: "text" });
    const updateNodeConfigSpy = jest.spyOn(useGraphSlice.getState(), "updateNodeConfig");
    const saveSpy = jest.spyOn(useGraphSlice.getState(), "save");

    const { messages, hook } = setup();
    act(() => hook.result.current.fillNow(target(), "Hey!!!"));

    // Pending draft filled directly (applyChatFillToDraft) + dirty.
    const draft = useConfigSlice.getState().drafts.slack1!;
    expect(draft.values.text).toBe("Hey!!!");
    expect(draft.isDirty).toBe(true);

    // The user's message is echoed, then an after-fill SUMMARY — never a proposal.
    expect(messages.some((m) => m.role === "user" && m.kind === "action")).toBe(true);
    const fill = lastFill(messages);
    expect(fill.phase).toBe("summary");
    if (fill.phase === "summary") {
      expect(fill.proposal.previousValue).toBe("");
      expect(fill.proposal.newValue).toBe("Hey!!!");
    }
    // No proposal bubble was ever created.
    expect(messages.some((m) => m.role === "assistant" && m.kind === "chat_fill" && m.fill.phase === "proposal")).toBe(false);
    // No graph commit / persist / run.
    expect(updateNodeConfigSpy).not.toHaveBeenCalled();
    expect(saveSpy).not.toHaveBeenCalled();

    updateNodeConfigSpy.mockRestore();
    saveSpy.mockRestore();
  });

  it("ambiguous input → safe guidance, NO write, NO summary, NO proposal", () => {
    useConfigSlice.getState().revealNode({ nodeId: "slack1", initialValues: { text: "" }, fieldKey: "text" });
    const { messages, hook } = setup();
    act(() => hook.result.current.fillNow(target(), "put hello in the message field"));
    expect(useConfigSlice.getState().drafts.slack1!.values.text).toBe("");
    const fill = lastFill(messages);
    expect(fill.phase).toBe("blocked");
    expect(messages.some((m) => m.role === "assistant" && m.kind === "chat_fill" && m.fill.phase === "proposal")).toBe(false);
  });

  it("ineligible (secret) field → blocked guidance, NO write, never echoes the value", () => {
    useConfigSlice.getState().revealNode({ nodeId: "slack1", initialValues: { apiKey: "" }, fieldKey: "apiKey" });
    const { messages, hook } = setup(() => target({ fieldKey: "apiKey", field: field("apiKey", "text"), fieldLabel: "" }));
    act(() => hook.result.current.fillNow(target({ fieldKey: "apiKey", field: field("apiKey", "text"), fieldLabel: "" }), "super-secret-token-123"));
    expect(useConfigSlice.getState().drafts.slack1!.values.apiKey).toBe("");
    const fill = lastFill(messages);
    expect(fill.phase).toBe("blocked");
    if (fill.phase === "blocked") {
      expect(fill.message).toMatch(/sensitive/i);
      expect(fill.message).not.toContain("apiKey");
    }
    // The blocked path must NOT echo the user's (secret) value anywhere.
    expect(JSON.stringify(messages)).not.toContain("super-secret-token-123");
    expect(messages.some((m) => m.role === "user")).toBe(false);
  });
});

describe("useChatFill.confirmFill", () => {
  it("writes the value to the pending config draft and appends a summary — no graph mutation/save", () => {
    // Open the rail draft + highlight (so applyChatFillToDraft can write).
    useConfigSlice.getState().revealNode({ nodeId: "slack1", initialValues: { text: "" }, fieldKey: "text" });
    const updateNodeConfigSpy = jest.spyOn(useGraphSlice.getState(), "updateNodeConfig");
    const saveSpy = jest.spyOn(useGraphSlice.getState(), "save");

    const { messages, hook } = setup();
    const proposal = {
      nodeId: "slack1",
      fieldKey: "text",
      nodeLabel: "Send Channel Message",
      fieldLabel: "Message",
      previousValue: "",
      newValue: "hello from ChainReact",
    };
    act(() => hook.result.current.confirmFill("m1", proposal));

    // Pending draft updated + dirty.
    const draft = useConfigSlice.getState().drafts.slack1!;
    expect(draft.values.text).toBe("hello from ChainReact");
    expect(draft.isDirty).toBe(true);
    // Summary appended with prev/new.
    const fill = lastFill(messages);
    expect(fill.phase).toBe("summary");
    if (fill.phase === "summary") {
      expect(fill.proposal.previousValue).toBe("");
      expect(fill.proposal.newValue).toBe("hello from ChainReact");
    }
    // No graph commit / persist.
    expect(updateNodeConfigSpy).not.toHaveBeenCalled();
    expect(saveSpy).not.toHaveBeenCalled();
    // Proposal marked resolved.
    expect(hook.result.current.resolvedFillIds.has("m1")).toBe(true);

    updateNodeConfigSpy.mockRestore();
    saveSpy.mockRestore();
  });

  it("rejects a stale proposal when the highlighted field changed (no write)", () => {
    useConfigSlice.getState().revealNode({ nodeId: "slack1", initialValues: { text: "" }, fieldKey: "text" });
    // Live target is now a DIFFERENT field.
    const { messages, hook } = setup(() => target({ fieldKey: "other", field: field("other", "textarea") }));
    act(() =>
      hook.result.current.confirmFill("m1", {
        nodeId: "slack1",
        fieldKey: "text",
        nodeLabel: "Send Channel Message",
        fieldLabel: "Message",
        previousValue: "",
        newValue: "hello",
      }),
    );
    const fill = lastFill(messages);
    expect(fill.phase).toBe("blocked");
    expect(useConfigSlice.getState().drafts.slack1!.values.text).toBe("");
  });

  it("rejects when there is no live target (no write)", () => {
    useConfigSlice.getState().revealNode({ nodeId: "slack1", initialValues: { text: "" }, fieldKey: "text" });
    const { messages, hook } = setup(() => null);
    act(() =>
      hook.result.current.confirmFill("m1", {
        nodeId: "slack1",
        fieldKey: "text",
        nodeLabel: "Send Channel Message",
        fieldLabel: "Message",
        previousValue: "",
        newValue: "hello",
      }),
    );
    expect(lastFill(messages).phase).toBe("blocked");
    expect(useConfigSlice.getState().drafts.slack1!.values.text).toBe("");
  });
});

describe("useChatFill.cancelFill", () => {
  it("does not write and marks the proposal resolved", () => {
    useConfigSlice.getState().revealNode({ nodeId: "slack1", initialValues: { text: "" }, fieldKey: "text" });
    const { messages, hook } = setup();
    act(() => hook.result.current.cancelFill("m1"));
    expect(useConfigSlice.getState().drafts.slack1!.values.text).toBe("");
    expect(hook.result.current.resolvedFillIds.has("m1")).toBe(true);
    expect(messages).toHaveLength(0); // cancel appends nothing
  });
});

describe("client-safety", () => {
  it("useChatFill + chat-fill modules import no server-only modules", () => {
    const files = [
      "features/workflow-builder/panels/useChatFill.ts",
      "features/workflow-builder/ai/extractChatFillValue.ts",
      "features/workflow-builder/ai/useChatFillTarget.ts",
      "features/workflow-builder/panels/_BuilderAiPanelChatFill.tsx",
    ];
    for (const f of files) {
      const src = readFileSync(path.join(process.cwd(), f), "utf8");
      expect(src).not.toMatch(/\bfrom\s+["']@\/(services|repositories)\//);
    }
  });
});
