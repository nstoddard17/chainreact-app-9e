/**
 * @jest-environment node
 *
 * Tests for the Microsoft Graph workbook range-delete wrapper. Pins
 * request shape, URL encoding, body content, error contract (401 →
 * `Unauthorized401Error`, 404 → `NotFoundError`, others → generic
 * `Error` surfacing Graph's message), and the `MICROSOFT_GRAPH_API_BASE`
 * override that the e2e walkthrough relies on.
 */
import { worksheetRangeDelete } from "@/integrations/microsoft-excel/api/worksheetRangeDelete";
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

describe("worksheetRangeDelete wrapper", () => {
  it("POSTs the workbook range-delete endpoint with shift=Up", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, status: 204 });

    await worksheetRangeDelete({
      accessToken: "t",
      workbookId: "wb-1",
      worksheetName: "Sheet1",
      address: "5:5",
      shift: "Up",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain(
      "/v1.0/me/drive/items/wb-1/workbook/worksheets('Sheet1')/range(address='5%3A5')/delete",
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ shift: "Up" });
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer t");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("honors shift=Left when explicitly requested", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, status: 204 });

    await worksheetRangeDelete({
      accessToken: "t",
      workbookId: "wb-1",
      worksheetName: "Sheet1",
      address: "A1:A1",
      shift: "Left",
    });

    expect(JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string)).toEqual({
      shift: "Left",
    });
  });

  it("URL-encodes workbook id, worksheet name, and address", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, status: 204 });

    await worksheetRangeDelete({
      accessToken: "t",
      workbookId: "wb+id/with=chars",
      worksheetName: "Q2 Report",
      address: "5:5",
      shift: "Up",
    });

    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain(
      "wb%2Bid%2Fwith%3Dchars/workbook/worksheets('Q2%20Report')/range(address='5%3A5')/delete",
    );
  });

  it("respects MICROSOFT_GRAPH_API_BASE override (e2e mock surface)", async () => {
    process.env.MICROSOFT_GRAPH_API_BASE = "http://127.0.0.1:9878";
    const fetchSpy = mockFetchOnce({ ok: true, status: 204 });

    await worksheetRangeDelete({
      accessToken: "t",
      workbookId: "wb-1",
      worksheetName: "Sheet1",
      address: "5:5",
      shift: "Up",
    });

    expect(fetchSpy.mock.calls[0]![0]).toContain(
      "http://127.0.0.1:9878/v1.0/me/drive/items/wb-1/",
    );
  });

  it("resolves to void on 204", async () => {
    mockFetchOnce({ ok: true, status: 204 });
    await expect(
      worksheetRangeDelete({
        accessToken: "t",
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        address: "5:5",
        shift: "Up",
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
      worksheetRangeDelete({
        accessToken: "stale",
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        address: "5:5",
        shift: "Up",
      }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404 (worksheet missing)", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      json: { error: { code: "ItemNotFound", message: "Worksheet not found" } },
    });
    await expect(
      worksheetRangeDelete({
        accessToken: "t",
        workbookId: "wb-1",
        worksheetName: "Missing",
        address: "5:5",
        shift: "Up",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("surfaces Graph's error.message on 4xx (non-401/404)", async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      json: {
        error: { code: "InvalidArgument", message: "Range address invalid." },
      },
    });
    await expect(
      worksheetRangeDelete({
        accessToken: "t",
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        address: "BAD",
        shift: "Up",
      }),
    ).rejects.toThrow(/Range address invalid/);
  });

  it("falls back to HTTP status when response is not JSON", async () => {
    mockFetchOnce({
      ok: false,
      status: 502,
      bodyText: "Bad Gateway plain text",
    });
    await expect(
      worksheetRangeDelete({
        accessToken: "t",
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        address: "5:5",
        shift: "Up",
      }),
    ).rejects.toThrow(/HTTP 502/);
  });
});
