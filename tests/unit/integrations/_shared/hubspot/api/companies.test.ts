/**
 * @jest-environment node
 *
 * Tests for `_shared/hubspot/api/companies.ts`. Mocks `hubspotRequest`.
 */
const mockHubspotRequest = jest.fn();

jest.mock("@/integrations/_shared/hubspot/api/_request", () => ({
  hubspotRequest: (...args: unknown[]) => mockHubspotRequest(...args),
  crmPath: (rest: string) => `/crm/v3/${rest}`,
}));

import {
  companiesCreate,
  companiesGet,
  companiesSearch,
  companiesUpdate,
  findCompanyByDomain,
} from "@/integrations/_shared/hubspot/api/companies";

beforeEach(() => {
  mockHubspotRequest.mockReset();
});

describe("companiesCreate", () => {
  it("POSTs /objects/companies with { properties }", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ id: "c1", properties: {} });
    await companiesCreate({
      accessToken: "tok",
      properties: { name: "Acme", domain: "acme.com" },
    });
    const call = mockHubspotRequest.mock.calls[0]![0]!;
    expect(call.method).toBe("POST");
    expect(call.path).toBe("/crm/v3/objects/companies");
    expect(call.body).toEqual({
      properties: { name: "Acme", domain: "acme.com" },
    });
  });
});

describe("companiesUpdate", () => {
  it("PATCHes /objects/companies/{id}", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ id: "c1", properties: {} });
    await companiesUpdate({
      accessToken: "tok",
      companyId: "c1",
      properties: { phone: "555-0100" },
    });
    const call = mockHubspotRequest.mock.calls[0]![0]!;
    expect(call.method).toBe("PATCH");
    expect(call.path).toBe("/crm/v3/objects/companies/c1");
  });
});

describe("companiesGet", () => {
  it("GETs without query when properties omitted", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ id: "c1", properties: {} });
    await companiesGet({ accessToken: "tok", companyId: "c1" });
    const call = mockHubspotRequest.mock.calls[0]![0]!;
    expect(call.query).toBeUndefined();
  });

  it("appends properties as comma-separated when supplied", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ id: "c1", properties: {} });
    await companiesGet({
      accessToken: "tok",
      companyId: "c1",
      properties: ["name", "domain"],
    });
    expect(
      (
        mockHubspotRequest.mock.calls[0]![0]!.query as URLSearchParams
      ).get("properties"),
    ).toBe("name,domain");
  });
});

describe("companiesSearch", () => {
  it("uses filterGroups (V2 fix)", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ total: 0, results: [] });
    await companiesSearch({
      accessToken: "tok",
      filters: [
        { propertyName: "domain", operator: "EQ", value: "acme.com" },
      ],
    });
    expect(mockHubspotRequest.mock.calls[0]![0]!.body.filterGroups).toEqual([
      {
        filters: [
          { propertyName: "domain", operator: "EQ", value: "acme.com" },
        ],
      },
    ]);
  });
});

describe("findCompanyByDomain", () => {
  it("returns the first match", async () => {
    mockHubspotRequest.mockResolvedValueOnce({
      total: 1,
      results: [{ id: "c1", properties: { domain: "acme.com" } }],
    });
    const result = await findCompanyByDomain({
      accessToken: "tok",
      domain: "acme.com",
    });
    expect(result?.id).toBe("c1");
  });

  it("returns null when no match", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ total: 0, results: [] });
    expect(
      await findCompanyByDomain({ accessToken: "tok", domain: "x.com" }),
    ).toBeNull();
  });
});
