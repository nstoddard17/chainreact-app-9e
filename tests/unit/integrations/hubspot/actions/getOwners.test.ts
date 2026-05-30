/**
 * @jest-environment node
 *
 * Tests for `get_owners`.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockOwnersList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
}));
jest.mock("@/integrations/_shared/hubspot/api/owners", () => ({
  ownersList: (...a: unknown[]) => mockOwnersList(...a),
}));

import { getOwners } from "@/integrations/hubspot/actions/getOwners";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockOwnersList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

const trigger: TriggerEvent = {
  provider: "hubspot",
  eventType: "manual",
  eventId: "e",
  occurredAt: "x",
  providerAccountId: "p",
  payload: {},
};

describe("get_owners", () => {
  it("threads email + limit + after through to the wrapper", async () => {
    mockOwnersList.mockResolvedValueOnce({ results: [] });
    await getOwners({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        limit: 50,
        email: "alice@example.com",
        after: "cursor-1",
      },
      triggerEvent: trigger,
    });
    expect(mockOwnersList.mock.calls[0]![0]!).toMatchObject({
      limit: 50,
      email: "alice@example.com",
      after: "cursor-1",
    });
  });

  it("returns canonical output with normalized owner shape", async () => {
    mockOwnersList.mockResolvedValueOnce({
      results: [
        {
          id: "owner-1",
          email: "alice@example.com",
          firstName: "Alice",
          lastName: "A",
          userId: 12345,
          createdAt: "x",
          updatedAt: "y",
        },
      ],
      paging: { next: { after: "cur" } },
    });
    const result = await getOwners({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger,
    });
    expect(result.output.owners).toEqual([
      {
        id: "owner-1",
        email: "alice@example.com",
        firstName: "Alice",
        lastName: "A",
        userId: 12345,
        createdAt: "x",
        updatedAt: "y",
      },
    ]);
    expect(result.output.nextCursor).toBe("cur");
    expect(result.output.hasMore).toBe(true);
    expect(result.output.count).toBe(1);
  });

  it("rejects invalid email format at schema", async () => {
    await expect(
      getOwners({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { email: "not-an-email" },
        triggerEvent: trigger,
      }),
    ).rejects.toThrow();
  });

  it("rejects limit > 100 at schema", async () => {
    await expect(
      getOwners({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { limit: 500 },
        triggerEvent: trigger,
      }),
    ).rejects.toThrow();
  });

  it("defaults missing nullable fields to null in output", async () => {
    mockOwnersList.mockResolvedValueOnce({
      results: [{ id: "owner-2" }],
    });
    const result = await getOwners({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger,
    });
    expect(result.output.owners).toEqual([
      {
        id: "owner-2",
        email: null,
        firstName: null,
        lastName: null,
        userId: null,
        createdAt: null,
        updatedAt: null,
      },
    ]);
  });
});
