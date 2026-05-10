/**
 * @jest-environment node
 *
 * Tests for `_shared/hubspot/errors.ts`:
 *   - NotFoundError + ConflictError name/resource/message shape.
 *   - surfaceHubSpotError on the common HubSpot CRM v3 error body shapes
 *     + fallback paths (HTML / malformed JSON / empty / non-object).
 */
import {
  ConflictError,
  NotFoundError,
  surfaceHubSpotError,
} from "@/integrations/_shared/hubspot/errors";

describe("NotFoundError", () => {
  it("formats the message with the resource name", () => {
    const err = new NotFoundError("contact 42");
    expect(err.message).toBe("HubSpot contact 42 not found.");
    expect(err.name).toBe("NotFoundError");
    expect(err.resource).toBe("contact 42");
  });

  it("includes optional detail in the message", () => {
    const err = new NotFoundError("contact 42", "deleted yesterday");
    expect(err.message).toBe(
      "HubSpot contact 42 not found: deleted yesterday.",
    );
  });
});

describe("ConflictError", () => {
  it("formats the message with the resource + surfaced HubSpot error", () => {
    const err = new ConflictError(
      "contact (create)",
      JSON.stringify({
        status: "error",
        message: "Contact already exists. Existing ID: 12345",
        category: "OBJECT_ALREADY_EXISTS",
      }),
    );
    expect(err.name).toBe("ConflictError");
    expect(err.resource).toBe("contact (create)");
    expect(err.message).toMatch(/Contact already exists/);
  });

  it("preserves the raw error body for diagnostic access (NOT for regex extraction)", () => {
    const body = JSON.stringify({
      status: "error",
      message: "Contact already exists. Existing ID: 12345",
    });
    const err = new ConflictError("contact (create)", body);
    expect(err.errorBody).toBe(body);
  });
});

describe("surfaceHubSpotError", () => {
  it("returns the `message` field when present", () => {
    const body = JSON.stringify({
      status: "error",
      message: "Property values were not valid",
      category: "VALIDATION_ERROR",
    });
    expect(surfaceHubSpotError(body, 400)).toBe(
      "Property values were not valid",
    );
  });

  it("falls back to `category` when `message` is missing", () => {
    const body = JSON.stringify({
      status: "error",
      category: "OBJECT_NOT_FOUND",
    });
    expect(surfaceHubSpotError(body, 404)).toBe("OBJECT_NOT_FOUND");
  });

  it("falls back to HTTP <status> when neither message nor category is present", () => {
    expect(surfaceHubSpotError(JSON.stringify({}), 500)).toBe("HTTP 500");
  });

  it("returns HTTP <status> on empty body", () => {
    expect(surfaceHubSpotError("", 502)).toBe("HTTP 502");
  });

  it("returns HTTP <status> on non-JSON body (e.g. HTML error page from CDN)", () => {
    expect(surfaceHubSpotError("<html>503 Bad Gateway</html>", 503)).toBe(
      "HTTP 503",
    );
  });

  it("returns HTTP <status> on a JSON value that isn't an object (e.g. plain string)", () => {
    expect(surfaceHubSpotError('"oops"', 500)).toBe("HTTP 500");
  });

  it("returns HTTP <status> when `message` is an empty string (defensive)", () => {
    const body = JSON.stringify({ message: "" });
    expect(surfaceHubSpotError(body, 500)).toBe("HTTP 500");
  });
});
