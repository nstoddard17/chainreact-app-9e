/**
 * @jest-environment node
 *
 * Schema tests for `create_payment_link`. Pins the strict-mode
 * shape + lineItems required + afterCompletion discriminated-union
 * shape + unknown-field rejection (no raw passthrough — parity-stripe
 * §8 R-Stripe-2).
 */
import { CreatePaymentLinkConfigSchema } from "@/integrations/stripe/actions/createPaymentLink.schema";

describe("CreatePaymentLinkConfigSchema", () => {
  describe("happy paths", () => {
    it("accepts minimal config (single line item)", () => {
      const result = CreatePaymentLinkConfigSchema.safeParse({
        lineItems: [{ priceId: "price_123", quantity: 1 }],
      });
      expect(result.success).toBe(true);
    });

    it("accepts multiple line items", () => {
      const result = CreatePaymentLinkConfigSchema.safeParse({
        lineItems: [
          { priceId: "price_aaa", quantity: 2 },
          { priceId: "price_bbb", quantity: 1 },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("accepts the full set of optional safe fields with redirect afterCompletion", () => {
      const result = CreatePaymentLinkConfigSchema.safeParse({
        lineItems: [{ priceId: "price_123", quantity: 1 }],
        metadata: { orderId: "order_42" },
        allowPromotionCodes: true,
        afterCompletion: {
          type: "redirect",
          redirectUrl: "https://example.com/thanks",
        },
      });
      expect(result.success).toBe(true);
    });

    it("accepts hosted_confirmation afterCompletion variant", () => {
      const result = CreatePaymentLinkConfigSchema.safeParse({
        lineItems: [{ priceId: "price_123", quantity: 1 }],
        afterCompletion: { type: "hosted_confirmation" },
      });
      expect(result.success).toBe(true);
    });

    it("accepts up to 20 line items (Stripe cap)", () => {
      const lineItems = Array.from({ length: 20 }, (_, i) => ({
        priceId: `price_${i}`,
        quantity: 1,
      }));
      const result = CreatePaymentLinkConfigSchema.safeParse({ lineItems });
      expect(result.success).toBe(true);
    });
  });

  describe("required fields", () => {
    it("rejects missing lineItems", () => {
      const result = CreatePaymentLinkConfigSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("rejects empty lineItems array", () => {
      const result = CreatePaymentLinkConfigSchema.safeParse({
        lineItems: [],
      });
      expect(result.success).toBe(false);
    });

    it("rejects more than 20 line items (Stripe cap)", () => {
      const lineItems = Array.from({ length: 21 }, (_, i) => ({
        priceId: `price_${i}`,
        quantity: 1,
      }));
      const result = CreatePaymentLinkConfigSchema.safeParse({ lineItems });
      expect(result.success).toBe(false);
    });
  });

  describe("line items", () => {
    it("rejects an entry with missing priceId", () => {
      const result = CreatePaymentLinkConfigSchema.safeParse({
        lineItems: [{ quantity: 1 }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects an entry with empty-string priceId", () => {
      const result = CreatePaymentLinkConfigSchema.safeParse({
        lineItems: [{ priceId: "", quantity: 1 }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects an entry with zero quantity", () => {
      const result = CreatePaymentLinkConfigSchema.safeParse({
        lineItems: [{ priceId: "price_123", quantity: 0 }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects an entry with negative quantity", () => {
      const result = CreatePaymentLinkConfigSchema.safeParse({
        lineItems: [{ priceId: "price_123", quantity: -1 }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects a non-integer quantity (e.g. 1.5)", () => {
      const result = CreatePaymentLinkConfigSchema.safeParse({
        lineItems: [{ priceId: "price_123", quantity: 1.5 }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects unknown fields inside a line item (no raw passthrough)", () => {
      const result = CreatePaymentLinkConfigSchema.safeParse({
        lineItems: [
          {
            priceId: "price_123",
            quantity: 1,
            // V1 quirk: arbitrary inner-shape passthrough. V2 rejects.
            adjustable_quantity: { enabled: true, maximum: 10 },
          },
        ],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("afterCompletion discriminated union", () => {
    it("rejects redirect variant without redirectUrl", () => {
      const result = CreatePaymentLinkConfigSchema.safeParse({
        lineItems: [{ priceId: "price_123", quantity: 1 }],
        afterCompletion: { type: "redirect" },
      });
      expect(result.success).toBe(false);
    });

    it("rejects redirect variant with non-URL redirectUrl", () => {
      const result = CreatePaymentLinkConfigSchema.safeParse({
        lineItems: [{ priceId: "price_123", quantity: 1 }],
        afterCompletion: { type: "redirect", redirectUrl: "not-a-url" },
      });
      expect(result.success).toBe(false);
    });

    it("rejects hosted_confirmation variant carrying redirectUrl (strict)", () => {
      const result = CreatePaymentLinkConfigSchema.safeParse({
        lineItems: [{ priceId: "price_123", quantity: 1 }],
        afterCompletion: {
          type: "hosted_confirmation",
          redirectUrl: "https://example.com/thanks",
        },
      });
      expect(result.success).toBe(false);
    });

    it("rejects unknown afterCompletion type", () => {
      const result = CreatePaymentLinkConfigSchema.safeParse({
        lineItems: [{ priceId: "price_123", quantity: 1 }],
        afterCompletion: { type: "showSpinner" },
      });
      expect(result.success).toBe(false);
    });
  });

  describe("strict mode — unknown fields rejected at top level", () => {
    it("rejects V1's legacy snake_case line_items field (raw JSON-string passthrough surrogate)", () => {
      const result = CreatePaymentLinkConfigSchema.safeParse({
        line_items: JSON.stringify([{ price: "price_123", quantity: 1 }]),
      });
      expect(result.success).toBe(false);
    });

    it("rejects raw after_completion snake_case passthrough", () => {
      const result = CreatePaymentLinkConfigSchema.safeParse({
        lineItems: [{ priceId: "price_123", quantity: 1 }],
        after_completion: { type: "redirect", redirect: { url: "https://example.com" } },
      });
      expect(result.success).toBe(false);
    });

    it("rejects V1's deferred shipping_countries field", () => {
      const result = CreatePaymentLinkConfigSchema.safeParse({
        lineItems: [{ priceId: "price_123", quantity: 1 }],
        shipping_countries: ["US"],
      });
      expect(result.success).toBe(false);
    });

    it("rejects V1's deferred application_fee_amount field", () => {
      const result = CreatePaymentLinkConfigSchema.safeParse({
        lineItems: [{ priceId: "price_123", quantity: 1 }],
        application_fee_amount: 100,
      });
      expect(result.success).toBe(false);
    });

    it("rejects V1's deferred application_fee_percent field", () => {
      const result = CreatePaymentLinkConfigSchema.safeParse({
        lineItems: [{ priceId: "price_123", quantity: 1 }],
        application_fee_percent: 10,
      });
      expect(result.success).toBe(false);
    });

    it("rejects metadata with non-string values (raw JSON shape rejected)", () => {
      const result = CreatePaymentLinkConfigSchema.safeParse({
        lineItems: [{ priceId: "price_123", quantity: 1 }],
        metadata: { orderId: 42 },
      });
      expect(result.success).toBe(false);
    });

    it("rejects metadata supplied as a JSON string (V1 quirk)", () => {
      const result = CreatePaymentLinkConfigSchema.safeParse({
        lineItems: [{ priceId: "price_123", quantity: 1 }],
        metadata: '{"orderId":"order_42"}',
      });
      expect(result.success).toBe(false);
    });

    it("rejects automaticTax (deliberately omitted per parity-stripe `if V1 supports` gate)", () => {
      const result = CreatePaymentLinkConfigSchema.safeParse({
        lineItems: [{ priceId: "price_123", quantity: 1 }],
        automaticTax: { enabled: true },
      });
      expect(result.success).toBe(false);
    });
  });
});
