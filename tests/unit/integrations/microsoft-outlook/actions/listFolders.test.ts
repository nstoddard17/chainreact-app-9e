/**
 * @jest-environment node
 *
 * microsoft-outlook:list_folders — read-only mail folder list.
 *
 * Business rules under test:
 *   - calls listMailFolders through refreshAndRetry;
 *   - output is a bounded projection ({id,displayName}) — raw Graph fields
 *     (@odata.*, parentFolderId, counts) never leak;
 *   - strict schema rejects unknown config fields before any API call;
 *   - provider 401 propagates (refreshAndRetry owns the refresh contract).
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockListMailFolders = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-outlook/api/listMailFolders", () => ({
  listMailFolders: (...args: unknown[]) => mockListMailFolders(...args),
}));

import { listFolders } from "@/integrations/microsoft-outlook/actions/listFolders";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockListMailFolders.mockReset();
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

describe("listFolders action", () => {
  it("projects folders to a bounded {id,displayName} shape and counts them", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("tok"));
    mockListMailFolders.mockResolvedValue({
      value: [
        // Hostile extras (counts/parentFolderId) must NOT reach output.
        { id: "inbox", displayName: "Inbox", totalItemCount: 999, parentFolderId: "root" },
        { id: "fld-1", displayName: "Receipts" },
      ],
    });

    const result = await listFolders(baseInput({}));

    expect(result.output.folders).toEqual([
      { id: "inbox", displayName: "Inbox" },
      { id: "fld-1", displayName: "Receipts" },
    ]);
    expect(result.output.count).toBe(2);
    expect(JSON.stringify(result.output)).not.toContain("totalItemCount");
    expect(JSON.stringify(result.output)).not.toContain("parentFolderId");
  });

  it("defaults a missing displayName to null", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("tok"));
    mockListMailFolders.mockResolvedValue({ value: [{ id: "fld-x" }] });

    const result = await listFolders(baseInput({}));

    expect(result.output.folders).toEqual([{ id: "fld-x", displayName: null }]);
  });

  it("rejects unknown config fields before calling the provider", async () => {
    await expect(listFolders(baseInput({ folderId: "x" }))).rejects.toThrow();
    expect(mockListMailFolders).not.toHaveBeenCalled();
  });

  it("propagates a provider 401", async () => {
    mockRefreshAndRetry.mockRejectedValue(
      new Error("Microsoft Graph GET me/mailFolders returned HTTP 401"),
    );
    await expect(listFolders(baseInput({}))).rejects.toThrow(/401/);
  });
});
