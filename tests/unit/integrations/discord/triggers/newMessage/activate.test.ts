/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-7 — Discord new_message activation hook.
 *
 * Pinned contracts:
 *   - Requires `guildId` + `channelId` in node.config (both throw on
 *     missing/empty).
 *   - Calls `messagesList({channelId, limit: 1})` exactly once.
 *   - Stores newest message id as `snapshot.lastSeenMessageId` when
 *     channel has messages.
 *   - Empty channel → synthesizes a snowflake from Date.now() so first
 *     real message has a strictly larger id (CLAUDE.md first-poll-miss
 *     rule, empty-channel case).
 *   - Returns pollingEnabled:true (mirrors Gmail's shape).
 *   - Re-activation is idempotent — each call re-seeds from CURRENT
 *     newest; missed messages during the "disabled" window are NOT
 *     replayed (workflow re-enable is not a history-replay event).
 */
const mockMessagesList = jest.fn();
jest.mock("@/integrations/_shared/discord/api/messages", () => ({
  messagesList: (...args: unknown[]) => mockMessagesList(...args),
}));

import { activate } from "@/integrations/discord/triggers/newMessage/activate";
import { DISCORD_EPOCH_MS } from "@/integrations/discord/triggers/newMessage/snowflake";

beforeEach(() => {
  mockMessagesList.mockReset();
});

const integration = {
  id: "int-1",
  userId: "user-1",
  provider: "discord",
  providerAccountId: "discord-user-1",
  displayName: "test-user",
  accessTokenEncrypted: "ENC",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: ["identify", "email", "bot", "guilds"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

const baseNode = {
  id: "node-trigger-1",
  kind: "trigger" as const,
  provider: "discord",
  type: "new_message",
  config: {
    guildId: "guild-snow-1",
    channelId: "ch-snow-1",
  },
  position: { x: 0, y: 0 },
};

describe("discord new_message activate — happy path", () => {
  it("seeds snapshot from the newest message in the channel", async () => {
    mockMessagesList.mockResolvedValueOnce([
      { id: "msg-newest", channel_id: "ch-snow-1", content: "hi", type: 0 },
    ]);
    const result = await activate({
      node: baseNode,
      integration,
      workflowId: "wf-1",
    });
    expect(mockMessagesList).toHaveBeenCalledTimes(1);
    expect(mockMessagesList.mock.calls[0]![0]!).toEqual({
      channelId: "ch-snow-1",
      limit: 1,
    });
    expect(result.pollingEnabled).toBe(true);
    const snapshot = (result as Record<string, unknown>).snapshot as {
      lastSeenMessageId: string;
      capturedAt: string;
    };
    expect(snapshot.lastSeenMessageId).toBe("msg-newest");
    expect(snapshot.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("synthesizes a high-water snowflake from Date.now() for empty channels", async () => {
    mockMessagesList.mockResolvedValueOnce([]);
    const before = Date.now();
    const result = await activate({
      node: baseNode,
      integration,
      workflowId: "wf-1",
    });
    const after = Date.now();
    const snapshot = (result as Record<string, unknown>).snapshot as {
      lastSeenMessageId: string;
    };
    // The synthesized snowflake is BigInt; reverse the formula to
    // recover its underlying timestamp and assert it's bounded by
    // [before, after].
    const snowflake = BigInt(snapshot.lastSeenMessageId);
    const recoveredMs = Number((snowflake >> 22n) + DISCORD_EPOCH_MS);
    expect(recoveredMs).toBeGreaterThanOrEqual(before);
    expect(recoveredMs).toBeLessThanOrEqual(after);
  });

  it("does NOT set config.type = 'subscription-watch' (polling has no provider-side resource)", async () => {
    mockMessagesList.mockResolvedValueOnce([
      { id: "msg-1", channel_id: "ch-1", content: "x", type: 0 },
    ]);
    const result = await activate({
      node: baseNode,
      integration,
      workflowId: "wf-1",
    });
    expect((result as Record<string, unknown>).type).toBeUndefined();
  });

  it("re-activation re-seeds from CURRENT newest message (no replay of missed messages)", async () => {
    // First activation: seed from msg-A.
    mockMessagesList.mockResolvedValueOnce([
      { id: "msg-A", channel_id: "ch-1", content: "first activation", type: 0 },
    ]);
    const first = await activate({
      node: baseNode,
      integration,
      workflowId: "wf-1",
    });
    expect(
      ((first as Record<string, unknown>).snapshot as { lastSeenMessageId: string })
        .lastSeenMessageId,
    ).toBe("msg-A");

    // Re-activation later: msg-C is now newest (msg-B arrived during
    // the disable window). The snapshot resets to msg-C — msg-B is
    // intentionally NOT replayed.
    mockMessagesList.mockResolvedValueOnce([
      { id: "msg-C", channel_id: "ch-1", content: "current newest", type: 0 },
    ]);
    const second = await activate({
      node: baseNode,
      integration,
      workflowId: "wf-1",
    });
    expect(
      ((second as Record<string, unknown>).snapshot as { lastSeenMessageId: string })
        .lastSeenMessageId,
    ).toBe("msg-C");
  });
});

describe("discord new_message activate — schema validation", () => {
  it("rejects missing guildId — no Discord call attempted", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: { channelId: "ch-1" } },
        integration,
        workflowId: "wf-1",
      }),
    ).rejects.toThrow(/guildId is required/);
    expect(mockMessagesList).not.toHaveBeenCalled();
  });

  it("rejects empty guildId — no Discord call attempted", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: { guildId: "", channelId: "ch-1" } },
        integration,
        workflowId: "wf-1",
      }),
    ).rejects.toThrow(/guildId is required/);
    expect(mockMessagesList).not.toHaveBeenCalled();
  });

  it("rejects missing channelId — no Discord call attempted", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: { guildId: "g-1" } },
        integration,
        workflowId: "wf-1",
      }),
    ).rejects.toThrow(/channelId is required/);
    expect(mockMessagesList).not.toHaveBeenCalled();
  });

  it("rejects empty channelId — no Discord call attempted", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: { guildId: "g-1", channelId: "" } },
        integration,
        workflowId: "wf-1",
      }),
    ).rejects.toThrow(/channelId is required/);
    expect(mockMessagesList).not.toHaveBeenCalled();
  });
});

describe("discord new_message activate — Discord error propagation", () => {
  it("propagates Discord errors so lifecycle wraps with TRIGGER_REGISTRATION_FAILED", async () => {
    mockMessagesList.mockRejectedValueOnce(new Error("403 Missing Access"));
    await expect(
      activate({ node: baseNode, integration, workflowId: "wf-1" }),
    ).rejects.toThrow(/403/);
  });
});
