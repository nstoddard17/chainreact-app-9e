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
  listMembershipsAdd,
  listMembershipsGet,
  listMembershipsRemove,
  listsCreate,
  listsDelete,
  searchLists,
} from "@/integrations/_shared/hubspot/api/lists";

beforeEach(() => {
  mockHubspotRequest.mockReset();
});

describe("listMembershipsAdd (v3 PUT contract — 405 bug fix)", () => {
  it("PUTs /lists/{listId}/memberships/add with a RAW record-id array body", async () => {
    mockHubspotRequest.mockResolvedValueOnce(undefined);
    await listMembershipsAdd({
      accessToken: "tok",
      listId: "list-1",
      recordIds: ["contact-42"],
    });
    const call = mockHubspotRequest.mock.calls[0]![0]!;
    // The v3 endpoint 405s on POST and takes NO email/object body — the
    // legacy { recordIdOrEmails } shape was the production bug.
    expect(call.method).toBe("PUT");
    expect(call.path).toBe("/crm/v3/lists/list-1/memberships/add");
    expect(call.body).toEqual(["contact-42"]);
  });

  it("URL-encodes listId (defensive against weird ids)", async () => {
    mockHubspotRequest.mockResolvedValueOnce(undefined);
    await listMembershipsAdd({
      accessToken: "tok",
      listId: "list/with/slashes",
      recordIds: ["c-1"],
    });
    expect(mockHubspotRequest.mock.calls[0]![0]!.path).toBe(
      "/crm/v3/lists/list%2Fwith%2Fslashes/memberships/add",
    );
  });

  it("returns void on 204", async () => {
    mockHubspotRequest.mockResolvedValueOnce(undefined);
    const result = await listMembershipsAdd({
      accessToken: "tok",
      listId: "l",
      recordIds: ["c-1"],
    });
    expect(result).toBeUndefined();
  });
});

describe("listMembershipsRemove (v3 PUT contract — 405 bug fix)", () => {
  it("PUTs /lists/{listId}/memberships/remove with a RAW record-id array body", async () => {
    mockHubspotRequest.mockResolvedValueOnce(undefined);
    await listMembershipsRemove({
      accessToken: "tok",
      listId: "list-1",
      recordIds: ["contact-42"],
    });
    const call = mockHubspotRequest.mock.calls[0]![0]!;
    expect(call.method).toBe("PUT");
    expect(call.path).toBe("/crm/v3/lists/list-1/memberships/remove");
    expect(call.body).toEqual(["contact-42"]);
  });

  it("threads the resourceForNotFound tag", async () => {
    mockHubspotRequest.mockResolvedValueOnce(undefined);
    await listMembershipsRemove({
      accessToken: "tok",
      listId: "list-99",
      recordIds: ["c-1"],
    });
    expect(mockHubspotRequest.mock.calls[0]![0]!.resourceForNotFound).toBe(
      "list list-99",
    );
  });

  it("propagates DYNAMIC-list validation error verbatim", async () => {
    mockHubspotRequest.mockRejectedValueOnce(
      new Error(
        "Cannot manually remove contacts from a dynamic list (VALIDATION_ERROR)",
      ),
    );
    await expect(
      listMembershipsRemove({
        accessToken: "tok",
        listId: "dynamic-list",
        recordIds: ["c-1"],
      }),
    ).rejects.toThrow(/dynamic list/i);
  });
});

describe("listMembershipsGet", () => {
  it("GETs /lists/{listId}/memberships with a clamped limit", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ results: [] });
    await listMembershipsGet({ accessToken: "tok", listId: "9", limit: 999 });
    const call = mockHubspotRequest.mock.calls[0]![0]!;
    expect(call.method).toBe("GET");
    expect(call.path).toBe("/crm/v3/lists/9/memberships");
    expect((call.query as URLSearchParams).get("limit")).toBe("250");
  });

  it("threads the after cursor when supplied", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ results: [] });
    await listMembershipsGet({ accessToken: "tok", listId: "9", after: "abc" });
    expect((mockHubspotRequest.mock.calls[0]![0]!.query as URLSearchParams).get("after")).toBe("abc");
  });
});

describe("listsCreate / listsDelete (smoke staging)", () => {
  it("POSTs /lists/ with name + objectTypeId + processingType", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ list: { listId: "77" } });
    await listsCreate({
      accessToken: "tok",
      name: "crsmoke-list",
      objectTypeId: "0-1",
      processingType: "MANUAL",
    });
    const call = mockHubspotRequest.mock.calls[0]![0]!;
    expect(call.method).toBe("POST");
    expect(call.path).toBe("/crm/v3/lists/");
    expect(call.body).toEqual({
      name: "crsmoke-list",
      objectTypeId: "0-1",
      processingType: "MANUAL",
    });
  });

  it("DELETEs /lists/{listId} with no body and returns void", async () => {
    mockHubspotRequest.mockResolvedValueOnce(undefined);
    const result = await listsDelete({ accessToken: "tok", listId: "77" });
    const call = mockHubspotRequest.mock.calls[0]![0]!;
    expect(call.method).toBe("DELETE");
    expect(call.path).toBe("/crm/v3/lists/77");
    expect(result).toBeUndefined();
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
