/**
 * @jest-environment node
 *
 * Bounded, count-only + metadata-only Microsoft OneNote readers (Slice
 * ANALYTICS-SOURCES-ONENOTE-1): verifies the minimal $select field masks, notebook /
 * section counting with paging, the account-wide page scan (createdDateTime +
 * lastModifiedDateTime only — never title/content/links/author), pagination via
 * @odata.nextLink, the page-scan truncation budget, and typed Graph error mapping.
 * `fetch` is mocked — no network.
 */

import {
  countNotebooks,
  countSections,
  scanPageTimestamps,
  OneNoteRateLimitError,
  PAGE_SIZE,
} from "@/services/analytics/sources/microsoft-onenote/api";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** A OneNote page with sensitive fields present — to prove the reader discards them. */
function page(createdDateTime: string, lastModifiedDateTime: string) {
  return {
    id: "1-abcPAGEID",
    title: "My Secret Meeting Notes",
    createdDateTime,
    lastModifiedDateTime,
    contentUrl: "https://graph.microsoft.com/.../content",
    links: { oneNoteWebUrl: { href: "https://onenote.com/x" } },
    createdByAppId: "app-123",
  };
}

afterEach(() => jest.restoreAllMocks());

describe("countNotebooks / countSections", () => {
  it("count notebooks with an id-only $select", async () => {
    const urls: string[] = [];
    global.fetch = jest.fn(async (url: string) => {
      urls.push(url);
      return jsonResponse({ value: [{ id: "n1" }, { id: "n2" }, { id: "n3" }] });
    }) as unknown as typeof fetch;
    const r = await countNotebooks("tok");
    expect(r).toEqual({ count: 3, truncated: false });
    const u = new URL(urls[0]!);
    expect(u.pathname).toContain("/me/onenote/notebooks");
    expect(u.searchParams.get("$select")).toBe("id");
  });

  it("count sections, paging via @odata.nextLink", async () => {
    let call = 0;
    global.fetch = jest.fn(async () => {
      call++;
      if (call === 1) {
        return jsonResponse({ value: [{ id: "s1" }, { id: "s2" }], "@odata.nextLink": "https://graph/next" });
      }
      return jsonResponse({ value: [{ id: "s3" }] });
    }) as unknown as typeof fetch;
    const r = await countSections("tok");
    expect(r.count).toBe(3);
    expect(r.truncated).toBe(false);
  });
});

describe("scanPageTimestamps", () => {
  it("requests createdDateTime/lastModifiedDateTime only and projects {createdMs, modifiedMs}", async () => {
    const urls: string[] = [];
    global.fetch = jest.fn(async (url: string) => {
      urls.push(url);
      return jsonResponse({ value: [page("2026-06-01T09:00:00Z", "2026-06-02T09:00:00Z")] });
    }) as unknown as typeof fetch;
    const r = await scanPageTimestamps("tok");
    expect(r.facts).toEqual([
      { createdMs: Date.parse("2026-06-01T09:00:00Z"), modifiedMs: Date.parse("2026-06-02T09:00:00Z") },
    ]);
    const u = new URL(urls[0]!);
    expect(u.pathname).toContain("/me/onenote/pages");
    expect(u.searchParams.get("$select")).toBe("createdDateTime,lastModifiedDateTime");
    expect(u.searchParams.get("$top")).toBe(String(PAGE_SIZE));
  });

  it("never carries page title / content / links / author into the result", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({ value: [page("2026-06-01T00:00:00Z", "2026-06-02T00:00:00Z")] }),
    ) as unknown as typeof fetch;
    const r = await scanPageTimestamps("tok");
    expect(JSON.stringify(r)).not.toMatch(/Secret Meeting Notes|abcPAGEID|contentUrl|onenote\.com|createdByAppId|title/i);
  });

  it("paginates via @odata.nextLink until exhausted", async () => {
    let call = 0;
    global.fetch = jest.fn(async () => {
      call++;
      if (call === 1) {
        return jsonResponse({
          value: [page("2026-06-01T00:00:00Z", "2026-06-01T00:00:00Z")],
          "@odata.nextLink": "https://graph/pages-2",
        });
      }
      return jsonResponse({ value: [page("2026-06-02T00:00:00Z", "2026-06-02T00:00:00Z")] });
    }) as unknown as typeof fetch;
    const r = await scanPageTimestamps("tok");
    expect(r.facts).toHaveLength(2);
    expect(r.truncated).toBe(false);
  });

  it("reports truncated when the page-scan budget is exhausted", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({ value: [page("2026-06-01T00:00:00Z", "2026-06-01T00:00:00Z")], "@odata.nextLink": "https://graph/more" }),
    ) as unknown as typeof fetch;
    const r = await scanPageTimestamps("tok", { maxPages: 2 });
    expect(r.truncated).toBe(true);
    expect(r.facts).toHaveLength(2);
  });

  it("maps Graph errors: 401 → Unauthorized401Error, 429 → OneNoteRateLimitError, 404 → NotFoundError", async () => {
    global.fetch = jest.fn(async () => jsonResponse({}, 401)) as unknown as typeof fetch;
    await expect(scanPageTimestamps("tok")).rejects.toBeInstanceOf(Unauthorized401Error);
    global.fetch = jest.fn(async () => jsonResponse({}, 429)) as unknown as typeof fetch;
    await expect(scanPageTimestamps("tok")).rejects.toBeInstanceOf(OneNoteRateLimitError);
    global.fetch = jest.fn(async () => jsonResponse({ error: { message: "not found" } }, 404)) as unknown as typeof fetch;
    await expect(scanPageTimestamps("tok")).rejects.toBeInstanceOf(NotFoundError);
  });
});
