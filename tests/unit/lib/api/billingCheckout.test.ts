/**
 * @jest-environment node
 *
 * Slice 4.BILLING-PERSONAL-PRO-TEAM-CHOICE-4 / PPT-4 — checkout client helper. Mocks
 * fetch; asserts the POST shape, the url return, and AccountApiError mapping (no raw
 * Stripe error leaked).
 */
import { startCheckout, startBillingPortal } from "@/lib/api/billingCheckout";
import { AccountApiError } from "@/lib/api/accounts";

afterEach(() => jest.restoreAllMocks());

it("POSTs the plan to the account's checkout route and returns the url", async () => {
  const fetchMock = jest
    .spyOn(global, "fetch")
    .mockResolvedValue(new Response(JSON.stringify({ url: "https://stripe.test/c" }), { status: 200 }));
  const out = await startCheckout("acct-1", "team");
  expect(out).toEqual({ url: "https://stripe.test/c" });
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(url).toBe("/api/accounts/acct-1/billing/checkout");
  expect((init as { method?: string }).method).toBe("POST");
  expect((init as { body?: string }).body).toBe(JSON.stringify({ plan: "team" }));
});

it("includes interval in the POST body only when provided (PRICING-INTERVAL-1)", async () => {
  const fetchMock = jest
    .spyOn(global, "fetch")
    .mockResolvedValue(new Response(JSON.stringify({ url: "https://stripe.test/c" }), { status: 200 }));
  await startCheckout("acct-1", "pro", "annual");
  const [, init] = fetchMock.mock.calls[0]!;
  expect((init as { body?: string }).body).toBe(JSON.stringify({ plan: "pro", interval: "annual" }));
});

it("maps a non-OK response to AccountApiError (generic message, no Stripe internals)", async () => {
  // Fresh Response per call — a Response body can only be consumed once.
  jest
    .spyOn(global, "fetch")
    .mockImplementation(async () =>
      new Response(JSON.stringify({ error: "Billing is not configured." }), { status: 503 }),
    );
  await expect(startCheckout("acct-1", "pro")).rejects.toBeInstanceOf(AccountApiError);
  await expect(startCheckout("acct-1", "pro")).rejects.toThrow(/not configured/i);
});

it("POSTs to the account's portal route and returns the url", async () => {
  const fetchMock = jest
    .spyOn(global, "fetch")
    .mockResolvedValue(new Response(JSON.stringify({ url: "https://stripe.test/p" }), { status: 200 }));
  const out = await startBillingPortal("acct-1");
  expect(out).toEqual({ url: "https://stripe.test/p" });
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(url).toBe("/api/accounts/acct-1/billing/portal");
  expect((init as { method?: string }).method).toBe("POST");
});

it("maps a 409 (no customer) to AccountApiError with code CONFLICT", async () => {
  jest
    .spyOn(global, "fetch")
    .mockResolvedValue(
      new Response(JSON.stringify({ error: "Start a subscription first." }), { status: 409 }),
    );
  await expect(startBillingPortal("acct-1")).rejects.toMatchObject({ code: "CONFLICT" });
});
