/**
 * @jest-environment node
 *
 * Microsoft Teams analytics adapter (Slice ANALYTICS-SOURCES-TEAMS-1): per-viewer
 * personal credential resolution (refreshable → refreshAndRetry), count-only +
 * metadata-only metrics (team channel count + messages over time / by channel / count +
 * active channels — only timestamps + channel names read; never message
 * content/subject/from/user-id/message-id/member listing), required team/channel
 * validation, and typed, leak-free error normalization. No network/DB — the credential
 * repo, refreshAndRetry, and the bounded Graph readers are mocked.
 */

const mockGetIntegration = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  __esModule: true,
  getActiveForExecution: (...args: unknown[]) => mockGetIntegration(...args),
}));

const mockListChannels = jest.fn();
const mockScanChannel = jest.fn();
const mockScanTeam = jest.fn();
jest.mock("@/services/analytics/sources/microsoft-teams/api", () => {
  const actual = jest.requireActual("@/services/analytics/sources/microsoft-teams/api");
  return {
    ...actual,
    listTeamChannels: (...a: unknown[]) => mockListChannels(...a),
    scanChannelTimestamps: (...a: unknown[]) => mockScanChannel(...a),
    scanTeamChannelCounts: (...a: unknown[]) => mockScanTeam(...a),
  };
});

const mockRefresh = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (input: unknown) => mockRefresh(input) };
});

import { microsoftTeamsAnalyticsSource } from "@/services/analytics/sources/microsoft-teams";
import { TeamsRateLimitError } from "@/services/analytics/sources/microsoft-teams/api";
import {
  AnalyticsSourceError,
  NormalizedAnalyticsResultSchema,
} from "@/services/analytics/sources/types";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";

const CTX = { accountId: "acct-1", userId: "user-1" };
const RANGE = { since: "2026-06-01T00:00:00Z", until: "2026-06-04T00:00:00Z" }; // 4 day-buckets
const TEAM = "19:abcTEAMid@thread.tacv2";
const CHANNEL = "19:abcCHANNELid@thread.tacv2";
const ms = (iso: string) => Date.parse(iso);

const TEAM_F = { teams_team: TEAM };
const CHAN_F = { teams_team: TEAM, teams_channel: CHANNEL };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetIntegration.mockResolvedValue({ providerAccountId: "tm-user-1" });
  mockRefresh.mockImplementation((input: { apiCall: (t: string) => unknown }) => input.apiCall("tok"));
  mockListChannels.mockResolvedValue({
    channels: [
      { id: "c1", name: "General" },
      { id: "c2", name: "Random" },
    ],
    truncated: false,
  });
  mockScanChannel.mockResolvedValue({
    timestamps: [ms("2026-06-01T09:00:00Z"), ms("2026-06-01T11:00:00Z"), ms("2026-06-02T09:00:00Z")],
    truncated: false,
    callsUsed: 1,
  });
  mockScanTeam.mockResolvedValue({
    channels: [
      { name: "General", count: 5 },
      { name: "Random", count: 2 },
      { name: "Quiet", count: 0 },
    ],
    truncated: false,
  });
});

describe("metric registration", () => {
  it("exposes the approved count-only metric set with correct filter shapes", () => {
    expect(microsoftTeamsAnalyticsSource.providerKey).toBe("microsoft-teams");
    expect(microsoftTeamsAnalyticsSource.connectedApp).toBe(true);
    expect(microsoftTeamsAnalyticsSource.metrics.map((m) => m.key).sort()).toEqual([
      "active_channels_count",
      "channel_messages_count",
      "channel_messages_over_time",
      "messages_by_channel",
      "team_channels_count",
    ]);
    const byKey = Object.fromEntries(microsoftTeamsAnalyticsSource.metrics.map((m) => [m.key, m.supportedFilters]));
    expect(byKey.team_channels_count).toEqual(["teams_team"]);
    expect(byKey.messages_by_channel).toEqual(["teams_team"]);
    expect(byKey.channel_messages_over_time).toEqual(["teams_team", "teams_channel"]);
    expect(byKey.channel_messages_count).toEqual(["teams_team", "teams_channel"]);
  });
});

