/**
 * @jest-environment node
 */
import { driveItemsList } from "@/integrations/microsoft-onedrive/api/driveItemsList";
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

describe("driveItemsList wrapper", () => {
  it("hits /me/drive/root/children when parentItemId is omitted", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { value: [] } });
    await driveItemsList({ accessToken: "t" });
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/drive/root/children",
    );
  });

  it("hits /me/drive/root/children when parentItemId='root' (UI sentinel)", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { value: [] } });
    await driveItemsList({ accessToken: "t", parentItemId: "root" });
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/drive/root/children",
    );
  });

  it("hits /me/drive/items/{id}/children when parentItemId is supplied", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { value: [] } });
    await driveItemsList({
      accessToken: "t",
      parentItemId: "folder-123",
    });
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/drive/items/folder-123/children",
    );
  });

  it("forwards $top and $orderby query params when supplied", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { value: [] } });
    await driveItemsList({
      accessToken: "t",
      parentItemId: "f",
      top: 25,
      orderBy: "lastModifiedDateTime desc",
    });
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("%24top=25");
    expect(url).toContain(
      "%24orderby=lastModifiedDateTime+desc",
    );
  });

  it("returns items + nextLink when Graph paginates", async () => {
    mockFetchOnce({
      ok: true,
      json: {
        value: [{ id: "a", name: "a" }, { id: "b", name: "b" }],
        "@odata.nextLink": "https://graph.microsoft.com/v1.0/...&$skiptoken=abc",
      },
    });

    const result = await driveItemsList({ accessToken: "t" });
    expect(result.items).toHaveLength(2);
    expect(result.nextLink).toMatch(/skiptoken/);
  });

  it("returns empty items + null nextLink when Graph returns no children", async () => {
    mockFetchOnce({ ok: true, json: { value: [] } });
    const result = await driveItemsList({ accessToken: "t" });
    expect(result).toEqual({ items: [], nextLink: null });
  });

  it("throws Unauthorized401Error on 401", async () => {
    mockFetchOnce({ ok: false, status: 401, bodyText: "{}" });
    await expect(driveItemsList({ accessToken: "t" })).rejects.toBeInstanceOf(
      Unauthorized401Error,
    );
  });

  it("throws NotFoundError on 404 (parent missing)", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      bodyText: '{"error":{"code":"itemNotFound"}}',
    });
    await expect(
      driveItemsList({ accessToken: "t", parentItemId: "missing" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
