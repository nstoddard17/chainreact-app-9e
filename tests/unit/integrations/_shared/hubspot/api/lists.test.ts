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

import { addListMembershipByEmail } from "@/integrations/_shared/hubspot/api/lists";

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
