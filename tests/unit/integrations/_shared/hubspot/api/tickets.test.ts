/**
 * @jest-environment node
 *
 * Tests for `_shared/hubspot/api/tickets.ts`. Same shape as the
 * contacts/companies/deals wrappers — focus is on endpoint paths +
 * body shape + correct filterGroups usage.
 */
const mockHubspotRequest = jest.fn();

jest.mock("@/integrations/_shared/hubspot/api/_request", () => ({
  hubspotRequest: (...args: unknown[]) => mockHubspotRequest(...args),
  crmPath: (rest: string) => `/crm/v3/${rest}`,
}));

import {
  ticketsCreate,
  ticketsGet,
  ticketsSearch,
  ticketsUpdate,
} from "@/integrations/_shared/hubspot/api/tickets";

beforeEach(() => {
  mockHubspotRequest.mockReset();
});

describe("ticketsCreate", () => {
  it("POSTs /objects/tickets with { properties }", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ id: "t-1", properties: {} });
    await ticketsCreate({
      accessToken: "tok",
      properties: {
        subject: "Need help",
        hs_pipeline: "support",
        hs_pipeline_stage: "1",
      },
    });
    const call = mockHubspotRequest.mock.calls[0]![0]!;
    expect(call.method).toBe("POST");
    expect(call.path).toBe("/crm/v3/objects/tickets");
    expect(call.body).toEqual({
      properties: {
        subject: "Need help",
        hs_pipeline: "support",
        hs_pipeline_stage: "1",
      },
    });
  });
});

describe("ticketsUpdate", () => {
  it("PATCHes /objects/tickets/{id}", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ id: "t-1", properties: {} });
    await ticketsUpdate({
      accessToken: "tok",
      ticketId: "t-1",
      properties: { subject: "Updated" },
    });
    expect(mockHubspotRequest.mock.calls[0]![0]!.method).toBe("PATCH");
    expect(mockHubspotRequest.mock.calls[0]![0]!.path).toBe(
      "/crm/v3/objects/tickets/t-1",
    );
  });
});

describe("ticketsGet", () => {
  it("appends properties as comma-separated when supplied", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ id: "t-1", properties: {} });
    await ticketsGet({
      accessToken: "tok",
      ticketId: "t-1",
      properties: ["subject", "hs_pipeline"],
    });
    expect(
      (mockHubspotRequest.mock.calls[0]![0]!.query as URLSearchParams).get(
        "properties",
      ),
    ).toBe("subject,hs_pipeline");
  });
});

describe("ticketsSearch", () => {
  it("uses filterGroups (NOT top-level filters)", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ total: 0, results: [] });
    await ticketsSearch({
      accessToken: "tok",
      filters: [
        { propertyName: "hs_pipeline_stage", operator: "EQ", value: "1" },
      ],
    });
    expect(mockHubspotRequest.mock.calls[0]![0]!.body.filterGroups).toEqual([
      {
        filters: [
          { propertyName: "hs_pipeline_stage", operator: "EQ", value: "1" },
        ],
      },
    ]);
  });

  it("threads after + properties when supplied", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ total: 0, results: [] });
    await ticketsSearch({
      accessToken: "tok",
      after: "cur",
      properties: ["subject"],
    });
    const body = mockHubspotRequest.mock.calls[0]![0]!.body;
    expect(body.after).toBe("cur");
    expect(body.properties).toEqual(["subject"]);
  });
});
