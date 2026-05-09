/**
 * @jest-environment node
 *
 * End-to-end check that the eventId shape produced by Airtable
 * normalize.ts is actually the value that lands in the dedup repo.
 * V2's dispatch.ts calls `dedup.markSeen(provider, eventId)`; this
 * test verifies the (provider, eventId) pair the repo receives is
 * the canonical Airtable shape, and that a second delivery of the
 * same payload returns duplicate=true.
 */
const mockMarkSeen = jest.fn();
const mockListForDispatch = jest.fn();

jest.mock("@/repositories/webhookEventDedup", () => ({
  markSeen: (...args: unknown[]) => mockMarkSeen(...args),
}));

jest.mock("@/repositories/triggerResources", () => ({
  listForDispatch: (...args: unknown[]) => mockListForDispatch(...args),
  listByConfigContains: jest.fn(),
  updateConfig: jest.fn(),
}));

jest.mock("@/repositories/workflows", () => ({
  getStateForDispatch: jest.fn(async () => "active"),
}));

jest.mock("@/services/execution/enqueue", () => ({
  enqueueRun: jest.fn(),
}));

import { dispatchTriggerEvent } from "@/services/triggers/dispatch";
import { normalizePayload } from "@/integrations/airtable/triggers/recordChanged/normalize";

beforeEach(() => {
  mockMarkSeen.mockReset();
  mockListForDispatch.mockReset();
  mockListForDispatch.mockResolvedValue([
    {
      id: "tr-1",
      workflowId: "wf-1",
      userId: "user-1",
      provider: "airtable",
      eventType: "record_changed",
      nodeId: "n-1",
      config: {},
      accountId: "usrXXX",
      registeredAt: "",
      expiresAt: null,
      lastRenewedAt: null,
      createdAt: "",
      updatedAt: "",
    },
  ]);
});

const ctx = {
  webhookId: "achWEBHOOK",
  baseId: "appBASE",
  accountId: "usrXXX",
  notificationOccurredAt: "2026-05-09T12:00:00Z",
};

describe("Airtable record_changed → dispatch + dedup", () => {
  it("first delivery enqueues (markSeen returns fresh: true)", async () => {
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    const { events } = normalizePayload(
      {
        baseTransactionNumber: 7,
        changedTablesById: {
          tblTASKS: {
            createdRecordsById: { rec1: { cellValuesByFieldId: { fld1: "x" } } },
          },
        },
      },
      ctx,
    );
    const result = await dispatchTriggerEvent(events[0]!);
    expect(result.duplicate).toBe(false);
    expect(result.enqueued).toBe(1);
    expect(mockMarkSeen).toHaveBeenCalledWith(
      "airtable",
      "achWEBHOOK:tblTASKS:rec1:created:7",
    );
  });

  it("second delivery of the same eventId is blocked as duplicate", async () => {
    mockMarkSeen.mockResolvedValueOnce({ fresh: false });
    const { events } = normalizePayload(
      {
        baseTransactionNumber: 7,
        changedTablesById: {
          tblTASKS: {
            createdRecordsById: { rec1: { cellValuesByFieldId: { fld1: "x" } } },
          },
        },
      },
      ctx,
    );
    const result = await dispatchTriggerEvent(events[0]!);
    expect(result.duplicate).toBe(true);
    expect(result.enqueued).toBe(0);
  });

  it("different transactionNumber → distinct eventIds → both dispatch", async () => {
    mockMarkSeen
      .mockResolvedValueOnce({ fresh: true })
      .mockResolvedValueOnce({ fresh: true });

    const tx1 = normalizePayload(
      {
        baseTransactionNumber: 1,
        changedTablesById: {
          tblA: { changedRecordsById: { rec1: { current: { cellValuesByFieldId: {} } } } },
        },
      },
      ctx,
    );
    const tx2 = normalizePayload(
      {
        baseTransactionNumber: 2,
        changedTablesById: {
          tblA: { changedRecordsById: { rec1: { current: { cellValuesByFieldId: {} } } } },
        },
      },
      ctx,
    );

    const r1 = await dispatchTriggerEvent(tx1.events[0]!);
    const r2 = await dispatchTriggerEvent(tx2.events[0]!);

    expect(r1.duplicate).toBe(false);
    expect(r2.duplicate).toBe(false);
    expect(mockMarkSeen.mock.calls[0]![1]).not.toBe(
      mockMarkSeen.mock.calls[1]![1],
    );
  });
});
