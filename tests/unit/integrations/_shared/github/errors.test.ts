/**
 * @jest-environment node
 *
 * Tests for `_shared/github/errors.ts` — surfaceGitHubError parser
 * and the typed NotFoundError / ValidationError classes.
 */
import {
  NotFoundError,
  ValidationError,
  surfaceGitHubError,
} from "@/integrations/_shared/github/errors";

describe("NotFoundError", () => {
  it("formats message with resource label", () => {
    const e = new NotFoundError("issue 42");
    expect(e.name).toBe("NotFoundError");
    expect(e.resource).toBe("issue 42");
    expect(e.message).toBe("GitHub issue 42 not found.");
  });

  it("includes detail when supplied", () => {
    const e = new NotFoundError("issue 42", "Repository not found");
    expect(e.message).toBe("GitHub issue 42 not found: Repository not found.");
  });

  it("is an Error instance", () => {
    expect(new NotFoundError("x")).toBeInstanceOf(Error);
  });
});

describe("ValidationError", () => {
  it("formats message with resource label", () => {
    const e = new ValidationError("issue (create)");
    expect(e.name).toBe("ValidationError");
    expect(e.resource).toBe("issue (create)");
    expect(e.message).toBe("GitHub issue (create) validation failed.");
  });

  it("includes detail when supplied", () => {
    const e = new ValidationError("issue (create)", "missing title");
    expect(e.message).toBe(
      "GitHub issue (create) validation failed: missing title.",
    );
  });
});

describe("surfaceGitHubError", () => {
  it("returns 'HTTP <status>' for empty body", () => {
    expect(surfaceGitHubError("", 500)).toBe("HTTP 500");
  });

  it("returns 'HTTP <status>' for non-JSON body", () => {
    expect(surfaceGitHubError("<html>500 Server Error</html>", 500)).toBe(
      "HTTP 500",
    );
  });

  it("returns 'HTTP <status>' for null/scalar JSON", () => {
    expect(surfaceGitHubError("null", 500)).toBe("HTTP 500");
    expect(surfaceGitHubError('"some string"', 500)).toBe("HTTP 500");
    expect(surfaceGitHubError("42", 500)).toBe("HTTP 500");
  });

  it("returns the top-level message when present and no errors[] array", () => {
    expect(
      surfaceGitHubError(
        JSON.stringify({ message: "Not Found" }),
        404,
      ),
    ).toBe("Not Found");
  });

  it("combines top-level message with per-error message when both present", () => {
    const text = JSON.stringify({
      message: "Validation Failed",
      errors: [
        {
          resource: "Issue",
          code: "missing_field",
          field: "title",
          message: "Title is required",
        },
      ],
    });
    expect(surfaceGitHubError(text, 422)).toBe(
      "Validation Failed: Title is required",
    );
  });

  it("falls back to code+field when per-error message is absent", () => {
    const text = JSON.stringify({
      message: "Validation Failed",
      errors: [
        {
          resource: "Issue",
          code: "missing_field",
          field: "title",
        },
      ],
    });
    expect(surfaceGitHubError(text, 422)).toBe(
      "Validation Failed: missing_field on title",
    );
  });

  it("falls back to code alone when only code is present in per-error", () => {
    const text = JSON.stringify({
      message: "Validation Failed",
      errors: [{ resource: "Issue", code: "already_exists" }],
    });
    expect(surfaceGitHubError(text, 422)).toBe(
      "Validation Failed: already_exists",
    );
  });

  it("handles errors[] entries that are bare strings", () => {
    const text = JSON.stringify({
      message: "Validation Failed",
      errors: ["title is empty"],
    });
    expect(surfaceGitHubError(text, 422)).toBe(
      "Validation Failed: title is empty",
    );
  });

  it("returns just message when errors[] is empty", () => {
    const text = JSON.stringify({ message: "Forbidden", errors: [] });
    expect(surfaceGitHubError(text, 403)).toBe("Forbidden");
  });

  it("returns 'HTTP <status>' when neither message nor recognizable errors[] is present", () => {
    expect(surfaceGitHubError(JSON.stringify({ foo: "bar" }), 500)).toBe(
      "HTTP 500",
    );
  });
});
