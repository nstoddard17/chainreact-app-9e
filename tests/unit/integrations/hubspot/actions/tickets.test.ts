/**
 * @jest-environment node
 *
 * Tests for `create_ticket`, `update_ticket`, `get_tickets`.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockTicketsCreate = jest.fn();
const mockTicketsUpdate = jest.fn();
const mockTicketsSearch = jest.fn();
const mockAttachAssociations = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
}));
jest.mock("@/integrations/_shared/hubspot/api/tickets", () => ({
  ticketsCreate: (...a: unknown[]) => mockTicketsCreate(...a),
  ticketsUpdate: (...a: unknown[]) => mockTicketsUpdate(...a),
  ticketsSearch: (...a: unknown[]) => mockTicketsSearch(...a),
  ticketsGet: jest.fn(),
}));
jest.mock("@/integrations/_shared/hubspot/api/associations", () => ({
  attachAssociations: (...a: unknown[]) => mockAttachAssociations(...a),
}));

import { createTicket } from "@/integrations/hubspot/actions/createTicket";
import { updateTicket } from "@/integrations/hubspot/actions/updateTicket";
import { getTickets } from "@/integrations/hubspot/actions/getTickets";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockTicketsCreate.mockReset();
  mockTicketsUpdate.mockReset();
  mockTicketsSearch.mockReset();
  mockAttachAssociations.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

const trigger: TriggerEvent = {
  provider: "hubspot",
  eventType: "manual",
  eventId: "e",
  occurredAt: "x",
  providerAccountId: "9876543",
  payload: {},
};

// ─── createTicket ───────────────────────────────────────────────────────────

describe("create_ticket", () => {
  it("rejects missing subject / hs_pipeline / hs_pipeline_stage", async () => {
    for (const cfg of [
      { subject: "X", hs_pipeline: "support" }, // missing stage
      { subject: "X", hs_pipeline_stage: "1" }, // missing pipeline
      { hs_pipeline: "support", hs_pipeline_stage: "1" }, // missing subject
    ]) {
      await expect(
        createTicket({
          workflowId: "wf",
          userId: "u",
          accountId: "acct-u",
          runId: "r",
          nodeId: "n",
          config: cfg,
          triggerEvent: trigger,
        }),
      ).rejects.toThrow();
    }
  });

  it("POSTs ticketsCreate with required + supplied optional fields", async () => {
    mockTicketsCreate.mockResolvedValueOnce({
      id: "t-1",
      properties: {
        subject: "Need help",
        hs_pipeline: "support",
        hs_pipeline_stage: "1",
      },
      createdAt: "x",
      updatedAt: "x",
    });
    mockAttachAssociations.mockResolvedValueOnce({
      attached: [],
      warnings: [],
    });

    await createTicket({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        subject: "Need help",
        hs_pipeline: "support",
        hs_pipeline_stage: "1",
        content: "Body text",
        hs_ticket_priority: "HIGH",
      },
      triggerEvent: trigger,
    });

    expect(mockTicketsCreate.mock.calls[0]![0]!.properties).toEqual({
      subject: "Need help",
      hs_pipeline: "support",
      hs_pipeline_stage: "1",
      content: "Body text",
      hs_ticket_priority: "HIGH",
    });
  });

  it("attaches contact/company/deal associations after create", async () => {
    mockTicketsCreate.mockResolvedValueOnce({
      id: "t-1",
      properties: {},
    });
    mockAttachAssociations.mockResolvedValueOnce({
      attached: [
        { toType: "contacts", toId: "c-1" },
        { toType: "deals", toId: "d-1" },
      ],
      warnings: [],
    });

    const result = await createTicket({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        subject: "Need help",
        hs_pipeline: "support",
        hs_pipeline_stage: "1",
        associatedContactId: "c-1",
        associatedDealId: "d-1",
      },
      triggerEvent: trigger,
    });

    expect(mockAttachAssociations).toHaveBeenCalledTimes(1);
    expect(mockAttachAssociations.mock.calls[0]![0]!).toMatchObject({
      fromType: "tickets",
      fromId: "t-1",
      toIds: { contacts: "c-1", deals: "d-1", companies: undefined },
    });
    expect(result.output.associationsAttached).toEqual([
      { toType: "contacts", toId: "c-1" },
      { toType: "deals", toId: "d-1" },
    ]);
  });

  it("returns canonical output", async () => {
    mockTicketsCreate.mockResolvedValueOnce({
      id: "t-1",
      properties: {
        subject: "Help",
        hs_pipeline: "support",
        hs_pipeline_stage: "1",
      },
      createdAt: "x",
      updatedAt: "y",
    });
    mockAttachAssociations.mockResolvedValueOnce({
      attached: [],
      warnings: [],
    });
    const result = await createTicket({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        subject: "Help",
        hs_pipeline: "support",
        hs_pipeline_stage: "1",
      },
      triggerEvent: trigger,
    });
    expect(result.output.ticketId).toBe("t-1");
    expect(result.output.subject).toBe("Help");
    expect(result.output.pipeline).toBe("support");
    expect(result.output.pipelineStage).toBe("1");
    expect(result.output.associationWarnings).toEqual([]);
  });
});

// ─── updateTicket ───────────────────────────────────────────────────────────

describe("update_ticket", () => {
  it("PATCHes ticketsUpdate with supplied fields", async () => {
    mockTicketsUpdate.mockResolvedValueOnce({
      id: "t-1",
      properties: { subject: "Updated" },
      updatedAt: "y",
    });
    await updateTicket({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { ticketId: "t-1", subject: "Updated" },
      triggerEvent: trigger,
    });
    expect(mockTicketsUpdate.mock.calls[0]![0]!).toMatchObject({
      ticketId: "t-1",
      properties: { subject: "Updated" },
    });
  });

  it("throws when no property fields are provided", async () => {
    await expect(
      updateTicket({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { ticketId: "t-1" },
        triggerEvent: trigger,
      }),
    ).rejects.toThrow(/at least one property/);
  });
});

// ─── getTickets ─────────────────────────────────────────────────────────────

describe("get_tickets", () => {
  it("uses default properties when omitted", async () => {
    mockTicketsSearch.mockResolvedValueOnce({ total: 0, results: [] });
    await getTickets({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger,
    });
    expect(mockTicketsSearch.mock.calls[0]![0]!.properties).toEqual([
      "subject",
      "content",
      "hs_pipeline",
      "hs_pipeline_stage",
      "hs_ticket_priority",
    ]);
  });

  it("returns paging shape", async () => {
    mockTicketsSearch.mockResolvedValueOnce({
      total: 3,
      results: [{ id: "t1", properties: {} }],
      paging: { next: { after: "cur" } },
    });
    const r = await getTickets({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger,
    });
    expect(r.output.tickets).toHaveLength(1);
    expect(r.output.total).toBe(3);
    expect(r.output.nextCursor).toBe("cur");
    expect(r.output.hasMore).toBe(true);
  });
});
