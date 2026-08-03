/** @jest-environment node */
import {
  NotFoundError,
  surfaceNotionError,
} from "@/integrations/_shared/notion/api/errors";

describe("Notion NotFoundError", () => {
  it("formats a simple resource label", () => {
    const err = new NotFoundError("page abc-123");
    expect(err.name).toBe("NotFoundError");
    expect(err.resource).toBe("page abc-123");
    expect(err.message).toContain("page abc-123");
  });

  it("appends the optional detail", () => {
    const err = new NotFoundError(
      "database xyz",
      "Could not find database with ID xyz",
    );
    expect(err.message).toContain("Could not find database");
  });
});

describe("surfaceNotionError", () => {
  it("extracts the message field from Notion's error envelope", () => {
    const text = JSON.stringify({
      object: "error",
      status: 400,
      code: "validation_error",
      message: "body failed validation",
      request_id: "req-1",
    });
    expect(surfaceNotionError(text, 400)).toBe("body failed validation");
  });

  it("falls back to the code when message is missing", () => {
    const text = JSON.stringify({
      object: "error",
      status: 401,
      code: "unauthorized",
    });
    expect(surfaceNotionError(text, 401)).toBe("unauthorized");
  });

  it("falls back to HTTP <status> when body isn't valid JSON", () => {
    expect(surfaceNotionError("not json", 502)).toBe("HTTP 502");
  });

  it("falls back to HTTP <status> when body is JSON but lacks Notion's envelope", () => {
    expect(surfaceNotionError(JSON.stringify({ foo: "bar" }), 500)).toBe(
      "HTTP 500",
    );
  });
});
