/**
 * @jest-environment node
 *
 * MOTIVE-1 — trigger activation: webhook activate creates a per-company webhook
 * and stores an ENCRYPTED 20-char secret + a strict-direct notification URL;
 * polling activate seeds the id high-water (baseline-first).
 */
const mockRefreshAndRetry = jest.fn();
const mockWebhookCreate = jest.fn();
const mockFuelList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...a: unknown[]) => mockRefreshAndRetry(...a),
}));
jest.mock("@/integrations/_shared/motive/api/webhooks", () => ({
  companyWebhookCreate: (...a: unknown[]) => mockWebhookCreate(...a),
}));
jest.mock("@/integrations/_shared/motive/api/fuelPurchases", () => ({
  fuelPurchaseList: (...a: unknown[]) => mockFuelList(...a),
}));

import { decryptToken } from "@/core/encryption/tokens";
import { buildMotiveActivate } from "@/integrations/motive/triggers/_shared/activate";
import { activate as fuelPollingActivate } from "@/integrations/motive/triggers/newFuelPurchase/activate";

const TOKEN_KEY = (() => {
  const bytes = Buffer.alloc(32);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 23) % 256;
  return bytes.toString("base64");
})();

const INTEGRATION = { accountId: "acct-1", providerAccountId: "8801" };

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = TOKEN_KEY;
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  jest.clearAllMocks();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});
afterEach(() => {
  delete process.env.TOKEN_ENCRYPTION_KEY;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.MOTIVE_WEBHOOK_URL;
});

describe("webhook activate", () => {
  it("creates a per-company webhook and returns a patch with an encrypted 20-char secret", async () => {
    mockWebhookCreate.mockResolvedValueOnce({ webhookId: "wh-77" });
    const activate = buildMotiveActivate("new_inspection_report");
    const patch = (await activate({
      node: { id: "node-1", config: {} } as never,
      integration: INTEGRATION as never,
      workflowId: "wf-1",
    })) as Record<string, unknown>;

    expect(patch).toMatchObject({ webhookEnabled: true, companyId: "8801", webhookId: "wh-77" });
    // Secret is encrypted at rest and decrypts to a 20-char string.
    const secret = decryptToken(patch.hookSecretEncrypted as string);
    expect(secret).toHaveLength(20);

    // Motive was asked to subscribe to the mapped event with a strict-direct URL.
    const createArg = mockWebhookCreate.mock.calls[0]![0];
    expect(createArg.actions).toEqual(["inspection_report_upserted"]);
    expect(createArg.url).toContain("/api/webhooks/motive?");
    expect(createArg.url).toContain("workflowId=wf-1");
    expect(createArg.url).toContain("nodeId=node-1");
    expect(createArg.secret).toBe(secret);
  });
});

describe("polling activate (new_fuel_purchase)", () => {
  it("seeds the id high-water from the current highest fuel-purchase id", async () => {
    mockFuelList.mockResolvedValueOnce({
      items: [{ fuelPurchaseId: "40" }, { fuelPurchaseId: "912" }, { fuelPurchaseId: "88" }],
      total: 3,
    });
    const patch = (await fuelPollingActivate({
      node: { id: "node-1", config: {} } as never,
      integration: INTEGRATION as never,
      workflowId: "wf-1",
    })) as { pollingEnabled: boolean; snapshot: { maxSeenId: number } };
    expect(patch.pollingEnabled).toBe(true);
    expect(patch.snapshot.maxSeenId).toBe(912);
  });

  it("seeds zero when the company has no fuel purchases yet", async () => {
    mockFuelList.mockResolvedValueOnce({ items: [], total: 0 });
    const patch = (await fuelPollingActivate({
      node: { id: "node-1", config: {} } as never,
      integration: INTEGRATION as never,
      workflowId: "wf-1",
    })) as { snapshot: { maxSeenId: number } };
    expect(patch.snapshot.maxSeenId).toBe(0);
  });
});
