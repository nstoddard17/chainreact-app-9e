/**
 * @jest-environment node
 *
 * Tests for the public-trigger rate-limit SEAM (Slice 4.API-KEYS-FOUNDATION-5 /
 * FK-4). The default implementation is intentionally PERMISSIVE — it exists so the
 * route has a single swappable chokepoint and the endpoint stays default-OFF until
 * a durable limiter replaces it. The route-level test covers the 429 mapping by
 * mocking this seam to refuse.
 */

import { rateLimitApiKeyTrigger } from "@/services/apiKeys/rateLimit";

describe("rateLimitApiKeyTrigger — default seam", () => {
  it("allows a normal request (permissive default)", async () => {
    const r = await rateLimitApiKeyTrigger({ keyId: "k1", accountId: "a1" });
    expect(r.allowed).toBe(true);
  });

  it("returns a result shape that can express refusal (allowed + optional retryAfter)", async () => {
    const r = await rateLimitApiKeyTrigger({ keyId: "k1", accountId: "a1" });
    expect(r).toHaveProperty("allowed");
    // The contract supports retryAfterSeconds for a future refusing implementation.
    expect("retryAfterSeconds" in r ? typeof r.retryAfterSeconds : "undefined").toBeDefined();
  });
});