describe("validation (no I/O before it passes)", () => {
  it("rejects an unknown metric", async () => {
    await expect(
      microsoftTeamsAnalyticsSource.query({ metricKey: "send_message", range: RANGE, filters: TEAM_F }, CTX),
    ).rejects.toMatchObject({ code: "UNKNOWN_METRIC" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });

  it("rejects a missing team id before any I/O", async () => {
    await expect(
      microsoftTeamsAnalyticsSource.query({ metricKey: "team_channels_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });

  it("rejects a malformed team id before any I/O", async () => {
    await expect(
      microsoftTeamsAnalyticsSource.query(
        { metricKey: "team_channels_count", range: RANGE, filters: { teams_team: "bad id with spaces" } },
        CTX,
      ),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("rejects a missing channel id for channel-scoped metrics before any I/O", async () => {
    await expect(
      microsoftTeamsAnalyticsSource.query({ metricKey: "channel_messages_count", range: RANGE, filters: TEAM_F }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });
});

describe("credential resolution (personal — viewer's own)", () => {
  it("pins to ctx.userId and refreshAndRetry uses that row's providerAccountId", async () => {
    await microsoftTeamsAnalyticsSource.query({ metricKey: "team_channels_count", range: RANGE, filters: TEAM_F }, CTX);
    expect(mockGetIntegration).toHaveBeenCalledWith("acct-1", "microsoft-teams", null, { connectedByUserId: "user-1" });
    expect(mockRefresh.mock.calls[0]![0]).toMatchObject({
      accountId: "acct-1",
      provider: "microsoft-teams",
      providerAccountId: "tm-user-1",
    });
  });

  it("returns MISSING_CREDENTIAL when the viewer has no Teams connection", async () => {
    mockGetIntegration.mockResolvedValue(null);
    await expect(
      microsoftTeamsAnalyticsSource.query({ metricKey: "team_channels_count", range: RANGE, filters: TEAM_F }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
    expect(mockListChannels).not.toHaveBeenCalled();
  });
});

describe("metrics", () => {
  it("team_channels_count returns the channel count", async () => {
    const r = await microsoftTeamsAnalyticsSource.query({ metricKey: "team_channels_count", range: RANGE, filters: TEAM_F }, CTX);
    expect(() => NormalizedAnalyticsResultSchema.parse(r)).not.toThrow();
    expect(r.totals).toEqual({ team_channels_count: 2 });
  });

  it("channel_messages_count counts in-range messages for the channel", async () => {
    const r = await microsoftTeamsAnalyticsSource.query({ metricKey: "channel_messages_count", range: RANGE, filters: CHAN_F }, CTX);
    expect(r.totals).toEqual({ channel_messages_count: 3 });
    // channelId threaded into the scanner
    expect(mockScanChannel.mock.calls[0]![2]).toBe(CHANNEL);
  });

  it("channel_messages_over_time buckets timestamps by day (out-of-range excluded)", async () => {
    const r = await microsoftTeamsAnalyticsSource.query({ metricKey: "channel_messages_over_time", range: RANGE, filters: CHAN_F }, CTX);
    expect(r.shape).toBe("series");
    expect(r.rows).toHaveLength(4);
    expect(r.rows.map((row) => row.count)).toEqual([2, 1, 0, 0]); // 06-01 x2, 06-02 x1
    expect(r.totals?.count).toBe(3);
  });

  it("active_channels_count counts channels with >0 messages", async () => {
    const r = await microsoftTeamsAnalyticsSource.query({ metricKey: "active_channels_count", range: RANGE, filters: TEAM_F }, CTX);
    expect(r.totals).toEqual({ active_channels_count: 2 }); // General + Random, not Quiet
  });

  it("messages_by_channel returns per-channel counts, most-active first, with name labels", async () => {
    const r = await microsoftTeamsAnalyticsSource.query({ metricKey: "messages_by_channel", range: RANGE, filters: TEAM_F }, CTX);
    expect(r.shape).toBe("series");
    expect(r.rows).toEqual([
      { channel: "General", count: 5 },
      { channel: "Random", count: 2 },
      { channel: "Quiet", count: 0 },
    ]);
  });

  it("surfaces a truncation warning when a scan hit its budget", async () => {
    mockScanTeam.mockResolvedValue({ channels: [{ name: "General", count: 5 }], truncated: true });
    const r = await microsoftTeamsAnalyticsSource.query({ metricKey: "messages_by_channel", range: RANGE, filters: TEAM_F }, CTX);
    expect(r.truncated).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("never surfaces message content / subject / from / user id / message id", async () => {
    const r = await microsoftTeamsAnalyticsSource.query({ metricKey: "channel_messages_over_time", range: RANGE, filters: CHAN_F }, CTX);
    expect(JSON.stringify(r)).not.toMatch(/content|body|subject|\bfrom\b|user_id|userid|message_id|messageid|@odata/i);
  });
});

describe("error normalization (typed, leak-free)", () => {
  it("IntegrationActionRequiredError → MISSING_CREDENTIAL", async () => {
    mockRefresh.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-1",
        provider: "microsoft-teams",
        providerAccountId: "tm-user-1",
        reason: "refresh_failed",
      }),
    );
    await expect(
      microsoftTeamsAnalyticsSource.query({ metricKey: "team_channels_count", range: RANGE, filters: TEAM_F }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a leaked 401 → MISSING_CREDENTIAL", async () => {
    mockScanChannel.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftTeamsAnalyticsSource.query({ metricKey: "channel_messages_count", range: RANGE, filters: CHAN_F }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a team/channel NotFoundError → INVALID_QUERY (user-fixable)", async () => {
    mockListChannels.mockRejectedValueOnce(new NotFoundError("team x channels", "not found"));
    await expect(
      microsoftTeamsAnalyticsSource.query({ metricKey: "team_channels_count", range: RANGE, filters: TEAM_F }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
  });

  it("a 429 → RATE_LIMITED", async () => {
    mockListChannels.mockRejectedValueOnce(new TeamsRateLimitError("rate-limited"));
    await expect(
      microsoftTeamsAnalyticsSource.query({ metricKey: "team_channels_count", range: RANGE, filters: TEAM_F }, CTX),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("an unexpected error → generic PROVIDER_ERROR with no raw leak", async () => {
    mockScanTeam.mockRejectedValueOnce(new Error("secret-internal token=abc123 boom"));
    const err = await microsoftTeamsAnalyticsSource
      .query({ metricKey: "active_channels_count", range: RANGE, filters: TEAM_F }, CTX)
      .catch((e) => e);
    expect(err).toBeInstanceOf(AnalyticsSourceError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toMatch(/secret-internal|token=abc123/);
  });
});
