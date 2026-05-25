/**
 * @jest-environment node
 */
import { driveItemsCreateFolder } from "@/integrations/microsoft-onedrive/api/driveItemsCreateFolder";
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

describe("driveItemsCreateFolder wrapper", () => {
  it("POSTs to /me/drive/root/children when parentItemId is omitted", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "f-1", name: "New", folder: {} },
    });

    await driveItemsCreateFolder({ accessToken: "t", name: "New" });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/drive/root/children",
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
  });

  it("POSTs to /me/drive/items/{parentId}/children when parentItemId is supplied", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "f-1", name: "New", folder: {} },
    });

    await driveItemsCreateFolder({
      accessToken: "t",
      name: "New",
      parentItemId: "p-1",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/drive/items/p-1/children",
    );
  });

  it("sends @microsoft.graph.conflictBehavior: 'fail' by default (Q11 — no silent overwrite)", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "f", name: "n", folder: {} },
    });

    await driveItemsCreateFolder({ accessToken: "t", name: "n" });

    const body = JSON.parse(
      fetchSpy.mock.calls[0]![1]!.body as string,
    );
    expect(body).toEqual({
      name: "n",
      folder: {},
      "@microsoft.graph.conflictBehavior": "fail",
    });
  });

  it("honors a conflictBehavior override when supplied", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "f", name: "n", folder: {} },
    });

    await driveItemsCreateFolder({
      accessToken: "t",
      name: "n",
      conflictBehavior: "rename",
    });

    const body = JSON.parse(
      fetchSpy.mock.calls[0]![1]!.body as string,
    );
    expect(body["@microsoft.graph.conflictBehavior"]).toBe("rename");
  });

  it("returns the created DriveItem on success", async () => {
    mockFetchOnce({
      ok: true,
      json: {
        id: "folder-xyz",
        name: "Reports",
        folder: { childCount: 0 },
        webUrl: "https://1drv.ms/...",
        createdDateTime: "2026-05-09T12:00:00Z",
      },
    });

    const result = await driveItemsCreateFolder({
      accessToken: "t",
      name: "Reports",
    });

    expect(result.id).toBe("folder-xyz");
    expect(result.folder?.childCount).toBe(0);
  });

  it("throws Unauthorized401Error on 401", async () => {
    mockFetchOnce({ ok: false, status: 401, bodyText: "{}" });
    await expect(
      driveItemsCreateFolder({ accessToken: "t", name: "x" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on 404 (parent missing)", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      bodyText: '{"error":{"code":"itemNotFound"}}',
    });
    await expect(
      driveItemsCreateFolder({
        accessToken: "t",
        parentItemId: "gone",
        name: "x",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("surfaces conflict error message on 409 nameAlreadyExists", async () => {
    mockFetchOnce({
      ok: false,
      status: 409,
      bodyText:
        '{"error":{"code":"nameAlreadyExists","message":"An item with the same name already exists"}}',
    });

    await expect(
      driveItemsCreateFolder({ accessToken: "t", name: "Reports" }),
    ).rejects.toThrow(/already exists/);
  });
});
