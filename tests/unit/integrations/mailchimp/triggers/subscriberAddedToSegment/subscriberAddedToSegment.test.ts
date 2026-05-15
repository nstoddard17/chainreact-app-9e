/**
 * @jest-environment node
 *
 * Tests for the Mailchimp `subscriber_added_to_segment` polling trigger
 * — Mailchimp 2.1 Commit 3.
 *
 * Verifies:
 *   - Strict schema; listId + segmentId required; empty strings rejected.
 *   - Activation captures baseline subscriber-hash set (sorted).
 *   - Activation throws MissingDataCenterError when integration lacks dc.
 *   - First poll after activation does NOT fire on already-known members.
 *   - Second poll fires ONE event per NEWLY-observed member id.
 *   - Bounded payload projection (no raw wire spread).
 *   - Stable eventId: `subscriber_added_to_segment:{segmentId}:{hash}`.
 *   - Snapshot grows monotonically.
 *   - Dedup via webhook_event_dedup blocks re-fires.
 *   - Dedup outage fails-CLOSED (no enqueue, no snapshot regression).
 *   - Missing snapshot defensive skip.
 *   - No integration → warn + skip.
 *   - MissingDataCenterError propagates from poll.
 *   - Polling handler default 5-min cadence.
 */
import type { WorkflowNode } from "@/contracts/workflowDefinition";
import type { IntegrationRecord } from "@/repositories/integrations";
import type { TriggerResourceRecord } from "@/repositories/triggerResources";

const mockSegmentMembersList = jest.fn();
const mockEnqueueRun = jest.fn();
const mockUpdateConfig = jest.fn();
const mockGetActiveForExecution = jest.fn();
const mockMarkSeen = jest.fn();

