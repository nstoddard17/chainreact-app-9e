/**
 * @jest-environment node
 *
 * Bounded, count-only + metadata-only Discord readers (Slice ANALYTICS-SOURCES-DISCORD-1):
 * verifies channel-message timestamp paging (before-cursor, range stop, truncation),
 * guild-wide per-channel counting with a global call budget, text-channel counting,
 * aggregate member count extraction, and that NO message content/author is ever
 * carried into the result. The shared bot-token wrappers are mocked — no network.
 */

const mockMessagesList = jest.fn();
jest.mock("@/integrations/_shared/discord/api/messages", () => ({
  __esModule: true,
  messagesList: (...a: unknown[]) => mockMessagesList(...a),
}));

const mockGuildChannelsList = jest.fn();
jest.mock("@/integrations/_shared/discord/api/guilds", () => {
  const actual = jest.requireActual("@/integrations/_shared/discord/api/guilds");
  return { ...actual, guildChannelsList: (...a: unknown[]) => mockGuildChannelsList(...a) };
});

const mockBotRequest = jest.fn();
jest.mock("@/integrations/_shared/discord/api/_request", () => ({
  __esModule: true,
  discordBotRequest: (...a: unknown[]) => mockBotRequest(...a),
}));

import {
  countTextChannels,
  getApproximateMemberCount,
  scanChannelTimestamps,
  scanGuildChannelCounts,
  CHANNEL_PAGE_SIZE,
} from "@/services/analytics/sources/discord/api";

const SINCE = Date.parse("2026-06-01T00:00:00Z");
const UNTIL = Date.parse("2026-06-08T00:00:00Z");
const at = (iso: string) => iso;

/** Build a message with content/author present — to prove the reader discards them. */
function msg(id: string, timestamp: string) {
  return {
    id,
    channel_id: "c",
    content: "SECRET MESSAGE BODY",
    timestamp,
    author: { id: "u1", username: "alice", email: "a@b.com" },
    attachments: [{ id: "att1", url: "http://x" }],
  };
}

beforeEach(() => jest.clearAllMocks());

describe("scanChannelTimestamps", () => {
  it("collects in-range timestamps and stops once older-than-since is seen (no extra page)", async () => {
    // One page, newest-first: one too-new, two in-range, one too-old.
    mockMessagesList.mockResolvedValueOnce([
      msg("5", at("2026-06-10T00:00:00Z")), // > until → skipped
      msg("4", at("2026-06-05T00:00:00Z")), // in range
      msg("3", at("2026-06-02T00:00:00Z")), // in range
      msg("2", at("2026-05-20T00:00:00Z")), // < since → stop
    ]);
    const r = await scanChannelTimestamps("chan", SINCE, UNTIL, 10);
    expect(r.timestamps).toHaveLength(2);
    expect(r.truncated).toBe(false);
    expect(r.callsUsed).toBe(1);
    expect(mockMessagesList).toHaveBeenCalledTimes(1); // stopped — didn't page further
  });

  it("paginates with the before-cursor (oldest id of the page) until empty", async () => {
    mockMessagesList
      .mockResolvedValueOnce(Array.from({ length: CHANNEL_PAGE_SIZE }, (_, i) => msg(String(200 - i), at("2026-06-05T00:00:00Z"))))
      .mockResolvedValueOnce([msg("50", at("2026-06-04T00:00:00Z"))]);
    const r = await scanChannelTimestamps("chan", SINCE, UNTIL, 10);
    expect(r.timestamps).toHaveLength(CHANNEL_PAGE_SIZE + 1);
    // second call used before = oldest id of first page (the last element id = 200-99 = 101)
    expect(mockMessagesList.mock.calls[1]![0]).toMatchObject({ before: "101" });
  });

  it("reports truncated when the page budget is exhausted", async () => {
    mockMessagesList.mockResolvedValue(
      Array.from({ length: CHANNEL_PAGE_SIZE }, (_, i) => msg(String(1000 - i), at("2026-06-05T00:00:00Z"))),
    );
    const r = await scanChannelTimestamps("chan", SINCE, UNTIL, 2);
    expect(r.truncated).toBe(true);
    expect(r.callsUsed).toBe(2);
  });

  it("never carries message content / author into the result", async () => {
    mockMessagesList.mockResolvedValueOnce([msg("4", at("2026-06-05T00:00:00Z"))]);
    const r = await scanChannelTimestamps("chan", SINCE, UNTIL, 1);
    expect(JSON.stringify(r)).not.toMatch(/SECRET MESSAGE BODY|alice|a@b\.com|att1/);
  });
});

describe("scanGuildChannelCounts", () => {
  it("counts only text-shaped channels, per channel, with name labels", async () => {
    mockGuildChannelsList.mockResolvedValueOnce([
      { id: "t1", name: "general", type: 0 }, // text
      { id: "v1", name: "Voice", type: 2 }, // voice — excluded
      { id: "a1", name: "news", type: 5 }, // announcement
    ]);
    mockMessagesList
      .mockResolvedValueOnce([msg("9", at("2026-06-03T00:00:00Z"))]) // t1: 1
      .mockResolvedValueOnce([]); // a1: 0
    const r = await scanGuildChannelCounts("g", SINCE, UNTIL);
    expect(r.channels).toEqual([
      { name: "general", count: 1 },
      { name: "news", count: 0 },
    ]);
    expect(mockMessagesList).toHaveBeenCalledTimes(2); // voice channel never scanned
  });

  it("falls back to a placeholder label for an unnamed channel (never a raw id leak as a name)", async () => {
    mockGuildChannelsList.mockResolvedValueOnce([{ id: "t1", type: 0 }]);
    mockMessagesList.mockResolvedValueOnce([]);
    const r = await scanGuildChannelCounts("g", SINCE, UNTIL);
    expect(r.channels[0]!.name).toBe("(unnamed)");
  });
});

describe("countTextChannels", () => {
  it("counts text-shaped channels only", async () => {
    mockGuildChannelsList.mockResolvedValueOnce([
      { id: "1", type: 0 },
      { id: "2", type: 2 }, // voice
      { id: "3", type: 5 },
      { id: "4", type: 15 },
      { id: "5", type: 4 }, // category
    ]);
    expect(await countTextChannels("g")).toBe(3);
  });
});

describe("getApproximateMemberCount", () => {
  it("extracts only approximate_member_count (never lists members)", async () => {
    mockBotRequest.mockResolvedValueOnce({
      id: "g",
      name: "My Server",
      owner_id: "u1",
      approximate_member_count: 1234,
      approximate_presence_count: 56,
    });
    expect(await getApproximateMemberCount("g")).toBe(1234);
    // requested with_counts and the guild path
    const call = mockBotRequest.mock.calls[0]![0];
    expect(call.path).toContain("/guilds/g");
    expect(call.query.get("with_counts")).toBe("true");
  });

  it("returns null when Discord omits the count", async () => {
    mockBotRequest.mockResolvedValueOnce({ id: "g", name: "x" });
    expect(await getApproximateMemberCount("g")).toBeNull();
  });
});
