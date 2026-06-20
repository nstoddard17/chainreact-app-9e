/**
 * @jest-environment node
 *
 * microsoft-outlook:get_profile — read-only mailbox profile.
 *
 * Business rules under test:
 *   - calls getMailboxProfile through refreshAndRetry;
 *   - output is a bounded projection (id/mail/userPrincipalName/displayName)
 *     — raw Graph fields never leak;
 *   - strict schema rejects unknown config fields before any API call;
 *   - provider 401 propagates.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockGetMailboxProfile = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-outlook/api/getMailboxProfile", () => ({
  getMailboxProfile: (...args: unknown[]) => mockGetMailboxProfile(...args),
}));

import { getProfile } from "@/integrations/microsoft-outlook/actions/getProfile";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockGetMailboxProfile.mockReset();
});

function trigger(): TriggerEvent {
  return {
    provider: "microsoft-outlook",
    eventType: "new_email",
    eventId: "evt-1",
    occurredAt: "2026-05-08T12:00:00Z",
    providerAccountId: "alice@example.test",
    payload: {},
  };
}

function baseInput(config: Record<string, unknown>) {
  return {
    workflowId: "wf",
    userId: "u",
    accountId: "acct-u",
    runId: "r",
    nodeId: "n",
    config,
    triggerEvent: trigger(),
  };
}

describe("getProfile action", () => {
  it("returns a bounded profile projection (id + identity fields)", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("tok"));
    mockGetMailboxProfile.mockResolvedValue({
      id: "guid-1",
      mail: "alice@example.test",
      userPrincipalName: "alice@example.test",
      displayName: "Alice Example",
      // Hostile extra must NOT reach output.
      "@odata.context": "https://graph.microsoft.com/$metadata#users",
    });

    const result = await getProfile(baseInput({}));

    expect(result.output).toEqual({
      id: "guid-1",
      mail: "alice@example.test",
      userPrincipalName: "alice@example.test",
      displayName: "Alice Example",
    });
    expect(JSON.stringify(result.output)).not.toContain("@odata.context");
  });

  it("defaults absent fields to null (e.g. consumer mailbox without mail)", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("tok"));
    mockGetMailboxProfile.mockResolvedValue({ id: "guid-2", userPrincipalName: "u@live.test" });

    const result = await getProfile(baseInput({}));

    expect(result.output).toEqual({
      id: "guid-2",
      mail: null,
      userPrincipalName: "u@live.test",
      displayName: null,
    });
  });

  it("rejects unknown config fields before calling the provider", async () => {
    await expect(getProfile(baseInput({ bogus: 1 }))).rejects.toThrow();
    expect(mockGetMailboxProfile).not.toHaveBeenCalled();
  });

  it("propagates a provider 401", async () => {
    mockRefreshAndRetry.mockRejectedValue(new Error("Microsoft Graph GET me returned HTTP 401"));
    await expect(getProfile(baseInput({}))).rejects.toThrow(/401/);
  });
});
