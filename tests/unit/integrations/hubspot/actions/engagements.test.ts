/**
 * @jest-environment node
 *
 * Tests for create_note / create_task / create_call / create_meeting.
 * Combined since the shape mirrors closely: properties build +
 * optional engagements wrapper + parallel attachAssociations call.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockNotesCreate = jest.fn();
const mockTasksCreate = jest.fn();
const mockCallsCreate = jest.fn();
const mockMeetingsCreate = jest.fn();
const mockAttachAssociations = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
}));
jest.mock("@/integrations/_shared/hubspot/api/engagements", () => ({
  notesCreate: (...a: unknown[]) => mockNotesCreate(...a),
  tasksCreate: (...a: unknown[]) => mockTasksCreate(...a),
  callsCreate: (...a: unknown[]) => mockCallsCreate(...a),
  meetingsCreate: (...a: unknown[]) => mockMeetingsCreate(...a),
}));
jest.mock("@/integrations/_shared/hubspot/api/associations", () => ({
  attachAssociations: (...a: unknown[]) => mockAttachAssociations(...a),
}));

import { createNote } from "@/integrations/hubspot/actions/createNote";
import { createTask } from "@/integrations/hubspot/actions/createTask";
import { createCall } from "@/integrations/hubspot/actions/createCall";
import { createMeeting } from "@/integrations/hubspot/actions/createMeeting";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockNotesCreate.mockReset();
  mockTasksCreate.mockReset();
  mockCallsCreate.mockReset();
  mockMeetingsCreate.mockReset();
  mockAttachAssociations.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockAttachAssociations.mockResolvedValue({ attached: [], warnings: [] });
});

const trigger: TriggerEvent = {
  provider: "hubspot",
  eventType: "manual",
  eventId: "e",
  occurredAt: "x",
  accountId: "p",
  payload: {},
};

// ─── createNote ─────────────────────────────────────────────────────────────

describe("create_note", () => {
  it("rejects missing hs_note_body", async () => {
    await expect(
      createNote({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {},
        triggerEvent: trigger,
      }),
    ).rejects.toThrow();
  });

  it("defaults hs_timestamp to Date.now() when omitted", async () => {
    mockNotesCreate.mockResolvedValueOnce({ id: "n-1", properties: {} });
    const before = Date.now();
    await createNote({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { hs_note_body: "Quick note" },
      triggerEvent: trigger,
    });
    const after = Date.now();
    const ts = Number(
      mockNotesCreate.mock.calls[0]![0]!.properties.hs_timestamp,
    );
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("converts ISO 8601 hs_timestamp to epoch-ms-string", async () => {
    mockNotesCreate.mockResolvedValueOnce({ id: "n-1", properties: {} });
    await createNote({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        hs_note_body: "Note",
        hs_timestamp: "2026-05-10T12:00:00.000Z",
      },
      triggerEvent: trigger,
    });
    expect(mockNotesCreate.mock.calls[0]![0]!.properties.hs_timestamp).toBe(
      Date.parse("2026-05-10T12:00:00.000Z").toString(),
    );
  });

  it("attaches optional contact/company/deal/ticket associations", async () => {
    mockNotesCreate.mockResolvedValueOnce({ id: "n-1", properties: {} });
    mockAttachAssociations.mockResolvedValueOnce({
      attached: [{ toType: "contacts", toId: "c-1" }],
      warnings: [],
    });
    const result = await createNote({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        hs_note_body: "Note",
        associatedContactId: "c-1",
      },
      triggerEvent: trigger,
    });
    expect(mockAttachAssociations.mock.calls[0]![0]!).toMatchObject({
      fromType: "notes",
      fromId: "n-1",
      toIds: { contacts: "c-1" },
    });
    expect(result.output.associationsAttached).toHaveLength(1);
  });
});

// ─── createTask ─────────────────────────────────────────────────────────────

describe("create_task", () => {
  it("rejects missing hs_task_subject", async () => {
    await expect(
      createTask({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {},
        triggerEvent: trigger,
      }),
    ).rejects.toThrow();
  });

  it("applies Zod defaults: status=NOT_STARTED, priority=MEDIUM, type=TODO", async () => {
    mockTasksCreate.mockResolvedValueOnce({ id: "t-1", properties: {} });
    await createTask({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { hs_task_subject: "Follow up" },
      triggerEvent: trigger,
    });
    const props = mockTasksCreate.mock.calls[0]![0]!.properties;
    expect(props.hs_task_status).toBe("NOT_STARTED");
    expect(props.hs_task_priority).toBe("MEDIUM");
    expect(props.hs_task_type).toBe("TODO");
  });

  it("allows explicit overrides of defaults", async () => {
    mockTasksCreate.mockResolvedValueOnce({ id: "t-1", properties: {} });
    await createTask({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        hs_task_subject: "Urgent",
        hs_task_status: "IN_PROGRESS",
        hs_task_priority: "HIGH",
        hs_task_type: "CALL",
      },
      triggerEvent: trigger,
    });
    const props = mockTasksCreate.mock.calls[0]![0]!.properties;
    expect(props.hs_task_status).toBe("IN_PROGRESS");
    expect(props.hs_task_priority).toBe("HIGH");
    expect(props.hs_task_type).toBe("CALL");
  });

  it("rejects unknown enum values for status/priority/type", async () => {
    for (const cfg of [
      { hs_task_subject: "x", hs_task_status: "BOGUS" },
      { hs_task_subject: "x", hs_task_priority: "URGENT" },
      { hs_task_subject: "x", hs_task_type: "SOCIAL" },
    ]) {
      await expect(
        createTask({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: cfg,
          triggerEvent: trigger,
        }),
      ).rejects.toThrow();
    }
  });
});

// ─── createCall ─────────────────────────────────────────────────────────────

describe("create_call", () => {
  it("accepts an empty config (no required fields per V1)", async () => {
    mockCallsCreate.mockResolvedValueOnce({ id: "ca-1", properties: {} });
    await createCall({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger,
    });
    expect(mockCallsCreate).toHaveBeenCalled();
  });

  it("defaults hs_call_status to COMPLETED", async () => {
    mockCallsCreate.mockResolvedValueOnce({ id: "ca-1", properties: {} });
    await createCall({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger,
    });
    expect(mockCallsCreate.mock.calls[0]![0]!.properties.hs_call_status).toBe(
      "COMPLETED",
    );
  });

  it("rejects unknown hs_call_direction values", async () => {
    await expect(
      createCall({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { hs_call_direction: "SIDEWAYS" },
        triggerEvent: trigger,
      }),
    ).rejects.toThrow();
  });
});

// ─── createMeeting ──────────────────────────────────────────────────────────

describe("create_meeting", () => {
  it("rejects missing hs_meeting_title", async () => {
    await expect(
      createMeeting({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {},
        triggerEvent: trigger,
      }),
    ).rejects.toThrow();
  });

  it("defaults hs_meeting_outcome to SCHEDULED", async () => {
    mockMeetingsCreate.mockResolvedValueOnce({ id: "m-1", properties: {} });
    await createMeeting({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { hs_meeting_title: "Kickoff" },
      triggerEvent: trigger,
    });
    expect(
      mockMeetingsCreate.mock.calls[0]![0]!.properties.hs_meeting_outcome,
    ).toBe("SCHEDULED");
  });

  it("converts start/end times to epoch-ms-string when supplied as ISO 8601", async () => {
    mockMeetingsCreate.mockResolvedValueOnce({ id: "m-1", properties: {} });
    await createMeeting({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        hs_meeting_title: "Kickoff",
        hs_meeting_start_time: "2026-05-10T15:00:00Z",
        hs_meeting_end_time: "2026-05-10T16:00:00Z",
      },
      triggerEvent: trigger,
    });
    const props = mockMeetingsCreate.mock.calls[0]![0]!.properties;
    expect(props.hs_meeting_start_time).toBe(
      Date.parse("2026-05-10T15:00:00Z").toString(),
    );
    expect(props.hs_meeting_end_time).toBe(
      Date.parse("2026-05-10T16:00:00Z").toString(),
    );
  });

  it("omits start/end when not supplied", async () => {
    mockMeetingsCreate.mockResolvedValueOnce({ id: "m-1", properties: {} });
    await createMeeting({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { hs_meeting_title: "Kickoff" },
      triggerEvent: trigger,
    });
    const props = mockMeetingsCreate.mock.calls[0]![0]!.properties;
    expect(props.hs_meeting_start_time).toBeUndefined();
    expect(props.hs_meeting_end_time).toBeUndefined();
  });
});
