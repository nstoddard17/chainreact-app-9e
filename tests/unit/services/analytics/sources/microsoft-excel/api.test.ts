/**
 * @jest-environment node
 *
 * Bounded, metadata-only Microsoft Excel workbook reader (Slice ANALYTICS-SOURCES-EXCEL-1):
 * verifies the whole-drive .xlsx search — minimal $select (createdDateTime,
 * lastModifiedDateTime, file), MIME-type filtering (non-xlsx + folders excluded),
 * pagination via @odata.nextLink, the MAX_PAGES truncation budget, no name/webUrl/size
 * leak, and typed Graph error mapping (401 / 429 / generic). `fetch` is mocked — no
 * network.
 */

import {
  scanWorkbooks,
  ExcelRateLimitError,
  PAGE_SIZE,
} from "@/services/analytics/sources/microsoft-excel/api";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** A drive item with extra (sensitive) fields present — to prove the reader discards them. */
function workbook(createdDateTime: string, lastModifiedDateTime: string) {
  return {
    id: "01ITEMID",
    name: "Secret Budget.xlsx",
    webUrl: "https://onedrive.live.com/x",
    size: 12345,
    createdDateTime,
    lastModifiedDateTime,
    file: { mimeType: XLSX_MIME },
  };
}

afterEach(() => jest.restoreAllMocks());

describe("scanWorkbooks", () => {
  it("requests createdDateTime/lastModifiedDateTime/file via search and projects {createdMs, modifiedMs}", async () => {
    const urls: string[] = [];
    global.fetch = jest.fn(async (url: string) => {
      urls.push(url);
      return jsonResponse({ value: [workbook("2026-06-01T09:00:00Z", "2026-06-02T09:00:00Z")] });
    }) as unknown as typeof fetch;
    const r = await scanWorkbooks("tok");
    expect(r.facts).toEqual([
      { createdMs: Date.parse("2026-06-01T09:00:00Z"), modifiedMs: Date.parse("2026-06-02T09:00:00Z") },
    ]);
    expect(r.truncated).toBe(false);
    const u = new URL(urls[0]!);
    expect(u.pathname).toContain("/me/drive/root/search(q='xlsx')");
    expect(u.searchParams.get("$select")).toBe("createdDateTime,lastModifiedDateTime,file");
    expect(u.searchParams.get("$top")).toBe(String(PAGE_SIZE));
  });

  it("excludes non-xlsx items and folders (mimeType filter)", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({
        value: [
          workbook("2026-06-01T00:00:00Z", "2026-06-01T00:00:00Z"), // xlsx → kept
          { createdDateTime: "2026-06-01T00:00:00Z", lastModifiedDateTime: "2026-06-01T00:00:00Z", file: { mimeType: "application/pdf" } },
          { createdDateTime: "2026-06-01T00:00:00Z", lastModifiedDateTime: "2026-06-01T00:00:00Z", folder: {} }, // folder, no file facet
        ],
      }),
    ) as unknown as typeof fetch;
    const r = await scanWorkbooks("tok");
    expect(r.facts).toHaveLength(1);
  });

  it("never carries the workbook name / webUrl / size into the result", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({ value: [workbook("2026-06-01T00:00:00Z", "2026-06-02T00:00:00Z")] }),
    ) as unknown as typeof fetch;
    const r = await scanWorkbooks("tok");
    expect(JSON.stringify(r)).not.toMatch(/Secret Budget|01ITEMID|onedrive\.live|\.xlsx|webUrl|12345/i);
  });

  it("paginates via @odata.nextLink until exhausted", async () => {
    let call = 0;
    global.fetch = jest.fn(async () => {
      call++;
      if (call === 1) {
        return jsonResponse({
          value: [workbook("2026-06-01T00:00:00Z", "2026-06-01T00:00:00Z")],
          "@odata.nextLink": "https://graph.microsoft.com/next",
        });
      }
      return jsonResponse({ value: [workbook("2026-06-02T00:00:00Z", "2026-06-02T00:00:00Z")] });
    }) as unknown as typeof fetch;
    const r = await scanWorkbooks("tok");
    expect(r.facts).toHaveLength(2);
    expect(r.truncated).toBe(false);
  });

  it("reports truncated when the page budget is exhausted", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({ value: [workbook("2026-06-01T00:00:00Z", "2026-06-01T00:00:00Z")], "@odata.nextLink": "https://graph.microsoft.com/more" }),
    ) as unknown as typeof fetch;
    const r = await scanWorkbooks("tok", { maxPages: 2 });
    expect(r.truncated).toBe(true);
    expect(r.facts).toHaveLength(2);
  });

  it("maps Graph errors: 401 → Unauthorized401Error, 429 → ExcelRateLimitError", async () => {
    global.fetch = jest.fn(async () => jsonResponse({}, 401)) as unknown as typeof fetch;
    await expect(scanWorkbooks("tok")).rejects.toBeInstanceOf(Unauthorized401Error);
    global.fetch = jest.fn(async () => jsonResponse({}, 429)) as unknown as typeof fetch;
    await expect(scanWorkbooks("tok")).rejects.toBeInstanceOf(ExcelRateLimitError);
  });

  it("other non-ok → generic Error with sanitized detail (no token)", async () => {
    global.fetch = jest.fn(async () => jsonResponse({ error: { message: "boom" } }, 500)) as unknown as typeof fetch;
    const err = await scanWorkbooks("tok").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).not.toContain("tok");
  });
});
