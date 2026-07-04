/**
 * @jest-environment node
 *
 * Tests for `_shared/hubspot/api/engagements.ts` — 4 typed wrappers
 * over the engagement object types (notes/tasks/calls/meetings).
 */
const mockHubspotRequest = jest.fn();

jest.mock("@/integrations/_shared/hubspot/api/_request", () => ({
  hubspotRequest: (...args: unknown[]) => mockHubspotRequest(...args),
  crmPath: (rest: string) => `/crm/v3/${rest}`,
}));

import {
  callsCreate,
  meetingsCreate,
  notesCreate,
  notesGet,
  tasksCreate,
  tasksGet,
} from "@/integrations/_shared/hubspot/api/engagements";

beforeEach(() => {
  mockHubspotRequest.mockReset();
});

describe("notesCreate", () => {
  it("POSTs /objects/notes with { properties }", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ id: "n-1", properties: {} });
    await notesCreate({
      accessToken: "tok",
      properties: { hs_note_body: "Quick note", hs_timestamp: "1700000000000" },
    });
    const call = mockHubspotRequest.mock.calls[0]![0]!;
    expect(call.path).toBe("/crm/v3/objects/notes");
    expect(call.body).toEqual({
      properties: { hs_note_body: "Quick note", hs_timestamp: "1700000000000" },
    });
  });
});

describe("notesGet", () => {
  it("GETs /objects/notes/{id} with properties projection", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ id: "n-1", properties: {} });
    await notesGet({
      accessToken: "tok",
      engagementId: "n-1",
      properties: ["hs_note_body"],
    });
    const call = mockHubspotRequest.mock.calls[0]![0]!;
    expect(call.method).toBe("GET");
    expect(call.path).toBe("/crm/v3/objects/notes/n-1");
    expect((call.query as URLSearchParams).get("properties")).toBe("hs_note_body");
  });
});

describe("tasksCreate", () => {
  it("POSTs /objects/tasks", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ id: "ta-1", properties: {} });
    await tasksCreate({
      accessToken: "tok",
      properties: {
        hs_task_subject: "Follow up",
        hs_task_status: "NOT_STARTED",
      },
    });
    expect(mockHubspotRequest.mock.calls[0]![0]!.path).toBe(
      "/crm/v3/objects/tasks",
    );
  });
});

describe("tasksGet", () => {
  it("GETs /objects/tasks/{id} with properties projection", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ id: "ta-1", properties: {} });
    await tasksGet({
      accessToken: "tok",
      engagementId: "ta-1",
      properties: ["hs_task_subject", "hs_task_status"],
    });
    const call = mockHubspotRequest.mock.calls[0]![0]!;
    expect(call.method).toBe("GET");
    expect(call.path).toBe("/crm/v3/objects/tasks/ta-1");
    expect((call.query as URLSearchParams).get("properties")).toBe(
      "hs_task_subject,hs_task_status",
    );
  });
});

describe("callsCreate", () => {
  it("POSTs /objects/calls", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ id: "c-1", properties: {} });
    await callsCreate({
      accessToken: "tok",
      properties: { hs_call_status: "COMPLETED" },
    });
    expect(mockHubspotRequest.mock.calls[0]![0]!.path).toBe(
      "/crm/v3/objects/calls",
    );
  });
});

describe("meetingsCreate", () => {
  it("POSTs /objects/meetings", async () => {
    mockHubspotRequest.mockResolvedValueOnce({ id: "m-1", properties: {} });
    await meetingsCreate({
      accessToken: "tok",
      properties: {
        hs_meeting_title: "Kickoff",
        hs_meeting_outcome: "SCHEDULED",
      },
    });
    expect(mockHubspotRequest.mock.calls[0]![0]!.path).toBe(
      "/crm/v3/objects/meetings",
    );
  });
});
