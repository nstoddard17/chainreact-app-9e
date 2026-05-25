/**
 * @jest-environment node
 */
import { worksheetUsedRange } from "@/integrations/microsoft-excel/api/worksheetUsedRange";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.MICROSOFT_GRAPH_API_BASE;
});

function mockFetchOnce(opts: {
  ok: boolean;
  status?: number;
  json?: unknown;
  bodyText?: string;
}) {
  const status = opts.status ?? (opts.ok ? 200 : 500);
  const body =
    opts.bodyText !== undefined
      ? opts.bodyText
      : opts.json !== undefined
        ? JSON.stringify(opts.json)
        : "";
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(body, { status }));
}

describe("worksheetUsedRange wrapper", () => {
  it("GETs workbook usedRange endpoint with default valuesOnly=true", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { address: "Sheet1!A1:B2", rowCount: 2, columnCount: 2, values: [] },
    });

    await worksheetUsedRange({
      accessToken: "t",
      workbookId: "wb-1",
      worksheetName: "Sheet1",
    });

    expect(fetchSpy.mock.calls[0]![0]).toContain(
      "/v1.0/me/drive/items/wb-1/workbook/worksheets('Sheet1')/usedRange(valuesOnly=true)",
    );
  });

  it("URL-encodes workbook id and worksheet name with edge chars", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { address: "A1", rowCount: 1, columnCount: 1, values: [] },
    });

    await worksheetUsedRange({
      accessToken: "t",
      workbookId: "wb+id/with=chars",
      worksheetName: "Q2 Report",
    });

    expect(fetchSpy.mock.calls[0]![0]).toContain(
      "wb%2Bid%2Fwith%3Dchars/workbook/worksheets('Q2%20Report')/usedRange",
    );
  });

  it("honors valuesOnly=false when explicitly requested", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { address: "A1", rowCount: 1, columnCount: 1, values: [] },
    });

    await worksheetUsedRange({
      accessToken: "t",
      workbookId: "wb-1",
      worksheetName: "Sheet1",
      valuesOnly: false,
    });

    expect(fetchSpy.mock.calls[0]![0]).toContain("usedRange(valuesOnly=false)");
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({ ok: false, status: 401 });

    await expect(
      worksheetUsedRange({
        accessToken: "stale",
        workbookId: "wb-1",
        worksheetName: "Sheet1",
      }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404 (worksheet missing)", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      bodyText: '{"error":{"code":"itemNotFound"}}',
    });

    await expect(
      worksheetUsedRange({
        accessToken: "t",
        workbookId: "wb-1",
        worksheetName: "Gone",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
