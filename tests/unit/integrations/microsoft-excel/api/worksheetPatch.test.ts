/**
 * @jest-environment node
 *
 * Tests for the Microsoft Graph worksheet PATCH wrapper. Pins request
 * shape, URL encoding, JSON body content, error contract (401 →
 * `Unauthorized401Error`, 404 → `NotFoundError`, others → generic
 * `Error` surfacing Graph's message), and the
 * `MICROSOFT_GRAPH_API_BASE` override.
 */
import { worksheetPatch } from "@/integrations/microsoft-excel/api/worksheetPatch";
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

describe("worksheetPatch wrapper", () => {
  it("PATCHes the worksheet endpoint with { name: <newName> } body", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "ws-1", name: "Renamed", position: 0 },
    });

    const result = await worksheetPatch({
      accessToken: "t",
      workbookId: "wb-1",
      worksheetName: "Sheet1",
      name: "Renamed",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain(
      "/v1.0/me/drive/items/wb-1/workbook/worksheets('Sheet1')",
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ name: "Renamed" });
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer t");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(result).toEqual({ id: "ws-1", name: "Renamed", position: 0 });
  });

  it("URL-encodes workbook id and worksheet name with edge chars", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "ws-1", name: "Q3" },
    });

    await worksheetPatch({
      accessToken: "t",
      workbookId: "wb+id/with=chars",
      worksheetName: "Q2 Report",
      name: "Q3",
    });

    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain(
      "wb%2Bid%2Fwith%3Dchars/workbook/worksheets('Q2%20Report')",
    );
  });

  it("respects MICROSOFT_GRAPH_API_BASE override (e2e mock surface)", async () => {
    process.env.MICROSOFT_GRAPH_API_BASE = "http://127.0.0.1:9878";
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "ws-1", name: "Renamed" },
    });

    await worksheetPatch({
      accessToken: "t",
      workbookId: "wb-1",
      worksheetName: "Sheet1",
      name: "Renamed",
    });

    expect(fetchSpy.mock.calls[0]![0]).toContain(
      "http://127.0.0.1:9878/v1.0/me/drive/items/wb-1/",
    );
  });

  it("returns the parsed worksheet resource on 200", async () => {
    mockFetchOnce({
      ok: true,
      json: { id: "ws-9", name: "After", position: 3, visibility: "Visible" },
    });
    const result = await worksheetPatch({
      accessToken: "t",
      workbookId: "wb-1",
      worksheetName: "Before",
      name: "After",
    });
    expect(result).toEqual({
      id: "ws-9",
      name: "After",
      position: 3,
      visibility: "Visible",
    });
  });

  it("throws Unauthorized401Error on HTTP 401 (refreshAndRetry contract)", async () => {
    mockFetchOnce({
      ok: false,
      status: 401,
      json: { error: { code: "InvalidAuthenticationToken" } },
    });
    await expect(
      worksheetPatch({
        accessToken: "stale",
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        name: "X",
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
      worksheetPatch({
        accessToken: "t",
        workbookId: "wb-1",
        worksheetName: "Missing",
        name: "X",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("surfaces Graph's error.message on 4xx (e.g. 409 duplicate name)", async () => {
    mockFetchOnce({
      ok: false,
      status: 409,
      json: {
        error: {
          code: "ItemAlreadyExists",
          message: "A worksheet named 'X' already exists.",
        },
      },
    });
    await expect(
      worksheetPatch({
        accessToken: "t",
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        name: "X",
      }),
    ).rejects.toThrow(/already exists/);
  });

  it("falls back to HTTP status when response is not JSON", async () => {
    mockFetchOnce({
      ok: false,
      status: 502,
      bodyText: "Bad Gateway plain text",
    });
    await expect(
      worksheetPatch({
        accessToken: "t",
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        name: "X",
      }),
    ).rejects.toThrow(/HTTP 502/);
  });
});
