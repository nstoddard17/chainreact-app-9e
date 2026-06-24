/**
 * @jest-environment node
 *
 * Tests for the Google Sheets `cellFormatGet` API wrapper (the bounded format
 * read-back behind the format_range write smoke). Mocks fetch and verifies:
 *   - the request is bounded: ranges = the single cell, includeGridData=true, and a
 *     `fields` mask that requests ONLY userEnteredFormat sub-fields (no cell values);
 *   - parsing of bold / italic / horizontalAlignment from the grid response;
 *   - sanitization: absent format fields -> null; an unexpected alignment -> null;
 *   - the 401 -> Unauthorized401Error / 404 -> NotFoundError contracts.
 */
import { cellFormatGet } from "@/integrations/google-sheets/api/cellFormatGet";
import { NotFoundError } from "@/integrations/google-sheets/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset?.();
});
afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.GOOGLE_SHEETS_API_BASE;
});

function mockFetchOnce(response: { status?: number; body: unknown }) {
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(
        typeof response.body === "string" ? response.body : JSON.stringify(response.body),
        { status: response.status ?? 200 },
      ),
    );
}

const gridBody = (uef: unknown) => ({
  sheets: [{ data: [{ rowData: [{ values: [{ userEnteredFormat: uef }] }] }] }],
});

describe("cellFormatGet — request shape (bounded)", () => {
  it("GETs spreadsheets/{id} with ranges, includeGridData=true, and a format-only fields mask", async () => {
    const fetchSpy = mockFetchOnce({ body: gridBody({ textFormat: { bold: true } }) });
    await cellFormatGet({ accessToken: "ya29.tok", spreadsheetId: "ss-1", range: "Data!A1" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = new URL(fetchSpy.mock.calls[0]![0] as string);
    expect(url.pathname).toMatch(/\/v4\/spreadsheets\/ss-1$/);
    expect(url.searchParams.get("ranges")).toBe("Data!A1");
    expect(url.searchParams.get("includeGridData")).toBe("true");
    const fields = url.searchParams.get("fields")!;
    expect(fields).toContain("userEnteredFormat");
    expect(fields).toContain("textFormat(bold,italic)");
    expect(fields).toContain("horizontalAlignment");
    // SAFETY: the mask must NOT pull any cell VALUE / content.
    expect(fields).not.toMatch(/effectiveValue|formattedValue|userEnteredValue/);
    // Bearer auth.
    const init = fetchSpy.mock.calls[0]![1] as { headers?: Record<string, string> };
    expect(init.headers?.Authorization).toBe("Bearer ya29.tok");
  });
});

describe("cellFormatGet — parsing + sanitization", () => {
  it("parses bold/italic/horizontalAlignment", async () => {
    mockFetchOnce({ body: gridBody({ textFormat: { bold: true, italic: false }, horizontalAlignment: "CENTER" }) });
    const out = await cellFormatGet({ accessToken: "t", spreadsheetId: "ss", range: "Data!A1" });
    expect(out).toEqual({ bold: true, italic: false, horizontalAlignment: "CENTER" });
  });

  it("absent format fields -> null (a fresh, unformatted cell)", async () => {
    mockFetchOnce({ body: gridBody({}) });
    expect(await cellFormatGet({ accessToken: "t", spreadsheetId: "ss", range: "Data!A1" })).toEqual({
      bold: null,
      italic: null,
      horizontalAlignment: null,
    });
  });

  it("an empty grid (no rowData at all) -> all null", async () => {
    mockFetchOnce({ body: { sheets: [{ data: [{}] }] } });
    expect(await cellFormatGet({ accessToken: "t", spreadsheetId: "ss", range: "Data!A1" })).toEqual({
      bold: null,
      italic: null,
      horizontalAlignment: null,
    });
  });

  it("an unexpected alignment value is coerced to null (no arbitrary string leaks)", async () => {
    mockFetchOnce({ body: gridBody({ horizontalAlignment: "JUSTIFIED_WEIRD" }) });
    const out = await cellFormatGet({ accessToken: "t", spreadsheetId: "ss", range: "Data!A1" });
    expect(out.horizontalAlignment).toBeNull();
  });

  it("a non-boolean bold is coerced to null", async () => {
    mockFetchOnce({ body: gridBody({ textFormat: { bold: "yes" } }) });
    const out = await cellFormatGet({ accessToken: "t", spreadsheetId: "ss", range: "Data!A1" });
    expect(out.bold).toBeNull();
  });
});

describe("cellFormatGet — error contracts", () => {
  it("401 -> Unauthorized401Error (refreshAndRetry contract)", async () => {
    mockFetchOnce({ status: 401, body: "" });
    await expect(cellFormatGet({ accessToken: "t", spreadsheetId: "ss", range: "Data!A1" })).rejects.toBeInstanceOf(
      Unauthorized401Error,
    );
  });

  it("404 -> NotFoundError", async () => {
    mockFetchOnce({ status: 404, body: { error: { message: "Requested entity was not found." } } });
    await expect(cellFormatGet({ accessToken: "t", spreadsheetId: "ss", range: "Data!A1" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("other non-2xx -> generic Error", async () => {
    mockFetchOnce({ status: 500, body: { error: { message: "backend error" } } });
    await expect(cellFormatGet({ accessToken: "t", spreadsheetId: "ss", range: "Data!A1" })).rejects.toThrow(
      /backend error/,
    );
  });
});
