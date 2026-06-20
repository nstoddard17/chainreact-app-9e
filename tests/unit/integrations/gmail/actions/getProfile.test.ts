/**
 * @jest-environment node
 *
 * gmail:get_profile — read-only mailbox profile.
 *
 * Business rules under test:
 *   - calls the usersGetProfile wrapper through refreshAndRetry;
 *   - output is a bounded projection (email + counts + historyId) — raw
 *     provider fields never leak;
 *   - strict schema rejects unknown config fields before any API call;
 *   - provider 401 propagates.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockUsersGetProfile = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/gmail/api/usersGetProfile", () => ({
  usersGetProfile: (...args: unknown[]) => mockUsersGetProfile(...args),
}));

import { getProfile } from "@/integrations/gmail/actions/getProfile";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUsersGetProfile.mockReset();
});

function trigger(): TriggerEvent {
  return {
    provider: "gmail",
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
  it("returns a bounded profile projection (email + counts + historyId)", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("tok"));
    mockUsersGetProfile.mockResolvedValue({
      emailAddress: "alice@example.test",
      messagesTotal: 1234,
      threadsTotal: 567,
      historyId: "987654",
      // Hostile extra must NOT reach output.
      internalSecret: "do-not-leak",
    });

    const result = await getProfile(baseInput({}));

    expect(result.output).toEqual({
      emailAddress: "alice@example.test",
      messagesTotal: 1234,
      threadsTotal: 567,
      historyId: "987654",
    });
    expect(result.output).not.toHaveProperty("internalSecret");
  });

  it("rejects unknown config fields before calling the provider", async () => {
    await expect(getProfile(baseInput({ userId: "x" }))).rejects.toThrow();
    expect(mockUsersGetProfile).not.toHaveBeenCalled();
  });

  it("propagates a provider 401", async () => {
    mockRefreshAndRetry.mockRejectedValue(new Error("Gmail users.getProfile returned HTTP 401"));
    await expect(getProfile(baseInput({}))).rejects.toThrow(/401/);
  });
});
