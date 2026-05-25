/**
 * @jest-environment node
 *
 * Tests for the Google Sheets `spreadsheets.create` API wrapper. Mocks
 * fetch and verifies request shape (collection-root POST, no path id),
 * body construction (title-only vs initialSheetTitles), response
 * passthrough, the 401 → Unauthorized401Error contract, the
 * 404 → NotFoundError mapping, and the GOOGLE_SHEETS_API_BASE override.
 */
import { spreadsheetsCreate } from "@/integrations/google-sheets/api/spreadsheetsCreate";
import { NotFoundError } from "@/integrations/google-sheets/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset?.();
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.GOOGLE_SHEETS_API_BASE;
});

function mockFetchOnce(response: { ok?: boolean; status?: number; body: unknown }) {
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(
        typeof response.body === "string"
          ? response.body
          : JSON.stringify(response.body),
        { status: response.status ?? (response.ok === false ? 500 : 200) },
      ),
    );
}

describe("spreadsheetsCreate — request shape", () => {
  it("POSTs to /v4/spreadsheets (collection root, no path id) with Bearer auth + JSON body", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      body: { spreadsheetId: "new-ss" },
    });

    await spreadsheetsCreate({
      accessToken: "ya29.token",
      title: "My Spreadsheet",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = fetchSpy.mock.calls[0]![0];
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(String(url)).toBe(
      "https://sheets.googleapis.com/v4/spreadsheets",
    );
    expect(init).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer ya29.token",
          "Content-Type": "application/json",
        },
      }),
    );
  });

  it("sends body { properties: { title } } when no initialSheetTitles", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, body: {} });

    await spreadsheetsCreate({
      accessToken: "t",
      title: "Project Tracker",
    });

    const body = JSON.parse(
      fetchSpy.mock.calls[0]![1]!.body as string,
    );
    expect(body).toEqual({
      properties: { title: "Project Tracker" },
    });
    expect(body.sheets).toBeUndefined();
  });

  it("sends body sheets[] when initialSheetTitles is provided", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, body: {} });

    await spreadsheetsCreate({
      accessToken: "t",
      title: "Tracker",
      initialSheetTitles: ["Orders"],
    });

    const body = JSON.parse(
      fetchSpy.mock.calls[0]![1]!.body as string,
    );
    expect(body).toEqual({
      properties: { title: "Tracker" },
      sheets: [{ properties: { title: "Orders" } }],
    });
  });

  it("supports multiple initialSheetTitles (one entry per sheet)", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, body: {} });

    await spreadsheetsCreate({
      accessToken: "t",
      title: "Quarterly",
      initialSheetTitles: ["Q1", "Q2", "Q3", "Q4"],
    });

    const body = JSON.parse(
      fetchSpy.mock.calls[0]![1]!.body as string,
    );
    expect(body.sheets).toEqual([
      { properties: { title: "Q1" } },
      { properties: { title: "Q2" } },
      { properties: { title: "Q3" } },
      { properties: { title: "Q4" } },
    ]);
  });

  it("omits sheets[] when initialSheetTitles is an empty array", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, body: {} });

    await spreadsheetsCreate({
      accessToken: "t",
      title: "X",
      initialSheetTitles: [],
    });

    const body = JSON.parse(
      fetchSpy.mock.calls[0]![1]!.body as string,
    );
    expect(body.sheets).toBeUndefined();
  });

  it("honors GOOGLE_SHEETS_API_BASE env override", async () => {
    process.env.GOOGLE_SHEETS_API_BASE = "http://localhost:9999";
    const fetchSpy = mockFetchOnce({ ok: true, body: {} });

    await spreadsheetsCreate({ accessToken: "t", title: "X" });

    const url = fetchSpy.mock.calls[0]![0];
    expect(String(url)).toBe("http://localhost:9999/v4/spreadsheets");
  });
});

describe("spreadsheetsCreate — response handling", () => {
  it("returns the parsed JSON response (passthrough)", async () => {
    mockFetchOnce({
      ok: true,
      body: {
        spreadsheetId: "ss-99",
        spreadsheetUrl: "https://docs.google.com/spreadsheets/d/ss-99/edit",
        properties: { title: "X", locale: "en_US", timeZone: "UTC" },
        sheets: [
          { properties: { sheetId: 0, title: "Sheet1", index: 0, sheetType: "GRID" } },
        ],
      },
    });

    const result = await spreadsheetsCreate({
      accessToken: "t",
      title: "X",
    });

    expect(result).toEqual({
      spreadsheetId: "ss-99",
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/ss-99/edit",
      properties: { title: "X", locale: "en_US", timeZone: "UTC" },
      sheets: [
        {
          properties: {
            sheetId: 0,
            title: "Sheet1",
            index: 0,
            sheetType: "GRID",
          },
        },
      ],
    });
  });
});

describe("spreadsheetsCreate — error mapping (matches existing wrappers)", () => {
  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({
      status: 401,
      body: { error: { code: 401, message: "Invalid auth" } },
    });

    await expect(
      spreadsheetsCreate({ accessToken: "t", title: "X" }),
    ).rejects.toThrow(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404", async () => {
    mockFetchOnce({
      status: 404,
      body: { error: { code: 404, message: "Drive scope missing" } },
    });

    await expect(
      spreadsheetsCreate({ accessToken: "t", title: "X" }),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws generic Error on HTTP 400 with surfaced Google message", async () => {
    mockFetchOnce({
      status: 400,
      body: { error: { code: 400, message: "Bad title", status: "INVALID_ARGUMENT" } },
    });

    await expect(
      spreadsheetsCreate({ accessToken: "t", title: "" }),
    ).rejects.toThrow(/spreadsheets.create failed: Bad title/);
  });

  it("throws generic Error on HTTP 500 with surfaced message", async () => {
    mockFetchOnce({
      status: 500,
      body: { error: { code: 500, message: "Backend error" } },
    });

    await expect(
      spreadsheetsCreate({ accessToken: "t", title: "X" }),
    ).rejects.toThrow(/spreadsheets.create failed: Backend error/);
  });

  it("falls back to HTTP code when the body isn't valid JSON", async () => {
    mockFetchOnce({ status: 503, body: "<html>Service Unavailable</html>" });

    await expect(
      spreadsheetsCreate({ accessToken: "t", title: "X" }),
    ).rejects.toThrow(/spreadsheets.create failed: HTTP 503/);
  });
});
