/**
 * @jest-environment node
 *
 * Tests for the Google Sheets `spreadsheets.batchUpdate` API wrapper.
 * Mocks fetch and verifies request shape, response passthrough, the
 * 401 → Unauthorized401Error contract that refreshAndRetry depends on,
 * 404 / 400-INVALID_ARGUMENT → NotFoundError mapping, and the
 * GOOGLE_SHEETS_API_BASE override convention. Mirrors the inline-checked
 * shape of the other Sheets api/ wrappers (spreadsheetsGet, valuesGet,
 * valuesUpdate).
 */
import { spreadsheetsBatchUpdate } from "@/integrations/google-sheets/api/spreadsheetsBatchUpdate";
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

describe("spreadsheetsBatchUpdate — request shape", () => {
  it("POSTs to /v4/spreadsheets/{id}:batchUpdate with Bearer auth + JSON body", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, body: { spreadsheetId: "ss-1", replies: [{}] } });

    await spreadsheetsBatchUpdate({
      accessToken: "ya29.token",
      spreadsheetId: "ss-1",
      requests: [
        {
          deleteDimension: {
            range: { sheetId: 0, dimension: "ROWS", startIndex: 4, endIndex: 5 },
          },
        },
      ],
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = fetchSpy.mock.calls[0]![0];
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(String(url)).toBe(
      "https://sheets.googleapis.com/v4/spreadsheets/ss-1:batchUpdate",
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
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      requests: [
        {
          deleteDimension: {
            range: { sheetId: 0, dimension: "ROWS", startIndex: 4, endIndex: 5 },
          },
        },
      ],
      includeSpreadsheetInResponse: false,
    });
  });

  it("URL-encodes the spreadsheetId", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, body: {} });

    await spreadsheetsBatchUpdate({
      accessToken: "t",
      spreadsheetId: "id with spaces/and slashes",
      requests: [],
    });

    const url = fetchSpy.mock.calls[0]![0];
    expect(String(url)).toBe(
      "https://sheets.googleapis.com/v4/spreadsheets/id%20with%20spaces%2Fand%20slashes:batchUpdate",
    );
  });

  it("forwards includeSpreadsheetInResponse=true when set", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, body: {} });

    await spreadsheetsBatchUpdate({
      accessToken: "t",
      spreadsheetId: "ss",
      requests: [{ insertDimension: {} }],
      includeSpreadsheetInResponse: true,
    });

    const body = JSON.parse(
      fetchSpy.mock.calls[0]![1]!.body as string,
    );
    expect(body.includeSpreadsheetInResponse).toBe(true);
  });

  it("honors GOOGLE_SHEETS_API_BASE env override", async () => {
    process.env.GOOGLE_SHEETS_API_BASE = "http://localhost:9999";
    const fetchSpy = mockFetchOnce({ ok: true, body: {} });

    await spreadsheetsBatchUpdate({
      accessToken: "t",
      spreadsheetId: "ss",
      requests: [],
    });

    const url = fetchSpy.mock.calls[0]![0];
    expect(String(url)).toBe(
      "http://localhost:9999/v4/spreadsheets/ss:batchUpdate",
    );
  });
});

describe("spreadsheetsBatchUpdate — response handling", () => {
  it("returns the parsed JSON response", async () => {
    mockFetchOnce({
      ok: true,
      body: {
        spreadsheetId: "ss",
        replies: [{ deleteDimension: {} }],
      },
    });

    const result = await spreadsheetsBatchUpdate({
      accessToken: "t",
      spreadsheetId: "ss",
      requests: [{ deleteDimension: {} }],
    });

    expect(result).toEqual({
      spreadsheetId: "ss",
      replies: [{ deleteDimension: {} }],
    });
  });
});

describe("spreadsheetsBatchUpdate — error mapping (matches existing wrappers)", () => {
  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({
      status: 401,
      body: { error: { code: 401, message: "Invalid auth" } },
    });

    await expect(
      spreadsheetsBatchUpdate({
        accessToken: "t",
        spreadsheetId: "ss",
        requests: [],
      }),
    ).rejects.toThrow(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404 (missing spreadsheet)", async () => {
    mockFetchOnce({
      status: 404,
      body: { error: { code: 404, message: "Requested entity was not found." } },
    });

    await expect(
      spreadsheetsBatchUpdate({
        accessToken: "t",
        spreadsheetId: "missing",
        requests: [],
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError on HTTP 400 with INVALID_ARGUMENT (missing sheet/range)", async () => {
    mockFetchOnce({
      status: 400,
      body: {
        error: {
          code: 400,
          status: "INVALID_ARGUMENT",
          message: "Invalid sheet id",
        },
      },
    });

    await expect(
      spreadsheetsBatchUpdate({
        accessToken: "t",
        spreadsheetId: "ss",
        requests: [{ deleteDimension: { range: { sheetId: 99 } } }],
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws generic Error on HTTP 400 without INVALID_ARGUMENT status", async () => {
    mockFetchOnce({
      status: 400,
      body: {
        error: { code: 400, message: "Bad request body", status: "FAILED_PRECONDITION" },
      },
    });

    await expect(
      spreadsheetsBatchUpdate({
        accessToken: "t",
        spreadsheetId: "ss",
        requests: [{ unknown: {} }],
      }),
    ).rejects.toThrow(/spreadsheets.batchUpdate failed: Bad request body/);
  });

  it("throws generic Error on HTTP 500 with surfaced message", async () => {
    mockFetchOnce({
      status: 500,
      body: { error: { code: 500, message: "Backend error" } },
    });

    await expect(
      spreadsheetsBatchUpdate({
        accessToken: "t",
        spreadsheetId: "ss",
        requests: [],
      }),
    ).rejects.toThrow(/spreadsheets.batchUpdate failed: Backend error/);
  });

  it("falls back to HTTP code when the body isn't valid JSON", async () => {
    mockFetchOnce({ status: 503, body: "<html>Service Unavailable</html>" });

    await expect(
      spreadsheetsBatchUpdate({
        accessToken: "t",
        spreadsheetId: "ss",
        requests: [],
      }),
    ).rejects.toThrow(/spreadsheets.batchUpdate failed: HTTP 503/);
  });
});
