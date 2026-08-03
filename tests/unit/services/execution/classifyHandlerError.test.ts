/**
 * @jest-environment node
 *
 * `classifyHandlerError` — handler throw → `RunFailureCode`.
 *
 * The module matches on `err.name` rather than `instanceof`, to avoid an
 * import cycle back into `services/execution`. Its own doc comment states
 * the consequence: "Renaming any of those classes silently degrades a run to
 * `HANDLER_FAILED`, which is why each mapping has a test that throws the REAL
 * class rather than a hand-set name."
 *
 * So every case here constructs the genuine error class. A test that faked
 * `{ name: "..." }` would keep passing through exactly the rename it exists
 * to catch.
 */
import { classifyHandlerError } from "@/services/execution/classifyHandlerError";
import { WorkbookConflictError } from "@/integrations/_shared/microsoft/api/errors";
import {
  IntegrationActionRequiredError,
  InsufficientScopeError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";

function conflict(): WorkbookConflictError {
  return new WorkbookConflictError({
    operation: "workbook/.../range PATCH",
    httpStatus: 409,
    detail: {
      code: "conflict",
      innerCode: "accessConflict",
      requestId: "req-1",
      clientRequestId: "cli-1",
    },
  });
}

describe("workbook conflicts get their own code", () => {
  it("maps the REAL WorkbookConflictError to PROVIDER_CONFLICT", () => {
    expect(classifyHandlerError(conflict())).toBe("PROVIDER_CONFLICT");
  });

  it("is NOT classified as a transient failure", () => {
    // `TRANSIENT_PROVIDER_ERROR` humanizes to "retrying usually succeeds".
    // Retrying a locked workbook is the one thing Microsoft documents a
    // client must not do, so this distinction is the whole point of the code.
    expect(classifyHandlerError(conflict())).not.toBe("TRANSIENT_PROVIDER_ERROR");
  });

  it("is NOT classified as an auth, scope, or unknown failure", () => {
    const code = classifyHandlerError(conflict());
    expect(code).not.toBe("INTEGRATION_REAUTH_REQUIRED");
    expect(code).not.toBe("INTEGRATION_SCOPE_REQUIRED");
    expect(code).not.toBe("HANDLER_FAILED");
  });
});

describe("neighbouring classifications are unchanged", () => {
  it("401 still routes to reconnect", () => {
    expect(classifyHandlerError(new Unauthorized401Error())).toBe(
      "INTEGRATION_REAUTH_REQUIRED",
    );
  });

  it("action-required still routes to reconnect", () => {
    expect(
      classifyHandlerError(
        new IntegrationActionRequiredError({
          accountId: "acct-1",
          provider: "microsoft-excel",
          providerAccountId: null,
          reason: "refresh_failed",
        }),
      ),
    ).toBe("INTEGRATION_REAUTH_REQUIRED");
  });

  it("missing scope still routes to re-consent", () => {
    expect(classifyHandlerError(new InsufficientScopeError())).toBe(
      "INTEGRATION_SCOPE_REQUIRED",
    );
  });

  it("an ordinary provider error still falls back to HANDLER_FAILED", () => {
    expect(
      classifyHandlerError(
        new Error("Microsoft Graph workbook/.../range PATCH failed: HTTP 500"),
      ),
    ).toBe("HANDLER_FAILED");
  });

  it("a non-Error throw falls back to HANDLER_FAILED", () => {
    expect(classifyHandlerError("just a string")).toBe("HANDLER_FAILED");
    expect(classifyHandlerError(undefined)).toBe("HANDLER_FAILED");
  });
});
