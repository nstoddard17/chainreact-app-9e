/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-7 — Discord new_message polling handler.
 *
 * Pinned contracts (the load-bearing invariants):
 *   - Reads snapshot.lastSeenMessageId, calls messagesList with
 *     `after=<snapshot>` + `limit: 100`.
 *   - Strips system messages (type !== 0 without attachments/embeds).
 *   - Applies authorFilter + contentFilter.
 *   - Dedups by Discord messageId via webhook_event_dedup.
 *   - Enqueues one run per matching, fresh, user-visible message.
 *   - Dispatches in chronological order (oldest → newest) even though
 *     Discord returns newest-first.
 *   - **Snapshot advances to max(prev, any fetched id) — even when
 *     every message is filtered out** (no infinite-replay regression).
 *   - 404 NotFoundError / 403 → log + return without advancing.
 *   - 401 / other errors → propagate.
 *   - One bad message does not abort the tick (caught + logged).
 */
const mockMessagesList = jest.fn();
const mockEnqueueRun = jest.fn();
const mockGetActive = jest.fn();
const mockUpdateConfig = jest.fn();
const mockMarkSeen = jest.fn();

jest.mock("@/integrations/_shared/discord/api/messages", () => ({
  messagesList: (...args: unknown[]) => mockMessagesList(...args),
}));
jest.mock("@/services/execution/enqueue", () => ({
  enqueueRun: (...args: unknown[]) => mockEnqueueRun(...args),
}));
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActive(...args),
}));
jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));
jest.mock("@/repositories/webhookEventDedup", () => ({
  markSeen: (...args: unknown[]) => mockMarkSeen(...args),
}));

import {
  DiscordApiError,
  NotFoundError,
} from "@/integrations/_shared/discord/errors";
import { discordNewMessagePollingHandler } from "@/integrations/discord/triggers/newMessage/poll";

beforeEach(() => {
  mockMessagesList.mockReset();
  mockEnqueueRun.mockReset();
  mockGetActive.mockReset();
  mockUpdateConfig.mockReset();
  mockMarkSeen.mockReset();
  // Default: integration is connected.
  mockGetActive.mockResolvedValue({
    id: "int-1",
    userId: "user-1",
    provider: "discord",
    providerAccountId: "discord-user-1",
    accessTokenEncrypted: "ENC",
  });
  // Default: dedup is fresh.
  mockMarkSeen.mockResolvedValue({ fresh: true });
  // Default: enqueueRun succeeds.
  mockEnqueueRun.mockResolvedValue({ runId: "run-1", enqueuedAt: "now" });
});

function makeTrigger(
  configOverrides: Record<string, unknown> = {},
): import("@/repositories/triggerResources").TriggerResourceRecord {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    userId: "user-1",
    provider: "discord",
    eventType: "new_message",
    nodeId: "node-1",
    accountId: null,
    config: {
      guildId: "g-1",
      channelId: "ch-1",
      contentFilter: [],
      pollingEnabled: true,
      snapshot: {
        lastSeenMessageId: "100",
        capturedAt: "2026-05-23T00:00:00Z",
      },
      ...configOverrides,
    },
    registeredAt: "2026-05-23T00:00:00Z",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "2026-05-23T00:00:00Z",
    updatedAt: "2026-05-23T00:00:00Z",
  };
}

const NOW = Date.parse("2026-05-23T00:05:00Z");

function userMsg(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    channel_id: "ch-1",
    content: "hello",
    type: 0,
    author: { id: "user-a", username: "alice" },
    timestamp: `2026-05-23T00:0${id.length}:00Z`,
    ...overrides,
  };
}

