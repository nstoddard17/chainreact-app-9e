/**
 * @jest-environment node
 *
 * Tests for the shared Microsoft Graph error helpers. NotFoundError +
 * surfaceGraphError are used by every per-provider API wrapper to surface
 * Graph's canonical `{ error: { code, message } }` envelope as either a
 * typed throw (NotFoundError) or a human-readable detail string.
 */
import {
  NotFoundError,
  WorkbookConflictError,
  isWorkbookConflict,
  parseGraphErrorDetail,
  surfaceGraphError,
  throwIfWorkbookConflict,
} from "@/integrations/_shared/microsoft/api/errors";

describe("NotFoundError", () => {
  it("formats message with the resource label", () => {
    const err = new NotFoundError("subscription sub-1");
    expect(err.name).toBe("NotFoundError");
    expect(err.message).toBe(
      "Microsoft Graph resource 'subscription sub-1' not found.",
    );
    expect(err.resource).toBe("subscription sub-1");
  });

  it("appends an optional detail to the message", () => {
    const err = new NotFoundError("message msg-1", "ErrorItemNotFound");
    expect(err.message).toBe(
      "Microsoft Graph resource 'message msg-1' not found: ErrorItemNotFound.",
    );
    expect(err.resource).toBe("message msg-1");
  });

  it("is throwable + catchable as instanceof", () => {
    expect(() => {
      throw new NotFoundError("x");
    }).toThrow(NotFoundError);
  });
});

describe("surfaceGraphError", () => {
  it("returns error.message when the body is a Graph error envelope", () => {
    const text = JSON.stringify({
      error: {
        code: "ErrorInvalidRecipients",
        message: "Invalid recipient address",
      },
    });
    expect(surfaceGraphError(text, 400)).toBe("Invalid recipient address");
  });

  it("falls back to error.code when error.message is missing", () => {
    const text = JSON.stringify({ error: { code: "ErrorAccessDenied" } });
    expect(surfaceGraphError(text, 403)).toBe("ErrorAccessDenied");
  });

  it("falls back to HTTP status when the body is non-JSON", () => {
    expect(surfaceGraphError("<html>upstream timeout</html>", 503)).toBe(
      "HTTP 503",
    );
  });

  it("falls back to HTTP status when the body is JSON but lacks an error envelope", () => {
    expect(surfaceGraphError("{}", 500)).toBe("HTTP 500");
  });

  it("handles empty string body without crashing", () => {
    expect(surfaceGraphError("", 502)).toBe("HTTP 502");
  });
});

/**
 * EXCEL-UPDATE-ROW-CONCURRENCY-4.
 *
 * Microsoft puts the code that says WHAT happened one level below the code
 * that says which HTTP shape it was, and instructs clients to read the
 * second level first. `surfaceGraphError` above reads only the top level,
 * which is why a real workbook conflict used to arrive as an unclassified
 * failure. Source: https://learn.microsoft.com/en-us/graph/workbook-error-handling
 */
describe("parseGraphErrorDetail", () => {
  it("reads the top-level code, the nested code, and both correlation ids", () => {
    const text = JSON.stringify({
      error: {
        code: "conflict",
        message: "The request conflicts with the current state.",
        innerError: {
          code: "accessConflict",
          "request-id": "214ca7ea-9ea4-442e-9c67-71fdda0a559c",
          "client-request-id": "e70c5c1b-8b47-68c0-3171-3d22f5e0bd54",
          date: "2026-08-03T03:56:09",
        },
      },
    });
    expect(parseGraphErrorDetail(text)).toEqual({
      code: "conflict",
      innerCode: "accessConflict",
      requestId: "214ca7ea-9ea4-442e-9c67-71fdda0a559c",
      clientRequestId: "e70c5c1b-8b47-68c0-3171-3d22f5e0bd54",
    });
  });

  it("keeps the DEEPEST code when innerError nests recursively", () => {
    // Microsoft documents that innerError "might recursively contain more
    // innerError objects with additional, more specific error codes" — the
    // most specific one is the one worth acting on.
    const text = JSON.stringify({
      error: {
        code: "internalServerError",
        innerError: {
          code: "internalServerErrorUncategorized",
          innerError: { code: "GenericFileOpenError" },
        },
      },
    });
    expect(parseGraphErrorDetail(text).innerCode).toBe("GenericFileOpenError");
  });

  it("finds a correlation id declared at an outer level than the deepest code", () => {
    const text = JSON.stringify({
      error: {
        code: "conflict",
        innerError: {
          code: "conflictUncategorized",
          "request-id": "req-1",
          innerError: { code: "accessConflict" },
        },
      },
    });
    const detail = parseGraphErrorDetail(text);
    expect(detail.innerCode).toBe("accessConflict");
    expect(detail.requestId).toBe("req-1");
  });

  it("answers all-undefined for a malformed, empty or envelope-free body", () => {
    const empty = {
      code: undefined,
      innerCode: undefined,
      requestId: undefined,
      clientRequestId: undefined,
    };
    expect(parseGraphErrorDetail("<html>gateway</html>")).toEqual(empty);
    expect(parseGraphErrorDetail("")).toEqual(empty);
    expect(parseGraphErrorDetail("{}")).toEqual(empty);
    expect(parseGraphErrorDetail(JSON.stringify({ error: {} }))).toEqual(empty);
  });

  it("survives a self-referential innerError chain instead of hanging", () => {
    // The body is remote input; a runaway or cyclic structure must not be
    // able to spin the handler.
    const cyclic: Record<string, unknown> = { code: "a" };
    cyclic["innerError"] = cyclic;
    // JSON.stringify would throw on a true cycle, so emulate depth instead.
    let nested: Record<string, unknown> = { code: "deepest" };
    for (let i = 0; i < 40; i++) nested = { code: `l${i}`, innerError: nested };
    const detail = parseGraphErrorDetail(
      JSON.stringify({ error: { code: "top", innerError: nested } }),
    );
    expect(detail.code).toBe("top");
    expect(typeof detail.innerCode).toBe("string");
  });

  it("ignores non-string codes rather than coercing them", () => {
    const text = JSON.stringify({
      error: { code: 409, innerError: { code: { nested: true } } },
    });
    const detail = parseGraphErrorDetail(text);
    expect(detail.code).toBeUndefined();
    expect(detail.innerCode).toBeUndefined();
  });
});

