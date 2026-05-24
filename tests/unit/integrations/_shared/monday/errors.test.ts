/**
 * @jest-environment node
 *
 * Slice 3.MONDAY-2 — Tests for Monday-specific typed errors and the
 * GraphQL-error surface helper.
 */
import {
  isNotFoundError,
  isRateLimitError,
  MondayApiError,
  NotFoundError,
  RateLimitError,
  surfaceMondayGraphqlErrors,
} from "@/integrations/_shared/monday/errors";

describe("NotFoundError", () => {
  it("formats with resource label", () => {
    const e = new NotFoundError("item 42");
    expect(e.message).toContain("Monday resource 'item 42' not found");
    expect(e.name).toBe("NotFoundError");
    expect(e.resource).toBe("item 42");
  });

  it("includes detail when provided", () => {
    const e = new NotFoundError("board 1", "no access");
    expect(e.message).toContain("no access");
  });
});

describe("RateLimitError", () => {
  it("formats without detail / retry", () => {
    const e = new RateLimitError();
    expect(e.message).toMatch(/Monday rate limit exceeded/);
    expect(e.retryAfterSeconds).toBeNull();
  });

  it("carries retryAfterSeconds when provided", () => {
    const e = new RateLimitError("complexity exceeded", 60);
    expect(e.retryAfterSeconds).toBe(60);
    expect(e.message).toContain("complexity exceeded");
  });
});

describe("MondayApiError", () => {
  it("formats with status when provided", () => {
    const e = new MondayApiError("bad query", 400);
    expect(e.message).toContain("HTTP 400");
    expect(e.message).toContain("bad query");
    expect(e.status).toBe(400);
  });

  it("formats without status when omitted", () => {
    const e = new MondayApiError("something failed");
    expect(e.status).toBeNull();
    expect(e.message).not.toMatch(/HTTP/);
  });
});

describe("surfaceMondayGraphqlErrors", () => {
  it("extracts GraphQL message + code", () => {
    const result = surfaceMondayGraphqlErrors(
      JSON.stringify({
        errors: [
          {
            message: "Field is required",
            extensions: { code: "InvalidArgumentException" },
          },
        ],
      }),
      200,
    );
    expect(result).toBe("InvalidArgumentException: Field is required");
  });

  it("joins multiple errors with semicolons", () => {
    const result = surfaceMondayGraphqlErrors(
      JSON.stringify({
        errors: [
          { message: "Err A", extensions: { code: "X" } },
          { message: "Err B" },
        ],
      }),
      200,
    );
    expect(result).toContain("X: Err A");
    expect(result).toContain("Err B");
  });

  it("falls back to error_message + error_code (legacy envelope)", () => {
    const result = surfaceMondayGraphqlErrors(
      JSON.stringify({
        error_message: "Old-style error",
        error_code: "OLD_CODE",
      }),
      400,
    );
    expect(result).toBe("OLD_CODE: Old-style error");
  });

  it("falls back to HTTP status on non-JSON body", () => {
    const result = surfaceMondayGraphqlErrors("<html>not json</html>", 502);
    expect(result).toBe("HTTP 502");
  });

  it("does NOT leak the raw body — only message + code surfaced", () => {
    // The helper extracts only `message` and `extensions.code` — any
    // adversarial response payload doesn't leak through (no secret
    // tokens / no full body echo).
    const result = surfaceMondayGraphqlErrors(
      JSON.stringify({
        errors: [{ message: "safe message" }],
        secret_field: "do-not-leak",
        extensions: { internal: "do-not-leak" },
      }),
      200,
    );
    expect(result).toContain("safe message");
    expect(result).not.toContain("do-not-leak");
  });
});

describe("isNotFoundError", () => {
  it("returns true for ResourceNotFoundException", () => {
    expect(
      isNotFoundError([
        { extensions: { code: "ResourceNotFoundException" } },
      ]),
    ).toBe(true);
  });

  it("returns true for InvalidArgumentException with 'not found' message", () => {
    expect(
      isNotFoundError([
        {
          message: "Item does not exist",
          extensions: { code: "InvalidArgumentException" },
        },
      ]),
    ).toBe(true);
  });

  it("returns false for InvalidArgumentException without 'not found' shape", () => {
    expect(
      isNotFoundError([
        {
          message: "bad shape",
          extensions: { code: "InvalidArgumentException" },
        },
      ]),
    ).toBe(false);
  });

  it("returns false for unrelated errors", () => {
    expect(isNotFoundError([{ message: "x" }])).toBe(false);
  });
});

describe("isRateLimitError", () => {
  it("returns true for ComplexityException", () => {
    expect(
      isRateLimitError([{ extensions: { code: "ComplexityException" } }]),
    ).toBe(true);
  });

  it("returns true for DailyLimitExceeded", () => {
    expect(
      isRateLimitError([{ extensions: { code: "DailyLimitExceeded" } }]),
    ).toBe(true);
  });

  it("returns true for RateLimitExceeded", () => {
    expect(
      isRateLimitError([{ extensions: { code: "RateLimitExceeded" } }]),
    ).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isRateLimitError([{ message: "x" }])).toBe(false);
  });
});
