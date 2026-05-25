/**
 * @jest-environment node
 *
 * Tests for `_shared/hubspot/api/lists.ts`.
 */
const mockHubspotRequest = jest.fn();

jest.mock("@/integrations/_shared/hubspot/api/_request", () => ({
  hubspotRequest: (...args: unknown[]) => mockHubspotRequest(...args),
  crmPath: (rest: string) => `/crm/v3/${rest}`,
}));

import {
  addListMembershipByEmail,
  removeListMembershipByEmail,
  searchLists,
} from "@/integrations/_shared/hubspot/api/lists";

beforeEach(() => {
  mockHubspotRequest.mockReset();
});

describe("addListMembershipByEmail", () => {
  it("POSTs /lists/{listId}/memberships/add with recordIdOrEmails containing the email", async () => {
    mockHubspotRequest.mockResolvedValueOnce({
      recordIdsAdded: ["contact-42"],
    });
    await addListMembershipByEmail({
      accessToken: "tok",
      listId: "list-1",
      email: "alice@example.com",
    });
    const call = mockHubspotRequest.mock.calls[0]![0]!;
    expect(call.method).toBe("POST");
    expect(call.path).toBe("/crm/v3/lists/list-1/memberships/add");
    // Single-call (HubSpot resolves email->contactId server-side) —
    // V2 collapses V1's two-step search-then-add flow.
    expect(call.body).toEqual({
      recordIdOrEmails: ["alice@example.com"],
    });
  });

  it("URL-encodes listId (defensive against weird ids)", async () => {
    mockHubspotRequest.mockResolvedValueOnce({});
    await addListMembershipByEmail({
      accessToken: "tok",
      listId: "list/with/slashes",
      email: "a@b.com",
    });
    expect(mockHubspotRequest.mock.calls[0]![0]!.path).toBe(
      "/crm/v3/lists/list%2Fwith%2Fslashes/memberships/add",
    );
  });

  it("returns the response verbatim", async () => {
    mockHubspotRequest.mockResolvedValueOnce({
      recordIdsAdded: ["c-1"],
      recordIdsDiscarded: [],
    });
    const result = await addListMembershipByEmail({
      accessToken: "tok",
      listId: "l",
      email: "x@y.com",
    });
    expect(result.recordIdsAdded).toEqual(["c-1"]);
  });
});

describe("removeListMembershipByEmail (HubSpot 2.1)", () => {
  it("POSTs /lists/{listId}/memberships/remove with recordIdOrEmails containing the email", async () => {
    mockHubspotRequest.mockResolvedValueOnce({
      recordIdsRemoved: ["contact-42"],
    });
    await removeListMembershipByEmail({
      accessToken: "tok",
      listId: "list-1",
      email: "alice@example.com",
    });
    const call = mockHubspotRequest.mock.calls[0]![0]!;
    expect(call.method).toBe("POST");
    expect(call.path).toBe("/crm/v3/lists/list-1/memberships/remove");
    expect(call.body).toEqual({
      recordIdOrEmails: ["alice@example.com"],
    });
  });

  it("URL-encodes listId (defensive against weird ids)", async () => {
    mockHubspotRequest.mockResolvedValueOnce({});
    await removeListMembershipByEmail({
      accessToken: "tok",
      listId: "list/with/slashes",
      email: "a@b.com",
    });
    expect(mockHubspotRequest.mock.calls[0]![0]!.path).toBe(
      "/crm/v3/lists/list%2Fwith%2Fslashes/memberships/remove",
    );
  });

  it("threads the resourceForNotFound tag", async () => {
    mockHubspotRequest.mockResolvedValueOnce({});
    await removeListMembershipByEmail({
      accessToken: "tok",
      listId: "list-99",
      email: "x@y.com",
    });
    expect(mockHubspotRequest.mock.calls[0]![0]!.resourceForNotFound).toBe(
      "list list-99",
    );
  });

  it("returns recordIdsRemoved + recordIdsDiscarded verbatim", async () => {
    mockHubspotRequest.mockResolvedValueOnce({
      recordIdsRemoved: ["c-1"],
      recordIdsDiscarded: ["c-2"],
    });
    const result = await removeListMembershipByEmail({
      accessToken: "tok",
      listId: "l",
      email: "x@y.com",
    });
    expect(result.recordIdsRemoved).toEqual(["c-1"]);
    expect(result.recordIdsDiscarded).toEqual(["c-2"]);
  });

  it("propagates DYNAMIC-list validation error verbatim", async () => {
    mockHubspotRequest.mockRejectedValueOnce(
      new Error(
        "Cannot manually remove contacts from a dynamic list (VALIDATION_ERROR)",
      ),
    );
    await expect(
      removeListMembershipByEmail({
        accessToken: "tok",
        listId: "dynamic-list",
        email: "a@b.com",
      }),
    ).rejects.toThrow(/dynamic list/i);
  });
});

describe("searchLists (Slice 3.HUBSPOT-2)", () => {
  it("POSTs /crm/v3/lists/search with default count 200 and no offset", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ lists: [] });
    await searchLists({ accessToken: "tok" });
    const call = mockHubspotRequest.mock.calls[0]![0]!;
    expect(call.method).toBe("POST");
    expect(call.path).toBe("/crm/v3/lists/search");
    expect(call.body).toEqual({ count: 200 });
    expect(call.resourceForNotFound).toBe("lists");
  });

  it("includes offset when supplied (positive)", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ lists: [] });
    await searchLists({ accessToken: "tok", count: 50, offset: 100 });
    expect(mockHubspotRequest.mock.calls[0]![0]!.body).toEqual({
      count: 50,
      offset: 100,
    });
  });

  it("clamps count to 500 (HubSpot's documented cap)", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ lists: [] });
    await searchLists({ accessToken: "tok", count: 9999 });
    expect(mockHubspotRequest.mock.calls[0]![0]!.body).toEqual({ count: 500 });
  });

  it("omits offset when it is zero (HubSpot expects absent for first page)", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ lists: [] });
    await searchLists({ accessToken: "tok", offset: 0 });
    expect(mockHubspotRequest.mock.calls[0]![0]!.body).toEqual({ count: 200 });
  });
});
