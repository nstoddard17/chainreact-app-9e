/**
 * @jest-environment node
 *
 * Slice 4.EXCEL-READ-2 — focused coverage for the optional `$top` cap added
 * to tableRowsList (consumed by read_table_rows + find_row). The base URL
 * (no $top) stays unchanged so the existing polling-trigger consumer is
 * unaffected.
 */
import { tableRowsList } from "@/integrations/microsoft-excel/api/tableRowsList";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.MICROSOFT_GRAPH_API_BASE;
});

function mockFetchOnce(opts: { ok: boolean; status?: number; json?: unknown }) {
  const status = opts.status ?? (opts.ok ? 200 : 500);
  const body = opts.json !== undefined ? JSON.stringify(opts.json) : "";
  return jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(body, { status }));
}

describe("tableRowsList wrapper — $top cap", () => {
  it("appends $top when top is supplied", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { value: [] } });
    await tableRowsList({ accessToken: "t", workbookId: "wb-1", tableName: "Table1", top: 25 });
    expect(fetchSpy.mock.calls[0]![0]).toContain(
      "/workbook/tables/Table1/rows?$top=25",
    );
  });

  it("omits $top entirely when top is not supplied (trigger path unchanged)", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { value: [] } });
    await tableRowsList({ accessToken: "t", workbookId: "wb-1", tableName: "Table1" });
    const url = String(fetchSpy.mock.calls[0]![0]);
    expect(url).toContain("/workbook/tables/Table1/rows");
    expect(url).not.toContain("$top");
  });

  it("returns the rows collection value array", async () => {
    mockFetchOnce({ ok: true, json: { value: [{ index: 0, values: [["a", "b"]] }] } });
    const rows = await tableRowsList({ accessToken: "t", workbookId: "wb-1", tableName: "Table1", top: 10 });
    expect(rows).toEqual([{ index: 0, values: [["a", "b"]] }]);
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({ ok: false, status: 401 });
    await expect(
      tableRowsList({ accessToken: "stale", workbookId: "wb-1", tableName: "Table1", top: 10 }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });
});
