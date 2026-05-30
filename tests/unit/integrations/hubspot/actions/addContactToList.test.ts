/**
 * @jest-environment node
 *
 * Tests for `add_contact_to_list`. Verifies V2's single-call collapse
 * of V1's two-step search-then-add flow.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockAddListMembershipByEmail = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
}));
jest.mock("@/integrations/_shared/hubspot/api/lists", () => ({
  addListMembershipByEmail: (...a: unknown[]) =>
    mockAddListMembershipByEmail(...a),
}));

import { addContactToList } from "@/integrations/hubspot/actions/addContactToList";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockAddListMembershipByEmail.mockReset();
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

describe("add_contact_to_list", () => {
  it("calls addListMembershipByEmail with the email + listId (V2 single-call)", async () => {
    mockAddListMembershipByEmail.mockResolvedValueOnce({
      recordIdsAdded: ["c-42"],
    });
    await addContactToList({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { listId: "list-1", email: "alice@example.com" },
      triggerEvent: trigger,
    });
    expect(mockAddListMembershipByEmail.mock.calls[0]![0]!).toMatchObject({
      listId: "list-1",
      email: "alice@example.com",
    });
  });

  it("returns canonical output with contactIdsAdded", async () => {
    mockAddListMembershipByEmail.mockResolvedValueOnce({
      recordIdsAdded: ["c-1", "c-2"],
      recordIdsDiscarded: ["c-3"],
    });
    const result = await addContactToList({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { listId: "l-1", email: "a@b.com" },
      triggerEvent: trigger,
    });
    expect(result.output).toEqual({
      listId: "l-1",
      email: "a@b.com",
      contactIdsAdded: ["c-1", "c-2"],
      contactIdsDiscarded: ["c-3"],
    });
  });

  it("defaults missing recordIdsAdded/Discarded to empty arrays", async () => {
    mockAddListMembershipByEmail.mockResolvedValueOnce({});
    const result = await addContactToList({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { listId: "l", email: "a@b.com" },
      triggerEvent: trigger,
    });
    expect(result.output.contactIdsAdded).toEqual([]);
    expect(result.output.contactIdsDiscarded).toEqual([]);
  });

  it("rejects invalid email format", async () => {
    await expect(
      addContactToList({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { listId: "l", email: "not-an-email" },
        triggerEvent: trigger,
      }),
    ).rejects.toThrow();
  });

  it("rejects empty listId", async () => {
    await expect(
      addContactToList({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { listId: "", email: "a@b.com" },
        triggerEvent: trigger,
      }),
    ).rejects.toThrow();
  });

  it("wraps in refreshAndRetry", async () => {
    mockAddListMembershipByEmail.mockResolvedValueOnce({});
    await addContactToList({
      workflowId: "wf",
      userId: "u-1",
      accountId: "acct-u-1",
      runId: "r",
      nodeId: "n",
      config: { listId: "l", email: "a@b.com" },
      triggerEvent: trigger,
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0]!.provider).toBe("hubspot");
  });
});
