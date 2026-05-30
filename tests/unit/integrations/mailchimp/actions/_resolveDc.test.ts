/**
 * @jest-environment node
 *
 * Tests for `_resolveDc` — the per-action helper that pulls
 * `(dc, accountId)` from the integration row's accountMetadata.
 *
 * Verifies:
 *   - Mailchimp-triggered runs hint the lookup with accountId.
 *   - Non-Mailchimp-triggered runs fall back to first-active lookup.
 *   - Missing integration → throws with a clear message.
 *   - Missing dc on accountMetadata → MissingDataCenterError
 *     (fail-loud, no V1-style runtime refetch).
 *   - Non-string dc → MissingDataCenterError.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockGetActive = jest.fn();

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActive(...args),
}));

import { resolveDc } from "@/integrations/mailchimp/actions/_resolveDc";
import { MissingDataCenterError } from "@/integrations/_shared/mailchimp/errors";

beforeEach(() => {
  mockGetActive.mockReset();
});

function trigger(
  provider = "mailchimp",
  providerAccountId = "mc_account_xyz",
): TriggerEvent {
  return {
    provider,
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-05-10T12:00:00Z",
    providerAccountId,
    payload: {},
  };
}

const ROW = {
  id: "i1",
  accountId: "acct-u1",
  connectedByUserId: "u1",
  provider: "mailchimp",
  providerAccountId: "mc_account_xyz",
  displayName: "Acme",
  accessTokenEncrypted: "enc",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: ["account_access"],
  accountMetadata: { dc: "us21", mailchimpAccountId: "mc_account_xyz" },
  disconnectedAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("resolveDc", () => {
  it("returns (dc, accountId) from the integration row", async () => {
    mockGetActive.mockResolvedValueOnce(ROW);
    const r = await resolveDc({ accountId: "acct-u1", userId: "u1", triggerEvent: trigger() });
    expect(r).toEqual({ dc: "us21", providerAccountId: "mc_account_xyz" });
  });

  it("hints the lookup with accountId when the trigger is Mailchimp", async () => {
    mockGetActive.mockResolvedValueOnce(ROW);
    await resolveDc({ accountId: "acct-u1", userId: "u1", triggerEvent: trigger("mailchimp", "mc_account_xyz") });
    expect(mockGetActive).toHaveBeenCalledWith("acct-u1", "mailchimp", "mc_account_xyz");
  });

  it("passes null hint when the trigger is from another provider", async () => {
    mockGetActive.mockResolvedValueOnce(ROW);
    await resolveDc({ accountId: "acct-u1", userId: "u1", triggerEvent: trigger("stripe", "cus_xyz") });
    expect(mockGetActive).toHaveBeenCalledWith("acct-u1", "mailchimp", null);
  });

  it("throws when no active Mailchimp integration exists", async () => {
    mockGetActive.mockResolvedValueOnce(null);
    await expect(
      resolveDc({ accountId: "acct-u1", userId: "u1", triggerEvent: trigger("stripe", "cus_x") }),
    ).rejects.toThrow(/no active Mailchimp integration for account acct-u1/);
  });

  it("throws MissingDataCenterError when accountMetadata lacks dc", async () => {
    mockGetActive.mockResolvedValueOnce({
      ...ROW,
      accountMetadata: { mailchimpAccountId: "mc_account_xyz" /* dc missing */ },
    });
    await expect(
      resolveDc({ accountId: "acct-u1", userId: "u1", triggerEvent: trigger() }),
    ).rejects.toBeInstanceOf(MissingDataCenterError);
  });

  it("throws MissingDataCenterError when dc is empty string", async () => {
    mockGetActive.mockResolvedValueOnce({
      ...ROW,
      accountMetadata: { dc: "", mailchimpAccountId: "mc_account_xyz" },
    });
    await expect(
      resolveDc({ accountId: "acct-u1", userId: "u1", triggerEvent: trigger() }),
    ).rejects.toBeInstanceOf(MissingDataCenterError);
  });

  it("throws MissingDataCenterError when dc is not a string", async () => {
    mockGetActive.mockResolvedValueOnce({
      ...ROW,
      accountMetadata: { dc: 42, mailchimpAccountId: "mc" },
    });
    await expect(
      resolveDc({ accountId: "acct-u1", userId: "u1", triggerEvent: trigger() }),
    ).rejects.toBeInstanceOf(MissingDataCenterError);
  });

  it("throws on missing accountId (defensive)", async () => {
    await expect(
      resolveDc({ accountId: "", userId: "u1", triggerEvent: trigger() }),
    ).rejects.toThrow(/accountId is required/);
  });
});
