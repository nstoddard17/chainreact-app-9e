/**
 * @jest-environment node
 *
 * Bounded, metadata-only Google Drive reader (Slice ANALYTICS-SOURCES-GDRIVE-1):
 * verifies the BFS subtree traversal over Drive v3 `files.list`, the minimal field
 * mask (no name/webViewLink/owner requested beyond the transient name→type derive),
 * folder detection by MIME, pagination, the MAX_CALLS truncation budget, and typed
 * error mapping (401 / 429 / 400-404 / generic). `fetch` is mocked — no network.
 */

import {
  scanDrive,
  GoogleDriveRateLimitError,
  MAX_CALLS,
} from "@/services/analytics/sources/google-drive/api";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/google-drive/api/errors";

const FOLDER_MIME = "application/vnd.google-apps.folder";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** Extract the parent id from a files.list `q='<parent>' in parents` URL. */
function parentOf(url: string): string {
  const q = new URL(url).searchParams.get("q") ?? "";
  const m = q.match(/'([^']+)' in parents/);
  return m ? m[1]! : "";
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("scanDrive — BFS subtree traversal", () => {
  it("walks root + subfolders, projects files to {isFile, modifiedMs, ext}, folders to facts (recursing into them)", async () => {
    const fetchMock = jest.fn(async (url: string) => {
      const parent = parentOf(url);
      if (parent === "root") {
        return jsonResponse({
          files: [
            { id: "A", mimeType: FOLDER_MIME, name: "Folder A" },
            { id: "f1", mimeType: "application/pdf", name: "report.pdf", modifiedTime: "2026-06-01T09:00:00Z" },
            { id: "f2", mimeType: "application/vnd.google-apps.document", name: "Plan", modifiedTime: "2026-06-02T09:00:00Z" },
          ],
        });
      }
      if (parent === "A") {
        return jsonResponse({
          files: [
            { id: "f3", mimeType: "image/png", name: "diagram.png", modifiedTime: "2026-06-03T09:00:00Z" },
          ],
        });
      }
      return jsonResponse({ files: [] });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await scanDrive("tok", "");
    expect(result.truncated).toBe(false);
    // 1 folder + 3 files
    expect(result.facts.filter((f) => !f.isFile)).toHaveLength(1);
    const files = result.facts.filter((f) => f.isFile);
    expect(files).toHaveLength(3);
    expect(files.map((f) => f.ext).sort()).toEqual(["gdoc", "pdf", "png"]);
    // recursed into Folder A (root + A = 2 list calls)
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("requests a minimal field mask (id/mimeType/modifiedTime/name only — no webViewLink/size/owners)", async () => {
    const urls: string[] = [];
    global.fetch = jest.fn(async (url: string) => {
      urls.push(url);
      return jsonResponse({ files: [] });
    }) as unknown as typeof fetch;
    await scanDrive("tok", "");
    const fields = new URL(urls[0]!).searchParams.get("fields") ?? "";
    expect(fields).toContain("files(id,mimeType,modifiedTime,name)");
    expect(fields).not.toMatch(/webViewLink|webContentLink|thumbnail|size|owners|permissions|parents/i);
    // q excludes trashed
    expect(new URL(urls[0]!).searchParams.get("q")).toContain("trashed=false");
  });

  it("scopes the query to the selected folder id when provided", async () => {
    const urls: string[] = [];
    global.fetch = jest.fn(async (url: string) => {
      urls.push(url);
      return jsonResponse({ files: [] });
    }) as unknown as typeof fetch;
    await scanDrive("tok", "FOLDER123");
    expect(parentOf(urls[0]!)).toBe("FOLDER123");
  });

  it("follows nextPageToken within a folder", async () => {
    const urls: string[] = [];
    let call = 0;
    global.fetch = jest.fn(async (url: string) => {
      urls.push(url);
      call++;
      if (call === 1) {
        return jsonResponse({
          files: [{ id: "f1", mimeType: "application/pdf", name: "a.pdf", modifiedTime: "2026-06-01T00:00:00Z" }],
          nextPageToken: "PAGE2",
        });
      }
      return jsonResponse({
        files: [{ id: "f2", mimeType: "application/pdf", name: "b.pdf", modifiedTime: "2026-06-02T00:00:00Z" }],
      });
    }) as unknown as typeof fetch;
    const result = await scanDrive("tok", "");
    expect(result.facts.filter((f) => f.isFile)).toHaveLength(2);
    expect(new URL(urls[1]!).searchParams.get("pageToken")).toBe("PAGE2");
  });

  it("reports truncated:true when the MAX_CALLS budget is exhausted", async () => {
    // Every folder lists one more subfolder → unbounded tree, capped by the budget.
    const fetchMock = jest.fn(async (url: string) => {
      const parent = parentOf(url);
      return jsonResponse({ files: [{ id: `${parent}-child`, mimeType: FOLDER_MIME, name: "sub" }] });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const result = await scanDrive("tok", "", { maxCalls: 3 });
    expect(result.truncated).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(MAX_CALLS).toBeGreaterThan(0);
  });
});

describe("scanDrive — typed error mapping", () => {
  it("401 → Unauthorized401Error (for refreshAndRetry)", async () => {
    global.fetch = jest.fn(async () => jsonResponse({}, 401)) as unknown as typeof fetch;
    await expect(scanDrive("tok", "")).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("429 → GoogleDriveRateLimitError", async () => {
    global.fetch = jest.fn(async () => jsonResponse({}, 429)) as unknown as typeof fetch;
    await expect(scanDrive("tok", "")).rejects.toBeInstanceOf(GoogleDriveRateLimitError);
  });

  it("400 / 404 (bad folder) → NotFoundError", async () => {
    global.fetch = jest.fn(async () => jsonResponse({ error: { message: "File not found" } }, 404)) as unknown as typeof fetch;
    await expect(scanDrive("tok", "BAD")).rejects.toBeInstanceOf(NotFoundError);
    global.fetch = jest.fn(async () => jsonResponse({ error: { message: "Invalid query" } }, 400)) as unknown as typeof fetch;
    await expect(scanDrive("tok", "BAD")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("other non-ok → generic Error with a sanitized detail (no token)", async () => {
    global.fetch = jest.fn(async () => jsonResponse({ error: { message: "backend hiccup" } }, 500)) as unknown as typeof fetch;
    const err = await scanDrive("tok", "").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).not.toContain("tok");
  });
});
