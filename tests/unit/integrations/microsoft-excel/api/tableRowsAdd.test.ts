/**
 * @jest-environment node
 */
import { tableRowsAdd } from "@/integrations/microsoft-excel/api/tableRowsAdd";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

afterEach(() => {
  jest.restoreAllMocks();
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

describe("tableRowsAdd wrapper", () => {
  it("POSTs to workbook tables rows endpoint with values envelope", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { index: 2, values: [["a", "b", "c"]] },
    });

    const result = await tableRowsAdd({
      accessToken: "t",
      workbookId: "wb-1",
      tableName: "Table1",
      values: [["a", "b", "c"]],
    });

    expect(fetchSpy.mock.calls[0]![0]).toContain(
      "/v1.0/me/drive/items/wb-1/workbook/tables/Table1/rows",
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      values: [["a", "b", "c"]],
    });
    expect(result.index).toBe(2);
  });

  it("falls back to index=-1 when Graph omits the field", async () => {
    mockFetchOnce({ ok: true, json: {} });

    const result = await tableRowsAdd({
      accessToken: "t",
      workbookId: "wb-1",
      tableName: "Table1",
      values: [["x"]],
    });

    expect(result.index).toBe(-1);
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({ ok: false, status: 401 });

    await expect(
      tableRowsAdd({
        accessToken: "stale",
        workbookId: "wb-1",
        tableName: "Table1",
        values: [["x"]],
      }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404 (table missing)", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      bodyText: '{"error":{"code":"itemNotFound"}}',
    });

    await expect(
      tableRowsAdd({
        accessToken: "t",
        workbookId: "wb-1",
        tableName: "Gone",
        values: [["x"]],
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
