/**
 * @jest-environment node
 */
import { Buffer } from "node:buffer";
import {
  driveItemsContentUpload,
  MAX_UPLOAD_BYTES,
} from "@/integrations/microsoft-onedrive/api/driveItemsContentUpload";
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

describe("driveItemsContentUpload wrapper", () => {
  it("PUTs to /me/drive/root:/{filename}:/content when parentItemId is omitted", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "u-1", name: "a.txt" },
    });

    await driveItemsContentUpload({
      accessToken: "t",
      filename: "a.txt",
      mimeType: "text/plain",
      content: Buffer.from("hi"),
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/drive/root:/a.txt:/content",
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("PUT");
    expect(init.headers).toEqual({
      Authorization: "Bearer t",
      "Content-Type": "text/plain",
      "Content-Length": "2",
    });
  });

  it("PUTs to /me/drive/items/{parent}:/{filename}:/content when parentItemId is supplied", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "u-1" },
    });

    await driveItemsContentUpload({
      accessToken: "t",
      parentItemId: "p-9",
      filename: "doc.pdf",
      mimeType: "application/pdf",
      content: Buffer.from("PDF"),
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/drive/items/p-9:/doc.pdf:/content",
    );
  });

  it("URL-encodes the filename so spaces / unicode survive", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { id: "u" } });

    await driveItemsContentUpload({
      accessToken: "t",
      filename: "report 2026.pdf",
      mimeType: "application/pdf",
      content: Buffer.from("x"),
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/drive/root:/report%202026.pdf:/content",
    );
  });

  it("throws clear 4 MB cap error BEFORE making the network call", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    const oversize = Buffer.alloc(MAX_UPLOAD_BYTES + 1);

    await expect(
      driveItemsContentUpload({
        accessToken: "t",
        filename: "big.bin",
        mimeType: "application/octet-stream",
        content: oversize,
      }),
    ).rejects.toThrow(/exceeded.*bytes/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uploads exactly at the 4 MB cap (boundary)", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { id: "u" } });
    const atCap = Buffer.alloc(MAX_UPLOAD_BYTES);

    await driveItemsContentUpload({
      accessToken: "t",
      filename: "edge.bin",
      mimeType: "application/octet-stream",
      content: atCap,
    });

    expect(fetchSpy).toHaveBeenCalled();
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({ ok: false, status: 401, bodyText: "{}" });
    await expect(
      driveItemsContentUpload({
        accessToken: "stale",
        filename: "x",
        mimeType: "text/plain",
        content: Buffer.from("x"),
      }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404 (parent folder missing)", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      bodyText: '{"error":{"code":"itemNotFound"}}',
    });
    await expect(
      driveItemsContentUpload({
        accessToken: "t",
        parentItemId: "gone",
        filename: "x",
        mimeType: "text/plain",
        content: Buffer.from("x"),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
