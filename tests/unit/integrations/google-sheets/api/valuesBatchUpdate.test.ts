/**
 * @jest-environment node
 *
 * Tests for the Google Sheets `spreadsheets.values.batchUpdate` API
 * wrapper. Mocks fetch and verifies request shape (POST to
 * `/values:batchUpdate` — DISTINCT from `:batchUpdate` at the
 * collection-level which is `spreadsheets.batchUpdate`), body
 * construction (`valueInputOption` + `data[]` shape), URL encoding,
 * response passthrough, GOOGLE_SHEETS_API_BASE override, and the
 * 401/404/400-INVALID_ARGUMENT/500/non-JSON error mapping that
 * matches the other Sheets api/ wrappers.
 */
import { valuesBatchUpdate } from "@/integrations/google-sheets/api/valuesBatchUpdate";
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

describe("valuesBatchUpdate — request shape", () => {
  it("POSTs to /v4/spreadsheets/{id}/values:batchUpdate with Bearer auth + JSON body", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      body: { spreadsheetId: "ss-1", responses: [] },
    });

    await valuesBatchUpdate({
      accessToken: "ya29.token",
      spreadsheetId: "ss-1",
      valueInputOption: "USER_ENTERED",
      data: [{ range: "Sheet1!A1", values: [["hello"]] }],
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = fetchSpy.mock.calls[0]![0];
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(String(url)).toBe(
      "https://sheets.googleapis.com/v4/spreadsheets/ss-1/values:batchUpdate",
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

  it("sends body { valueInputOption, data: [{range, values}] }", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, body: {} });

    await valuesBatchUpdate({
      accessToken: "t",
      spreadsheetId: "ss",
      valueInputOption: "RAW",
      data: [
        { range: "Sheet1!A1", values: [["one"]] },
        { range: "Sheet1!B2:C3", values: [["b2", "c2"], ["b3", "c3"]] },
      ],
    });

    const body = JSON.parse(
      fetchSpy.mock.calls[0]![1]!.body as string,
    );
    expect(body).toEqual({
      valueInputOption: "RAW",
      data: [
        { range: "Sheet1!A1", values: [["one"]] },
        { range: "Sheet1!B2:C3", values: [["b2", "c2"], ["b3", "c3"]] },
      ],
    });
    // valueInputOption MUST live in the body (not the URL) for
    // values:batchUpdate. Distinct from values.update / values.append
    // which read it from the query string.
    expect(String(fetchSpy.mock.calls[0]![0])).not.toMatch(/[?&]valueInputOption=/);
  });

  it("forwards RAW valueInputOption when chosen", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, body: {} });

    await valuesBatchUpdate({
      accessToken: "t",
      spreadsheetId: "ss",
      valueInputOption: "RAW",
      data: [{ range: "Sheet1!A1", values: [["=SUM(A2:A10)"]] }],
    });

    const body = JSON.parse(
      fetchSpy.mock.calls[0]![1]!.body as string,
    );
    expect(body.valueInputOption).toBe("RAW");
  });

  it("URL-encodes the spreadsheetId", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, body: {} });

    await valuesBatchUpdate({
      accessToken: "t",
      spreadsheetId: "id with spaces/and slashes",
      valueInputOption: "RAW",
      data: [{ range: "Sheet1!A1", values: [["x"]] }],
    });

    const url = fetchSpy.mock.calls[0]![0];
    expect(String(url)).toBe(
      "https://sheets.googleapis.com/v4/spreadsheets/id%20with%20spaces%2Fand%20slashes/values:batchUpdate",
    );
  });

  it("omits includeValuesInResponse + responseValueRenderOption by default", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, body: {} });

    await valuesBatchUpdate({
      accessToken: "t",
      spreadsheetId: "ss",
      valueInputOption: "RAW",
      data: [{ range: "Sheet1!A1", values: [["x"]] }],
    });

    const body = JSON.parse(
      fetchSpy.mock.calls[0]![1]!.body as string,
    );
    expect(body.includeValuesInResponse).toBeUndefined();
    expect(body.responseValueRenderOption).toBeUndefined();
  });

  it("forwards includeValuesInResponse=true + responseValueRenderOption when set", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, body: {} });

    await valuesBatchUpdate({
      accessToken: "t",
      spreadsheetId: "ss",
      valueInputOption: "USER_ENTERED",
      data: [{ range: "Sheet1!A1", values: [["x"]] }],
      includeValuesInResponse: true,
      responseValueRenderOption: "UNFORMATTED_VALUE",
    });

    const body = JSON.parse(
      fetchSpy.mock.calls[0]![1]!.body as string,
    );
    expect(body.includeValuesInResponse).toBe(true);
    expect(body.responseValueRenderOption).toBe("UNFORMATTED_VALUE");
  });

  it("honors GOOGLE_SHEETS_API_BASE env override", async () => {
    process.env.GOOGLE_SHEETS_API_BASE = "http://localhost:9999";
    const fetchSpy = mockFetchOnce({ ok: true, body: {} });

    await valuesBatchUpdate({
      accessToken: "t",
      spreadsheetId: "ss",
      valueInputOption: "RAW",
      data: [{ range: "Sheet1!A1", values: [["x"]] }],
    });

    const url = fetchSpy.mock.calls[0]![0];
    expect(String(url)).toBe(
      "http://localhost:9999/v4/spreadsheets/ss/values:batchUpdate",
    );
  });
});

