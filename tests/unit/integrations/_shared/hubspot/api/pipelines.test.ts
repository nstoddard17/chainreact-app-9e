/**
 * @jest-environment node
 *
 * Tests for `_shared/hubspot/api/pipelines.ts` — Slice 3.HUBSPOT-2.
 *
 * Pin:
 *   - GET shape: method, path (/crm/v3/pipelines/{objectType}),
 *     no query, no body.
 *   - resourceForNotFound carries the objectType for legible 404
 *     surfaces.
 *   - Returns the JSON payload verbatim (typed as PipelinesListResponse).
 */
const mockHubspotRequest = jest.fn();

jest.mock("@/integrations/_shared/hubspot/api/_request", () => ({
  hubspotRequest: (...args: unknown[]) => mockHubspotRequest(...args),
  crmPath: (rest: string) => `/crm/v3/${rest}`,
}));

import { pipelinesList } from "@/integrations/_shared/hubspot/api/pipelines";

beforeEach(() => {
  mockHubspotRequest.mockReset();
});

describe("pipelinesList", () => {
  it("GETs /crm/v3/pipelines/deals with no query / no body", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ results: [] });
    await pipelinesList({ accessToken: "tok", objectType: "deals" });
    const call = mockHubspotRequest.mock.calls[0]![0]!;
    expect(call.method).toBe("GET");
    expect(call.path).toBe("/crm/v3/pipelines/deals");
    expect(call.query).toBeUndefined();
    expect(call.body).toBeUndefined();
  });

  it("GETs /crm/v3/pipelines/tickets when objectType=tickets", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ results: [] });
    await pipelinesList({ accessToken: "tok", objectType: "tickets" });
    expect(mockHubspotRequest.mock.calls[0]![0]!.path).toBe(
      "/crm/v3/pipelines/tickets",
    );
  });

  it("sets resourceForNotFound to '<objectType> pipelines' for legible 404 surfaces", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ results: [] });
    await pipelinesList({ accessToken: "tok", objectType: "deals" });
    expect(mockHubspotRequest.mock.calls[0]![0]!.resourceForNotFound).toBe(
      "deals pipelines",
    );
    mockHubspotRequest.mockResolvedValueOnce({ results: [] });
    await pipelinesList({ accessToken: "tok", objectType: "tickets" });
    expect(mockHubspotRequest.mock.calls[1]![0]!.resourceForNotFound).toBe(
      "tickets pipelines",
    );
  });

  it("returns the HubSpot response verbatim (typed)", async () => {
    const payload = {
      results: [
        {
          id: "default",
          label: "Sales Pipeline",
          displayOrder: 0,
          stages: [
            { id: "appointmentscheduled", label: "Appointment Scheduled", displayOrder: 0 },
            { id: "closedwon", label: "Closed Won", displayOrder: 1 },
          ],
        },
      ],
    };
    mockHubspotRequest.mockResolvedValueOnce(payload);
    const result = await pipelinesList({
      accessToken: "tok",
      objectType: "deals",
    });
    expect(result).toBe(payload);
  });
});
