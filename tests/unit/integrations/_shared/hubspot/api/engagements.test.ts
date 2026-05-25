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
  tasksCreate,
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