describe("discord new_message poll — happy path dispatch", () => {
  it("calls messagesList with after=<snapshot> and limit=100", async () => {
    mockMessagesList.mockResolvedValueOnce([]);
    await discordNewMessagePollingHandler.poll({
      trigger: makeTrigger(),
      userRole: "default",
      now: NOW,
    });
    expect(mockMessagesList).toHaveBeenCalledWith({
      channelId: "ch-1",
      after: "100",
      limit: 100,
    });
  });

  it("enqueues one run per fresh, user-visible, matching message", async () => {
    mockMessagesList.mockResolvedValueOnce([userMsg("200"), userMsg("150")]);
    await discordNewMessagePollingHandler.poll({
      trigger: makeTrigger(),
      userRole: "default",
      now: NOW,
    });
    expect(mockEnqueueRun).toHaveBeenCalledTimes(2);
  });

  it("dispatches in chronological order (oldest → newest) — Discord returns newest-first", async () => {
    mockMessagesList.mockResolvedValueOnce([userMsg("300"), userMsg("200"), userMsg("150")]);
    await discordNewMessagePollingHandler.poll({
      trigger: makeTrigger(),
      userRole: "default",
      now: NOW,
    });
    const dispatchedIds = mockEnqueueRun.mock.calls.map(
      (c) => (c[0] as { event: { eventId: string } }).event.eventId,
    );
    expect(dispatchedIds).toEqual(["150", "200", "300"]);
  });

  it("normalizes each event with the trigger's guildId in accountId", async () => {
    mockMessagesList.mockResolvedValueOnce([userMsg("200")]);
    await discordNewMessagePollingHandler.poll({
      trigger: makeTrigger({ guildId: "g-from-config" }),
      userRole: "default",
      now: NOW,
    });
    const arg = mockEnqueueRun.mock.calls[0]![0] as { event: { accountId: string } };
    expect(arg.event.accountId).toBe("g-from-config");
  });
});

describe("discord new_message poll — system-message filter", () => {
  it("strips system messages (type !== 0, no attachments, no embeds)", async () => {
    mockMessagesList.mockResolvedValueOnce([
      { id: "sys-200", channel_id: "ch-1", content: "Alice pinned a message.", type: 6, author: {} },
      userMsg("150"),
    ]);
    await discordNewMessagePollingHandler.poll({
      trigger: makeTrigger(),
      userRole: "default",
      now: NOW,
    });
    const ids = mockEnqueueRun.mock.calls.map(
      (c) => (c[0] as { event: { eventId: string } }).event.eventId,
    );
    expect(ids).toEqual(["150"]);
  });

  it("keeps system messages that carry attachments", async () => {
    mockMessagesList.mockResolvedValueOnce([
      {
        id: "sys-200",
        channel_id: "ch-1",
        content: "",
        type: 6,
        author: {},
        attachments: [{ id: "a-1", filename: "x.png" }],
      },
    ]);
    await discordNewMessagePollingHandler.poll({
      trigger: makeTrigger(),
      userRole: "default",
      now: NOW,
    });
    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
  });
});

describe("discord new_message poll — content + author filters", () => {
  it("applies authorFilter", async () => {
    mockMessagesList.mockResolvedValueOnce([
      userMsg("200", { author: { id: "user-a", username: "alice" } }),
      userMsg("150", { author: { id: "user-b", username: "bob" } }),
    ]);
    await discordNewMessagePollingHandler.poll({
      trigger: makeTrigger({ authorFilter: "user-a" }),
      userRole: "default",
      now: NOW,
    });
    const ids = mockEnqueueRun.mock.calls.map(
      (c) => (c[0] as { event: { eventId: string } }).event.eventId,
    );
    expect(ids).toEqual(["200"]);
  });

  it("applies contentFilter (case-insensitive OR-match)", async () => {
    mockMessagesList.mockResolvedValueOnce([
      userMsg("200", { content: "URGENT release ready" }),
      userMsg("150", { content: "lunch plans" }),
    ]);
    await discordNewMessagePollingHandler.poll({
      trigger: makeTrigger({ contentFilter: ["urgent"] }),
      userRole: "default",
      now: NOW,
    });
    const ids = mockEnqueueRun.mock.calls.map(
      (c) => (c[0] as { event: { eventId: string } }).event.eventId,
    );
    expect(ids).toEqual(["200"]);
  });
});

