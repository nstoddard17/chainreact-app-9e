/**
 * @jest-environment node
 *
 * Tests for `_shared/hubspot/api/associations.ts` — the v4 default-typed
 * associations helper that backs every Batch 2 create_* action's
 * optional association handling.
 */
const mockHubspotRequest = jest.fn();

jest.mock("@/integrations/_shared/hubspot/api/_request", () => ({
  hubspotRequest: (...args: unknown[]) => mockHubspotRequest(...args),
  crmPath: (rest: string) => `/crm/v3/${rest}`,
}));

import {
  associateCrmObjects,
  attachAssociations,
  getAssociationTypeId,
} from "@/integrations/_shared/hubspot/api/associations";

beforeEach(() => {
  mockHubspotRequest.mockReset();
});

describe("getAssociationTypeId", () => {
  it("returns documented HubSpot-defined ids for engagement → CRM-object pairs", () => {
    // Note associations (V1's createNote.ts:79-117 source).
    expect(getAssociationTypeId("notes", "contacts")).toBe(202);
    expect(getAssociationTypeId("notes", "companies")).toBe(190);
    expect(getAssociationTypeId("notes", "deals")).toBe(214);
    expect(getAssociationTypeId("notes", "tickets")).toBe(218);
    // Task associations.
    expect(getAssociationTypeId("tasks", "contacts")).toBe(204);
    expect(getAssociationTypeId("tasks", "companies")).toBe(192);
    expect(getAssociationTypeId("tasks", "deals")).toBe(216);
    expect(getAssociationTypeId("tasks", "tickets")).toBe(220);
    // Call associations.
    expect(getAssociationTypeId("calls", "contacts")).toBe(194);
    expect(getAssociationTypeId("calls", "companies")).toBe(182);
    expect(getAssociationTypeId("calls", "deals")).toBe(206);
    expect(getAssociationTypeId("calls", "tickets")).toBe(210);
    // Meeting associations.
    expect(getAssociationTypeId("meetings", "contacts")).toBe(200);
    expect(getAssociationTypeId("meetings", "companies")).toBe(188);
    expect(getAssociationTypeId("meetings", "deals")).toBe(212);
    expect(getAssociationTypeId("meetings", "tickets")).toBe(216);
  });

  it("returns documented HubSpot-defined ids for ticket associations", () => {
    expect(getAssociationTypeId("tickets", "contacts")).toBe(16);
    expect(getAssociationTypeId("tickets", "companies")).toBe(26);
    expect(getAssociationTypeId("tickets", "deals")).toBe(28);
  });

  it("returns the line_item → deal id (Slice 13 Batch 2's create_line_item)", () => {
    expect(getAssociationTypeId("line_items", "deals")).toBe(20);
  });

  it("returns null for unsupported (from, to) pairs", () => {
    // line_items don't associate to contacts or companies in HubSpot's
    // default association graph — they associate via deals.
    expect(getAssociationTypeId("line_items", "contacts")).toBeNull();
    expect(getAssociationTypeId("line_items", "companies")).toBeNull();
    expect(getAssociationTypeId("line_items", "tickets")).toBeNull();
    // tickets don't have a documented default association to tickets.
    expect(getAssociationTypeId("tickets", "tickets")).toBeNull();
  });
});

describe("associateCrmObjects", () => {
  it("PUTs /crm/v4/objects/{from}/{id}/associations/{to}/{id} with the body shape", async () => {
    mockHubspotRequest.mockResolvedValueOnce({});
    await associateCrmObjects({
      accessToken: "tok",
      fromType: "notes",
      fromId: "note-1",
      toType: "contacts",
      toId: "contact-42",
    });
    const call = mockHubspotRequest.mock.calls[0]![0]!;
    expect(call.method).toBe("PUT");
    expect(call.path).toBe(
      "/crm/v4/objects/notes/note-1/associations/contacts/contact-42",
    );
    expect(call.body).toEqual([
      { associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 },
    ]);
  });

  it("URL-encodes both ids (defensive)", async () => {
    mockHubspotRequest.mockResolvedValueOnce({});
    await associateCrmObjects({
      accessToken: "tok",
      fromType: "tasks",
      fromId: "task/with/slashes",
      toType: "deals",
      toId: "deal+plus",
    });
    expect(mockHubspotRequest.mock.calls[0]![0]!.path).toBe(
      "/crm/v4/objects/tasks/task%2Fwith%2Fslashes/associations/deals/deal%2Bplus",
    );
  });

  it("throws when (fromType, toType) isn't in the type lookup", async () => {
    await expect(
      associateCrmObjects({
        accessToken: "tok",
        fromType: "line_items",
        fromId: "li-1",
        toType: "contacts",
        toId: "c-1",
      }),
    ).rejects.toThrow(/no default association type id/i);
    expect(mockHubspotRequest).not.toHaveBeenCalled();
  });
});

describe("attachAssociations", () => {
  it("attaches multiple associations in parallel and reports successes", async () => {
    mockHubspotRequest.mockResolvedValue({});
    const result = await attachAssociations({
      accessToken: "tok",
      fromType: "notes",
      fromId: "note-1",
      toIds: {
        contacts: "c-1",
        companies: "co-1",
        deals: "d-1",
        tickets: "t-1",
      },
    });
    expect(mockHubspotRequest).toHaveBeenCalledTimes(4);
    expect(result.attached).toHaveLength(4);
    expect(result.warnings).toHaveLength(0);
  });

  it("skips empty / undefined target ids without making API calls", async () => {
    mockHubspotRequest.mockResolvedValueOnce({});
    const result = await attachAssociations({
      accessToken: "tok",
      fromType: "notes",
      fromId: "note-1",
      toIds: {
        contacts: "c-1",
        companies: undefined,
        deals: "",
        tickets: undefined,
      },
    });
    expect(mockHubspotRequest).toHaveBeenCalledTimes(1);
    expect(result.attached).toEqual([{ toType: "contacts", toId: "c-1" }]);
  });

  it("captures partial failures as warnings (parent object NOT rolled back)", async () => {
    mockHubspotRequest
      .mockResolvedValueOnce({}) // contacts succeeds
      .mockRejectedValueOnce(new Error("HubSpot 404: contact not found")) // companies fails
      .mockResolvedValueOnce({}); // deals succeeds
    const result = await attachAssociations({
      accessToken: "tok",
      fromType: "notes",
      fromId: "note-1",
      toIds: {
        contacts: "c-1",
        companies: "co-bad",
        deals: "d-1",
      },
    });
    expect(result.attached).toHaveLength(2);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.toType).toBe("companies");
    expect(result.warnings[0]!.message).toMatch(/contact not found/);
  });

  it("skips (fromType, toType) pairs with no defined type id (future-proof)", async () => {
    mockHubspotRequest.mockResolvedValue({});
    const result = await attachAssociations({
      accessToken: "tok",
      fromType: "line_items",
      fromId: "li-1",
      // contacts/companies/tickets aren't valid targets for line_items.
      toIds: {
        contacts: "c-1",
        companies: "co-1",
        tickets: "t-1",
        deals: "d-1",
      },
    });
    expect(mockHubspotRequest).toHaveBeenCalledTimes(1);
    expect(result.attached).toEqual([{ toType: "deals", toId: "d-1" }]);
    expect(result.warnings).toHaveLength(0);
  });

  it("returns empty arrays when no targets are provided", async () => {
    const result = await attachAssociations({
      accessToken: "tok",
      fromType: "notes",
      fromId: "note-1",
      toIds: {},
    });
    expect(mockHubspotRequest).not.toHaveBeenCalled();
    expect(result.attached).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});
