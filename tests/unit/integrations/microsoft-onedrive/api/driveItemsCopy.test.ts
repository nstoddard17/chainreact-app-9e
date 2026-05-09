/**
 * @jest-environment node
 */
import { driveItemsCopy } from "@/integrations/microsoft-onedrive/api/driveItemsCopy";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

afterEach(() => {
  jest.restoreAllMocks();
});

function mockOnce(opts: {
  status: number;
  body?: string;
  headers?: Record<string, string>;
}): jest.SpyInstance {
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(opts.body ?? "", {
        status: opts.status,
        headers: opts.headers,
      }),
    );
}

describe("driveItemsCopy wrapper", () => {
  it("POSTs /me/drive/items/{id}/copy with parentReference + Prefer: respond-async", async () => {
    const fetchSpy = mockOnce({
      status: 202,
      headers: {
        Location: "https://graph.microsoft.com/v1.0/operations/op-1",
      },
    });

    await driveItemsCopy({
      accessToken: "t",
      itemId: "i-1",
      targetParentItemId: "p-1",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/drive/items/i-1/copy",
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Prefer).toBe(
      "respond-async",
    );
    expect(JSON.parse(init.body as string)).toEqual({
      parentReference: { id: "p-1" },
      "@microsoft.graph.conflictBehavior": "fail",
    });
  });

  it("includes newName in the body when supplied", async () => {
    const fetchSpy = mockOnce({
      status: 202,
      headers: { Location: "https://graph/op" },
    });

    await driveItemsCopy({
      accessToken: "t",
      itemId: "i-1",
      targetParentItemId: "p-1",
      newName: "copy.txt",
    });

    expect(JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string)).toEqual({
      parentReference: { id: "p-1" },
      "@microsoft.graph.conflictBehavior": "fail",
      name: "copy.txt",
    });
  });

  it("returns { status: 'pending', monitorUrl } from the Location header", async () => {
    mockOnce({
      status: 202,
      headers: {
        Location: "https://graph.microsoft.com/v1.0/operations/op-42",
      },
    });

    const result = await driveItemsCopy({
      accessToken: "t",
      itemId: "i-1",
      targetParentItemId: "p-1",
    });

    expect(result).toEqual({
      status: "pending",
      monitorUrl: "https://graph.microsoft.com/v1.0/operations/op-42",
    });
  });

  it("honors a conflictBehavior override when supplied", async () => {
    const fetchSpy = mockOnce({
      status: 202,
      headers: { Location: "https://graph/op" },
    });

    await driveItemsCopy({
      accessToken: "t",
      itemId: "i-1",
      targetParentItemId: "p-1",
      conflictBehavior: "rename",
    });

    expect(
      JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string)[
        "@microsoft.graph.conflictBehavior"
      ],
    ).toBe("rename");
  });

  it("throws Unauthorized401Error on 401", async () => {
    mockOnce({ status: 401, body: "{}" });
    await expect(
      driveItemsCopy({
        accessToken: "stale",
        itemId: "x",
        targetParentItemId: "y",
      }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on 404 (source or target parent missing)", async () => {
    mockOnce({
      status: 404,
      body: '{"error":{"code":"itemNotFound"}}',
    });
    await expect(
      driveItemsCopy({
        accessToken: "t",
        itemId: "gone",
        targetParentItemId: "y",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws when Graph returns 2xx without a Location header (defensive — surfaces operation visibility loss)", async () => {
    mockOnce({ status: 202 }); // no Location header
    await expect(
      driveItemsCopy({
        accessToken: "t",
        itemId: "x",
        targetParentItemId: "y",
      }),
    ).rejects.toThrow(/no Location header/);
  });
});
