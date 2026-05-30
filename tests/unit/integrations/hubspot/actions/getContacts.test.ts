/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockContactsSearch = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
}));
jest.mock("@/integrations/_shared/hubspot/api/contacts", () => ({
  contactsSearch: (...a: unknown[]) => mockContactsSearch(...a),
}));

import { getContacts } from "@/integrations/hubspot/actions/getContacts";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockContactsSearch.mockReset();
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

describe("get_contacts", () => {
  it("uses default properties when config.properties is omitted", async () => {
    mockContactsSearch.mockResolvedValueOnce({ total: 0, results: [] });
    await getContacts({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger,
    });
    expect(mockContactsSearch.mock.calls[0]![0]!.properties).toEqual([
      "firstname",
      "lastname",
      "email",
      "phone",
      "company",
    ]);
  });

  it("accepts comma-separated string for properties", async () => {
    mockContactsSearch.mockResolvedValueOnce({ total: 0, results: [] });
    await getContacts({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { properties: "email, jobtitle" },
      triggerEvent: trigger,
    });
    expect(mockContactsSearch.mock.calls[0]![0]!.properties).toEqual([
      "email",
      "jobtitle",
    ]);
  });

  it("accepts array for properties", async () => {
    mockContactsSearch.mockResolvedValueOnce({ total: 0, results: [] });
    await getContacts({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { properties: ["email", "phone"] },
      triggerEvent: trigger,
    });
    expect(mockContactsSearch.mock.calls[0]![0]!.properties).toEqual([
      "email",
      "phone",
    ]);
  });

  it("builds an EQ filter when both filterProperty + filterValue are present", async () => {
    mockContactsSearch.mockResolvedValueOnce({ total: 0, results: [] });
    await getContacts({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        filterProperty: "lifecyclestage",
        filterValue: "customer",
      },
      triggerEvent: trigger,
    });
    expect(mockContactsSearch.mock.calls[0]![0]!.filters).toEqual([
      { propertyName: "lifecyclestage", operator: "EQ", value: "customer" },
    ]);
  });

  it("omits filters when only filterProperty is supplied (matches V1 gate)", async () => {
    mockContactsSearch.mockResolvedValueOnce({ total: 0, results: [] });
    await getContacts({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { filterProperty: "lifecyclestage" },
      triggerEvent: trigger,
    });
    expect(mockContactsSearch.mock.calls[0]![0]!.filters).toEqual([]);
  });

  it("returns nextCursor + hasMore from paging shape", async () => {
    mockContactsSearch.mockResolvedValueOnce({
      total: 250,
      results: [
        { id: "1", properties: {} },
        { id: "2", properties: {} },
      ],
      paging: { next: { after: "cursor-xyz" } },
    });
    const result = await getContacts({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger,
    });
    expect(result.output.nextCursor).toBe("cursor-xyz");
    expect(result.output.hasMore).toBe(true);
    expect(result.output.count).toBe(2);
    expect(result.output.total).toBe(250);
  });

  it("returns hasMore=false when paging.next is absent", async () => {
    mockContactsSearch.mockResolvedValueOnce({ total: 1, results: [] });
    const result = await getContacts({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger,
    });
    expect(result.output.hasMore).toBe(false);
    expect(result.output.nextCursor).toBeNull();
  });

  it("clamps limit to schema's max 100 (rejects > 100)", async () => {
    await expect(
      getContacts({
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

  it("wraps in refreshAndRetry", async () => {
    mockContactsSearch.mockResolvedValueOnce({ total: 0, results: [] });
    await getContacts({
      workflowId: "wf",
      userId: "user-xyz",
      accountId: "acct-user-xyz",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger,
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0]!.provider).toBe("hubspot");
    expect(mockRefreshAndRetry.mock.calls[0]![0]!.userId).toBe("user-xyz");
  });
});
