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
  surfaceGraphError,
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
