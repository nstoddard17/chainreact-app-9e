/**
 * @jest-environment node
 *
 * Tests for `add_contact_to_list` — REWORKED 2026-07-04 after the live 405
 * production bug: the v3 memberships endpoint is PUT + raw record-id array
 * with no email variant, so the handler resolves email -> contactId via
 * `findContactByEmail` first (V1's two-step shape, V2's wrappers).
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockListMembershipsAdd = jest.fn();
const mockFindContactByEmail = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
}));
jest.mock("@/integrations/_shared/hubspot/api/lists", () => ({
  listMembershipsAdd: (...a: unknown[]) => mockListMembershipsAdd(...a),
}));
jest.mock("@/integrations/_shared/hubspot/api/contacts", () => ({
  findContactByEmail: (...a: unknown[]) => mockFindContactByEmail(...a),
}));

import { addContactToList } from "@/integrations/hubspot/actions/addContactToList";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockListMembershipsAdd.mockReset();
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
  addContactToList({
    workflowId: "wf",
    userId: "u",
    accountId: "acct-u",
    runId: "r",
    nodeId: "n",
    config,
    triggerEvent: trigger,
  });

describe("add_contact_to_list", () => {
  it("resolves email -> contactId, then PUTs the record id to the list", async () => {
    mockFindContactByEmail.mockResolvedValueOnce({ id: "c-42", properties: {} });
    mockListMembershipsAdd.mockResolvedValueOnce(undefined);
    const result = await run({ listId: "list-1", email: "alice@example.com" });
    expect(mockFindContactByEmail.mock.calls[0]![0]!).toMatchObject({
      email: "alice@example.com",
    });
    expect(mockListMembershipsAdd.mock.calls[0]![0]!).toMatchObject({
      listId: "list-1",
      recordIds: ["c-42"],
    });
    expect(result.output).toEqual({
      listId: "list-1",
      email: "alice@example.com",
      contactIdsAdded: ["c-42"],
      contactIdsDiscarded: [],
    });
  });

  it("returns the documented empty-add result (NO membership call) when no contact matches", async () => {
    mockFindContactByEmail.mockResolvedValueOnce(null);
    const result = await run({ listId: "l-1", email: "ghost@example.com" });
    expect(result.output).toEqual({
      listId: "l-1",
      email: "ghost@example.com",
      contactIdsAdded: [],
      contactIdsDiscarded: [],
    });
    expect(mockListMembershipsAdd).not.toHaveBeenCalled();
  });

  it("rejects invalid email format", async () => {
    await expect(run({ listId: "l", email: "not-an-email" })).rejects.toThrow();
  });

  it("rejects empty listId", async () => {
    await expect(run({ listId: "", email: "a@b.com" })).rejects.toThrow();
  });

  it("wraps both calls in refreshAndRetry (provider hubspot)", async () => {
    mockFindContactByEmail.mockResolvedValueOnce({ id: "c-1", properties: {} });
    mockListMembershipsAdd.mockResolvedValueOnce(undefined);
    await run({ listId: "l", email: "a@b.com" });
    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(2);
    expect(mockRefreshAndRetry.mock.calls[0]![0]!.provider).toBe("hubspot");
    expect(mockRefreshAndRetry.mock.calls[1]![0]!.provider).toBe("hubspot");
  });
});
