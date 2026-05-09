/**
 * @jest-environment node
 */
import { driveItemsUpdate } from "@/integrations/microsoft-onedrive/api/driveItemsUpdate";
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

describe("driveItemsUpdate wrapper", () => {
  it("PATCHes /v1.0/me/drive/items/{id} with name only when only newName is supplied (rename in place)", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "i-1", name: "renamed.txt" },
    });

    await driveItemsUpdate({
      accessToken: "t",
      itemId: "i-1",
      newName: "renamed.txt",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/drive/items/i-1",
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ name: "renamed.txt" });
  });

  it("PATCHes with parentReference only when only targetParentItemId is supplied (move)", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "i-1" },
    });

    await driveItemsUpdate({
      accessToken: "t",
      itemId: "i-1",
      targetParentItemId: "p-2",
    });

    expect(JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string)).toEqual({
      parentReference: { id: "p-2" },
    });
  });

  it("PATCHes with both name and parentReference when both supplied (atomic move + rename)", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "i-1" },
    });

    await driveItemsUpdate({
      accessToken: "t",
      itemId: "i-1",
      targetParentItemId: "p-2",
      newName: "moved.txt",
    });

    expect(JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string)).toEqual({
      name: "moved.txt",
      parentReference: { id: "p-2" },
    });
  });

  it("returns the updated DriveItem on success", async () => {
    mockFetchOnce({
      ok: true,
      json: {
        id: "i-1",
        name: "renamed.txt",
        parentReference: { id: "p-2", path: "/drive/root:/Folder" },
        lastModifiedDateTime: "2026-05-09T12:00:00Z",
      },
    });

    const result = await driveItemsUpdate({
      accessToken: "t",
      itemId: "i-1",
      newName: "renamed.txt",
    });

    expect(result.name).toBe("renamed.txt");
    expect(result.parentReference?.id).toBe("p-2");
  });

  it("throws Unauthorized401Error on 401", async () => {
    mockFetchOnce({ ok: false, status: 401, bodyText: "{}" });
    await expect(
      driveItemsUpdate({ accessToken: "t", itemId: "x", newName: "y" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on 404 (item or target parent missing)", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      bodyText: '{"error":{"code":"itemNotFound"}}',
    });
    await expect(
      driveItemsUpdate({ accessToken: "t", itemId: "gone", newName: "y" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
