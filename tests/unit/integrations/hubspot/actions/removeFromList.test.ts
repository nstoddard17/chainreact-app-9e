/**
 * @jest-environment node
 *
 * Tests for `remove_from_list` — REWORKED 2026-07-04 after the live 405
 * production bug: the v3 memberships endpoint is PUT + raw record-id array
 * with no email variant, so the handler resolves email -> contactId via
 * `findContactByEmail` first (symmetric with add_contact_to_list).
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockListMembershipsRemove = jest.fn();
const mockFindContactByEmail = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
}));
jest.mock("@/integrations/_shared/hubspot/api/lists", () => ({
  listMembershipsRemove: (...a: unknown[]) => mockListMembershipsRemove(...a),
}));
jest.mock("@/integrations/_shared/hubspot/api/contacts", () => ({
  findContactByEmail: (...a: unknown[]) => mockFindContactByEmail(...a),
}));

import { removeFromList } from "@/integrations/hubspot/actions/removeFromList";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockListMembershipsRemove.mockReset();
  mockFindContactByEmail.mockReset();
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

const run = (config: Record<string, unknown>) =>
  removeFromList({
    workflowId: "wf",
    userId: "u",
    accountId: "acct-u",
    runId: "r",
    nodeId: "n",
    config,
    triggerEvent: trigger,
  });

describe("remove_from_list", () => {
  it("resolves email -> contactId, then PUTs the record id to memberships/remove", async () => {
    mockFindContactByEmail.mockResolvedValueOnce({ id: "c-42", properties: {} });
    mockListMembershipsRemove.mockResolvedValueOnce(undefined);
    const result = await run({ listId: "list-7", email: "alice@e.test" });
    expect(mockFindContactByEmail.mock.calls[0]![0]!).toMatchObject({
      email: "alice@e.test",
    });
    expect(mockListMembershipsRemove.mock.calls[0]![0]!).toMatchObject({
      listId: "list-7",
      recordIds: ["c-42"],
    });
    expect(result.output).toEqual({
      listId: "list-7",
      email: "alice@e.test",
      contactIdsRemoved: ["c-42"],
      contactIdsDiscarded: [],
    });
  });

  it("returns the documented empty-remove result (NO membership call) when no contact matches", async () => {
    mockFindContactByEmail.mockResolvedValueOnce(null);
    const result = await run({ listId: "l", email: "ghost@example.com" });
    expect(result.output).toEqual({
      listId: "l",
      email: "ghost@example.com",
      contactIdsRemoved: [],
      contactIdsDiscarded: [],
    });
    expect(mockListMembershipsRemove).not.toHaveBeenCalled();
  });

  it("rejects invalid email format", async () => {
    await expect(run({ listId: "l", email: "nope" })).rejects.toThrow();
  });

  it("rejects empty listId", async () => {
    await expect(run({ listId: "", email: "a@b.com" })).rejects.toThrow();
  });

  it("wraps both calls in refreshAndRetry (provider hubspot)", async () => {
    mockFindContactByEmail.mockResolvedValueOnce({ id: "c-1", properties: {} });
    mockListMembershipsRemove.mockResolvedValueOnce(undefined);
    await run({ listId: "l", email: "a@b.com" });
    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(2);
    expect(mockRefreshAndRetry.mock.calls[0]![0]!.provider).toBe("hubspot");
  });
});
