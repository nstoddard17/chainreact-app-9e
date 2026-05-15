/**
 * @jest-environment node
 *
 * Schema tests for `create_invoice`. Pins the strict-mode shape +
 * customer-required + unknown-field rejection. V1's deferred surface
 * (collectionMethod / daysUntilDue / subscription / dueDate / footer
 * / automaticTax / applicationFee*) is rejected via .strict() — V2
 * doesn't ship them in Stripe 2.1 Commit 3 per the "if V1 supports"
 * gate.
 */
import { CreateInvoiceConfigSchema } from "@/integrations/stripe/actions/createInvoice.schema";

describe("CreateInvoiceConfigSchema", () => {
  describe("happy paths", () => {
    it("accepts minimal config (customerId only)", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
      });
      expect(result.success).toBe(true);
    });

    it("accepts customerId + description", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        description: "Monthly retainer — May",
      });
      expect(result.success).toBe(true);
    });

    it("accepts customerId + metadata", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        metadata: { orderId: "order_42" },
      });
      expect(result.success).toBe(true);
    });

    it("accepts customerId + autoAdvance:false (draft-only invoice)", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        autoAdvance: false,
      });
      expect(result.success).toBe(true);
    });

    it("accepts the full set of optional safe fields", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        description: "Q4 services",
        metadata: { orderId: "order_42", source: "workflow" },
        autoAdvance: true,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("required fields", () => {
    it("rejects missing customerId", () => {
      const result = CreateInvoiceConfigSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("rejects empty-string customerId", () => {
      const result = CreateInvoiceConfigSchema.safeParse({ customerId: "" });
      expect(result.success).toBe(false);
    });

    it("rejects non-string customerId", () => {
      const result = CreateInvoiceConfigSchema.safeParse({ customerId: 42 });
      expect(result.success).toBe(false);
    });
  });

  describe("optional field validation", () => {
    it("rejects empty-string description (must be non-empty when supplied)", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        description: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects metadata with non-string values (raw JSON shape rejected)", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        metadata: { orderId: 42 },
      });
      expect(result.success).toBe(false);
    });

    it("rejects metadata supplied as a JSON string (V1 quirk explicitly NOT ported)", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        metadata: '{"orderId":"order_42"}',
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-boolean autoAdvance", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        autoAdvance: "true",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("strict mode — unknown fields rejected", () => {
    it("rejects V1's snake_case auto_advance field (wire field disguised as schema field)", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        auto_advance: true,
      });
      expect(result.success).toBe(false);
    });

    it("rejects V1's snake_case customer (Stripe wire field disguised as schema field)", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customer: "cus_test_1",
      });
      expect(result.success).toBe(false);
    });

    it("rejects the deferred collectionMethod field", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        collectionMethod: "send_invoice",
      });
      expect(result.success).toBe(false);
    });

    it("rejects the deferred daysUntilDue field", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        daysUntilDue: 30,
      });
      expect(result.success).toBe(false);
    });

    it("rejects the deferred dueDate field", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        dueDate: "2026-06-15",
      });
      expect(result.success).toBe(false);
    });

    it("rejects the deferred subscription field", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        subscription: "sub_test_1",
      });
      expect(result.success).toBe(false);
    });

    it("rejects the deferred footer field", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        footer: "Thanks for your business!",
      });
      expect(result.success).toBe(false);
    });

    it("rejects the deferred automaticTax field", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        automaticTax: { enabled: true },
      });
      expect(result.success).toBe(false);
    });

    it("rejects the deferred applicationFeeAmount field (Stripe Connect platform fee)", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        applicationFeeAmount: 100,
      });
      expect(result.success).toBe(false);
    });

    it("rejects raw line_items / pending_invoice_items_behavior passthrough (line-item attachment is the deferred createInvoiceItem action's job)", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        pending_invoice_items_behavior: "include",
      });
      expect(result.success).toBe(false);
    });
  });
});
