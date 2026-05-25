import {
  TrelloNotFoundError,
  surfaceTrelloError,
} from "@/integrations/_shared/trello/api/errors";

describe("TrelloNotFoundError", () => {
  it("constructs with resource + optional detail", () => {
    const err = new TrelloNotFoundError("card abc", "invalid id");
    expect(err.name).toBe("TrelloNotFoundError");
    expect(err.resource).toBe("card abc");
    expect(err.message).toContain("card abc");
    expect(err.message).toContain("invalid id");
  });

  it("constructs without detail", () => {
    const err = new TrelloNotFoundError("card abc");
    expect(err.message).toContain("card abc");
    expect(err.message).not.toContain("undefined");
  });
});

describe("surfaceTrelloError", () => {
  it("returns the message field from a JSON envelope", () => {
    const text = JSON.stringify({ message: "Card not found" });
    expect(surfaceTrelloError(text, 404)).toBe("Card not found");
  });

  it("returns the error field from a JSON envelope", () => {
    const text = JSON.stringify({ error: "INVALID_TOKEN" });
    expect(surfaceTrelloError(text, 401)).toBe("INVALID_TOKEN");
  });

  it("returns plain-text body verbatim when not JSON", () => {
    expect(surfaceTrelloError("invalid value for field 'name'", 400)).toBe(
      "invalid value for field 'name'",
    );
  });

  it("falls back to HTTP <status> when body is empty", () => {
    expect(surfaceTrelloError("", 500)).toBe("HTTP 500");
    expect(surfaceTrelloError("   ", 500)).toBe("HTTP 500");
  });

  it("truncates extremely long plain-text bodies", () => {
    const long = "x".repeat(500);
    const surfaced = surfaceTrelloError(long, 400);
    expect(surfaced.length).toBeLessThanOrEqual(201);
    expect(surfaced).toMatch(/…$/);
  });
});
