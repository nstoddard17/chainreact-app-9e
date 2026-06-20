/**
 * @jest-environment node
 *
 * Slice 4.EXCEL-READ-2 — worksheetRangeGet wrapper (caller-specified A1
 * range read). Pins URL construction (range(address=...) on the encoded
 * worksheet path) + the 401/404/error mapping shared by the Excel wrappers.
 */
import { worksheetRangeGet } from "@/integrations/microsoft-excel/api/worksheetRangeGet";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.MICROSOFT_GRAPH_API_BASE;
});

function mockFetchOnce(opts: { ok: boolean; status?: number; json?: unknown; bodyText?: string }) {
  const status = opts.status ?? (opts.ok ? 200 : 500);
  const body =
    opts.bodyText !== undefined
      ? opts.bodyText
      : opts.json !== undefined
        ? JSON.stringify(opts.json)
        : "";
  return jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(body, { status }));
}

describe("worksheetRangeGet wrapper", () => {
  it("GETs the range(address=...) endpoint on the encoded worksheet path", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { address: "Sheet1!A1:B2", rowCount: 2, columnCount: 2, values: [] },
    });

    await worksheetRangeGet({
      accessToken: "t",
      workbookId: "wb-1",
      worksheetName: "Sheet1",
      address: "A1:B2",
    });

    expect(fetchSpy.mock.calls[0]![0]).toContain(
      "/v1.0/me/drive/items/wb-1/workbook/worksheets('Sheet1')/range(address='A1%3AB2')",
    );
  });

  it("URL-encodes workbook id, worksheet name, and address edge chars", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { address: "A1", rowCount: 1, columnCount: 1, values: [] },
    });

    await worksheetRangeGet({
      accessToken: "t",
      workbookId: "wb+id/x",
      worksheetName: "Q2 Report",
      address: "A1:D10",
    });

    expect(fetchSpy.mock.calls[0]![0]).toContain(
      "wb%2Bid%2Fx/workbook/worksheets('Q2%20Report')/range(address='A1%3AD10')",
    );
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({ ok: false, status: 401 });
    await expect(
      worksheetRangeGet({ accessToken: "stale", workbookId: "wb-1", worksheetName: "Sheet1", address: "A1" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404", async () => {
    mockFetchOnce({ ok: false, status: 404, bodyText: '{"error":{"code":"itemNotFound"}}' });
    await expect(
      worksheetRangeGet({ accessToken: "t", workbookId: "wb-1", worksheetName: "Gone", address: "A1" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
