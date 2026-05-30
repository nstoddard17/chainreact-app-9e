/**
 * @jest-environment node
 *
 * Tests for the Mailchimp `segment_updated` polling trigger —
 * Mailchimp 2.1 Commit 3.
 *
 * Verifies:
 *   - Strict schema; listId + segmentId required; empty strings rejected.
 *   - Activation captures baseline observable state.
 *   - Activation throws MissingDataCenterError when integration lacks dc.
 *   - Unchanged segment → no fire.
 *   - Changed memberCount → fire.
 *   - Changed updatedAt → fire.
 *   - Changed name → fire.
 *   - Changed type → fire.
 *   - eventId stable: `segment_updated:{segmentId}:{updatedAt}`.
 *   - eventId fallback when updatedAt missing: hash of name|count|type.
 *   - Bounded payload (no raw wire spread).
 *   - Snapshot always updated to the latest observed state.
 *   - Dedup hit prevents re-fire for the same updatedAt.
 *   - Dedup outage fails-CLOSED (no enqueue).
 *   - Missing snapshot defensive skip.
 *   - No integration → warn + skip.
 *   - MissingDataCenterError propagates from poll.
 *   - Polling handler default 5-min cadence.
 */
import type { WorkflowNode } from "@/contracts/workflowDefinition";
import type { IntegrationRecord } from "@/repositories/integrations";
import type { TriggerResourceRecord } from "@/repositories/triggerResources";

const mockSegmentGet = jest.fn();
const mockEnqueueRun = jest.fn();
const mockUpdateConfig = jest.fn();
const mockGetActiveForExecution = jest.fn();
const mockMarkSeen = jest.fn();

jest.mock("@/integrations/_shared/mailchimp/api/segments", () => ({
  segmentGet: (...a: unknown[]) => mockSegmentGet(...a),
  segmentMembersList: jest.fn(),
  segmentCreate: jest.fn(),
}));

jest.mock("@/services/execution/enqueue", () => ({
  enqueueRun: (...a: unknown[]) => mockEnqueueRun(...a),
}));

jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...a: unknown[]) => mockUpdateConfig(...a),
}));

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...a: unknown[]) => mockGetActiveForExecution(...a),
}));

jest.mock("@/repositories/webhookEventDedup", () => ({
  markSeen: (...a: unknown[]) => mockMarkSeen(...a),
}));

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (input: { apiCall: (t: string) => Promise<unknown> }) =>
    input.apiCall("decrypted-token"),
}));

import { activate } from "@/integrations/mailchimp/triggers/segmentUpdated/activate";
import { mailchimpSegmentUpdatedPollingHandler } from "@/integrations/mailchimp/triggers/segmentUpdated/poll";
import { SegmentUpdatedConfigSchema } from "@/integrations/mailchimp/triggers/segmentUpdated/schema";
import { MissingDataCenterError } from "@/integrations/_shared/mailchimp/errors";

beforeEach(() => {
  mockSegmentGet.mockReset();
  mockEnqueueRun.mockReset();
  mockUpdateConfig.mockReset();
  mockGetActiveForExecution.mockReset();
  mockMarkSeen.mockReset();
  mockMarkSeen.mockResolvedValue({ fresh: true });
});

function makeNode(config: Record<string, unknown>): WorkflowNode {
  return {
    id: "n1",
    kind: "trigger",
    type: "segment_updated",
    provider: "mailchimp",
    config,
    position: { x: 0, y: 0 },
  };
}

