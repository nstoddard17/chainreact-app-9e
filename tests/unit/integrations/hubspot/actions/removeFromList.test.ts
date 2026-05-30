/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockRemoveListMembershipByEmail = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
}));
jest.mock("@/integrations/_shared/hubspot/api/lists", () => ({
  removeListMembershipByEmail: (...a: unknown[]) =>
    mockRemoveListMembershipByEmail(...a),
}));

import { removeFromList } from "@/integrations/hubspot/actions/removeFromList";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockRemoveListMembershipByEmail.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

const trigger: TriggerEvent = {
  provider: "hubspot",
  eventType: "webhook_received",
  eventId: "e",
  occurredAt: "x",
  providerAccountId: "portal-1",
  payload: {},
};

describe("remove_from_list", () => {
  it("calls removeListMembershipByEmail with listId + email", async () => {
    mockRemoveListMembershipByEmail.mockResolvedValueOnce({
      recordIdsRemoved: ["c-1"],
    });
    await removeFromList({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { listId: "list-7", email: "alice@e.test" },
      triggerEvent: trigger,
    });
    const call = mockRemoveListMembershipByEmail.mock.calls[0]![0]!;
    expect(call.listId).toBe("list-7");
    expect(call.email).toBe("alice@e.test");
  });

  it("returns bounded { listId, email, contactIdsRemoved, contactIdsDiscarded }", async () => {
    mockRemoveListMembershipByEmail.mockResolvedValueOnce({
      recordIdsRemoved: ["c-42"],
      recordIdsDiscarded: ["c-99"],
    });
    const result = await removeFromList({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { listId: "list-7", email: "bob@e.test" },
      triggerEvent: trigger,
    });
    expect(result.output).toEqual({
      listId: "list-7",
      email: "bob@e.test",
      contactIdsRemoved: ["c-42"],
      contactIdsDiscarded: ["c-99"],
    });
  });

  it("defaults empty arrays when wrapper omits the fields", async () => {
    mockRemoveListMembershipByEmail.mockResolvedValueOnce({});
    const result = await removeFromList({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { listId: "l", email: "x@y.com" },
      triggerEvent: trigger,
    });
    expect(result.output.contactIdsRemoved).toEqual([]);
    expect(result.output.contactIdsDiscarded).toEqual([]);
  });

  it("wraps in refreshAndRetry", async () => {
    mockRemoveListMembershipByEmail.mockResolvedValueOnce({});
    await removeFromList({
      workflowId: "wf",
      userId: "user-abc",
      accountId: "acct-user-abc",
      runId: "r",
      nodeId: "n",
      config: { listId: "l", email: "x@y.com" },
      triggerEvent: trigger,
    });
    const arg = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(arg.provider).toBe("hubspot");
    expect(arg.userId).toBe("user-abc");
    expect(arg.accountId).toBe("portal-1");
  });

  it("rejects missing listId at schema time", async () => {
    await expect(
      removeFromList({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { email: "x@y.com" } as Record<string, unknown>,
        triggerEvent: trigger,
      }),
    ).rejects.toThrow();
    expect(mockRemoveListMembershipByEmail).not.toHaveBeenCalled();
  });

  it("rejects malformed email at schema time", async () => {
    await expect(
      removeFromList({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { listId: "l", email: "not-an-email" },
        triggerEvent: trigger,
      }),
    ).rejects.toThrow();
    expect(mockRemoveListMembershipByEmail).not.toHaveBeenCalled();
  });

  it("rejects unknown fields (strict mode — V1 contactId chrome)", async () => {
    await expect(
      removeFromList({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          listId: "l",
          email: "x@y.com",
          contactId: "c-1",
        } as Record<string, unknown>,
        triggerEvent: trigger,
      }),
    ).rejects.toThrow();
  });

  it("propagates DYNAMIC-list validation error verbatim", async () => {
    mockRemoveListMembershipByEmail.mockRejectedValueOnce(
      new Error(
        "Cannot manually remove contacts from a dynamic list (VALIDATION_ERROR)",
      ),
    );
    await expect(
      removeFromList({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { listId: "dynamic-list", email: "a@b.com" },
        triggerEvent: trigger,
      }),
    ).rejects.toThrow(/dynamic list/i);
  });
});
