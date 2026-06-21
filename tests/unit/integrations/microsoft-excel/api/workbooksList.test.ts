/**
 * @jest-environment node
 */
import { workbooksList } from "@/integrations/microsoft-excel/api/workbooksList";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

afterEach(() => {
  jest.restoreAllMocks();
});

function mockFetchOnce(opts: {
  ok: boolean;
  status?: number;
  json?: unknown;
}) {
  const status = opts.status ?? (opts.ok ? 200 : 500);
  const body = opts.json !== undefined ? JSON.stringify(opts.json) : "";
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(body, { status }));
}

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

describe("workbooksList wrapper", () => {
  it("lists root children WITHOUT a server-side $filter and keeps only .xlsx client-side", async () => {
    // Regression: OneDrive rejects `$filter` on /drive/root/children with HTTP
    // 400 notSupported, so the wrapper must list the page and filter in memory.
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: {
        value: [
          { id: "folder-1", name: "Coding" }, // folder (no file facet) — dropped
          { id: "doc-1", name: "notes.docx", file: { mimeType: "application/msword" } }, // non-xlsx — dropped
          {
            id: "wb-1",
            name: "Q1.xlsx",
            file: { mimeType: XLSX },
            webUrl: "https://1drv.ms/q1",
            size: 12345,
            lastModifiedDateTime: "2026-05-08T10:00:00Z",
          },
          { id: "wb-2", name: "Q2.xlsx" }, // xlsx by name suffix when the file facet is absent
        ],
        "@odata.nextLink": "https://graph.microsoft.com/v1.0/...&$skiptoken=x",
      },
    });

    const result = await workbooksList({ accessToken: "t" });

    const url = String(fetchSpy.mock.calls[0]![0]);
    expect(url).not.toMatch(/%24filter/); // no unsupported server-side filter
    expect(url).toMatch(/%24select=[^&]*file/); // requests the `file` facet
    expect(result.workbooks.map((w) => w.id)).toEqual(["wb-1", "wb-2"]); // folder + docx filtered out
    expect(result.workbooks[0]).toMatchObject({ id: "wb-1", name: "Q1.xlsx", size: 12345 });
    expect(result.nextLink).toMatch(/skiptoken/);
  });

  it("returns empty + nextLink null when the root page has no .xlsx", async () => {
    mockFetchOnce({ ok: true, json: { value: [{ id: "f", name: "Folder" }] } });

    const result = await workbooksList({ accessToken: "t" });

    expect(result.workbooks).toEqual([]);
    expect(result.nextLink).toBeNull();
  });

  it("caps the returned workbooks to `top` (client-side, after filtering)", async () => {
    mockFetchOnce({
      ok: true,
      json: {
        value: [
          { id: "a", name: "a.xlsx" },
          { id: "b", name: "b.xlsx" },
          { id: "c", name: "c.xlsx" },
        ],
      },
    });

    const result = await workbooksList({ accessToken: "t", top: 2 });

    expect(result.workbooks.map((w) => w.id)).toEqual(["a", "b"]);
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({ ok: false, status: 401 });

    await expect(
      workbooksList({ accessToken: "stale" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });
});