describe("isWorkbookConflict", () => {
  const bare = {
    code: undefined,
    innerCode: undefined,
    requestId: undefined,
    clientRequestId: undefined,
  };

  it.each([
    "accessConflict",
    "conflictUncategorized",
    "invalidSessionAccessConflict",
    "insertDeleteConflict",
    "filteredRangeConflict",
  ])("recognizes the documented conflict code %s", (innerCode) => {
    expect(isWorkbookConflict(400, { ...bare, innerCode })).toBe(true);
  });

  it("compares case-insensitively, as Microsoft documents", () => {
    expect(isWorkbookConflict(400, { ...bare, innerCode: "ACCESSCONFLICT" })).toBe(
      true,
    );
    expect(isWorkbookConflict(400, { ...bare, innerCode: "AccessConflict" })).toBe(
      true,
    );
  });

  it("does NOT treat every 409 as this failure when a different cause is named", () => {
    // The whole reason to read the second level: a 409 whose cause is
    // "this already exists" is not somebody editing the file, and telling
    // the user to wait for an edit that never happened would be a lie.
    expect(
      isWorkbookConflict(409, { ...bare, innerCode: "itemAlreadyExists" }),
    ).toBe(false);
  });

  it("falls back to the status when the body names no cause at all", () => {
    expect(isWorkbookConflict(409, bare)).toBe(true);
    expect(isWorkbookConflict(412, bare)).toBe(true);
  });

  it.each([401, 403, 404, 429, 500, 502, 503])(
    "leaves HTTP %i alone",
    (status) => {
      expect(isWorkbookConflict(status, bare)).toBe(false);
    },
  );

  it("does not classify an unrecognized second-level code, whatever the status", () => {
    // A code Microsoft adds later must fall through to the generic path
    // rather than inherit "do not retry" semantics it may not have.
    expect(
      isWorkbookConflict(409, { ...bare, innerCode: "somethingNewIn2027" }),
    ).toBe(false);
  });
});

describe("throwIfWorkbookConflict", () => {
  const conflictBody = JSON.stringify({
    error: {
      code: "conflict",
      message: "Workbook is locked for editing by another client.",
      innerError: {
        code: "accessConflict",
        "request-id": "req-9",
        "client-request-id": "cli-9",
      },
    },
  });

  it("throws a typed conflict carrying every diagnostic field", () => {
    let thrown: unknown;
    try {
      throwIfWorkbookConflict({
        operation: "workbook/.../range PATCH",
        httpStatus: 409,
        body: conflictBody,
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(WorkbookConflictError);
    const conflict = thrown as WorkbookConflictError;
    expect(conflict.httpStatus).toBe(409);
    expect(conflict.graphCode).toBe("conflict");
    expect(conflict.graphInnerCode).toBe("accessConflict");
    expect(conflict.requestId).toBe("req-9");
    expect(conflict.clientRequestId).toBe("cli-9");
  });

  it("uses a STABLE name — the engine classifies on it, not on instanceof", () => {
    // `classifyHandlerError` matches `err.name` to avoid an import cycle, so
    // renaming this class silently degrades the run to HANDLER_FAILED.
    expect(new WorkbookConflictError({
      operation: "op",
      httpStatus: 409,
      detail: {
        code: undefined,
        innerCode: undefined,
        requestId: undefined,
        clientRequestId: undefined,
      },
    }).name).toBe("WorkbookConflictError");
  });

  it("returns quietly for a failure that is not a conflict", () => {
    expect(() =>
      throwIfWorkbookConflict({
        operation: "op",
        httpStatus: 500,
        body: JSON.stringify({ error: { code: "internalServerError" } }),
      }),
    ).not.toThrow();
  });

  it("carries no workbook content in its message", () => {
    // The body it parses can contain a provider message naming the file;
    // the thrown message is built from the operation, the status and the
    // Graph code only.
    const withFilename = JSON.stringify({
      error: {
        code: "conflict",
        message: "Q3 Payroll.xlsx is locked by alice@contoso.com",
        innerError: { code: "accessConflict" },
      },
    });
    let thrown: WorkbookConflictError | undefined;
    try {
      throwIfWorkbookConflict({
        operation: "workbook/.../range PATCH",
        httpStatus: 409,
        body: withFilename,
      });
    } catch (err) {
      thrown = err as WorkbookConflictError;
    }
    expect(thrown!.message).not.toContain("Payroll");
    expect(thrown!.message).not.toContain("contoso");
    expect(thrown!.message).toContain("accessConflict");
  });
});
