/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-teams/api/teamMembersList", () => ({
  teamMembersList: (...args: unknown[]) => mockList(...args),
}));

import { getTeamMembers } from "@/integrations/microsoft-teams/actions/getTeamMembers";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "microsoft-teams",
    eventType: "new_channel_message",
    eventId: "evt-1",
    occurredAt: "2026-05-10T12:00:00Z",
    providerAccountId: "alice@contoso.com",
    payload: {},
  };
}

describe("get_team_members action", () => {
  it("normalizes members with isOwner convenience boolean", async () => {
    mockList.mockResolvedValueOnce({
      members: [
        {
          id: "mem-1",
          displayName: "Alice",
          email: "alice@contoso.com",
          userId: "aad-alice",
          roles: ["owner"],
        },
        {
          id: "mem-2",
          displayName: "Bob",
          email: "bob@contoso.com",
          userId: "aad-bob",
          roles: [],
        },
      ],
      nextLink: null,
    });

    const result = await getTeamMembers({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { teamId: "team-1" },
      triggerEvent: trigger(),
    });

    const members = result.output.members as Array<Record<string, unknown>>;
    expect(members).toHaveLength(2);
    expect(members[0]).toEqual({
      memberId: "mem-1",
      displayName: "Alice",
      email: "alice@contoso.com",
      userId: "aad-alice",
      roles: ["owner"],
      isOwner: true,
    });
    expect(members[1]).toEqual({
      memberId: "mem-2",
      displayName: "Bob",
      email: "bob@contoso.com",
      userId: "aad-bob",
      roles: [],
      isOwner: false,
    });
    expect(result.output.count).toBe(2);
    expect(result.output.hasMore).toBe(false);
    expect(result.output.nextLink).toBeNull();
    expect(result.output.teamId).toBe("team-1");
  });

  it("surfaces hasMore=true + nextLink when Graph paginates", async () => {
    mockList.mockResolvedValueOnce({
      members: [],
      nextLink:
        "https://graph.microsoft.com/v1.0/teams/team-1/members?$skiptoken=x",
    });

    const result = await getTeamMembers({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { teamId: "team-1" },
      triggerEvent: trigger(),
    });

    expect(result.output.hasMore).toBe(true);
    expect(result.output.nextLink).toMatch(/skiptoken/);
  });

  it("normalizes missing fields to safe defaults", async () => {
    mockList.mockResolvedValueOnce({
      members: [{ id: "mem-bare" }],
      nextLink: null,
    });

    const result = await getTeamMembers({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { teamId: "team-1" },
      triggerEvent: trigger(),
    });

    expect(
      (result.output.members as Array<Record<string, unknown>>)[0],
    ).toEqual({
      memberId: "mem-bare",
      displayName: "",
      email: null,
      userId: null,
      roles: [],
      isOwner: false,
    });
  });

  it("forwards top to the wrapper", async () => {
    mockList.mockResolvedValueOnce({ members: [], nextLink: null });

    await getTeamMembers({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { teamId: "team-1", top: 50 },
      triggerEvent: trigger(),
    });

    expect(mockList.mock.calls[0]![0].top).toBe(50);
  });

  it("rejects top out of range (Graph 1..999)", async () => {
    await expect(
      getTeamMembers({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { teamId: "team-1", top: 0 },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();

    await expect(
      getTeamMembers({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { teamId: "team-1", top: 1000 },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
