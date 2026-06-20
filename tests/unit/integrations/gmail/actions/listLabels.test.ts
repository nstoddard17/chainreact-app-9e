/**
 * @jest-environment node
 *
 * gmail:list_labels — read-only label list.
 *
 * Business rules under test:
 *   - calls the usersLabelsList wrapper through refreshAndRetry;
 *   - output is a bounded projection ({id,name,type}) — raw provider
 *     fields (color, messagesTotal, etc.) never leak;
 *   - strict schema rejects unknown config fields before any API call;
 *   - provider 401 propagates (refreshAndRetry owns the refresh contract).
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockUsersLabelsList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/gmail/api/usersLabelsList", () => ({
  usersLabelsList: (...args: unknown[]) => mockUsersLabelsList(...args),
}));

import { listLabels } from "@/integrations/gmail/actions/listLabels";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUsersLabelsList.mockReset();
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

describe("listLabels action", () => {
  it("projects labels to a bounded {id,name,type} shape and counts them", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("tok"));
    mockUsersLabelsList.mockResolvedValue({
      labels: [
        // Hostile extras (color/messagesTotal) must NOT reach output.
        { id: "INBOX", name: "INBOX", type: "system", color: { backgroundColor: "#fff" }, messagesTotal: 42 },
        { id: "Label_1", name: "Receipts", type: "user" },
      ],
    });

    const result = await listLabels(baseInput({}));

    expect(result.output.labels).toEqual([
      { id: "INBOX", name: "INBOX", type: "system" },
      { id: "Label_1", name: "Receipts", type: "user" },
    ]);
    expect(result.output.count).toBe(2);
    expect(JSON.stringify(result.output)).not.toContain("messagesTotal");
    expect(JSON.stringify(result.output)).not.toContain("backgroundColor");
  });

  it("defaults a missing label type to null", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("tok"));
    mockUsersLabelsList.mockResolvedValue({ labels: [{ id: "L", name: "Custom" }] });

    const result = await listLabels(baseInput({}));

    expect(result.output.labels).toEqual([{ id: "L", name: "Custom", type: null }]);
  });

  it("rejects unknown config fields before calling the provider", async () => {
    await expect(listLabels(baseInput({ bogus: true }))).rejects.toThrow();
    expect(mockUsersLabelsList).not.toHaveBeenCalled();
  });

  it("propagates a provider 401", async () => {
    mockRefreshAndRetry.mockRejectedValue(new Error("Gmail users.labels.list returned HTTP 401"));
    await expect(listLabels(baseInput({}))).rejects.toThrow(/401/);
  });
});
