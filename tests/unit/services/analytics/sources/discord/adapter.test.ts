/**
 * @jest-environment node
 *
 * Discord analytics adapter (Slice ANALYTICS-SOURCES-DISCORD-1): per-viewer personal
 * credential GATE (bot-token reads, no refreshAndRetry), count-only + metadata-only
 * metrics (server channel/member counts + messages over time / by channel / count +
 * active channels — only timestamps + channel names + an aggregate member count read;
 * never message content/author/username/user-id/member listing), required
 * guild/channel snowflake validation, and typed, leak-free error normalization. No
 * network/DB — the credential repo + the bounded Discord readers are mocked.
 */

const mockGetIntegration = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  __esModule: true,
  getActiveForExecution: (...args: unknown[]) => mockGetIntegration(...args),
}));

const mockCountChannels = jest.fn();
const mockMemberCount = jest.fn();
const mockScanChannel = jest.fn();
const mockScanGuild = jest.fn();
jest.mock("@/services/analytics/sources/discord/api", () => {
  const actual = jest.requireActual("@/services/analytics/sources/discord/api");
  return {
    ...actual,
    countTextChannels: (...a: unknown[]) => mockCountChannels(...a),
    getApproximateMemberCount: (...a: unknown[]) => mockMemberCount(...a),
    scanChannelTimestamps: (...a: unknown[]) => mockScanChannel(...a),
    scanGuildChannelCounts: (...a: unknown[]) => mockScanGuild(...a),
  };
});

import { discordAnalyticsSource } from "@/services/analytics/sources/discord";
import {
  AnalyticsSourceError,
  NormalizedAnalyticsResultSchema,
} from "@/services/analytics/sources/types";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  DiscordApiError,
  DiscordBotTokenMissingError,
  NotFoundError,
} from "@/integrations/_shared/discord/errors";

const CTX = { accountId: "acct-1", userId: "user-1" };
const RANGE = { since: "2026-06-01T00:00:00Z", until: "2026-06-04T00:00:00Z" }; // 4 day-buckets
const GUILD = "112233445566778899";
const CHANNEL = "998877665544332211";
const ms = (iso: string) => Date.parse(iso);

const GUILD_F = { discord_guild: GUILD };
const CHAN_F = { discord_guild: GUILD, discord_channel: CHANNEL };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetIntegration.mockResolvedValue({ providerAccountId: "dc-user-1" });
  mockCountChannels.mockResolvedValue(7);
  mockMemberCount.mockResolvedValue(420);
  mockScanChannel.mockResolvedValue({
    timestamps: [ms("2026-06-01T09:00:00Z"), ms("2026-06-01T11:00:00Z"), ms("2026-06-02T09:00:00Z")],
    truncated: false,
    callsUsed: 1,
  });
  mockScanGuild.mockResolvedValue({
    channels: [
      { name: "general", count: 5 },
      { name: "random", count: 2 },
      { name: "quiet", count: 0 },
    ],
    truncated: false,
  });
});

describe("metric registration", () => {
  it("exposes the approved count-only metric set with correct filter shapes", () => {
    expect(discordAnalyticsSource.providerKey).toBe("discord");
    expect(discordAnalyticsSource.connectedApp).toBe(true);
    expect(discordAnalyticsSource.metrics.map((m) => m.key).sort()).toEqual([
      "active_channels_count",
      "channel_messages_over_time",
      "messages_by_channel",
      "messages_count",
      "server_channels_count",
      "server_member_count",
    ]);
    const byKey = Object.fromEntries(discordAnalyticsSource.metrics.map((m) => [m.key, m.supportedFilters]));
    expect(byKey.server_channels_count).toEqual(["discord_guild"]);
    expect(byKey.messages_by_channel).toEqual(["discord_guild"]);
    expect(byKey.channel_messages_over_time).toEqual(["discord_guild", "discord_channel"]);
    expect(byKey.messages_count).toEqual(["discord_guild", "discord_channel"]);
  });
});

