/**
 * @jest-environment node
 */
import { FindPaymentIntentConfigSchema } from "@/integrations/stripe/actions/findPaymentIntent.schema";

describe("FindPaymentIntentConfigSchema", () => {
  it("accepts a valid paymentIntentId", () => {
    const result = FindPaymentIntentConfigSchema.safeParse({
      paymentIntentId: "pi_test_1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects when paymentIntentId is missing", () => {
    const result = FindPaymentIntentConfigSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects an empty paymentIntentId", () => {
    const result = FindPaymentIntentConfigSchema.safeParse({
      paymentIntentId: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-string paymentIntentId", () => {
    const result = FindPaymentIntentConfigSchema.safeParse({
      paymentIntentId: 123,
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields (.strict() — no raw expand passthrough)", () => {
    const result = FindPaymentIntentConfigSchema.safeParse({
      paymentIntentId: "pi_1",
      expand: ["charges"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects V1 search/list-style fields (customer / status / limit)", () => {
    expect(
      FindPaymentIntentConfigSchema.safeParse({
        paymentIntentId: "pi_1",
        customer: "cus_1",
      }).success,
    ).toBe(false);
    expect(
      FindPaymentIntentConfigSchema.safeParse({
        paymentIntentId: "pi_1",
        status: "succeeded",
      }).success,
    ).toBe(false);
    expect(
      FindPaymentIntentConfigSchema.safeParse({
        paymentIntentId: "pi_1",
        limit: 10,
      }).success,
    ).toBe(false);
  });
});