function makeIntegration(
  metadata: Record<string, unknown> = { dc: "us21" },
): IntegrationRecord {
  return {
    id: "i1",
    accountId: "acct-u1",
    connectedByUserId: "u1",
    provider: "mailchimp",
    providerAccountId: "mc_xyz",
    displayName: "Acme",
    accessTokenEncrypted: "enc",
    refreshTokenEncrypted: null,
    accessTokenExpiresAt: null,
    scopes: ["account_access"],
    accountMetadata: metadata,
    disconnectedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function makeTrigger(config: Record<string, unknown>): TriggerResourceRecord {
  return {
    id: "tr1",
    workflowId: "w1",
    workflowAccountId: "acct-w1",
    userId: "u1",
    provider: "mailchimp",
    eventType: "segment_updated",
    nodeId: "n1",
    config,
    providerAccountId: "mc_xyz",
    registeredAt: "2026-01-01T00:00:00Z",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

// ─── Schema ─────────────────────────────────────────────────────────────────

describe("segment_updated — schema", () => {
  it("accepts minimal valid config", () => {
    expect(() =>
      SegmentUpdatedConfigSchema.parse({
        listId: "list_1",
        segmentId: "42",
      }),
    ).not.toThrow();
  });

  it("rejects missing listId", () => {
    expect(() =>
      SegmentUpdatedConfigSchema.parse({ segmentId: "42" }),
    ).toThrow();
  });

  it("rejects missing segmentId", () => {
    expect(() =>
      SegmentUpdatedConfigSchema.parse({ listId: "list_1" }),
    ).toThrow();
  });

  it("rejects empty listId / empty segmentId", () => {
    expect(() =>
      SegmentUpdatedConfigSchema.parse({ listId: "", segmentId: "42" }),
    ).toThrow();
    expect(() =>
      SegmentUpdatedConfigSchema.parse({ listId: "list_1", segmentId: "" }),
    ).toThrow();
  });

  it("accepts snapshot shape with nullable observable fields", () => {
    expect(() =>
      SegmentUpdatedConfigSchema.parse({
        listId: "list_1",
        segmentId: "42",
        pollingEnabled: true,
        snapshot: {
          name: "VIPs",
          memberCount: 12,
          updatedAt: "2026-01-01T00:00:00Z",
          type: "static",
          capturedAt: "2026-01-01T00:00:00Z",
        },
      }),
    ).not.toThrow();
  });

  it("accepts snapshot with all null observable fields (defensive)", () => {
    expect(() =>
      SegmentUpdatedConfigSchema.parse({
        listId: "list_1",
        segmentId: "42",
        snapshot: {
          name: null,
          memberCount: null,
          updatedAt: null,
          type: null,
          capturedAt: "2026-01-01T00:00:00Z",
        },
      }),
    ).not.toThrow();
  });
});

// ─── Activate ───────────────────────────────────────────────────────────────

describe("segment_updated — activate", () => {
  it("captures baseline observable state", async () => {
    mockSegmentGet.mockResolvedValueOnce({
      id: 42,
      name: "VIPs",
      member_count: 12,
      updated_at: "2026-01-01T00:00:00+00:00",
      type: "static",
    });
    const result = await activate({
      node: makeNode({ listId: "list_1", segmentId: "42" }),
      integration: makeIntegration(),
      workflowId: "w1",
    });
    expect(result.pollingEnabled).toBe(true);
    expect(result.snapshot).toMatchObject({
      name: "VIPs",
      memberCount: 12,
      updatedAt: "2026-01-01T00:00:00+00:00",
      type: "static",
    });
  });

  it("throws MissingDataCenterError when integration lacks dc", async () => {
    await expect(
      activate({
        node: makeNode({ listId: "list_1", segmentId: "42" }),
        integration: makeIntegration({}),
        workflowId: "w1",
      }),
    ).rejects.toBeInstanceOf(MissingDataCenterError);
  });

  it("forwards listId + segmentId to segmentGet", async () => {
    mockSegmentGet.mockResolvedValueOnce({ id: 42, name: "x" });
    await activate({
      node: makeNode({ listId: "list_1", segmentId: "42" }),
      integration: makeIntegration(),
      workflowId: "w1",
    });
    expect(mockSegmentGet).toHaveBeenCalledWith(
      expect.objectContaining({
        dc: "us21",
        audienceId: "list_1",
        segmentId: "42",
      }),
    );
  });

  it("defensive nulls when Mailchimp omits observable fields", async () => {
    mockSegmentGet.mockResolvedValueOnce({ id: 42, name: "x" });
    const result = await activate({
      node: makeNode({ listId: "list_1", segmentId: "42" }),
      integration: makeIntegration(),
      workflowId: "w1",
    });
    const snap = result.snapshot as Record<string, unknown>;
    expect(snap.memberCount).toBeNull();
    expect(snap.updatedAt).toBeNull();
    expect(snap.type).toBeNull();
  });
});

// ─── Poll: unchanged → no fire ──────────────────────────────────────────────

describe("segment_updated poll — unchanged → no fire", () => {
  it("does NOT fire when observed state matches snapshot exactly", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeIntegration());
    mockSegmentGet.mockResolvedValueOnce({
      id: 42,
      name: "VIPs",
      member_count: 12,
      updated_at: "2026-01-01T00:00:00+00:00",
      type: "static",
    });
    const trigger = makeTrigger({
      listId: "list_1",
      segmentId: "42",
      pollingEnabled: true,
      snapshot: {
        name: "VIPs",
        memberCount: 12,
        updatedAt: "2026-01-01T00:00:00+00:00",
        type: "static",
        capturedAt: "2026-01-01T00:00:00Z",
      },
    });
    await mailchimpSegmentUpdatedPollingHandler.poll({
      trigger,
      accountId: "acct-test",
      userRole: "default",
      now: Date.now(),
    });
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("missing snapshot → defensive skip + warn", async () => {
    const warnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const trigger = makeTrigger({
      listId: "list_1",
      segmentId: "42",
      pollingEnabled: true,
    });
    await mailchimpSegmentUpdatedPollingHandler.poll({
      trigger,
      accountId: "acct-test",
      userRole: "default",
      now: Date.now(),
    });
    expect(mockEnqueueRun).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("no integration → warn + skip", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    const warnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const trigger = makeTrigger({
      listId: "list_1",
      segmentId: "42",
      pollingEnabled: true,
      snapshot: {
        name: "x",
        memberCount: 1,
        updatedAt: null,
        type: null,
        capturedAt: "2026-01-01T00:00:00Z",
      },
    });
    await mailchimpSegmentUpdatedPollingHandler.poll({
      trigger,
      accountId: "acct-test",
      userRole: "default",
      now: Date.now(),
    });
    expect(mockEnqueueRun).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("integration without dc → throws MissingDataCenterError", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeIntegration({}));
    const trigger = makeTrigger({
      listId: "list_1",
      segmentId: "42",
      pollingEnabled: true,
      snapshot: {
        name: "x",
        memberCount: 1,
        updatedAt: null,
        type: null,
        capturedAt: "2026-01-01T00:00:00Z",
      },
    });
    await expect(
      mailchimpSegmentUpdatedPollingHandler.poll({
        trigger,
        accountId: "acct-test",
        userRole: "default",
        now: Date.now(),
      }),
    ).rejects.toBeInstanceOf(MissingDataCenterError);
  });
});

// ─── Poll: changed → fire ───────────────────────────────────────────────────

describe("segment_updated poll — emit on observable change", () => {
  function setupBaseline(seg: Record<string, unknown>) {
    mockGetActiveForExecution.mockResolvedValueOnce(makeIntegration());
    mockSegmentGet.mockResolvedValueOnce(seg);
  }

  it("fires when memberCount changes", async () => {
    setupBaseline({
      id: 42,
      name: "VIPs",
      member_count: 13,
      updated_at: "2026-01-02T00:00:00+00:00",
      type: "static",
    });
    await mailchimpSegmentUpdatedPollingHandler.poll({
      trigger: makeTrigger({
        listId: "list_1",
        segmentId: "42",
        pollingEnabled: true,
        snapshot: {
          name: "VIPs",
          memberCount: 12,
          updatedAt: "2026-01-01T00:00:00+00:00",
          type: "static",
          capturedAt: "2026-01-01T00:00:00Z",
        },
      }),
      accountId: "acct-test",
      userRole: "default",
      now: Date.now(),
    });
    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
  });

  it("fires when name changes", async () => {
    setupBaseline({
      id: 42,
      name: "Renamed",
      member_count: 12,
      updated_at: "2026-01-02T00:00:00+00:00",
      type: "static",
    });
    await mailchimpSegmentUpdatedPollingHandler.poll({
      trigger: makeTrigger({
        listId: "list_1",
        segmentId: "42",
        pollingEnabled: true,
        snapshot: {
          name: "VIPs",
          memberCount: 12,
          updatedAt: "2026-01-01T00:00:00+00:00",
          type: "static",
          capturedAt: "2026-01-01T00:00:00Z",
        },
      }),
      accountId: "acct-test",
      userRole: "default",
      now: Date.now(),
    });
    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
  });

  it("fires when type changes", async () => {
    setupBaseline({
      id: 42,
      name: "VIPs",
      member_count: 12,
      updated_at: "2026-01-02T00:00:00+00:00",
      type: "saved",
    });
    await mailchimpSegmentUpdatedPollingHandler.poll({
      trigger: makeTrigger({
        listId: "list_1",
        segmentId: "42",
        pollingEnabled: true,
        snapshot: {
          name: "VIPs",
          memberCount: 12,
          updatedAt: "2026-01-01T00:00:00+00:00",
          type: "static",
          capturedAt: "2026-01-01T00:00:00Z",
        },
      }),
      accountId: "acct-test",
      userRole: "default",
      now: Date.now(),
    });
    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
  });

  it("fires when updated_at changes (most common)", async () => {
    setupBaseline({
      id: 42,
      name: "VIPs",
      member_count: 12,
      updated_at: "2026-01-02T00:00:00+00:00",
      type: "static",
    });
    await mailchimpSegmentUpdatedPollingHandler.poll({
      trigger: makeTrigger({
        listId: "list_1",
        segmentId: "42",
        pollingEnabled: true,
        snapshot: {
          name: "VIPs",
          memberCount: 12,
          updatedAt: "2026-01-01T00:00:00+00:00",
          type: "static",
          capturedAt: "2026-01-01T00:00:00Z",
        },
      }),
      accountId: "acct-test",
      userRole: "default",
      now: Date.now(),
    });
    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
    const call = mockEnqueueRun.mock.calls[0]![0];
    expect(call.event.eventId).toBe(
      "segment_updated:42:2026-01-02T00:00:00+00:00",
    );
  });

  it("eventId fallback when updatedAt absent (hash of name|count|type)", async () => {
    setupBaseline({
      id: 42,
      name: "VIPs",
      member_count: 13,
      // updated_at omitted.
      type: "static",
    });
    await mailchimpSegmentUpdatedPollingHandler.poll({
      trigger: makeTrigger({
        listId: "list_1",
        segmentId: "42",
        pollingEnabled: true,
        snapshot: {
          name: "VIPs",
          memberCount: 12,
          updatedAt: null,
          type: "static",
          capturedAt: "2026-01-01T00:00:00Z",
        },
      }),
      accountId: "acct-test",
      userRole: "default",
      now: Date.now(),
    });
    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
    const call = mockEnqueueRun.mock.calls[0]![0];
    expect(call.event.eventId).toBe("segment_updated:42:mc:VIPs:13:static");
  });

  it("emits bounded payload (no raw wire spread)", async () => {
    setupBaseline({
      id: 42,
      name: "VIPs",
      member_count: 13,
      updated_at: "2026-01-02T00:00:00+00:00",
      type: "static",
      // Wire-only extras that MUST NOT leak through.
      list_id: "ignored-by-wrapper",
      created_at: "2026-01-01",
      options: { match: "any" },
    });
    await mailchimpSegmentUpdatedPollingHandler.poll({
      trigger: makeTrigger({
        listId: "list_1",
        segmentId: "42",
        pollingEnabled: true,
        snapshot: {
          name: "VIPs",
          memberCount: 12,
          updatedAt: "2026-01-01T00:00:00+00:00",
          type: "static",
          capturedAt: "2026-01-01T00:00:00Z",
        },
      }),
      accountId: "acct-test",
      userRole: "default",
      now: Date.now(),
    });
    const call = mockEnqueueRun.mock.calls[0]![0];
    expect(call.event.payload).toEqual({
      listId: "list_1",
      segmentId: "42",
      name: "VIPs",
      memberCount: 13,
      type: "static",
      updatedAt: "2026-01-02T00:00:00+00:00",
    });
    expect(call.event.payload).not.toHaveProperty("created_at");
    expect(call.event.payload).not.toHaveProperty("options");
    expect(call.event.payload).not.toHaveProperty("list_id");
  });

  it("dedup hit prevents re-fire across ticks for same updatedAt", async () => {
    mockMarkSeen.mockResolvedValueOnce({ fresh: false });
    setupBaseline({
      id: 42,
      name: "VIPs",
      member_count: 13,
      updated_at: "2026-01-02T00:00:00+00:00",
      type: "static",
    });
    await mailchimpSegmentUpdatedPollingHandler.poll({
      trigger: makeTrigger({
        listId: "list_1",
        segmentId: "42",
        pollingEnabled: true,
        snapshot: {
          name: "VIPs",
          memberCount: 12,
          updatedAt: "2026-01-01T00:00:00+00:00",
          type: "static",
          capturedAt: "2026-01-01T00:00:00Z",
        },
      }),
      accountId: "acct-test",
      userRole: "default",
      now: Date.now(),
    });
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("dedup outage fails-CLOSED (no enqueue this tick)", async () => {
    mockMarkSeen.mockRejectedValueOnce(new Error("dedup down"));
    setupBaseline({
      id: 42,
      name: "VIPs",
      member_count: 13,
      updated_at: "2026-01-02T00:00:00+00:00",
      type: "static",
    });
    const warnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    await mailchimpSegmentUpdatedPollingHandler.poll({
      trigger: makeTrigger({
        listId: "list_1",
        segmentId: "42",
        pollingEnabled: true,
        snapshot: {
          name: "VIPs",
          memberCount: 12,
          updatedAt: "2026-01-01T00:00:00+00:00",
          type: "static",
          capturedAt: "2026-01-01T00:00:00Z",
        },
      }),
      accountId: "acct-test",
      userRole: "default",
      now: Date.now(),
    });
    expect(mockEnqueueRun).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("snapshot always updated to latest observed state (even on unchanged tick)", async () => {
    setupBaseline({
      id: 42,
      name: "VIPs",
      member_count: 12,
      updated_at: "2026-01-01T00:00:00+00:00",
      type: "static",
    });
    await mailchimpSegmentUpdatedPollingHandler.poll({
      trigger: makeTrigger({
        listId: "list_1",
        segmentId: "42",
        pollingEnabled: true,
        snapshot: {
          name: "VIPs",
          memberCount: 12,
          updatedAt: "2026-01-01T00:00:00+00:00",
          type: "static",
          capturedAt: "2026-01-01T00:00:00Z",
        },
      }),
      accountId: "acct-test",
      userRole: "default",
      now: 1700000000000,
    });
    const updatePatch = mockUpdateConfig.mock.calls[0]![1] as {
      snapshot: { name: string; memberCount: number };
      polling: { lastPolledAt: string };
    };
    expect(updatePatch.snapshot.name).toBe("VIPs");
    expect(updatePatch.snapshot.memberCount).toBe(12);
    expect(updatePatch.polling.lastPolledAt).toBe(
      new Date(1700000000000).toISOString(),
    );
  });
});

// ─── Handler registration ───────────────────────────────────────────────────

describe("segment_updated polling handler", () => {
  it("handler.id matches mailchimp/segment_updated", () => {
    expect(mailchimpSegmentUpdatedPollingHandler.id).toBe(
      "mailchimp/segment_updated",
    );
  });

  it("default 5-minute cadence", () => {
    expect(mailchimpSegmentUpdatedPollingHandler.getIntervalMs("default")).toBe(
      5 * 60 * 1000,
    );
  });
});
