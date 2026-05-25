/**
 * @jest-environment node
 *
 * Schema tests for `get_payments`. Pins the strict shape + pagination
 * cursor mutex + limit-range + unknown-field rejection. V1's
 * client-side status filter + raw query passthrough + auto-pagination
 * are all rejected at the schema layer (parity-stripe §8 — no V1
 * status-filter or fetchAll port).
 */
import { GetPaymentsConfigSchema } from "@/integrations/stripe/actions/getPayments.schema";

describe("GetPaymentsConfigSchema", () => {
  describe("happy paths", () => {
    it("accepts empty config (no filters; Stripe defaults to limit=10)", () => {
      const result = GetPaymentsConfigSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("accepts customer filter", () => {
      const result = GetPaymentsConfigSchema.safeParse({
        customer: "cus_test_1",
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid limit (1..100)", () => {
      expect(
        GetPaymentsConfigSchema.safeParse({ limit: 1 }).success,
      ).toBe(true);
      expect(
        GetPaymentsConfigSchema.safeParse({ limit: 50 }).success,
      ).toBe(true);
      expect(
        GetPaymentsConfigSchema.safeParse({ limit: 100 }).success,
      ).toBe(true);
    });

    it("accepts startingAfter cursor", () => {
      const result = GetPaymentsConfigSchema.safeParse({
        startingAfter: "ch_test_xxx",
      });
      expect(result.success).toBe(true);
    });

    it("accepts endingBefore cursor", () => {
      const result = GetPaymentsConfigSchema.safeParse({
        endingBefore: "ch_test_yyy",
      });
      expect(result.success).toBe(true);
    });

    it("accepts customer + limit + startingAfter combo", () => {
      const result = GetPaymentsConfigSchema.safeParse({
        customer: "cus_test_1",
        limit: 25,
        startingAfter: "ch_last",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("limit validation", () => {
    it("rejects limit = 0", () => {
      const result = GetPaymentsConfigSchema.safeParse({ limit: 0 });
      expect(result.success).toBe(false);
    });

    it("rejects negative limit", () => {
      const result = GetPaymentsConfigSchema.safeParse({ limit: -5 });
      expect(result.success).toBe(false);
    });

    it("rejects limit > 100 (Stripe maximum)", () => {
      const result = GetPaymentsConfigSchema.safeParse({ limit: 101 });
      expect(result.success).toBe(false);
    });

    it("rejects non-integer limit (e.g. 10.5)", () => {
      const result = GetPaymentsConfigSchema.safeParse({ limit: 10.5 });
      expect(result.success).toBe(false);
    });

    it("rejects string-form limit (no silent coercion — V1 quirk NOT ported)", () => {
      const result = GetPaymentsConfigSchema.safeParse({ limit: "10" });
      expect(result.success).toBe(false);
    });
  });

  describe("optional field validation", () => {
    it("rejects empty-string customer", () => {
      const result = GetPaymentsConfigSchema.safeParse({ customer: "" });
      expect(result.success).toBe(false);
    });

    it("rejects empty-string startingAfter", () => {
      const result = GetPaymentsConfigSchema.safeParse({ startingAfter: "" });
      expect(result.success).toBe(false);
    });

    it("rejects empty-string endingBefore", () => {
      const result = GetPaymentsConfigSchema.safeParse({ endingBefore: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("pagination cursor mutex", () => {
    it("rejects startingAfter + endingBefore together (ambiguous cursor direction)", () => {
      const result = GetPaymentsConfigSchema.safeParse({
        startingAfter: "ch_a",
        endingBefore: "ch_z",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((i) => i.path.includes("endingBefore")),
        ).toBe(true);
      }
    });
  });

  describe("strict mode — unknown fields rejected", () => {
    it("rejects V1's client-side status filter (V2 doesn't port it)", () => {
      const result = GetPaymentsConfigSchema.safeParse({
        status: "succeeded",
      });
      expect(result.success).toBe(false);
    });

    it("rejects V1's snake_case starting_after (wire field disguised as schema field)", () => {
      const result = GetPaymentsConfigSchema.safeParse({
        starting_after: "ch_xxx",
      });
      expect(result.success).toBe(false);
    });

    it("rejects fetchAll / autoPaginate fields (no auto-pagination in V2)", () => {
      expect(
        GetPaymentsConfigSchema.safeParse({ fetchAll: true }).success,
      ).toBe(false);
      expect(
        GetPaymentsConfigSchema.safeParse({ autoPaginate: true }).success,
      ).toBe(false);
    });

    it("rejects raw expand passthrough", () => {
      const result = GetPaymentsConfigSchema.safeParse({
        expand: ["customer", "payment_intent"],
      });
      expect(result.success).toBe(false);
    });

    it("rejects deferred createdGte / createdLte (V1 doesn't have them)", () => {
      expect(
        GetPaymentsConfigSchema.safeParse({ createdGte: 1234567890 })
          .success,
      ).toBe(false);
      expect(
        GetPaymentsConfigSchema.safeParse({ createdLte: 1234567890 })
          .success,
      ).toBe(false);
    });

    it("rejects deferred paymentIntent / transferGroup filters", () => {
      expect(
        GetPaymentsConfigSchema.safeParse({ paymentIntent: "pi_xxx" })
          .success,
      ).toBe(false);
      expect(
        GetPaymentsConfigSchema.safeParse({ transferGroup: "tg_xxx" })
          .success,
      ).toBe(false);
    });
  });
});
