/**
 * @jest-environment node
 *
 * Route tests for POST /api/webhooks/stripe-billing (CS-4). Mocks the handler; asserts
 * the route reads the raw body + signature header, maps handler outcomes to HTTP, and
 * leaks no payload/secret in responses.
 */

const mockHandle = jest.fn();
jest.mock("@/services/billing/stripeBillingWebhook", () => ({
  handleStripeBillingWebhook: (...a: unknown[]) => mockHandle(...a),
}));

import { POST } from "@/app/api/webhooks/stripe-billing/route";

function req(body: string, signature?: string) {
  return new Request("https://x/api/webhooks/stripe-billing", {
    method: "POST",
    headers: signature ? { "stripe-signature": signature } : {},
    body,
  });
}

beforeEach(() => mockHandle.mockReset());

it("passes the raw body + signature header to the handler", async () => {
  mockHandle.mockResolvedValueOnce({ ok: true, outcome: "processed", eventType: "x" });
  await POST(req("RAW_BODY_BYTES", "t=1,v1=abc"));
  expect(mockHandle).toHaveBeenCalledWith("RAW_BODY_BYTES", "t=1,v1=abc");
});

it("passes null signature when the header is absent", async () => {
  mockHandle.mockResolvedValueOnce({ ok: true, outcome: "ignored", eventType: "x" });
  await POST(req("{}"));
  expect(mockHandle).toHaveBeenCalledWith("{}", null);
});

it.each([
  ["processed", 200],
  ["deduped", 200],
  ["ignored", 200],
] as const)("%s → %i { received: true }", async (outcome, status) => {
  mockHandle.mockResolvedValueOnce({ ok: true, outcome, eventType: "x" });
  const res = await POST(req("{}", "sig"));
  expect(res.status).toBe(status);
  const body = await res.json();
  expect(body.received).toBe(true);
});

it.each([
  ["not_configured", 500],
  ["invalid_signature", 400],
  ["bad_request", 400],
] as const)("%s → %i", async (reason, status) => {
  mockHandle.mockResolvedValueOnce({ ok: false, reason });
  const res = await POST(req("{}", "sig"));
  expect(res.status).toBe(status);
});

it("500 (generic) when the handler throws — no detail leaked", async () => {
  mockHandle.mockRejectedValueOnce(new Error("db boom whsec_secret"));
  const res = await POST(req("{}", "sig"));
  expect(res.status).toBe(500);
  const body = await res.json();
  expect(JSON.stringify(body)).not.toContain("whsec_secret");
});

it("responses never echo the raw event body", async () => {
  mockHandle.mockResolvedValueOnce({ ok: true, outcome: "processed", eventType: "x" });
  const res = await POST(req('{"secret_card":"4242424242424242"}', "sig"));
  const body = await res.json();
  expect(JSON.stringify(body)).not.toContain("4242424242424242");
});