describe("discord new_message poll — dedup", () => {
  it("repeated polls of the same message id only enqueue once", async () => {
    mockMessagesList.mockResolvedValueOnce([userMsg("200")]);
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    await discordNewMessagePollingHandler.poll({
      trigger: makeTrigger(),
      userRole: "default",
      now: NOW,
    });
    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);

    // Second tick — same message id, dedup says non-fresh.
    mockMessagesList.mockResolvedValueOnce([userMsg("200")]);
    mockMarkSeen.mockResolvedValueOnce({ fresh: false });
    await discordNewMessagePollingHandler.poll({
      trigger: makeTrigger(),
      userRole: "default",
      now: NOW,
    });
    // No additional enqueue.
    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
  });

  it("dedup outage fails CLOSED (skips message, no enqueue)", async () => {
    mockMessagesList.mockResolvedValueOnce([userMsg("200")]);
    mockMarkSeen.mockRejectedValueOnce(new Error("dedup down"));
    await discordNewMessagePollingHandler.poll({
      trigger: makeTrigger(),
      userRole: "default",
      now: NOW,
    });
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });
});

describe("discord new_message poll — snapshot advancement", () => {
  it("advances snapshot to the newest fetched id (max BigInt compare)", async () => {
    mockMessagesList.mockResolvedValueOnce([
      userMsg("999999999999999999"), // huge snowflake
      userMsg("150"),
    ]);
    await discordNewMessagePollingHandler.poll({
      trigger: makeTrigger(),
      userRole: "default",
      now: NOW,
    });
    const [id, config] = mockUpdateConfig.mock.calls[0]!;
    expect(id).toBe("tr-1");
    expect(
      (config as { snapshot: { lastSeenMessageId: string } }).snapshot.lastSeenMessageId,
    ).toBe("999999999999999999");
  });

  it("advances snapshot EVEN when every message is filtered out (no infinite-replay regression)", async () => {
    // Author filter doesn't match — every message gets dropped, but
    // the snapshot must STILL advance to the newest fetched id,
    // otherwise the next tick polls the same batch forever.
    mockMessagesList.mockResolvedValueOnce([userMsg("500"), userMsg("300")]);
    await discordNewMessagePollingHandler.poll({
      trigger: makeTrigger({ authorFilter: "no-such-user" }),
      userRole: "default",
      now: NOW,
    });
    expect(mockEnqueueRun).not.toHaveBeenCalled();
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    const config = mockUpdateConfig.mock.calls[0]![1]!;
    expect(
      (config as { snapshot: { lastSeenMessageId: string } }).snapshot.lastSeenMessageId,
    ).toBe("500");
  });

  it("never regresses the snapshot below its previous value", async () => {
    // Discord returns nothing newer than the snapshot — empty batch.
    mockMessagesList.mockResolvedValueOnce([]);
    await discordNewMessagePollingHandler.poll({
      trigger: makeTrigger(),
      userRole: "default",
      now: NOW,
    });
    const config = mockUpdateConfig.mock.calls[0]![1]!;
    expect(
      (config as { snapshot: { lastSeenMessageId: string } }).snapshot.lastSeenMessageId,
    ).toBe("100"); // unchanged
  });

  it("updates polling.lastPolledAt to the tick's `now` time", async () => {
    mockMessagesList.mockResolvedValueOnce([]);
    await discordNewMessagePollingHandler.poll({
      trigger: makeTrigger(),
      userRole: "default",
      now: NOW,
    });
    const config = mockUpdateConfig.mock.calls[0]![1]! as {
      polling: { lastPolledAt: string };
    };
    expect(config.polling.lastPolledAt).toBe(new Date(NOW).toISOString());
  });
});

describe("discord new_message poll — empty-result path", () => {
  it("empty batch — no enqueue, snapshot unchanged, polling.lastPolledAt updated", async () => {
    mockMessagesList.mockResolvedValueOnce([]);
    await discordNewMessagePollingHandler.poll({
      trigger: makeTrigger(),
      userRole: "default",
      now: NOW,
    });
    expect(mockEnqueueRun).not.toHaveBeenCalled();
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
  });
});

