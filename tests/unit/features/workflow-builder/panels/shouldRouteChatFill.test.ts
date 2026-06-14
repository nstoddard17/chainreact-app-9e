/**
 * Tests for AI-CONFIG-ASSIST CS-3B — composer→chat-fill routing decision.
 *
 * Chat-fill is LIVE by default (no flag). The composer routes to chat-fill when a
 * field is highlighted and we're not mid plan-follow-up; otherwise it plans as
 * before.
 */
import { shouldRouteChatFill } from "@/features/workflow-builder/ai/shouldRouteChatFill";
import type { ChatFillTarget } from "@/features/workflow-builder/ai/useChatFillTarget";

const target = { nodeId: "slack1", fieldKey: "text" } as unknown as ChatFillTarget;

describe("shouldRouteChatFill", () => {
  it("routes to chat-fill by default when a field is highlighted (no flag)", () => {
    expect(shouldRouteChatFill(target, false)).toBe(true);
  });

  it("does NOT route when no field is highlighted (normal composer behavior)", () => {
    expect(shouldRouteChatFill(null, false)).toBe(false);
  });

  it("does NOT route mid plan-follow-up — the plan keeps the composer", () => {
    expect(shouldRouteChatFill(target, true)).toBe(false);
  });
});
