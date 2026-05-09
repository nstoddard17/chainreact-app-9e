/**
 * @jest-environment node
 *
 * Tests for `flattenForStripe` — V1 port verbatim. The V1 test suite
 * was hardened against a real production incident where nested
 * objects serialized as `[object Object]`, causing Stripe's
 * `parameter_invalid_string` error. The "no [object Object] in final
 * URL-encoded body" round-trip assertion is the load-bearing
 * regression guard.
 */
import { flattenForStripe } from "@/integrations/_shared/stripe/flattenForStripe";

describe("flattenForStripe", () => {
  it("returns empty object for empty input", () => {
    expect(flattenForStripe({})).toEqual({});
  });

  it("passes through flat string values", () => {
    expect(flattenForStripe({ name: "Alice", description: "VIP" })).toEqual({
      name: "Alice",
      description: "VIP",
    });
  });

  it("stringifies numbers", () => {
    expect(flattenForStripe({ amount: 2099, quantity: 1 })).toEqual({
      amount: "2099",
      quantity: "1",
    });
  });

  it("serializes booleans as 'true'/'false' (NOT '1'/'0' or '[object Object]')", () => {
    // Stripe's form-encoding contract: booleans are the literal
    // strings 'true' / 'false'. Sending '1' / '0' parses as numbers
    // for some fields and breaks them.
    const flat = flattenForStripe({ allow_promotion_codes: true, livemode: false });
    expect(flat.allow_promotion_codes).toBe("true");
    expect(flat.livemode).toBe("false");
  });

  it("drops null and undefined entirely (does NOT stringify to 'null')", () => {
    const flat = flattenForStripe({
      name: "Alice",
      empty1: null,
      empty2: undefined,
    });
    expect(flat).toEqual({ name: "Alice" });
    expect("empty1" in flat).toBe(false);
    expect("empty2" in flat).toBe(false);
  });

  it("flattens nested objects to bracket notation", () => {
    const flat = flattenForStripe({
      customer: { email: "x@y.com", name: "Alice" },
    });
    expect(flat).toEqual({
      "customer[email]": "x@y.com",
      "customer[name]": "Alice",
    });
  });

  it("flattens deeply-nested objects with multiple bracket levels", () => {
    const flat = flattenForStripe({
      shipping: { address: { line1: "1 Main", city: "Sydney" } },
    });
    expect(flat).toEqual({
      "shipping[address][line1]": "1 Main",
      "shipping[address][city]": "Sydney",
    });
  });

  it("flattens arrays of primitives with index brackets", () => {
    const flat = flattenForStripe({
      tags: ["red", "blue", "green"],
    });
    expect(flat).toEqual({
      "tags[0]": "red",
      "tags[1]": "blue",
      "tags[2]": "green",
    });
  });

  it("flattens arrays of objects (canonical Checkout payload shape)", () => {
    // Production-incident regression — V1's `__tests__/workflows/stripe-flatten.test.ts:144-160`.
    const flat = flattenForStripe({
      line_items: [
        { price: "price_1", quantity: 2 },
        { price: "price_2", quantity: 1 },
      ],
      mode: "payment",
    });
    expect(flat).toEqual({
      "line_items[0][price]": "price_1",
      "line_items[0][quantity]": "2",
      "line_items[1][price]": "price_2",
      "line_items[1][quantity]": "1",
      mode: "payment",
    });
  });

  it("round-trips through URLSearchParams without producing '[object Object]' (production incident regression)", () => {
    const flat = flattenForStripe({
      line_items: [{ price: "price_1", quantity: 2 }],
      mode: "payment",
    });
    const body = new URLSearchParams(flat).toString();
    // %5B = '[', %5D = ']' after URL-encoding.
    expect(body).toContain("line_items%5B0%5D%5Bprice%5D=price_1");
    expect(body).toContain("line_items%5B0%5D%5Bquantity%5D=2");
    expect(body).toContain("mode=payment");
    // The load-bearing regression guards:
    expect(body).not.toContain("object+Object");
    expect(body).not.toContain("%5Bobject");
  });

  it("treats array of booleans as 'true'/'false' strings at indexed keys", () => {
    const flat = flattenForStripe({ flags: [true, false, true] });
    expect(flat).toEqual({
      "flags[0]": "true",
      "flags[1]": "false",
      "flags[2]": "true",
    });
  });

  it("drops null/undefined inside arrays without shifting indexes", () => {
    // Defensive — V1's contract is "drop null/undefined entirely";
    // V2 mirrors. Real-world callers shouldn't emit array gaps but
    // the helper handles them defensively rather than serializing
    // as 'null'.
    const flat = flattenForStripe({
      items: ["a", null, "c"],
    });
    expect(flat["items[0]"]).toBe("a");
    expect(flat["items[1]"]).toBeUndefined();
    expect(flat["items[2]"]).toBe("c");
  });

  it("does not include empty arrays in output", () => {
    const flat = flattenForStripe({ tags: [], description: "x" });
    expect(flat).toEqual({ description: "x" });
  });

  it("preserves special characters (URL-encoding is URLSearchParams' job)", () => {
    const flat = flattenForStripe({
      description: "100% off & free shipping",
    });
    expect(flat.description).toBe("100% off & free shipping");
  });

  it("handles metadata as nested object → metadata[key] notation", () => {
    const flat = flattenForStripe({
      metadata: { workflowId: "wf-123", source: "chainreact" },
    });
    expect(flat).toEqual({
      "metadata[workflowId]": "wf-123",
      "metadata[source]": "chainreact",
    });
  });

  it("flattens mixed deep + array shapes (full Subscription Items example)", () => {
    const flat = flattenForStripe({
      customer: "cus_1",
      items: [{ id: "si_1", price: "price_pro" }],
      metadata: { plan: "pro" },
    });
    expect(flat).toEqual({
      customer: "cus_1",
      "items[0][id]": "si_1",
      "items[0][price]": "price_pro",
      "metadata[plan]": "pro",
    });
  });
});
