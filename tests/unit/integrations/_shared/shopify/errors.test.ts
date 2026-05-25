import {
  NotFoundError,
  surfaceShopifyError,
} from "@/integrations/_shared/shopify/errors";

describe("NotFoundError", () => {
  it("carries the resource label and detail in the message", () => {
    const err = new NotFoundError("order 123", "could not find resource");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("NotFoundError");
    expect(err.resource).toBe("order 123");
    expect(err.message).toContain("order 123");
    expect(err.message).toContain("could not find resource");
  });

  it("works without a detail string", () => {
    const err = new NotFoundError("customer 999");
    expect(err.message).toBe("Shopify customer 999 not found.");
  });
});

describe("surfaceShopifyError", () => {
  it("returns 'HTTP <status>' for empty body", () => {
    expect(surfaceShopifyError("", 500)).toBe("HTTP 500");
  });

  it("returns 'HTTP <status>' when body is not JSON", () => {
    expect(surfaceShopifyError("<html>oops</html>", 502)).toBe("HTTP 502");
  });

  it("extracts top-level string `errors`", () => {
    expect(
      surfaceShopifyError(JSON.stringify({ errors: "Order not found" }), 404),
    ).toBe("Order not found");
  });

  it("extracts first item from top-level array `errors`", () => {
    expect(
      surfaceShopifyError(
        JSON.stringify({ errors: ["bad", "worse"] }),
        422,
      ),
    ).toBe("bad");
  });

  it("extracts first field/message from per-field map `errors` (422 shape)", () => {
    expect(
      surfaceShopifyError(
        JSON.stringify({
          errors: { email: ["is invalid"], phone: ["too short"] },
        }),
        422,
      ),
    ).toBe("email: is invalid");
  });

  it("extracts string-valued field from per-field map", () => {
    expect(
      surfaceShopifyError(
        JSON.stringify({ errors: { base: "Resource locked" } }),
        409,
      ),
    ).toBe("base: Resource locked");
  });

  it("falls back to status when JSON has no `errors` field", () => {
    expect(surfaceShopifyError(JSON.stringify({ ok: true }), 500)).toBe(
      "HTTP 500",
    );
  });
});
