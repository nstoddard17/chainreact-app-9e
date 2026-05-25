/**
 * @jest-environment node
 *
 * Slice 3.GDOCS-2 — Drive files.export wrapper. Used by
 * google-docs:export_document.
 */
import { filesExport } from "@/integrations/google-drive/api/filesExport";
import { NotFoundError } from "@/integrations/google-drive/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

const mockFetch = jest.fn();
const originalFetch = global.fetch;

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

function arrayBufferResponse(
  status: number,
  bytes: Uint8Array,
  contentType: string,
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    headers: new Headers({ "content-type": contentType }),
    text: async () => "",
    arrayBuffer: async () => bytes.buffer.slice(0) as ArrayBuffer,
    json: async () => ({}),
  } as unknown as Response;
}

function errorResponse(status: number, body: unknown) {
  return {
    ok: false,
    status,
    statusText: "",
    headers: new Headers(),
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new ArrayBuffer(0),
    json: async () => body,
  } as unknown as Response;
}

describe("filesExport — happy path", () => {
  it("GETs /drive/v3/files/{id}/export with mimeType query and returns raw bytes", async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
    mockFetch.mockResolvedValueOnce(
      arrayBufferResponse(200, bytes, "application/pdf"),
    );
    const result = await filesExport({
      accessToken: "tok",
      fileId: "doc-1",
      mimeType: "application/pdf",
    });
    expect(Array.from(result.bytes)).toEqual([0x25, 0x50, 0x44, 0x46]);
    expect(result.contentType).toBe("application/pdf");
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(String(url)).toContain("/drive/v3/files/doc-1/export");
    expect(String(url)).toContain("mimeType=application%2Fpdf");
    expect(init.method).toBe("GET");
  });

  it("url-encodes the fileId", async () => {
    mockFetch.mockResolvedValueOnce(
      arrayBufferResponse(200, new Uint8Array(0), "application/pdf"),
    );
    await filesExport({
      accessToken: "tok",
      fileId: "doc/with-slash",
      mimeType: "application/pdf",
    });
    const [url] = mockFetch.mock.calls[0]!;
    expect(String(url)).toContain("/drive/v3/files/doc%2Fwith-slash/export");
  });

  it("falls back to requested mimeType when Drive omits Content-Type", async () => {
    const noHeader = {
      ok: true,
      status: 200,
      statusText: "",
      headers: new Headers(),
      text: async () => "",
      arrayBuffer: async () => new ArrayBuffer(0),
      json: async () => ({}),
    } as unknown as Response;
    mockFetch.mockResolvedValueOnce(noHeader);
    const result = await filesExport({
      accessToken: "tok",
      fileId: "doc-1",
      mimeType: "application/rtf",
    });
    expect(result.contentType).toBe("application/rtf");
  });
});

describe("filesExport — error mapping", () => {
  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(401, {}));
    await expect(
      filesExport({
        accessToken: "stale",
        fileId: "doc-1",
        mimeType: "application/pdf",
      }),
    ).rejects.toThrow(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404", async () => {
    mockFetch.mockResolvedValueOnce(
      errorResponse(404, { error: { code: 404, message: "File not found" } }),
    );
    await expect(
      filesExport({
        accessToken: "tok",
        fileId: "missing",
        mimeType: "application/pdf",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("surfaces Google error.message on Drive's 10MB-cap 403", async () => {
    mockFetch.mockResolvedValueOnce(
      errorResponse(403, {
        error: { code: 403, message: "This file is too large to be exported." },
      }),
    );
    await expect(
      filesExport({
        accessToken: "tok",
        fileId: "doc-1",
        mimeType: "application/pdf",
      }),
    ).rejects.toThrow(/too large/);
  });
});
