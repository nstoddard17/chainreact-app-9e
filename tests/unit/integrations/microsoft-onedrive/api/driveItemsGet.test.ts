/**
 * @jest-environment node
 */
import { driveItemsGet } from "@/integrations/microsoft-onedrive/api/driveItemsGet";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.MICROSOFT_GRAPH_API_BASE;
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

describe("driveItemsGet wrapper", () => {
  it("GETs /v1.0/me/drive/items/{id} with Bearer token", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "item-1", name: "report.pdf" },
    });

    await driveItemsGet({ accessToken: "t", itemId: "item-1" });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/drive/items/item-1",
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual({ Authorization: "Bearer t" });
  });

  it("URL-encodes item ids that contain edge chars", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { id: "x" } });

    await driveItemsGet({ accessToken: "t", itemId: "abc+def/ghi=" });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/drive/items/abc%2Bdef%2Fghi%3D",
    );
  });

  it("returns the parsed DriveItem on 200, including downloadUrl when Graph emits it", async () => {
    mockFetchOnce({
      ok: true,
      json: {
        id: "item-2",
        name: "report.pdf",
        size: 4096,
        file: { mimeType: "application/pdf" },
        webUrl: "https://1drv.ms/...",
        "@microsoft.graph.downloadUrl":
          "https://public.bn.files.1drv.com/y4m...?short-lived",
      },
    });

    const result = await driveItemsGet({ accessToken: "t", itemId: "item-2" });

    expect(result.id).toBe("item-2");
    expect(result["@microsoft.graph.downloadUrl"]).toMatch(/^https:\/\//);
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({ ok: false, status: 401, bodyText: '{"error":{"code":"InvalidAuthenticationToken"}}' });

    await expect(
      driveItemsGet({ accessToken: "stale", itemId: "x" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404 (item deleted or no access)", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      bodyText: '{"error":{"code":"itemNotFound"}}',
    });

    await expect(
      driveItemsGet({ accessToken: "t", itemId: "gone" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("surfaces Graph error message on other 4xx failures", async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      bodyText: '{"error":{"code":"invalidRequest","message":"Invalid item id"}}',
    });

    await expect(
      driveItemsGet({ accessToken: "t", itemId: "bad" }),
    ).rejects.toThrow(/Invalid item id/);
  });
});