describe("valuesBatchUpdate — response handling", () => {
  it("returns the parsed JSON response (passthrough)", async () => {
    mockFetchOnce({
      ok: true,
      body: {
        spreadsheetId: "ss",
        totalUpdatedRows: 3,
        totalUpdatedColumns: 5,
        totalUpdatedCells: 7,
        totalUpdatedSheets: 1,
        responses: [
          {
            spreadsheetId: "ss",
            updatedRange: "Sheet1!A1",
            updatedRows: 1,
            updatedColumns: 1,
            updatedCells: 1,
          },
          {
            spreadsheetId: "ss",
            updatedRange: "Sheet1!B2:C3",
            updatedRows: 2,
            updatedColumns: 2,
            updatedCells: 4,
          },
        ],
      },
    });

    const result = await valuesBatchUpdate({
      accessToken: "t",
      spreadsheetId: "ss",
      valueInputOption: "USER_ENTERED",
      data: [{ range: "Sheet1!A1", values: [["x"]] }],
    });

    expect(result.spreadsheetId).toBe("ss");
    expect(result.totalUpdatedCells).toBe(7);
    expect(result.responses).toHaveLength(2);
  });
});

describe("valuesBatchUpdate — error mapping (matches existing wrappers)", () => {
  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({
      status: 401,
      body: { error: { code: 401, message: "Invalid auth" } },
    });

    await expect(
      valuesBatchUpdate({
        accessToken: "t",
        spreadsheetId: "ss",
        valueInputOption: "RAW",
        data: [{ range: "Sheet1!A1", values: [["x"]] }],
      }),
    ).rejects.toThrow(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404 (missing spreadsheet)", async () => {
    mockFetchOnce({
      status: 404,
      body: { error: { code: 404, message: "Requested entity was not found." } },
    });

    await expect(
      valuesBatchUpdate({
        accessToken: "t",
        spreadsheetId: "missing",
        valueInputOption: "RAW",
        data: [{ range: "Sheet1!A1", values: [["x"]] }],
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
          message: "Unable to parse range: Missing!A1",
        },
      },
    });

    await expect(
      valuesBatchUpdate({
        accessToken: "t",
        spreadsheetId: "ss",
        valueInputOption: "RAW",
        data: [{ range: "Missing!A1", values: [["x"]] }],
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
      valuesBatchUpdate({
        accessToken: "t",
        spreadsheetId: "ss",
        valueInputOption: "RAW",
        data: [{ range: "Sheet1!A1", values: [["x"]] }],
      }),
    ).rejects.toThrow(/values.batchUpdate failed: Bad request body/);
  });

  it("throws generic Error on HTTP 500 with surfaced message", async () => {
    mockFetchOnce({
      status: 500,
      body: { error: { code: 500, message: "Backend error" } },
    });

    await expect(
      valuesBatchUpdate({
        accessToken: "t",
        spreadsheetId: "ss",
        valueInputOption: "RAW",
        data: [{ range: "Sheet1!A1", values: [["x"]] }],
      }),
    ).rejects.toThrow(/values.batchUpdate failed: Backend error/);
  });

  it("falls back to HTTP code when the body isn't valid JSON", async () => {
    mockFetchOnce({ status: 503, body: "<html>Service Unavailable</html>" });

    await expect(
      valuesBatchUpdate({
        accessToken: "t",
        spreadsheetId: "ss",
        valueInputOption: "RAW",
        data: [{ range: "Sheet1!A1", values: [["x"]] }],
      }),
    ).rejects.toThrow(/values.batchUpdate failed: HTTP 503/);
  });
});
