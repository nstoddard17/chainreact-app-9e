/**
 * @jest-environment node
 *
 * Shared Google Workspace metadata reader (Slice ANALYTICS-SOURCES-GWORKSPACE-1):
 * verifies the flat MIME-filtered Drive files.list scan — minimal field mask
 * (createdTime,modifiedTime only — no name/id/webViewLink/owners), pagination via
 * nextPageToken, the MAX_PAGES truncation budget, no-content projection, and typed
 * error mapping (401 / 429 / generic). `fetch` is mocked — no network.
 */

import {
  scanWorkspaceFiles,
  GoogleWorkspaceRateLimitError,
  PAGE_SIZE,
} from "@/services/analytics/sources/_shared/googleWorkspaceFiles";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

const DOC_MIME = "application/vnd.google-apps.document";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** A Drive file with extra (sensitive) fields present — to prove the reader discards them. */
function file(createdTime: string, modifiedTime: string) {
  return {
    id: "FILEID123",
    name: "Secret Quarterly Plan",
    mimeType: DOC_MIME,
    createdTime,
    modifiedTime,
    webViewLink: "https://docs.google.com/x",
    owners: [{ emailAddress: "alice@example.com" }],
  };
}

afterEach(() => jest.restoreAllMocks());

describe("scanWorkspaceFiles", () => {
  it("requests a minimal field mask + mimeType/trashed query and projects {createdMs, modifiedMs}", async () => {
    const urls: string[] = [];
    global.fetch = jest.fn(async (url: string) => {
      urls.push(url);
      return jsonResponse({ files: [file("2026-06-01T09:00:00Z", "2026-06-02T09:00:00Z")] });
    }) as unknown as typeof fetch;

    const r = await scanWorkspaceFiles("tok", DOC_MIME);
    expect(r.facts).toEqual([
      { createdMs: Date.parse("2026-06-01T09:00:00Z"), modifiedMs: Date.parse("2026-06-02T09:00:00Z") },
    ]);
    expect(r.truncated).toBe(false);
    const u = new URL(urls[0]!);
    expect(u.searchParams.get("fields")).toBe("nextPageToken,files(createdTime,modifiedTime)");
    expect(u.searchParams.get("q")).toBe(`mimeType='${DOC_MIME}' and trashed=false`);
    expect(u.searchParams.get("pageSize")).toBe(String(PAGE_SIZE));
  });

  it("never carries file name / owners / webViewLink into the result", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({ files: [file("2026-06-01T00:00:00Z", "2026-06-02T00:00:00Z")] }),
    ) as unknown as typeof fetch;
    const r = await scanWorkspaceFiles("tok", DOC_MIME);
    expect(JSON.stringify(r)).not.toMatch(/Secret Quarterly Plan|FILEID123|alice@example|webViewLink|docs\.google/i);
  });

  it("paginates via nextPageToken until exhausted", async () => {
    const urls: string[] = [];
    let call = 0;
    global.fetch = jest.fn(async (url: string) => {
      urls.push(url);
      call++;
      if (call === 1) {
        return jsonResponse({
          files: [file("2026-06-01T00:00:00Z", "2026-06-01T00:00:00Z")],
          nextPageToken: "TOKEN2",
        });
      }
      return jsonResponse({ files: [file("2026-06-02T00:00:00Z", "2026-06-02T00:00:00Z")] });
    }) as unknown as typeof fetch;
    const r = await scanWorkspaceFiles("tok", DOC_MIME);
    expect(r.facts).toHaveLength(2);
    expect(r.truncated).toBe(false);
    expect(new URL(urls[1]!).searchParams.get("pageToken")).toBe("TOKEN2");
  });

  it("reports truncated when the page budget is exhausted", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({ files: [file("2026-06-01T00:00:00Z", "2026-06-01T00:00:00Z")], nextPageToken: "more" }),
    ) as unknown as typeof fetch;
    const r = await scanWorkspaceFiles("tok", DOC_MIME, { maxPages: 2 });
    expect(r.truncated).toBe(true);
    expect(r.facts).toHaveLength(2);
  });

  it("maps 401 → Unauthorized401Error and 429 → GoogleWorkspaceRateLimitError", async () => {
    global.fetch = jest.fn(async () => jsonResponse({}, 401)) as unknown as typeof fetch;
    await expect(scanWorkspaceFiles("tok", DOC_MIME)).rejects.toBeInstanceOf(Unauthorized401Error);
    global.fetch = jest.fn(async () => jsonResponse({}, 429)) as unknown as typeof fetch;
    await expect(scanWorkspaceFiles("tok", DOC_MIME)).rejects.toBeInstanceOf(GoogleWorkspaceRateLimitError);
  });

  it("other non-ok → generic Error with sanitized detail (no token)", async () => {
    global.fetch = jest.fn(async () => jsonResponse({ error: { message: "backend hiccup" } }, 500)) as unknown as typeof fetch;
    const err = await scanWorkspaceFiles("tok", DOC_MIME).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).not.toContain("tok");
  });
});
