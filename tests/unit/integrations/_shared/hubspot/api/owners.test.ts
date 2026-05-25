/**
 * @jest-environment node
 *
 * Tests for `_shared/hubspot/api/owners.ts`.
 */
const mockHubspotRequest = jest.fn();

jest.mock("@/integrations/_shared/hubspot/api/_request", () => ({
  hubspotRequest: (...args: unknown[]) => mockHubspotRequest(...args),
  crmPath: (rest: string) => `/crm/v3/${rest}`,
}));

import { ownersList } from "@/integrations/_shared/hubspot/api/owners";

beforeEach(() => {
  mockHubspotRequest.mockReset();
});

describe("ownersList", () => {
  it("GETs /crm/v3/owners with default limit 100", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ results: [] });
    await ownersList({ accessToken: "tok" });
    const call = mockHubspotRequest.mock.calls[0]![0]!;
    expect(call.method).toBe("GET");
    expect(call.path).toBe("/crm/v3/owners");
    expect((call.query as URLSearchParams).get("limit")).toBe("100");
  });

  it("clamps limit to 100", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ results: [] });
    await ownersList({ accessToken: "tok", limit: 500 });
    expect(
      (
        mockHubspotRequest.mock.calls[0]![0]!.query as URLSearchParams
      ).get("limit"),
    ).toBe("100");
  });

  it("appends email + after when supplied", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ results: [] });
    await ownersList({
      accessToken: "tok",
      email: "alice@example.com",
      after: "cursor-xyz",
    });
    const query = mockHubspotRequest.mock.calls[0]![0]!.query as URLSearchParams;
    expect(query.get("email")).toBe("alice@example.com");
    expect(query.get("after")).toBe("cursor-xyz");
  });

  it("does NOT use crmPath (owners endpoint lives outside /objects)", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ results: [] });
    await ownersList({ accessToken: "tok" });
    // Path is /crm/v3/owners — NOT /crm/v3/objects/owners.
    expect(mockHubspotRequest.mock.calls[0]![0]!.path).toBe("/crm/v3/owners");
  });
});
