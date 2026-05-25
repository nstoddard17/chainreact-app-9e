/**
 * @jest-environment node
 */
import {
  NotFoundError,
  surfaceAirtableError,
} from "@/integrations/_shared/airtable/errors";

describe("Airtable NotFoundError", () => {
  it("carries the resource label and includes detail when given", () => {
    const err = new NotFoundError("record rec1", "could not find rec1");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("NotFoundError");
    expect(err.resource).toBe("record rec1");
    expect(err.message).toContain("record rec1");
    expect(err.message).toContain("could not find rec1");
  });

  it("works without a detail argument", () => {
    const err = new NotFoundError("base appXXXX");
    expect(err.message).toContain("base appXXXX");
    expect(err.message).not.toContain("undefined");
  });
});

describe("surfaceAirtableError — error envelope parsing", () => {
  it("parses the standard { error: { message } } envelope", () => {
    expect(
      surfaceAirtableError(
        JSON.stringify({
          error: { type: "NOT_FOUND", message: "Record not found" },
        }),
        404,
      ),
    ).toBe("Record not found");
  });

  it("falls back to error.type when error.message is missing", () => {
    expect(
      surfaceAirtableError(
        JSON.stringify({ error: { type: "INVALID_REQUEST" } }),
        400,
      ),
    ).toBe("INVALID_REQUEST");
  });

  it("falls back to HTTP <status> on non-JSON bodies", () => {
    expect(surfaceAirtableError("not json", 502)).toBe("HTTP 502");
  });

  it("falls back to HTTP <status> when JSON has no error key", () => {
    expect(
      surfaceAirtableError(JSON.stringify({ unrelated: "x" }), 503),
    ).toBe("HTTP 503");
  });
});