describe("discord new_message poll — defensive no-ops", () => {
  it("missing snapshot → log + return (no Discord call, no enqueue, no config update)", async () => {
    const trigger = makeTrigger();
    (trigger.config as Record<string, unknown>).snapshot = undefined;
    await discordNewMessagePollingHandler.poll({
      trigger,
      userRole: "default",
      now: NOW,
    });
    expect(mockMessagesList).not.toHaveBeenCalled();
    expect(mockEnqueueRun).not.toHaveBeenCalled();
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });

  it("missing integration → log + return (no Discord call, no enqueue)", async () => {
    mockGetActive.mockResolvedValueOnce(null);
    await discordNewMessagePollingHandler.poll({
      trigger: makeTrigger(),
      userRole: "default",
      now: NOW,
    });
    expect(mockMessagesList).not.toHaveBeenCalled();
    expect(mockEnqueueRun).not.toHaveBeenCalled();
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });
});

describe("discord new_message poll — provider error handling", () => {
  it("NotFoundError (channel deleted) → log + return without advancing snapshot", async () => {
    mockMessagesList.mockRejectedValueOnce(new NotFoundError("channel ch-1"));
    await discordNewMessagePollingHandler.poll({
      trigger: makeTrigger(),
      userRole: "default",
      now: NOW,
    });
    expect(mockEnqueueRun).not.toHaveBeenCalled();
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });

  it("403 DiscordApiError (bot missing permission) → log + return without advancing", async () => {
    mockMessagesList.mockRejectedValueOnce(
      new DiscordApiError(403, 50001, "Missing Access"),
    );
    await discordNewMessagePollingHandler.poll({
      trigger: makeTrigger(),
      userRole: "default",
      now: NOW,
    });
    expect(mockEnqueueRun).not.toHaveBeenCalled();
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });

  it("401 DiscordApiError → propagate (deployment broken; cron logs loud)", async () => {
    mockMessagesList.mockRejectedValueOnce(
      new DiscordApiError(401, 0, "Unauthorized"),
    );
    await expect(
      discordNewMessagePollingHandler.poll({
        trigger: makeTrigger(),
        userRole: "default",
        now: NOW,
      }),
    ).rejects.toThrow(/401/);
  });

  it("unexpected error → propagate per the cron's outer catch contract", async () => {
    mockMessagesList.mockRejectedValueOnce(new Error("network glitch"));
    await expect(
      discordNewMessagePollingHandler.poll({
        trigger: makeTrigger(),
        userRole: "default",
        now: NOW,
      }),
    ).rejects.toThrow(/network glitch/);
  });

  it("one bad message does not abort the tick (per-message try/catch)", async () => {
    mockMessagesList.mockResolvedValueOnce([userMsg("200"), userMsg("150")]);
    mockMarkSeen
      .mockRejectedValueOnce(new Error("transient")) // first message fails dedup
      .mockResolvedValueOnce({ fresh: true });        // second message OK
    // Implementation reads markSeen in chronological order (150 first).
    // The above setup means 150 fails closed (no enqueue), 200 enqueues.
    await discordNewMessagePollingHandler.poll({
      trigger: makeTrigger(),
      userRole: "default",
      now: NOW,
    });
    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
    // Snapshot still advanced because we never threw out of the tick.
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
  });
});

describe("discord new_message poll — handler shape", () => {
  it("canHandle accepts only (discord, new_message)", () => {
    expect(
      discordNewMessagePollingHandler.canHandle(makeTrigger()),
    ).toBe(true);
    const wrongProvider = makeTrigger();
    (wrongProvider as { provider: string }).provider = "slack";
    expect(discordNewMessagePollingHandler.canHandle(wrongProvider)).toBe(false);
    const wrongEvent = makeTrigger();
    (wrongEvent as { eventType: string }).eventType = "slash_command";
    expect(discordNewMessagePollingHandler.canHandle(wrongEvent)).toBe(false);
  });

  it("getIntervalMs returns the V2 default 5-minute cadence", () => {
    // Default interval is 5 * 60 * 1000 = 300000 ms.
    expect(discordNewMessagePollingHandler.getIntervalMs("default")).toBe(
      5 * 60 * 1000,
    );
  });

  it("handler id is stable for log attribution", () => {
    expect(discordNewMessagePollingHandler.id).toBe("discord/new_message");
  });
});
