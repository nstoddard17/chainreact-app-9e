/**
 * @jest-environment node
 *
 * Bounded, count-only + metadata-only Microsoft Teams readers (Slice
 * ANALYTICS-SOURCES-TEAMS-1): verifies the minimal $select field masks, channel-message
 * timestamp paging (@odata.nextLink, descending-order early-stop, system-message skip,
 * truncation), team-wide per-channel counting with a global call budget, channel-list
 * paging + unnamed fallback, that NO message content/from is ever carried into a
 * result, and typed Graph error mapping. `fetch` is mocked — no network.
 */

import {
  listTeamChannels,
  scanChannelTimestamps,
  scanTeamChannelCounts,
  TeamsRateLimitError,
  MESSAGE_PAGE_SIZE,
} from "@/services/analytics/sources/microsoft-teams/api";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";

const SINCE = Date.parse("2026-06-01T00:00:00Z");
const UNTIL = Date.parse("2026-06-08T00:00:00Z");

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** A channel message with content/from present — to prove the reader discards them. */
function msg(createdDateTime: string, messageType = "message") {
  return {
    id: "1700000000000",
    createdDateTime,
    messageType,
    body: { content: "SECRET MESSAGE BODY", contentType: "html" },
    from: { user: { id: "u1", displayName: "Alice" } },
    attachments: [{ id: "att1" }],
    webUrl: "https://teams.microsoft.com/x",
  };
}

afterEach(() => jest.restoreAllMocks());

describe("scanChannelTimestamps", () => {
  it("requests a minimal $select (createdDateTime,messageType) and counts in-range messages", async () => {
    const urls: string[] = [];
    global.fetch = jest.fn(async (url: string) => {
      urls.push(url);
      return jsonResponse({
        value: [
          msg("2026-06-10T00:00:00Z"), // > until → skipped
          msg("2026-06-05T00:00:00Z"), // in range
          msg("2026-06-02T00:00:00Z"), // in range
          msg("2026-05-20T00:00:00Z"), // < since → stop
        ],
      });
    }) as unknown as typeof fetch;

    const r = await scanChannelTimestamps("tok", "team1", "chan1", SINCE, UNTIL, 10);
    expect(r.timestamps).toHaveLength(2);
    expect(r.truncated).toBe(false);
    const u = new URL(urls[0]!);
    expect(u.searchParams.get("$select")).toBe("createdDateTime,messageType");
    expect(u.searchParams.get("$top")).toBe(String(MESSAGE_PAGE_SIZE));
    expect(u.pathname).toContain("/teams/team1/channels/chan1/messages");
  });

  it("skips system/event messages (messageType !== 'message')", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({
        value: [
          msg("2026-06-05T00:00:00Z", "message"),
          msg("2026-06-04T00:00:00Z", "systemEventMessage"),
        ],
      }),
    ) as unknown as typeof fetch;
    const r = await scanChannelTimestamps("tok", "t", "c", SINCE, UNTIL, 10);
    expect(r.timestamps).toHaveLength(1);
  });

  it("follows @odata.nextLink across pages and early-stops on older-than-since", async () => {
    let call = 0;
    global.fetch = jest.fn(async () => {
      call++;
      if (call === 1) {
        return jsonResponse({
          value: [msg("2026-06-05T00:00:00Z")],
          "@odata.nextLink": "https://graph.microsoft.com/next-page-2",
        });
      }
      return jsonResponse({ value: [msg("2026-05-01T00:00:00Z")] }); // older → stop
    }) as unknown as typeof fetch;
    const r = await scanChannelTimestamps("tok", "t", "c", SINCE, UNTIL, 10);
    expect(r.timestamps).toHaveLength(1);
    expect(r.callsUsed).toBe(2);
    expect(r.truncated).toBe(false);
  });

  it("reports truncated when the page budget is exhausted", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({
        value: [msg("2026-06-05T00:00:00Z")],
        "@odata.nextLink": "https://graph.microsoft.com/more",
      }),
    ) as unknown as typeof fetch;
    const r = await scanChannelTimestamps("tok", "t", "c", SINCE, UNTIL, 2);
    expect(r.truncated).toBe(true);
    expect(r.callsUsed).toBe(2);
  });

  it("never carries message content / from / webUrl into the result", async () => {
    global.fetch = jest.fn(async () => jsonResponse({ value: [msg("2026-06-05T00:00:00Z")] })) as unknown as typeof fetch;
    const r = await scanChannelTimestamps("tok", "t", "c", SINCE, UNTIL, 1);
    expect(JSON.stringify(r)).not.toMatch(/SECRET MESSAGE BODY|Alice|att1|teams\.microsoft\.com|\bfrom\b/);
  });

  it("maps Graph errors: 401 → Unauthorized401Error, 429 → TeamsRateLimitError, 404 → NotFoundError", async () => {
    global.fetch = jest.fn(async () => jsonResponse({}, 401)) as unknown as typeof fetch;
    await expect(scanChannelTimestamps("tok", "t", "c", SINCE, UNTIL, 1)).rejects.toBeInstanceOf(Unauthorized401Error);
    global.fetch = jest.fn(async () => jsonResponse({}, 429)) as unknown as typeof fetch;
    await expect(scanChannelTimestamps("tok", "t", "c", SINCE, UNTIL, 1)).rejects.toBeInstanceOf(TeamsRateLimitError);
    global.fetch = jest.fn(async () => jsonResponse({ error: { message: "not found" } }, 404)) as unknown as typeof fetch;
    await expect(scanChannelTimestamps("tok", "t", "c", SINCE, UNTIL, 1)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("listTeamChannels", () => {
  it("requests $select=id,displayName, pages via nextLink, and falls back to a placeholder name", async () => {
    const urls: string[] = [];
    let call = 0;
    global.fetch = jest.fn(async (url: string) => {
      urls.push(url);
      call++;
      if (call === 1) {
        return jsonResponse({
          value: [{ id: "c1", displayName: "General" }],
          "@odata.nextLink": "https://graph.microsoft.com/channels-page-2",
        });
      }
      return jsonResponse({ value: [{ id: "c2" }] }); // no displayName
    }) as unknown as typeof fetch;
    const r = await listTeamChannels("tok", "team1");
    expect(r.channels).toEqual([
      { id: "c1", name: "General" },
      { id: "c2", name: "(unnamed)" },
    ]);
    expect(new URL(urls[0]!).searchParams.get("$select")).toBe("id,displayName");
  });
});

describe("scanTeamChannelCounts", () => {
  it("counts per channel with name labels (channel list + per-channel message scan)", async () => {
    global.fetch = jest.fn(async (url: string) => {
      if (url.includes("/messages")) {
        if (url.includes("/channels/c1/")) return jsonResponse({ value: [msg("2026-06-03T00:00:00Z")] });
        return jsonResponse({ value: [] }); // c2 empty
      }
      return jsonResponse({ value: [{ id: "c1", displayName: "General" }, { id: "c2", displayName: "Random" }] });
    }) as unknown as typeof fetch;
    const r = await scanTeamChannelCounts("tok", "team1", SINCE, UNTIL);
    expect(r.channels).toEqual([
      { name: "General", count: 1 },
      { name: "Random", count: 0 },
    ]);
    expect(r.truncated).toBe(false);
  });
});
