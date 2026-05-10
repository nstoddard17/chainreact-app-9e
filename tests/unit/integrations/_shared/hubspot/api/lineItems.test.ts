/**
 * @jest-environment node
 *
 * Tests for `_shared/hubspot/api/lineItems.ts`.
 */
const mockHubspotRequest = jest.fn();

jest.mock("@/integrations/_shared/hubspot/api/_request", () => ({
  hubspotRequest: (...args: unknown[]) => mockHubspotRequest(...args),
  crmPath: (rest: string) => `/crm/v3/${rest}`,
}));

import {
  lineItemsCreate,
  lineItemsUpdate,
} from "@/integrations/_shared/hubspot/api/lineItems";

beforeEach(() => {
  mockHubspotRequest.mockReset();
});

describe("lineItemsCreate", () => {
  it("POSTs /objects/line_items with { properties }", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ id: "li-1", properties: {} });
    await lineItemsCreate({
      accessToken: "tok",
      properties: { hs_product_id: "p-1", quantity: "2" },
    });
    expect(mockHubspotRequest.mock.calls[0]![0]!.method).toBe("POST");
    expect(mockHubspotRequest.mock.calls[0]![0]!.path).toBe(
      "/crm/v3/objects/line_items",
    );
  });
});

describe("lineItemsUpdate", () => {
  it("PATCHes /objects/line_items/{id}", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ id: "li-1", properties: {} });
    await lineItemsUpdate({
      accessToken: "tok",
      lineItemId: "li-1",
      properties: { quantity: "5" },
    });
    expect(mockHubspotRequest.mock.calls[0]![0]!.method).toBe("PATCH");
    expect(mockHubspotRequest.mock.calls[0]![0]!.path).toBe(
      "/crm/v3/objects/line_items/li-1",
    );
  });
});
