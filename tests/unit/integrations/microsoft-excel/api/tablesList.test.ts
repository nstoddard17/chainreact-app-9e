/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-excel/api/tablesList.ts` —
 * Slice 4.EXCEL-META-2. Mirrors the worksheetsList/workbooksList wrapper
 * tests: pins the Graph URL, value[] mapping, and 401/404 error surfaces.
 * No real network — fetch is spied.
 */
import { tablesList } from "@/integrations/microsoft-excel/api/tablesList";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";

afterEach(() => {
  jest.restoreAllMocks();
});

function mockFetchOnce(opts: { ok: boolean; status?: number; json?: unknown }) {
  const status = opts.status ?? (opts.ok ? 200 : 500);
  const body = opts.json !== undefined ? JSON.stringify(opts.json) : "";
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(body, { status }));
}

describe("tablesList wrapper", () => {
  it("GETs the workbook tables endpoint with the workbookId path-encoded", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: {
        value: [
          { id: "{t-1}", name: "Sales", showHeaders: true },
          { id: "{t-2}", name: "Budget" },
        ],
      },
    });

    const tables = await tablesList({ accessToken: "t", workbookId: "wb 1" });

    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("/v1.0/me/drive/items/wb%201/workbook/tables");
    expect(tables).toHaveLength(2);
    expect(tables[0]).toMatchObject({ id: "{t-1}", name: "Sales" });
  });

  it("returns [] when Graph omits value", async () => {
    mockFetchOnce({ ok: true, json: {} });
    const tables = await tablesList({ accessToken: "t", workbookId: "wb-1" });
    expect(tables).toEqual([]);
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({ ok: false, status: 401 });
    await expect(
      tablesList({ accessToken: "stale", workbookId: "wb-1" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404 (workbook missing / no access)", async () => {
    mockFetchOnce({ ok: false, status: 404, json: { error: { message: "x" } } });
    await expect(
      tablesList({ accessToken: "t", workbookId: "wb-ghost" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
