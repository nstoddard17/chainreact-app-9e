/**
 * @jest-environment node
 *
 * Tests for the Microsoft Graph worksheet DELETE wrapper. Pins request
 * shape, URL encoding, 204-handling (no body), and the error contract
 * (401 → `Unauthorized401Error`, 404 → `NotFoundError`, others →
 * generic `Error` surfacing Graph's message).
 */
import { worksheetDelete } from "@/integrations/microsoft-excel/api/worksheetDelete";
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
  const status = opts.status ?? (opts.ok ? 204 : 500);
  // 204 No Content rejects a body in undici's Response constructor —
  // pass null. Other statuses accept body strings.
  const body =
    status === 204
      ? null
      : opts.bodyText !== undefined
        ? opts.bodyText
        : opts.json !== undefined
          ? JSON.stringify(opts.json)
          : "";
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(body, { status }));
}

describe("worksheetDelete wrapper", () => {
  it("DELETEs the worksheet endpoint", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, status: 204 });

    await worksheetDelete({
      accessToken: "t",
      workbookId: "wb-1",
      worksheetName: "Sheet1",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain(
      "/v1.0/me/drive/items/wb-1/workbook/worksheets('Sheet1')",
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("DELETE");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer t");
    expect(init.body).toBeUndefined();
  });

  it("URL-encodes workbook id and worksheet name with edge chars", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, status: 204 });

    await worksheetDelete({
      accessToken: "t",
      workbookId: "wb+id/with=chars",
      worksheetName: "Q2 Report",
    });

    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain(
      "wb%2Bid%2Fwith%3Dchars/workbook/worksheets('Q2%20Report')",
    );
  });

  it("respects MICROSOFT_GRAPH_API_BASE override (e2e mock surface)", async () => {
    process.env.MICROSOFT_GRAPH_API_BASE = "http://127.0.0.1:9878";
    const fetchSpy = mockFetchOnce({ ok: true, status: 204 });

    await worksheetDelete({
      accessToken: "t",
      workbookId: "wb-1",
      worksheetName: "Sheet1",
    });

    expect(fetchSpy.mock.calls[0]![0]).toContain(
      "http://127.0.0.1:9878/v1.0/me/drive/items/wb-1/",
    );
  });

  it("resolves to void on 204", async () => {
    mockFetchOnce({ ok: true, status: 204 });
    await expect(
      worksheetDelete({
        accessToken: "t",
        workbookId: "wb-1",
        worksheetName: "Sheet1",
      }),
    ).resolves.toBeUndefined();
  });

  it("throws Unauthorized401Error on HTTP 401 (refreshAndRetry contract)", async () => {
    mockFetchOnce({
      ok: false,
      status: 401,
      json: { error: { code: "InvalidAuthenticationToken" } },
    });
    await expect(
      worksheetDelete({
        accessToken: "stale",
        workbookId: "wb-1",
        worksheetName: "Sheet1",
      }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404 (worksheet missing — no silent no-op)", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      json: { error: { code: "ItemNotFound", message: "Worksheet not found" } },
    });
    await expect(
      worksheetDelete({
        accessToken: "t",
        workbookId: "wb-1",
        worksheetName: "Missing",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("surfaces Graph's error.message on 400 (e.g. last visible worksheet)", async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      json: {
        error: {
          code: "InvalidArgument",
          message: "Cannot delete the last visible worksheet.",
        },
      },
    });
    await expect(
      worksheetDelete({
        accessToken: "t",
        workbookId: "wb-1",
        worksheetName: "OnlySheet",
      }),
    ).rejects.toThrow(/Cannot delete the last visible/);
  });

  it("falls back to HTTP status when response is not JSON", async () => {
    mockFetchOnce({
      ok: false,
      status: 502,
      bodyText: "Bad Gateway plain text",
    });
    await expect(
      worksheetDelete({
        accessToken: "t",
        workbookId: "wb-1",
        worksheetName: "Sheet1",
      }),
    ).rejects.toThrow(/HTTP 502/);
  });
});