describe("validation (no I/O before it passes)", () => {
  it("rejects an unknown metric", async () => {
    await expect(
      discordAnalyticsSource.query({ metricKey: "delete_message", range: RANGE, filters: GUILD_F }, CTX),
    ).rejects.toMatchObject({ code: "UNKNOWN_METRIC" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });

  it("rejects a missing guild id before any I/O", async () => {
    await expect(
      discordAnalyticsSource.query({ metricKey: "server_channels_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });

  it("rejects a malformed guild snowflake before any I/O", async () => {
    await expect(
      discordAnalyticsSource.query(
        { metricKey: "server_channels_count", range: RANGE, filters: { discord_guild: "not-a-snowflake" } },
        CTX,
      ),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(mockCountChannels).not.toHaveBeenCalled();
  });

  it("rejects a missing channel id for channel-scoped metrics before any I/O", async () => {
    await expect(
      discordAnalyticsSource.query({ metricKey: "messages_count", range: RANGE, filters: GUILD_F }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });
});

describe("credential resolution (personal gate — viewer's own)", () => {
  it("pins to ctx.userId", async () => {
    await discordAnalyticsSource.query({ metricKey: "server_channels_count", range: RANGE, filters: GUILD_F }, CTX);
    expect(mockGetIntegration).toHaveBeenCalledWith("acct-1", "discord", null, { connectedByUserId: "user-1" });
  });

  it("returns MISSING_CREDENTIAL when the viewer has no Discord connection", async () => {
    mockGetIntegration.mockResolvedValue(null);
    await expect(
      discordAnalyticsSource.query({ metricKey: "server_channels_count", range: RANGE, filters: GUILD_F }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
    expect(mockCountChannels).not.toHaveBeenCalled();
  });
});

describe("metrics", () => {
  it("server_channels_count returns the text-channel count", async () => {
    const r = await discordAnalyticsSource.query({ metricKey: "server_channels_count", range: RANGE, filters: GUILD_F }, CTX);
    expect(() => NormalizedAnalyticsResultSchema.parse(r)).not.toThrow();
    expect(r.totals).toEqual({ server_channels_count: 7 });
  });

  it("server_member_count returns the aggregate member count (0 when absent)", async () => {
    const r = await discordAnalyticsSource.query({ metricKey: "server_member_count", range: RANGE, filters: GUILD_F }, CTX);
    expect(r.totals).toEqual({ server_member_count: 420 });
    mockMemberCount.mockResolvedValue(null);
    const r2 = await discordAnalyticsSource.query({ metricKey: "server_member_count", range: RANGE, filters: GUILD_F }, CTX);
    expect(r2.totals).toEqual({ server_member_count: 0 });
  });

  it("messages_count counts in-range messages for the channel", async () => {
    const r = await discordAnalyticsSource.query({ metricKey: "messages_count", range: RANGE, filters: CHAN_F }, CTX);
    expect(r.totals).toEqual({ messages_count: 3 });
    expect(mockScanChannel.mock.calls[0]![0]).toBe(CHANNEL);
  });

  it("channel_messages_over_time buckets timestamps by day (out-of-range excluded)", async () => {
    const r = await discordAnalyticsSource.query({ metricKey: "channel_messages_over_time", range: RANGE, filters: CHAN_F }, CTX);
    expect(r.shape).toBe("series");
    expect(r.rows).toHaveLength(4);
    expect(r.rows.map((row) => row.count)).toEqual([2, 1, 0, 0]); // 06-01 x2, 06-02 x1
    expect(r.totals?.count).toBe(3);
  });

  it("active_channels_count counts channels with >0 messages", async () => {
    const r = await discordAnalyticsSource.query({ metricKey: "active_channels_count", range: RANGE, filters: GUILD_F }, CTX);
    expect(r.totals).toEqual({ active_channels_count: 2 }); // general + random, not quiet
  });

  it("messages_by_channel returns per-channel counts, most-active first, with name labels", async () => {
    const r = await discordAnalyticsSource.query({ metricKey: "messages_by_channel", range: RANGE, filters: GUILD_F }, CTX);
    expect(r.shape).toBe("series");
    expect(r.rows).toEqual([
      { channel: "general", count: 5 },
      { channel: "random", count: 2 },
      { channel: "quiet", count: 0 },
    ]);
  });

  it("surfaces a truncation warning when a scan hit its budget", async () => {
    mockScanGuild.mockResolvedValue({ channels: [{ name: "general", count: 5 }], truncated: true });
    const r = await discordAnalyticsSource.query({ metricKey: "messages_by_channel", range: RANGE, filters: GUILD_F }, CTX);
    expect(r.truncated).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("never surfaces message content / author / username / user id / message id", async () => {
    const r = await discordAnalyticsSource.query({ metricKey: "channel_messages_over_time", range: RANGE, filters: CHAN_F }, CTX);
    expect(JSON.stringify(r)).not.toMatch(/content|author|username|user_id|userid|message_id|messageid|avatar|email/i);
  });
});

describe("error normalization (typed, leak-free)", () => {
  it("IntegrationActionRequiredError → MISSING_CREDENTIAL", async () => {
    mockCountChannels.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-1",
        provider: "discord",
        providerAccountId: "dc-user-1",
        reason: "refresh_failed",
      }),
    );
    await expect(
      discordAnalyticsSource.query({ metricKey: "server_channels_count", range: RANGE, filters: GUILD_F }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a leaked 401 → MISSING_CREDENTIAL", async () => {
    mockCountChannels.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      discordAnalyticsSource.query({ metricKey: "server_channels_count", range: RANGE, filters: GUILD_F }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a guild/channel NotFoundError → INVALID_QUERY (user-fixable)", async () => {
    mockCountChannels.mockRejectedValueOnce(new NotFoundError("guild 1", "not found"));
    await expect(
      discordAnalyticsSource.query({ metricKey: "server_channels_count", range: RANGE, filters: GUILD_F }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
  });

  it("403 (bot not in server) → INVALID_QUERY", async () => {
    mockCountChannels.mockRejectedValueOnce(new DiscordApiError(403, 50001, "Missing Access"));
    await expect(
      discordAnalyticsSource.query({ metricKey: "server_channels_count", range: RANGE, filters: GUILD_F }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
  });

  it("429 → RATE_LIMITED", async () => {
    mockCountChannels.mockRejectedValueOnce(new DiscordApiError(429, 0, "rate limited"));
    await expect(
      discordAnalyticsSource.query({ metricKey: "server_channels_count", range: RANGE, filters: GUILD_F }, CTX),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("missing bot token (deploy misconfig) → generic PROVIDER_ERROR, no leak", async () => {
    mockCountChannels.mockRejectedValueOnce(new DiscordBotTokenMissingError());
    const err = await discordAnalyticsSource
      .query({ metricKey: "server_channels_count", range: RANGE, filters: GUILD_F }, CTX)
      .catch((e) => e);
    expect(err).toBeInstanceOf(AnalyticsSourceError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toMatch(/DISCORD_BOT_TOKEN|env/i);
  });

  it("an unexpected error → generic PROVIDER_ERROR with no raw leak", async () => {
    mockScanChannel.mockRejectedValueOnce(new Error("secret-internal token=abc123 boom"));
    const err = await discordAnalyticsSource
      .query({ metricKey: "messages_count", range: RANGE, filters: CHAN_F }, CTX)
      .catch((e) => e);
    expect(err).toBeInstanceOf(AnalyticsSourceError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toMatch(/secret-internal|token=abc123/);
  });
});
