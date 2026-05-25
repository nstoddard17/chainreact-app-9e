/**
 * @jest-environment node
 *
 * Tests for the shared Dropbox request layer — Slice 3.DROPBOX-2.
 * Covers the three call shapes (RPC / content-download / content-upload),
 * two-host routing, Dropbox-API-Arg header behavior, the typed error map,
 * and error sanitization (no raw body / path / token leakage).
 */
import {
  dropboxContentDownload,
  dropboxContentUpload,
  dropboxRpc,
} from "@/integrations/_shared/dropbox/api/_request";
import {
  DropboxApiError,
  DropboxConflictError,
  NotFoundError,
  RateLimitError,
} from "@/integrations/_shared/dropbox/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.DROPBOX_API_BASE;
  delete process.env.DROPBOX_CONTENT_BASE;
});

function mockFetchOnce(
  body: string | Uint8Array | null,
  init: { status?: number; headers?: Record<string, string> } = {},
): jest.SpyInstance {
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(body as unknown as Blob, init));
}

describe("dropboxRpc", () => {
  it("POSTs to the api host with Bearer + JSON content-type + JSON body", async () => {
    const spy = mockFetchOnce(JSON.stringify({ id: "id:1", name: "f.txt" }));
    const result = await dropboxRpc<{ id: string; name: string }>({
      accessToken: "tok",
      endpoint: "/2/files/get_metadata",
      args: { path: "/f.txt" },
    });
    expect(result).toEqual({ id: "id:1", name: "f.txt" });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.dropboxapi.com/2/files/get_metadata",
    );
    const init = spy.mock.calls[0]![1] as {
      headers: Record<string, string>;
      body: string;
    };
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ path: "/f.txt" });
  });

  it("sends a literal null body for no-arg endpoints", async () => {
    const spy = mockFetchOnce(JSON.stringify({ account_id: "dbid:1" }));
    await dropboxRpc({
      accessToken: "tok",
      endpoint: "/2/users/get_current_account",
      args: null,
    });
    expect((spy.mock.calls[0]![1] as { body: string }).body).toBe("null");
  });

  it("honors DROPBOX_API_BASE override", async () => {
    process.env.DROPBOX_API_BASE = "http://localhost:9990";
    const spy = mockFetchOnce(JSON.stringify({}));
    await dropboxRpc({ accessToken: "t", endpoint: "/2/x", args: {} });
    expect(spy.mock.calls[0]![0]).toBe("http://localhost:9990/2/x");
  });

  it("maps 401 → Unauthorized401Error (drives refreshAndRetry)", async () => {
    mockFetchOnce(JSON.stringify({ error_summary: "expired_access_token/" }), {
      status: 401,
    });
    await expect(
      dropboxRpc({ accessToken: "t", endpoint: "/2/x", args: {} }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("maps 429 → RateLimitError with parsed Retry-After", async () => {
    mockFetchOnce(JSON.stringify({}), {
      status: 429,
      headers: { "Retry-After": "7" },
    });
    try {
      await dropboxRpc({ accessToken: "t", endpoint: "/2/x", args: {} });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitError);
      expect((err as RateLimitError).retryAfterSeconds).toBe(7);
    }
  });

  it("maps 409 not-found → NotFoundError", async () => {
    mockFetchOnce(
      JSON.stringify({ error_summary: "path/not_found/.", error: {} }),
      { status: 409 },
    );
    await expect(
      dropboxRpc({ accessToken: "t", endpoint: "/2/x", args: {} }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("maps 409 conflict → DropboxConflictError carrying the summary tag", async () => {
    mockFetchOnce(
      JSON.stringify({ error_summary: "shared_link_already_exists/..", error: {} }),
      { status: 409 },
    );
    try {
      await dropboxRpc({ accessToken: "t", endpoint: "/2/x", args: {} });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(DropboxConflictError);
      expect((err as DropboxConflictError).summary).toBe(
        "shared_link_already_exists/..",
      );
    }
  });

  it("maps other 4xx/5xx → DropboxApiError with only the sanitized summary", async () => {
    mockFetchOnce(
      JSON.stringify({
        error_summary: "other/problem",
        secretEcho: "tok-leak-should-not-surface",
      }),
      { status: 500 },
    );
    try {
      await dropboxRpc({ accessToken: "tok-leak", endpoint: "/2/x", args: {} });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(DropboxApiError);
      const msg = (err as Error).message;
      expect(msg).toContain("other/problem");
      // Sanitization: never the raw body / token.
      expect(msg).not.toContain("tok-leak");
      expect(msg).not.toContain("secretEcho");
    }
  });
});

describe("dropboxContentDownload", () => {
  it("POSTs to the content host with Dropbox-API-Arg + NO request Content-Type, returns bytes + parsed result header", async () => {
    const fileBytes = new Uint8Array([1, 2, 3, 4]);
    const spy = mockFetchOnce(fileBytes, {
      headers: {
        "Dropbox-API-Result": JSON.stringify({ name: "f.txt", size: 4 }),
      },
    });
    const { bytes, result } = await dropboxContentDownload<{
      name: string;
      size: number;
    }>({ accessToken: "tok", endpoint: "/2/files/download", args: { path: "/f.txt" } });
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4]);
    expect(result).toEqual({ name: "f.txt", size: 4 });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://content.dropboxapi.com/2/files/download",
    );
    const init = spy.mock.calls[0]![1] as { headers: Record<string, string> };
    expect(init.headers["Dropbox-API-Arg"]).toBe(
      JSON.stringify({ path: "/f.txt" }),
    );
    expect(init.headers["Content-Type"]).toBeUndefined();
  });

  it("honors DROPBOX_CONTENT_BASE override", async () => {
    process.env.DROPBOX_CONTENT_BASE = "http://localhost:9991";
    const spy = mockFetchOnce(new Uint8Array([0]), {
      headers: { "Dropbox-API-Result": "{}" },
    });
    await dropboxContentDownload({
      accessToken: "t",
      endpoint: "/2/files/download",
      args: { path: "/x" },
    });
    expect(spy.mock.calls[0]![0]).toBe(
      "http://localhost:9991/2/files/download",
    );
  });
});

describe("dropboxContentUpload", () => {
  it("POSTs bytes to the content host with Dropbox-API-Arg + octet-stream", async () => {
    const spy = mockFetchOnce(JSON.stringify({ id: "id:9", name: "u.txt" }));
    const result = await dropboxContentUpload<{ id: string }>({
      accessToken: "tok",
      endpoint: "/2/files/upload",
      args: { path: "/u.txt", mode: "add" },
      bytes: new Uint8Array([9, 9]),
    });
    expect(result).toEqual({ id: "id:9", name: "u.txt" });
    const init = spy.mock.calls[0]![1] as { headers: Record<string, string> };
    expect(init.headers["Content-Type"]).toBe("application/octet-stream");
    expect(init.headers["Dropbox-API-Arg"]).toBe(
      JSON.stringify({ path: "/u.txt", mode: "add" }),
    );
  });

  it("maps content-endpoint 409 not-found → NotFoundError", async () => {
    mockFetchOnce(JSON.stringify({ error_summary: "path/not_found/." }), {
      status: 409,
    });
    await expect(
      dropboxContentUpload({
        accessToken: "t",
        endpoint: "/2/files/upload",
        args: { path: "/x" },
        bytes: new Uint8Array([1]),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
