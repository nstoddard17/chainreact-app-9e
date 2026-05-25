/**
 * @jest-environment node
 */
import { FindSubscriptionConfigSchema } from "@/integrations/stripe/actions/findSubscription.schema";

describe("FindSubscriptionConfigSchema", () => {
  it("accepts a valid subscriptionId", () => {
    const result = FindSubscriptionConfigSchema.safeParse({
      subscriptionId: "sub_test_1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects when subscriptionId is missing", () => {
    const result = FindSubscriptionConfigSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects an empty subscriptionId", () => {
    const result = FindSubscriptionConfigSchema.safeParse({
      subscriptionId: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-string subscriptionId", () => {
    const result = FindSubscriptionConfigSchema.safeParse({
      subscriptionId: 123,
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields (.strict() — no raw expand passthrough)", () => {
    const result = FindSubscriptionConfigSchema.safeParse({
      subscriptionId: "sub_1",
      expand: ["items"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects V1 search/list-style fields (customer / status / limit)", () => {
    expect(
      FindSubscriptionConfigSchema.safeParse({
        subscriptionId: "sub_1",
        customer: "cus_1",
      }).success,
    ).toBe(false);
    expect(
      FindSubscriptionConfigSchema.safeParse({
        subscriptionId: "sub_1",
        status: "active",
      }).success,
    ).toBe(false);
    expect(
      FindSubscriptionConfigSchema.safeParse({
        subscriptionId: "sub_1",
        limit: 10,
      }).success,
    ).toBe(false);
  });
});
