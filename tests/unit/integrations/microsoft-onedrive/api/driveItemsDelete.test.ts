/**
 * @jest-environment node
 */
import { driveItemsDelete } from "@/integrations/microsoft-onedrive/api/driveItemsDelete";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

afterEach(() => {
  jest.restoreAllMocks();
});

function mockFetchOnce(opts: {
  ok: boolean;
  status?: number;
  bodyText?: string;
}) {
  const status = opts.status ?? (opts.ok ? 204 : 500);
  // Web Response constructor rejects bodies on 204/205/304 — pass null
  // to honor the spec.
  const noBodyStatus = status === 204 || status === 205 || status === 304;
  const body = noBodyStatus ? null : (opts.bodyText ?? "");
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(body, { status }));
}

describe("driveItemsDelete wrapper", () => {
  it("DELETEs /v1.0/me/drive/items/{id} with Bearer token", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, status: 204 });

    await driveItemsDelete({ accessToken: "t", itemId: "i-1" });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/drive/items/i-1",
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("DELETE");
    expect(init.headers).toEqual({ Authorization: "Bearer t" });
  });

  it("URL-encodes the item id", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, status: 204 });

    await driveItemsDelete({ accessToken: "t", itemId: "abc/def+ghi" });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/drive/items/abc%2Fdef%2Bghi",
    );
  });

  it("resolves on 204 No Content", async () => {
    mockFetchOnce({ ok: true, status: 204 });
    await expect(
      driveItemsDelete({ accessToken: "t", itemId: "i-1" }),
    ).resolves.toBeUndefined();
  });

  it("throws Unauthorized401Error on 401", async () => {
    mockFetchOnce({ ok: false, status: 401, bodyText: "{}" });
    await expect(
      driveItemsDelete({ accessToken: "stale", itemId: "x" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on 404 (item already gone — handler swallows for idempotency)", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      bodyText: '{"error":{"code":"itemNotFound"}}',
    });
    await expect(
      driveItemsDelete({ accessToken: "t", itemId: "gone" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("surfaces error message on other 4xx", async () => {
    mockFetchOnce({
      ok: false,
      status: 403,
      bodyText:
        '{"error":{"code":"accessDenied","message":"Insufficient privileges to delete"}}',
    });

    await expect(
      driveItemsDelete({ accessToken: "t", itemId: "x" }),
    ).rejects.toThrow(/Insufficient privileges/);
  });
});
