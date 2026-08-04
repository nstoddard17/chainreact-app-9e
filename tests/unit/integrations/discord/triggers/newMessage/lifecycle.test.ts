/**
 * @jest-environment node
 *
 * discord/triggers/newMessage trigger lifecycle contract suite — one per-trigger suite
 * consolidating the former per-lifecycle files (PROVIDER-CONTRACT-CONSOLIDATION-1E).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockMessagesList = jest.fn();
const mockMarkSeen = jest.fn();
const mockEnqueueRun = jest.fn();
const mockGetActive = jest.fn();
const mockUpdateConfig = jest.fn();

jest.mock("@/integrations/_shared/discord/api/messages", () => ({
  messagesList: (...args: unknown[]) => mockMessagesList(...args),
}));

jest.mock("@/repositories/webhookEventDedup", () => ({
  markSeen: (...args: unknown[]) => mockMarkSeen(...args),
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

import { activate } from "@/integrations/discord/triggers/newMessage/activate";
import { DISCORD_EPOCH_MS, maxSnowflake, snowflakeFromTimestamp } from "@/integrations/discord/triggers/newMessage/snowflake";
import { checkAndMarkSeen } from "@/integrations/discord/triggers/newMessage/dedup";
import type { DiscordMessage } from "@/integrations/_shared/discord/api/messages";
import { matchesNewMessageFilters } from "@/integrations/discord/triggers/newMessage/filters";
import type { DiscordNewMessageConfig } from "@/integrations/discord/triggers/newMessage/schema";
import "@/integrations/discord/triggers/newMessage";
import { findActivation } from "@/services/triggers/activationRegistry";
import { findPollingHandler } from "@/services/triggers/pollingRegistry";
import { normalizeNewMessage } from "@/integrations/discord/triggers/newMessage/normalize";
import { DiscordApiError, NotFoundError } from "@/integrations/_shared/discord/errors";
import { discordNewMessagePollingHandler } from "@/integrations/discord/triggers/newMessage/poll";

// ---------------------------------------------------------------------------
// Merged from the former activate.test.ts
// Slice 3.DISCORD-7 — Discord new_message activation hook.
// Pinned contracts:
// - Requires `guildId` + `channelId` in node.config (both throw on
// missing/empty).
// - Calls `messagesList({channelId, limit: 1})` exactly once.
// - Stores newest message id as `snapshot.lastSeenMessageId` when
// channel has messages.
// - Empty channel → synthesizes a snowflake from Date.now() so first
// real message has a strictly larger id (CLAUDE.md first-poll-miss
// rule, empty-channel case).
// - Returns pollingEnabled:true (mirrors Gmail's shape).
// - Re-activation is idempotent — each call re-seeds from CURRENT
// newest; missed messages during the "disabled" window are NOT
// replayed (workflow re-enable is not a history-replay event).
// ---------------------------------------------------------------------------
describe("activate (lifecycle)", () => {

beforeEach(() => {
  mockMessagesList.mockReset();
});

const integration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
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

});

// ---------------------------------------------------------------------------
// Merged from the former dedup.test.ts
// Slice 3.DISCORD-7 — Discord new_message dedup wrapper.
// Pinned contracts:
// - Wraps `webhook_event_dedup` keyed on (provider="discord", messageId).
// - Fresh result → `{fresh:true, outage:false}`.
// - Repeat result → `{fresh:false, outage:false}`.
// - `markSeen` throw → fail CLOSED with `{fresh:false, outage:true}`
// so caller skips the message (rationale in dedup.ts header).
// ---------------------------------------------------------------------------
describe("dedup (lifecycle)", () => {

beforeEach(() => {
  mockMarkSeen.mockReset();
});

describe("checkAndMarkSeen", () => {
  it("returns {fresh:true, outage:false} on first sighting", async () => {
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    const result = await checkAndMarkSeen("msg-1");
    expect(result).toEqual({ fresh: true, outage: false });
    expect(mockMarkSeen).toHaveBeenCalledWith("discord", "msg-1");
  });

  it("returns {fresh:false, outage:false} on repeat sighting", async () => {
    mockMarkSeen.mockResolvedValueOnce({ fresh: false });
    const result = await checkAndMarkSeen("msg-1");
    expect(result).toEqual({ fresh: false, outage: false });
  });

  it("repeated polls of the same id stay non-fresh (regression guard)", async () => {
    mockMarkSeen
      .mockResolvedValueOnce({ fresh: true })
      .mockResolvedValueOnce({ fresh: false })
      .mockResolvedValueOnce({ fresh: false });
    expect(await checkAndMarkSeen("snow-1")).toEqual({ fresh: true, outage: false });
    expect(await checkAndMarkSeen("snow-1")).toEqual({ fresh: false, outage: false });
    expect(await checkAndMarkSeen("snow-1")).toEqual({ fresh: false, outage: false });
  });

  it("fails CLOSED (outage:true, fresh:false) when markSeen throws", async () => {
    mockMarkSeen.mockRejectedValueOnce(new Error("dedup table outage"));
    const result = await checkAndMarkSeen("msg-1");
    expect(result).toEqual({ fresh: false, outage: true });
  });

  it("scopes the dedup key to provider='discord' (no cross-provider collisions)", async () => {
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    await checkAndMarkSeen("ambiguous-id");
    expect(mockMarkSeen).toHaveBeenCalledWith("discord", "ambiguous-id");
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former filters.test.ts
// Slice 3.DISCORD-7 — Discord new_message filter helper.
// ---------------------------------------------------------------------------
describe("filters (lifecycle)", () => {

function makeMessage(
  partial: Partial<DiscordMessage> & { author?: { id: string; username?: string } },
): DiscordMessage {
  return {
    id: "msg-1",
    channel_id: "ch-1",
    content: "Hello world",
    type: 0,
    ...partial,
    author:
      partial.author === undefined
        ? { id: "u-1", username: "alice" }
        : partial.author,
  } as DiscordMessage;
}

function baseConfig(
  partial: Partial<DiscordNewMessageConfig> = {},
): DiscordNewMessageConfig {
  return {
    guildId: "g-1",
    channelId: "ch-1",
    contentFilter: [],
    authorFilter: undefined,
    pollingEnabled: true,
    ...partial,
  };
}

describe("matchesNewMessageFilters — empty filters", () => {
  it("passes every message when both filters are empty/absent", () => {
    expect(matchesNewMessageFilters(makeMessage({}), baseConfig())).toBe(true);
  });
});

describe("matchesNewMessageFilters — contentFilter", () => {
  it("matches case-insensitively (lowercase needle vs uppercase content)", () => {
    expect(
      matchesNewMessageFilters(
        makeMessage({ content: "HELLO World" }),
        baseConfig({ contentFilter: ["hello"] }),
      ),
    ).toBe(true);
  });

  it("matches case-insensitively (uppercase needle vs lowercase content)", () => {
    expect(
      matchesNewMessageFilters(
        makeMessage({ content: "hello world" }),
        baseConfig({ contentFilter: ["HELLO"] }),
      ),
    ).toBe(true);
  });

  it("OR-match across keywords — passes if ANY keyword matches", () => {
    expect(
      matchesNewMessageFilters(
        makeMessage({ content: "release notes for v2" }),
        baseConfig({ contentFilter: ["urgent", "release", "production"] }),
      ),
    ).toBe(true);
  });

  it("rejects when NO keyword matches", () => {
    expect(
      matchesNewMessageFilters(
        makeMessage({ content: "lunch plans" }),
        baseConfig({ contentFilter: ["urgent", "release", "production"] }),
      ),
    ).toBe(false);
  });

  it("rejects empty-content message when keywords are non-empty (MESSAGE_CONTENT-intent-stripped case)", () => {
    // Documents the MESSAGE_CONTENT intent behavior: if the bot lacks
    // the privileged intent, Discord auto-strips content; the trigger
    // still matches the filter correctly (no false-positive).
    expect(
      matchesNewMessageFilters(
        makeMessage({ content: "" }),
        baseConfig({ contentFilter: ["anything"] }),
      ),
    ).toBe(false);
  });
});

describe("matchesNewMessageFilters — authorFilter", () => {
  it("matches when author.id equals authorFilter", () => {
    expect(
      matchesNewMessageFilters(
        makeMessage({ author: { id: "alice-id", username: "alice" } }),
        baseConfig({ authorFilter: "alice-id" }),
      ),
    ).toBe(true);
  });

  it("rejects when author.id does not match", () => {
    expect(
      matchesNewMessageFilters(
        makeMessage({ author: { id: "bob-id", username: "bob" } }),
        baseConfig({ authorFilter: "alice-id" }),
      ),
    ).toBe(false);
  });

  it("rejects when message has no author and authorFilter is set", () => {
    const msg = makeMessage({}) as DiscordMessage;
    delete (msg as unknown as { author?: unknown }).author;
    expect(matchesNewMessageFilters(msg, baseConfig({ authorFilter: "alice-id" }))).toBe(
      false,
    );
  });
});

describe("matchesNewMessageFilters — AND composition", () => {
  it("requires BOTH filters to pass when both are set", () => {
    const msg = makeMessage({
      author: { id: "alice-id", username: "alice" },
      content: "release notes",
    });
    expect(
      matchesNewMessageFilters(
        msg,
        baseConfig({ authorFilter: "alice-id", contentFilter: ["release"] }),
      ),
    ).toBe(true);
    // Same author, wrong content keyword.
    expect(
      matchesNewMessageFilters(
        msg,
        baseConfig({ authorFilter: "alice-id", contentFilter: ["urgent"] }),
      ),
    ).toBe(false);
    // Same content, wrong author.
    expect(
      matchesNewMessageFilters(
        msg,
        baseConfig({ authorFilter: "bob-id", contentFilter: ["release"] }),
      ),
    ).toBe(false);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former index.test.ts
// Slice 3.DISCORD-7 — Discord new_message module-init registration.
// ---------------------------------------------------------------------------
describe("index (lifecycle)", () => {

describe("discord new_message module-init registration", () => {
  it("registers activation under (provider='discord', eventType='new_message')", () => {
    expect(findActivation("discord", "new_message")).not.toBeNull();
  });

  it("registers the polling handler so the cron picks up Discord new_message rows", () => {
    const fakeRow = {
      id: "tr-x",
      workflowId: "wf-x",
      workflowAccountId: "acct-x",
      userId: "u-x",
      provider: "discord",
      eventType: "new_message",
      nodeId: "n-x",
      providerAccountId: null,
      config: {},
      registeredAt: "",
      expiresAt: null,
      lastRenewedAt: null,
      createdAt: "",
      updatedAt: "",
    };
    const handler = findPollingHandler(fakeRow);
    expect(handler).not.toBeNull();
    expect(handler!.id).toBe("discord/new_message");
  });

  it("does NOT register a deactivation hook (polling has no provider-side resource)", async () => {
    // The deactivation registry is the same one used by webhook
    // triggers. Polling-only triggers must NOT register here —
    // disabling the workflow simply stops the cron from picking it up.
    const { findDeactivation } = await import(
      "@/services/triggers/deactivationRegistry"
    );
    expect(findDeactivation("discord", "new_message")).toBeNull();
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former normalize.test.ts
// Slice 3.DISCORD-7 — Discord new_message normalize.
// Pinned contracts:
// - eventId = Discord message id (snowflake) → drives (provider,
// eventId) dedup.
// - provider = "discord", eventType = "new_message".
// - accountId = guild id (from trigger config — Discord messages
// API doesn't include guild_id on each row).
// - 11-field payload mirrors V1 manifest.
// - attachments / mentions projected to bounded shape.
// - channelName / guildName surface as null (raw payload doesn't
// carry them; follow-up plumbs from picker labels).
// - occurredAt = message.timestamp if present, else now().
// ---------------------------------------------------------------------------
describe("normalize (lifecycle)", () => {

const SAMPLE: DiscordMessage = {
  id: "msg-snow-1",
  channel_id: "ch-1",
  content: "hello world",
  timestamp: "2026-05-23T12:00:00.000Z",
  edited_timestamp: null,
  author: {
    id: "user-snow-1",
    username: "alice",
    global_name: "Alice",
    bot: false,
  },
  attachments: [
    {
      id: "att-1",
      filename: "diagram.png",
      size: 1024,
      url: "https://cdn.discordapp.com/.../diagram.png",
      content_type: "image/png",
    },
  ],
  mentions: [{ id: "user-snow-2", username: "bob" }],
  pinned: false,
  type: 0,
};

describe("normalizeNewMessage — canonical TriggerEvent fields", () => {
  it("sets provider=discord and eventType=new_message", () => {
    const event = normalizeNewMessage({ message: SAMPLE, guildId: "g-1" });
    expect(event.provider).toBe("discord");
    expect(event.eventType).toBe("new_message");
  });

  it("uses message.id as the dedup key", () => {
    const event = normalizeNewMessage({ message: SAMPLE, guildId: "g-1" });
    expect(event.eventId).toBe("msg-snow-1");
  });

  it("sets accountId to the guild id from trigger config (NOT message.guild_id)", () => {
    // Discord's messages API doesn't populate guild_id on each row;
    // trigger config supplies it.
    const event = normalizeNewMessage({ message: SAMPLE, guildId: "g-from-config" });
    expect(event.providerAccountId).toBe("g-from-config");
  });

  it("uses message.timestamp for occurredAt when present", () => {
    const event = normalizeNewMessage({ message: SAMPLE, guildId: "g-1" });
    expect(event.occurredAt).toBe("2026-05-23T12:00:00.000Z");
  });

  it("falls back to now() for occurredAt when message.timestamp is missing", () => {
    const noTs: DiscordMessage = { ...SAMPLE };
    delete (noTs as Partial<DiscordMessage>).timestamp;
    const event = normalizeNewMessage({ message: noTs, guildId: "g-1" });
    expect(event.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("normalizeNewMessage — payload shape", () => {
  it("surfaces messageId / content / authorId / authorName", () => {
    const event = normalizeNewMessage({ message: SAMPLE, guildId: "g-1" });
    expect(event.payload.messageId).toBe("msg-snow-1");
    expect(event.payload.content).toBe("hello world");
    expect(event.payload.authorId).toBe("user-snow-1");
    expect(event.payload.authorName).toBe("alice");
  });

  it("falls back authorName to global_name when username absent", () => {
    const noUser: DiscordMessage = {
      ...SAMPLE,
      author: { id: "user-x", global_name: "Display Name" },
    };
    const event = normalizeNewMessage({ message: noUser, guildId: "g-1" });
    expect(event.payload.authorName).toBe("Display Name");
  });

  it("sets authorName=null when author has neither username nor global_name", () => {
    const stripped: DiscordMessage = {
      ...SAMPLE,
      author: { id: "user-x" },
    };
    const event = normalizeNewMessage({ message: stripped, guildId: "g-1" });
    expect(event.payload.authorName).toBeNull();
  });

  it("echoes channelId from message + guildId from config", () => {
    const event = normalizeNewMessage({ message: SAMPLE, guildId: "g-from-config" });
    expect(event.payload.channelId).toBe("ch-1");
    expect(event.payload.guildId).toBe("g-from-config");
  });

  it("surfaces channelName / guildName as null (known limitation, see normalize.ts header)", () => {
    const event = normalizeNewMessage({ message: SAMPLE, guildId: "g-1" });
    expect(event.payload.channelName).toBeNull();
    expect(event.payload.guildName).toBeNull();
  });

  it("normalizes attachments to {id, filename, size, url, contentType}", () => {
    const event = normalizeNewMessage({ message: SAMPLE, guildId: "g-1" });
    expect(event.payload.attachments).toEqual([
      {
        id: "att-1",
        filename: "diagram.png",
        size: 1024,
        url: "https://cdn.discordapp.com/.../diagram.png",
        contentType: "image/png",
      },
    ]);
  });

  it("normalizes mentions to {id, username}", () => {
    const event = normalizeNewMessage({ message: SAMPLE, guildId: "g-1" });
    expect(event.payload.mentions).toEqual([{ id: "user-snow-2", username: "bob" }]);
  });

  it("returns empty arrays for attachments / mentions when message has none", () => {
    const bare: DiscordMessage = {
      ...SAMPLE,
      attachments: undefined,
      mentions: undefined,
    };
    const event = normalizeNewMessage({ message: bare, guildId: "g-1" });
    expect(event.payload.attachments).toEqual([]);
    expect(event.payload.mentions).toEqual([]);
  });

  it("preserves empty `content` (MESSAGE_CONTENT-intent-stripped case)", () => {
    const stripped: DiscordMessage = { ...SAMPLE, content: "" };
    const event = normalizeNewMessage({ message: stripped, guildId: "g-1" });
    expect(event.payload.content).toBe("");
  });
});

describe("normalizeNewMessage — security: no secret-shaped fields", () => {
  it("never surfaces an interaction reply token (defense-in-depth — token never lives on message)", () => {
    const event = normalizeNewMessage({ message: SAMPLE, guildId: "g-1" });
    expect(JSON.stringify(event)).not.toMatch(/"token"/);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former poll.test.ts
// Slice 3.DISCORD-7 — Discord new_message polling handler.
// Pinned contracts (the load-bearing invariants):
// - Reads snapshot.lastSeenMessageId, calls messagesList with
// `after=<snapshot>` + `limit: 100`.
// - Strips system messages (type !== 0 without attachments/embeds).
// - Applies authorFilter + contentFilter.
// - Dedups by Discord messageId via webhook_event_dedup.
// - Enqueues one run per matching, fresh, user-visible message.
// - Dispatches in chronological order (oldest → newest) even though
// Discord returns newest-first.
// - **Snapshot advances to max(prev, any fetched id) — even when
// every message is filtered out** (no infinite-replay regression).
// - 404 NotFoundError / 403 → log + return without advancing.
// - 401 / other errors → propagate.
// - One bad message does not abort the tick (caught + logged).
// ---------------------------------------------------------------------------
describe("poll (lifecycle)", () => {

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
    workflowAccountId: "acct-1",
    userId: "user-1",
    provider: "discord",
    eventType: "new_message",
    nodeId: "node-1",
    providerAccountId: null,
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
      accountId: "acct-test",
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
      accountId: "acct-test",
      userRole: "default",
      now: NOW,
    });
    expect(mockEnqueueRun).toHaveBeenCalledTimes(2);
  });

  it("dispatches in chronological order (oldest → newest) — Discord returns newest-first", async () => {
    mockMessagesList.mockResolvedValueOnce([userMsg("300"), userMsg("200"), userMsg("150")]);
    await discordNewMessagePollingHandler.poll({
      trigger: makeTrigger(),
      accountId: "acct-test",
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
      accountId: "acct-test",
      userRole: "default",
      now: NOW,
    });
    const arg = mockEnqueueRun.mock.calls[0]![0] as { event: { providerAccountId: string } };
    expect(arg.event.providerAccountId).toBe("g-from-config");
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
      accountId: "acct-test",
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
      accountId: "acct-test",
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
      accountId: "acct-test",
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
      accountId: "acct-test",
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
      accountId: "acct-test",
      userRole: "default",
      now: NOW,
    });
    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);

    // Second tick — same message id, dedup says non-fresh.
    mockMessagesList.mockResolvedValueOnce([userMsg("200")]);
    mockMarkSeen.mockResolvedValueOnce({ fresh: false });
    await discordNewMessagePollingHandler.poll({
      trigger: makeTrigger(),
      accountId: "acct-test",
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
      accountId: "acct-test",
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
      accountId: "acct-test",
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
      accountId: "acct-test",
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
      accountId: "acct-test",
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
      accountId: "acct-test",
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
      accountId: "acct-test",
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
      accountId: "acct-test",
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
      accountId: "acct-test",
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
      accountId: "acct-test",
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
      accountId: "acct-test",
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
        accountId: "acct-test",
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
        accountId: "acct-test",
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
      accountId: "acct-test",
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

});

// ---------------------------------------------------------------------------
// Merged from the former snowflake.test.ts
// Slice 3.DISCORD-7 — Discord snowflake helpers.
// Pinned facts:
// - Discord epoch = 1420070400000 ms (2015-01-01T00:00:00Z).
// - Snowflake = ((unixMs - epoch) << 22) for the empty-counter case.
// - 64-bit ints; encoded as ASCII decimal strings end-to-end.
// - All math goes through BigInt — JS Number loses precision after
// `2024-12-04T07:50:23Z`.
// ---------------------------------------------------------------------------
describe("snowflake (lifecycle)", () => {

describe("snowflakeFromTimestamp", () => {
  it("equals 0 when timestampMs equals the Discord epoch", () => {
    expect(snowflakeFromTimestamp(Number(DISCORD_EPOCH_MS))).toBe("0");
  });

  it("produces ((ms - epoch) << 22) for a known timestamp", () => {
    // 2024-01-01T00:00:00Z = 1704067200000 ms
    // ms - epoch = 283996800000
    // << 22 = 283996800000 * 2^22 = 1191182643363840000... let's just compute via BigInt.
    const ms = 1704067200000;
    const expected = ((BigInt(ms) - DISCORD_EPOCH_MS) << 22n).toString();
    expect(snowflakeFromTimestamp(ms)).toBe(expected);
  });

  it("produces strictly larger values for later timestamps (BigInt monotonicity)", () => {
    const earlier = snowflakeFromTimestamp(1700000000000);
    const later = snowflakeFromTimestamp(1700000001000);
    expect(BigInt(later) > BigInt(earlier)).toBe(true);
  });

  it("throws when timestampMs is before the Discord epoch", () => {
    expect(() => snowflakeFromTimestamp(0)).toThrow(/before the Discord epoch/);
    expect(() => snowflakeFromTimestamp(Number(DISCORD_EPOCH_MS) - 1)).toThrow(
      /before the Discord epoch/,
    );
  });

  it("Date.now() produces a snowflake larger than every historical message id", () => {
    // Sanity-check the empty-channel activation path: a synthesized
    // snowflake from `Date.now()` MUST be larger than any plausible
    // Discord-issued historical message id. Discord message ids in
    // current circulation are all >> 2^60; our synthesized value at
    // current wall-clock is ~((now - epoch) << 22) which is in the
    // same magnitude range and increasing monotonically.
    const synth = BigInt(snowflakeFromTimestamp(Date.now()));
    // 2020-01-01 snowflake — chosen as a value any real channel's
    // current newest message is guaranteed to exceed by now.
    const oldRef = BigInt(snowflakeFromTimestamp(1577836800000));
    expect(synth > oldRef).toBe(true);
  });
});

describe("maxSnowflake", () => {
  it("returns the larger of two parseable snowflakes (a > b)", () => {
    expect(maxSnowflake("1000", "500")).toBe("1000");
  });

  it("returns the larger of two parseable snowflakes (b > a)", () => {
    expect(maxSnowflake("500", "1000")).toBe("1000");
  });

  it("returns either when equal (deterministic — prefers `a` per implementation)", () => {
    expect(maxSnowflake("500", "500")).toBe("500");
  });

  it("compares as BigInt, not lexicographically (the regression guard)", () => {
    // Lexicographic compare would say "9" > "10" (because '9' > '1');
    // BigInt compare correctly says 10 > 9.
    expect(maxSnowflake("9", "10")).toBe("10");
  });

  it("handles values past Number.MAX_SAFE_INTEGER (real Discord snowflakes)", () => {
    // Real Discord snowflakes are ~2^60+; this range overflows JS Number.
    const a = "1234567890123456789";
    const b = "1234567890123456790";
    expect(maxSnowflake(a, b)).toBe(b);
  });

  it("falls back to the other value when a is null/undefined/empty", () => {
    expect(maxSnowflake(null, "100")).toBe("100");
    expect(maxSnowflake(undefined, "100")).toBe("100");
    expect(maxSnowflake("", "100")).toBe("100");
  });

  it("falls back to the other value when b is null/undefined/empty", () => {
    expect(maxSnowflake("100", null)).toBe("100");
    expect(maxSnowflake("100", undefined)).toBe("100");
    expect(maxSnowflake("100", "")).toBe("100");
  });

  it("returns a sentinel when both inputs are unparseable", () => {
    expect(maxSnowflake("not-a-number", "also-not")).toBe("not-a-number");
  });

  it("falls back to b when a is unparseable but b is valid", () => {
    expect(maxSnowflake("not-a-number", "100")).toBe("100");
  });
});

});
