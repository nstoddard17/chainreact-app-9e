/**
 * @jest-environment node
 *
 * Tests for `_shared/hubspot/api/contacts.ts`. Mocks `hubspotRequest`
 * so we exercise the wrapper's body/query construction without touching
 * the HTTP layer (that's covered separately in `_request.test.ts`).
 */
const mockHubspotRequest = jest.fn();

jest.mock("@/integrations/_shared/hubspot/api/_request", () => ({
  hubspotRequest: (...args: unknown[]) => mockHubspotRequest(...args),
  crmPath: (rest: string) => `/crm/v3/${rest}`,
}));

import {
  contactsCreate,
  contactsGet,
  contactsSearch,
  contactsUpdate,
  findContactByEmail,
} from "@/integrations/_shared/hubspot/api/contacts";

beforeEach(() => {
  mockHubspotRequest.mockReset();
});

describe("contactsCreate", () => {
  it("POSTs /objects/contacts with { properties }", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ id: "123", properties: {} });
    await contactsCreate({
      accessToken: "tok",
      properties: { email: "alice@example.com", firstname: "Alice" },
    });
    const call = mockHubspotRequest.mock.calls[0]![0]!;
    expect(call.method).toBe("POST");
    expect(call.path).toBe("/crm/v3/objects/contacts");
    expect(call.body).toEqual({
      properties: { email: "alice@example.com", firstname: "Alice" },
    });
  });

  it("propagates the access token to the wrapper", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ id: "1", properties: {} });
    await contactsCreate({
      accessToken: "secret-xyz",
      properties: { email: "a@b.com" },
    });
    expect(mockHubspotRequest.mock.calls[0]![0]!.accessToken).toBe("secret-xyz");
  });
});

describe("contactsUpdate", () => {
  it("PATCHes /objects/contacts/{id} with URL-encoded id", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ id: "1", properties: {} });
    await contactsUpdate({
      accessToken: "tok",
      contactId: "abc/def",
      properties: { firstname: "Updated" },
    });
    const call = mockHubspotRequest.mock.calls[0]![0]!;
    expect(call.method).toBe("PATCH");
    expect(call.path).toBe("/crm/v3/objects/contacts/abc%2Fdef");
    expect(call.body).toEqual({ properties: { firstname: "Updated" } });
  });
});

describe("contactsGet", () => {
  it("GETs /objects/contacts/{id} without query when properties omitted", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ id: "1", properties: {} });
    await contactsGet({ accessToken: "tok", contactId: "1" });
    const call = mockHubspotRequest.mock.calls[0]![0]!;
    expect(call.method).toBe("GET");
    expect(call.path).toBe("/crm/v3/objects/contacts/1");
    expect(call.query).toBeUndefined();
  });

  it("appends properties as comma-separated query when supplied", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ id: "1", properties: {} });
    await contactsGet({
      accessToken: "tok",
      contactId: "1",
      properties: ["email", "firstname"],
    });
    const call = mockHubspotRequest.mock.calls[0]![0]!;
    expect((call.query as URLSearchParams).get("properties")).toBe(
      "email,firstname",
    );
  });
});

describe("contactsSearch", () => {
  it("POSTs /objects/contacts/search with default limit 100", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ total: 0, results: [] });
    await contactsSearch({ accessToken: "tok" });
    const call = mockHubspotRequest.mock.calls[0]![0]!;
    expect(call.method).toBe("POST");
    expect(call.path).toBe("/crm/v3/objects/contacts/search");
    expect(call.body).toEqual({ limit: 100 });
  });

  it("clamps limit to HubSpot's 100-row max", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ total: 0, results: [] });
    await contactsSearch({ accessToken: "tok", limit: 500 });
    expect(mockHubspotRequest.mock.calls[0]![0]!.body.limit).toBe(100);
  });

  it("nests filters in filterGroups (NOT top-level — V2 fix for V1 bug)", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ total: 0, results: [] });
    await contactsSearch({
      accessToken: "tok",
      filters: [
        { propertyName: "email", operator: "EQ", value: "a@b.com" },
      ],
    });
    const body = mockHubspotRequest.mock.calls[0]![0]!.body;
    // Correct HubSpot search shape: filterGroups: [{ filters: [...] }].
    // V1's getContacts.ts sends a TOP-LEVEL `filters` array — HubSpot
    // ignores it. This wrapper produces the documented shape.
    expect(body.filterGroups).toEqual([
      { filters: [{ propertyName: "email", operator: "EQ", value: "a@b.com" }] },
    ]);
    expect(body.filters).toBeUndefined();
  });

  it("threads `after` and `properties` into the body when supplied", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ total: 0, results: [] });
    await contactsSearch({
      accessToken: "tok",
      after: "cursor-xyz",
      properties: ["email", "lastname"],
    });
    const body = mockHubspotRequest.mock.calls[0]![0]!.body;
    expect(body.after).toBe("cursor-xyz");
    expect(body.properties).toEqual(["email", "lastname"]);
  });

  it("omits filterGroups when no filters supplied (avoids returning zero results unintentionally)", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ total: 0, results: [] });
    await contactsSearch({ accessToken: "tok", filters: [] });
    expect(
      mockHubspotRequest.mock.calls[0]![0]!.body.filterGroups,
    ).toBeUndefined();
  });
});

describe("findContactByEmail", () => {
  it("returns the first result when search hits", async () => {
    mockHubspotRequest.mockResolvedValueOnce({
      total: 1,
      results: [{ id: "42", properties: { email: "a@b.com" } }],
    });
    const result = await findContactByEmail({
      accessToken: "tok",
      email: "a@b.com",
    });
    expect(result?.id).toBe("42");
  });

  it("returns null when search returns empty", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ total: 0, results: [] });
    const result = await findContactByEmail({
      accessToken: "tok",
      email: "noone@nowhere.com",
    });
    expect(result).toBeNull();
  });

  it("uses an email EQ filter with limit 1 (deterministic; V2 fix for V1's regex extraction)", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ total: 0, results: [] });
    await findContactByEmail({ accessToken: "tok", email: "x@y.com" });
    const body = mockHubspotRequest.mock.calls[0]![0]!.body;
    expect(body.limit).toBe(1);
    expect(body.filterGroups).toEqual([
      { filters: [{ propertyName: "email", operator: "EQ", value: "x@y.com" }] },
    ]);
  });
});
