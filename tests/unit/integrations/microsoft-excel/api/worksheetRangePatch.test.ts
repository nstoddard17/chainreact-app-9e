/**
 * @jest-environment node
 *
 * `worksheetRangePatch` — the single write every Excel row mutation goes
 * through. It had no dedicated test before
 * EXCEL-UPDATE-ROW-CONCURRENCY-4; this suite covers the request shape it
 * always had, plus the workbook-conflict classification the slice added.
 *
 * The classification matters more than it looks: without it, a workbook that
 * somebody has open for editing produced "This step failed for an unexpected
 * reason", which tells a user nothing and invites them to retry into a lock.
 */
import { worksheetRangePatch } from "@/integrations/microsoft-excel/api/worksheetRangePatch";
import {
  NotFoundError,
  WorkbookConflictError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

/**
 * The init bag `fetch` was called with. Derived from `fetch` itself rather
 * than naming the DOM `RequestInit` global, which this suite's node lint
 * environment does not declare.
 */
type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.MICROSOFT_GRAPH_API_BASE;
});

function mockFetchOnce(opts: {
  status: number;
  json?: unknown;
  bodyText?: string;
}) {
  const body =
    opts.bodyText !== undefined
      ? opts.bodyText
      : opts.json !== undefined
        ? JSON.stringify(opts.json)
        : "";
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(body, { status: opts.status }));
}

function patch() {
  return worksheetRangePatch({
    accessToken: "t",
    workbookId: "wb-1",
    worksheetName: "Sheet1",
    address: "A2:C2",
    values: [["a", null, "c"]],
  });
}

/**
 * Capture the thrown error, failing loudly if the call unexpectedly
 * RESOLVES. A bare `.catch(e => e)` types as "error or the success value",
 * and — worse — would silently pass an assertion about a rejection that
 * never happened.
 */
async function rejection<T>(promise: Promise<unknown>): Promise<T> {
  try {
    await promise;
  } catch (err) {
    return err as T;
  }
  throw new Error("Expected the call to reject, but it resolved.");
}

describe("request shape", () => {
  it("PATCHes the addressed range with the supplied values", async () => {
    const fetchSpy = mockFetchOnce({ status: 200, json: { address: "A2:C2" } });
    await patch();

    const [url, init] = fetchSpy.mock.calls[0] as [string, FetchInit];
    expect(url).toContain(
      "/v1.0/me/drive/items/wb-1/workbook/worksheets('Sheet1')/range(address='A2%3AC2')",
    );
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({
      values: [["a", null, "c"]],
    });
  });

  it("sends no conditional header — Graph documents none for this endpoint", async () => {
    // EXCEL-UPDATE-ROW-CONCURRENCY-4 audit finding: the Update range request
    // header table is Authorization / Content-Type / Workbook-Session-Id.
    // Sending `If-Match` here would be indistinguishable from a header the
    // service silently ignores, i.e. protection that isn't there.
    const fetchSpy = mockFetchOnce({ status: 200, json: {} });
    await patch();
    const headers = (fetchSpy.mock.calls[0]![1] as FetchInit).headers as Record<
      string,
      string
    >;
    expect(Object.keys(headers).map((h) => h.toLowerCase())).toEqual([
      "authorization",
      "content-type",
    ]);
  });
});

describe("workbook conflicts are their own failure", () => {
  it("throws a typed conflict for a documented accessConflict", async () => {
    mockFetchOnce({
      status: 409,
      json: {
        error: {
          code: "conflict",
          message: "Locked for editing.",
          innerError: {
            code: "accessConflict",
            "request-id": "req-1",
            "client-request-id": "cli-1",
          },
        },
      },
    });
    await expect(patch()).rejects.toBeInstanceOf(WorkbookConflictError);
  });

  it("keeps the provider correlation ids for support", async () => {
    mockFetchOnce({
      status: 409,
      json: {
        error: {
          code: "conflict",
          innerError: {
            code: "accessConflict",
            "request-id": "req-1",
            "client-request-id": "cli-1",
          },
        },
      },
    });
    const err = await rejection<WorkbookConflictError>(patch());
    expect(err.requestId).toBe("req-1");
    expect(err.clientRequestId).toBe("cli-1");
    expect(err.graphInnerCode).toBe("accessConflict");
    expect(err.httpStatus).toBe(409);
  });

  it.each([
    "conflictUncategorized",
    "invalidSessionAccessConflict",
    "insertDeleteConflict",
    "filteredRangeConflict",
  ])("classifies %s as a conflict too", async (innerCode) => {
    mockFetchOnce({
      status: 400,
      json: { error: { code: "badRequest", innerError: { code: innerCode } } },
    });
    await expect(patch()).rejects.toBeInstanceOf(WorkbookConflictError);
  });

  it("treats a bare 409 with no stated cause as a conflict", async () => {
    mockFetchOnce({ status: 409, bodyText: "" });
    await expect(patch()).rejects.toBeInstanceOf(WorkbookConflictError);
  });

  it("does NOT treat a 409 with a different documented cause as a conflict", async () => {
    // A 409 that means "this already exists" is not somebody editing the
    // file, and must keep its generic handling rather than tell the user to
    // wait for an edit that never happened.
    mockFetchOnce({
      status: 409,
      json: {
        error: { code: "conflict", innerError: { code: "itemAlreadyExists" } },
      },
    });
    const err = await rejection<Error>(patch());
    expect(err).not.toBeInstanceOf(WorkbookConflictError);
    expect(err.message).toContain("range PATCH failed");
  });
});

describe("every other failure keeps the classification it had", () => {
  it("401 → Unauthorized401Error, so refreshAndRetry still refreshes", async () => {
    mockFetchOnce({ status: 401 });
    await expect(patch()).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("404 → NotFoundError", async () => {
    mockFetchOnce({
      status: 404,
      json: { error: { code: "itemNotFound", message: "No worksheet." } },
    });
    await expect(patch()).rejects.toBeInstanceOf(NotFoundError);
  });

  it.each([403, 429, 500, 503])("HTTP %i stays a generic error", async (status) => {
    mockFetchOnce({
      status,
      json: { error: { code: "someCode", message: "Provider said no." } },
    });
    const err = await rejection<Error>(patch());
    expect(err).not.toBeInstanceOf(WorkbookConflictError);
    expect(err.message).toContain("Provider said no.");
  });

  it("a malformed error body still produces a usable generic error", async () => {
    mockFetchOnce({ status: 500, bodyText: "<html>gateway</html>" });
    const err = await rejection<Error>(patch());
    expect(err).not.toBeInstanceOf(WorkbookConflictError);
    expect(err.message).toContain("HTTP 500");
  });
});
