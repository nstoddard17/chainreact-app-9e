/**
 * @jest-environment node
 *
 * Tests for `integrations/google-sheets/api/listSpreadsheets.ts` —
 * Slice 3.GSHEETS-2.
 *
 * Pin:
 *   - URL shape (Drive v3 files endpoint, mimeType + trashed filter,
 *     orderBy modifiedTime desc, fields mask).
 *   - Authorization header carries the access token verbatim.
 *   - 401 → Unauthorized401Error (refreshAndRetry contract).
 *   - Non-OK 4xx/5xx → generic Error with the surfaced Drive message.
 *   - Response mapping: drops files lacking id / name; preserves
 *     modifiedTime when present.
 *   - hasMore: true iff nextPageToken returned + non-empty.
 */

import { listSpreadsheets } from "@/integrations/google-sheets/api/listSpreadsheets";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;

beforeEach(() => {
  mockFetch.mockReset();
  globalThis.fetch = mockFetch;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("listSpreadsheets — request shape", () => {
  it("hits Drive v3 files endpoint with mimeType + trashed filter, orderBy modifiedTime desc, and the access token", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ files: [], nextPageToken: null }),
    );
    await listSpreadsheets({ accessToken: "ya29.token" });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0]!;
    const u = new URL(url as string);
    expect(u.pathname).toBe("/drive/v3/files");
    expect(u.searchParams.get("q")).toBe(
      "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    );
    expect(u.searchParams.get("orderBy")).toBe("modifiedTime desc");
    expect(u.searchParams.get("pageSize")).toBe("200");
    expect(u.searchParams.get("fields")).toBe(
      "files(id,name,modifiedTime),nextPageToken",
    );
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer ya29.token");
    expect(init?.method).toBe("GET");
  });

  it("forwards pageSize and pageToken when supplied", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ files: [] }));
    await listSpreadsheets({
      accessToken: "t",
      pageSize: 500,
      pageToken: "abc",
    });
    const [url] = mockFetch.mock.calls[0]!;
    const u = new URL(url as string);
    expect(u.searchParams.get("pageSize")).toBe("500");
    expect(u.searchParams.get("pageToken")).toBe("abc");
  });
});

describe("listSpreadsheets — response mapping", () => {
  it("maps valid Drive files to SpreadsheetSummary with id / name / modifiedTime", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        files: [
          { id: "1", name: "First", modifiedTime: "2026-05-01T00:00:00Z" },
          { id: "2", name: "Second", modifiedTime: "2026-04-15T12:30:00Z" },
        ],
        nextPageToken: null,
      }),
    );
    const result = await listSpreadsheets({ accessToken: "t" });
    expect(result.spreadsheets).toEqual([
      { id: "1", name: "First", modifiedTime: "2026-05-01T00:00:00Z" },
      { id: "2", name: "Second", modifiedTime: "2026-04-15T12:30:00Z" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("omits modifiedTime when Drive doesn't return one", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ files: [{ id: "1", name: "First" }] }),
    );
    const result = await listSpreadsheets({ accessToken: "t" });
    expect(result.spreadsheets).toEqual([{ id: "1", name: "First" }]);
  });

  it("drops files lacking id or name (defensive)", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        files: [
          { id: "1", name: "kept" },
          { id: "", name: "empty-id" },
          { name: "no-id" },
          { id: "2" },
          { id: "3", name: "" },
          { id: 42, name: "non-string-id" },
        ],
      }),
    );
    const result = await listSpreadsheets({ accessToken: "t" });
    expect(result.spreadsheets).toEqual([{ id: "1", name: "kept" }]);
  });

  it("hasMore is true iff nextPageToken is a non-empty string", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ files: [{ id: "1", name: "a" }], nextPageToken: "abc" }),
    );
    const r1 = await listSpreadsheets({ accessToken: "t" });
    expect(r1.hasMore).toBe(true);

    mockFetch.mockResolvedValueOnce(
      jsonResponse({ files: [{ id: "1", name: "a" }], nextPageToken: "" }),
    );
    const r2 = await listSpreadsheets({ accessToken: "t" });
    expect(r2.hasMore).toBe(false);
  });

  it("returns empty spreadsheets when Drive returns no files", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ files: [] }));
    const result = await listSpreadsheets({ accessToken: "t" });
    expect(result.spreadsheets).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it("handles a missing files array (defensive)", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}));
    const result = await listSpreadsheets({ accessToken: "t" });
    expect(result.spreadsheets).toEqual([]);
  });
});

describe("listSpreadsheets — error handling", () => {
  it("throws Unauthorized401Error on HTTP 401 (refreshAndRetry contract)", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("{\"error\":{\"code\":401}}", { status: 401 }),
    );
    await expect(listSpreadsheets({ accessToken: "t" })).rejects.toBeInstanceOf(
      Unauthorized401Error,
    );
  });

  it("throws a generic Error on other 4xx/5xx with the surfaced Drive message", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 403, message: "Drive quota exceeded" } }),
        { status: 403 },
      ),
    );
    await expect(
      listSpreadsheets({ accessToken: "t" }),
    ).rejects.toThrow(/Drive quota exceeded/);
  });
});
