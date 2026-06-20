/**
 * @jest-environment node
 *
 * microsoft-teams:list_teams — read-only joined-teams list.
 *
 * Rules: calls teamsList via refreshAndRetry; bounded projection
 * {id,displayName,description}; hasMore from nextLink; raw envelope not
 * spread; strict schema rejects unknown fields; 401 propagation.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockTeamsList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-teams/api/teamsList", () => ({
  teamsList: (...args: unknown[]) => mockTeamsList(...args),
}));

import { listTeams } from "@/integrations/microsoft-teams/actions/listTeams";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockTeamsList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "microsoft-teams",
    eventType: "new_channel_message",
    eventId: "evt-1",
    occurredAt: "2026-05-09T12:00:00Z",
    providerAccountId: "alice@contoso.com",
    payload: {},
  };
}

function input(config: Record<string, unknown>) {
  return { workflowId: "wf", userId: "u", accountId: "acct-u", runId: "r", nodeId: "n", config, triggerEvent: trigger() };
}

describe("list_teams action", () => {
  it("projects a bounded {id,displayName,description} shape + hasMore", async () => {
    mockTeamsList.mockResolvedValueOnce({
      teams: [
        // Hostile extra must NOT spread into output.
        { id: "t1", displayName: "Eng", description: "Engineering", internalId: "secret" },
        { id: "t2", displayName: "Sales" },
      ],
      nextLink: "https://graph/next",
    });

    const result = await listTeams(input({}));

    expect(result.output.teams).toEqual([
      { id: "t1", displayName: "Eng", description: "Engineering" },
      { id: "t2", displayName: "Sales", description: null },
    ]);
    expect(result.output.count).toBe(2);
    expect(result.output.hasMore).toBe(true);
    expect(JSON.stringify(result.output)).not.toContain("internalId");
  });

  it("rejects unknown config fields before calling the provider", async () => {
    await expect(listTeams(input({ teamId: "x" }))).rejects.toThrow();
    expect(mockTeamsList).not.toHaveBeenCalled();
  });

  it("propagates a provider 401", async () => {
    mockRefreshAndRetry.mockReset();
    mockRefreshAndRetry.mockRejectedValue(new Error("Microsoft Graph me/joinedTeams GET returned HTTP 401"));
    await expect(listTeams(input({}))).rejects.toThrow(/401/);
  });
});
