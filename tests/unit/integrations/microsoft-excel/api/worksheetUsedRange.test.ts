/**
 * @jest-environment node
 */
import { worksheetUsedRange } from "@/integrations/microsoft-excel/api/worksheetUsedRange";
import {
  NotFoundError,
  WorkbookConflictError,
} from "@/integrations/_shared/microsoft/api/errors";
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

/**
 * Capture the thrown error, failing loudly if the call unexpectedly
 * RESOLVES — a bare `.catch(e => e)` would let an assertion about a
 * rejection pass when nothing was thrown.
 */
async function rejection<T>(promise: Promise<unknown>): Promise<T> {
  try {
    await promise;
  } catch (err) {
    return err as T;
  }
  throw new Error("Expected the call to reject, but it resolved.");
}

describe("worksheetUsedRange wrapper", () => {
  it("GETs workbook usedRange endpoint with default valuesOnly=true", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { address: "Sheet1!A1:B2", rowCount: 2, columnCount: 2, values: [] },
    });

    await worksheetUsedRange({
      accessToken: "t",
      workbookId: "wb-1",
      worksheetName: "Sheet1",
    });

    expect(fetchSpy.mock.calls[0]![0]).toContain(
      "/v1.0/me/drive/items/wb-1/workbook/worksheets('Sheet1')/usedRange(valuesOnly=true)",
    );
  });

  it("URL-encodes workbook id and worksheet name with edge chars", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { address: "A1", rowCount: 1, columnCount: 1, values: [] },
    });

    await worksheetUsedRange({
      accessToken: "t",
      workbookId: "wb+id/with=chars",
      worksheetName: "Q2 Report",
    });

    expect(fetchSpy.mock.calls[0]![0]).toContain(
      "wb%2Bid%2Fwith%3Dchars/workbook/worksheets('Q2%20Report')/usedRange",
    );
  });

  it("honors valuesOnly=false when explicitly requested", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { address: "A1", rowCount: 1, columnCount: 1, values: [] },
    });

    await worksheetUsedRange({
      accessToken: "t",
      workbookId: "wb-1",
      worksheetName: "Sheet1",
      valuesOnly: false,
    });

    expect(fetchSpy.mock.calls[0]![0]).toContain("usedRange(valuesOnly=false)");
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({ ok: false, status: 401 });

    await expect(
      worksheetUsedRange({
        accessToken: "stale",
        workbookId: "wb-1",
        worksheetName: "Sheet1",
      }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404 (worksheet missing)", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      bodyText: '{"error":{"code":"itemNotFound"}}',
    });

    await expect(
      worksheetUsedRange({
        accessToken: "t",
        workbookId: "wb-1",
        worksheetName: "Gone",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  /**
   * EXCEL-UPDATE-ROW-CONCURRENCY-4 — the READ is classified as well as the
   * write. Microsoft's own illustration of `accessConflict` is "another
   * client has locked the workbook for edit", and a lock like that stops the
   * FIRST request an action makes. Classifying only the PATCH would leave
   * the likeliest contention path reported as an unknown failure.
   */
  it("throws a typed conflict when the workbook is locked for editing", async () => {
    mockFetchOnce({
      ok: false,
      status: 409,
      bodyText: JSON.stringify({
        error: {
          code: "conflict",
          innerError: { code: "accessConflict", "request-id": "req-2" },
        },
      }),
    });

    const err = await rejection<WorkbookConflictError>(
      worksheetUsedRange({
        accessToken: "t",
        workbookId: "wb-1",
        worksheetName: "Sheet1",
      }),
    );

    expect(err).toBeInstanceOf(WorkbookConflictError);
    expect(err.graphInnerCode).toBe("accessConflict");
    expect(err.requestId).toBe("req-2");
  });

  it("leaves an unrelated failure generic", async () => {
    mockFetchOnce({
      ok: false,
      status: 500,
      bodyText: '{"error":{"code":"internalServerError","message":"Boom."}}',
    });

    const err = await rejection<Error>(
      worksheetUsedRange({
        accessToken: "t",
        workbookId: "wb-1",
        worksheetName: "Sheet1",
      }),
    );

    expect(err).not.toBeInstanceOf(WorkbookConflictError);
    expect(err.message).toContain("Boom.");
  });
});