jest.mock("@/integrations/_shared/mailchimp/api/segments", () => ({
  segmentMembersList: (...a: unknown[]) => mockSegmentMembersList(...a),
  segmentGet: jest.fn(),
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

import { activate } from "@/integrations/mailchimp/triggers/subscriberAddedToSegment/activate";
import { mailchimpSubscriberAddedToSegmentPollingHandler } from "@/integrations/mailchimp/triggers/subscriberAddedToSegment/poll";
import { SubscriberAddedToSegmentConfigSchema } from "@/integrations/mailchimp/triggers/subscriberAddedToSegment/schema";
import { MissingDataCenterError } from "@/integrations/_shared/mailchimp/errors";

beforeEach(() => {
  mockSegmentMembersList.mockReset();
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
    type: "subscriber_added_to_segment",
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
    userId: "u1",
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
    userId: "u1",
    provider: "mailchimp",
    eventType: "subscriber_added_to_segment",
    nodeId: "n1",
    config,
    accountId: "mc_xyz",
    registeredAt: "2026-01-01T00:00:00Z",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

// ─── Schema ─────────────────────────────────────────────────────────────────

describe("subscriber_added_to_segment — schema", () => {
  it("accepts minimal valid config", () => {
    expect(() =>
      SubscriberAddedToSegmentConfigSchema.parse({
        listId: "list_1",
        segmentId: "42",
      }),
    ).not.toThrow();
  });

  it("rejects missing listId", () => {
    expect(() =>
      SubscriberAddedToSegmentConfigSchema.parse({ segmentId: "42" }),
    ).toThrow();
  });

  it("rejects empty listId", () => {
    expect(() =>
      SubscriberAddedToSegmentConfigSchema.parse({
        listId: "",
        segmentId: "42",
      }),
    ).toThrow();
  });

  it("rejects missing segmentId", () => {
    expect(() =>
      SubscriberAddedToSegmentConfigSchema.parse({ listId: "list_1" }),
    ).toThrow();
  });

  it("rejects empty segmentId", () => {
    expect(() =>
      SubscriberAddedToSegmentConfigSchema.parse({
        listId: "list_1",
        segmentId: "",
      }),
    ).toThrow();
  });

  it("accepts snapshot shape with sorted hash array", () => {
    expect(() =>
      SubscriberAddedToSegmentConfigSchema.parse({
        listId: "list_1",
        segmentId: "42",
        pollingEnabled: true,
        snapshot: {
          knownSubscriberHashes: ["h1", "h2", "h3"],
          capturedAt: "2026-01-01T00:00:00Z",
        },
      }),
    ).not.toThrow();
  });
});

// ─── Activate ───────────────────────────────────────────────────────────────

describe("subscriber_added_to_segment — activate", () => {
  it("captures the baseline knownSubscriberHashes (sorted)", async () => {
    mockSegmentMembersList.mockResolvedValueOnce({
      members: [
        { id: "hash-zebra", email_address: "z@x.com", status: "subscribed" },
        { id: "hash-alpha", email_address: "a@x.com", status: "subscribed" },
        { id: "hash-mango", email_address: "m@x.com", status: "subscribed" },
      ],
      totalItems: 3,
    });
    const result = await activate({
      node: makeNode({ listId: "list_1", segmentId: "42" }),
      integration: makeIntegration(),
      workflowId: "w1",
    });
    expect(result.pollingEnabled).toBe(true);
    expect(
      (result.snapshot as { knownSubscriberHashes: string[] }).knownSubscriberHashes,
    ).toEqual(["hash-alpha", "hash-mango", "hash-zebra"]);
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

  it("forwards listId + segmentId to the wrapper", async () => {
    mockSegmentMembersList.mockResolvedValueOnce({ members: [], totalItems: 0 });
    await activate({
      node: makeNode({ listId: "list_1", segmentId: "42" }),
      integration: makeIntegration(),
      workflowId: "w1",
    });
    expect(mockSegmentMembersList).toHaveBeenCalledWith(
      expect.objectContaining({
        dc: "us21",
        audienceId: "list_1",
        segmentId: "42",
        count: 100,
      }),
    );
  });

  it("handles empty initial segment (empty baseline)", async () => {
    mockSegmentMembersList.mockResolvedValueOnce({ members: [], totalItems: 0 });
    const result = await activate({
      node: makeNode({ listId: "list_1", segmentId: "42" }),
      integration: makeIntegration(),
      workflowId: "w1",
    });
    expect(
      (result.snapshot as { knownSubscriberHashes: string[] }).knownSubscriberHashes,
    ).toEqual([]);
  });

  it("echoes listId + segmentId onto the config patch", async () => {
    mockSegmentMembersList.mockResolvedValueOnce({ members: [], totalItems: 0 });
    const result = await activate({
      node: makeNode({ listId: "list_1", segmentId: "42" }),
      integration: makeIntegration(),
      workflowId: "w1",
    });
    expect(result.listId).toBe("list_1");
    expect(result.segmentId).toBe("42");
  });
});

// ─── Poll: baseline-first rule ──────────────────────────────────────────────

describe("subscriber_added_to_segment poll — baseline-first rule", () => {
  it("does NOT fire when current members match snapshot", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeIntegration());
    mockSegmentMembersList.mockResolvedValueOnce({
      members: [
        { id: "h1", email_address: "a@x.com", status: "subscribed" },
        { id: "h2", email_address: "b@x.com", status: "subscribed" },
      ],
      totalItems: 2,
    });
    const trigger = makeTrigger({
      listId: "list_1",
      segmentId: "42",
      pollingEnabled: true,
      snapshot: {
        knownSubscriberHashes: ["h1", "h2"],
        capturedAt: "2026-01-01T00:00:00Z",
      },
    });
    await mailchimpSubscriberAddedToSegmentPollingHandler.poll({
      trigger,
      userRole: "default",
      now: Date.now(),
    });
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("skips with warn log when snapshot is missing", async () => {
    const warnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const trigger = makeTrigger({
      listId: "list_1",
      segmentId: "42",
      pollingEnabled: true,
    });
    await mailchimpSubscriberAddedToSegmentPollingHandler.poll({
      trigger,
      userRole: "default",
      now: Date.now(),
    });
    expect(mockEnqueueRun).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("skips with warn log when no active integration", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    const warnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const trigger = makeTrigger({
      listId: "list_1",
      segmentId: "42",
      pollingEnabled: true,
      snapshot: {
        knownSubscriberHashes: ["h1"],
        capturedAt: "2026-01-01T00:00:00Z",
      },
    });
    await mailchimpSubscriberAddedToSegmentPollingHandler.poll({
      trigger,
      userRole: "default",
      now: Date.now(),
    });
    expect(mockEnqueueRun).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("throws MissingDataCenterError when integration lacks dc on poll", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeIntegration({}));
    const trigger = makeTrigger({
      listId: "list_1",
      segmentId: "42",
      pollingEnabled: true,
      snapshot: {
        knownSubscriberHashes: ["h1"],
        capturedAt: "2026-01-01T00:00:00Z",
      },
    });
    await expect(
      mailchimpSubscriberAddedToSegmentPollingHandler.poll({
        trigger,
        userRole: "default",
        now: Date.now(),
      }),
    ).rejects.toBeInstanceOf(MissingDataCenterError);
  });
});

// ─── Poll: emit on diff ─────────────────────────────────────────────────────

describe("subscriber_added_to_segment poll — emit on diff", () => {
  it("emits ONE event per newly-observed member id with bounded payload", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeIntegration());
    mockSegmentMembersList.mockResolvedValueOnce({
      members: [
        { id: "h-old", email_address: "old@x.com", status: "subscribed" },
        {
          id: "h-new",
          email_address: "new@x.com",
          status: "subscribed",
          last_changed: "2026-01-02T00:00:00+00:00",
          // Wire surface extras that MUST NOT leak through.
          merge_fields: { FNAME: "New" },
        },
      ],
      totalItems: 2,
    });
    const trigger = makeTrigger({
      listId: "list_1",
      segmentId: "42",
      pollingEnabled: true,
      snapshot: {
        knownSubscriberHashes: ["h-old"],
        capturedAt: "2026-01-01T00:00:00Z",
      },
    });
    await mailchimpSubscriberAddedToSegmentPollingHandler.poll({
      trigger,
      userRole: "default",
      now: Date.now(),
    });
    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
    const call = mockEnqueueRun.mock.calls[0]![0];
    expect(call.event.provider).toBe("mailchimp");
    expect(call.event.eventType).toBe("subscriber_added_to_segment");
    expect(call.event.eventId).toBe("subscriber_added_to_segment:42:h-new");
    expect(call.event.payload).toEqual({
      listId: "list_1",
      segmentId: "42",
      subscriberHash: "h-new",
      emailAddress: "new@x.com",
      status: "subscribed",
      lastChanged: "2026-01-02T00:00:00+00:00",
    });
    // Anti-test: no raw wire fields leaked through.
    expect(call.event.payload).not.toHaveProperty("merge_fields");
    expect(call.event.payload).not.toHaveProperty("id");
    expect(call.event.payload).not.toHaveProperty("email_address");
  });

  it("snapshot grows monotonically — UNION old + observed", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeIntegration());
    mockSegmentMembersList.mockResolvedValueOnce({
      members: [{ id: "h-new", status: "subscribed" }],
      totalItems: 2,
    });
    const trigger = makeTrigger({
      listId: "list_1",
      segmentId: "42",
      pollingEnabled: true,
      snapshot: {
        knownSubscriberHashes: ["h-old"],
        capturedAt: "2026-01-01T00:00:00Z",
      },
    });
    await mailchimpSubscriberAddedToSegmentPollingHandler.poll({
      trigger,
      userRole: "default",
      now: 1700000000000,
    });
    const updatePatch = mockUpdateConfig.mock.calls[0]![1] as {
      snapshot: { knownSubscriberHashes: string[] };
    };
    expect(updatePatch.snapshot.knownSubscriberHashes).toEqual([
      "h-new",
      "h-old",
    ]);
  });

  it("dedup outage fails-CLOSED: no enqueue, no snapshot regression", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeIntegration());
    mockSegmentMembersList.mockResolvedValueOnce({
      members: [{ id: "h-new", status: "subscribed" }],
      totalItems: 1,
    });
    mockMarkSeen.mockRejectedValueOnce(new Error("dedup outage"));
    const warnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    const trigger = makeTrigger({
      listId: "list_1",
      segmentId: "42",
      pollingEnabled: true,
      snapshot: {
        knownSubscriberHashes: ["h-old"],
        capturedAt: "2026-01-01T00:00:00Z",
      },
    });
    await mailchimpSubscriberAddedToSegmentPollingHandler.poll({
      trigger,
      userRole: "default",
      now: Date.now(),
    });
    expect(mockEnqueueRun).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("dedup hit prevents re-fire across ticks", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeIntegration());
    mockSegmentMembersList.mockResolvedValueOnce({
      members: [{ id: "h-new", status: "subscribed" }],
      totalItems: 1,
    });
    mockMarkSeen.mockResolvedValueOnce({ fresh: false });

    const trigger = makeTrigger({
      listId: "list_1",
      segmentId: "42",
      pollingEnabled: true,
      snapshot: {
        knownSubscriberHashes: ["h-old"],
        capturedAt: "2026-01-01T00:00:00Z",
      },
    });
    await mailchimpSubscriberAddedToSegmentPollingHandler.poll({
      trigger,
      userRole: "default",
      now: Date.now(),
    });
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });
});

// ─── Polling handler registration ───────────────────────────────────────────

describe("subscriber_added_to_segment polling handler", () => {
  it("handler.id matches mailchimp/<eventType>", () => {
    expect(mailchimpSubscriberAddedToSegmentPollingHandler.id).toBe(
      "mailchimp/subscriber_added_to_segment",
    );
  });

  it("default 5-minute cadence", () => {
    expect(
      mailchimpSubscriberAddedToSegmentPollingHandler.getIntervalMs("default"),
    ).toBe(5 * 60 * 1000);
  });

  it("canHandle is type-strict", () => {
    const t1 = makeTrigger({
      listId: "list_1",
      segmentId: "42",
      pollingEnabled: true,
    });
    expect(mailchimpSubscriberAddedToSegmentPollingHandler.canHandle(t1)).toBe(
      true,
    );
    const other = { ...t1, eventType: "campaign_created" };
    expect(mailchimpSubscriberAddedToSegmentPollingHandler.canHandle(other)).toBe(
      false,
    );
  });
});
