/**
 * @jest-environment node
 *
 * Tests for the Mailchimp `new_audience` polling trigger — Mailchimp
 * 2.1 Commit 3.
 *
 * Verifies:
 *   - Schema accepts no required config; snapshot optional shape.
 *   - Activation captures baseline knownListIds (sorted).
 *   - Activation throws MissingDataCenterError when integration lacks dc.
 *   - First poll after activation does NOT fire on already-known lists.
 *   - Second poll fires ONE event per NEWLY-observed list id.
 *   - Stable eventId: `new_audience:{listId}`.
 *   - Bounded payload projection (no raw wire spread).
 *   - Snapshot grows monotonically.
 *   - Dedup hit prevents re-fire across ticks.
 *   - Dedup outage fails-CLOSED (no enqueue).
 *   - Missing snapshot defensive skip.
 *   - No integration → warn + skip.
 *   - MissingDataCenterError propagates from poll.
 */
import type { WorkflowNode } from "@/contracts/workflowDefinition";
import type { IntegrationRecord } from "@/repositories/integrations";
import type { TriggerResourceRecord } from "@/repositories/triggerResources";

const mockListsList = jest.fn();
const mockEnqueueRun = jest.fn();
const mockUpdateConfig = jest.fn();
const mockGetActiveForExecution = jest.fn();
const mockMarkSeen = jest.fn();

jest.mock("@/integrations/_shared/mailchimp/api/lists", () => ({
  listsList: (...a: unknown[]) => mockListsList(...a),
  listCreate: jest.fn(),
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

import { activate } from "@/integrations/mailchimp/triggers/newAudience/activate";
import { mailchimpNewAudiencePollingHandler } from "@/integrations/mailchimp/triggers/newAudience/poll";
import { NewAudienceConfigSchema } from "@/integrations/mailchimp/triggers/newAudience/schema";
import { MissingDataCenterError } from "@/integrations/_shared/mailchimp/errors";

beforeEach(() => {
  mockListsList.mockReset();
  mockEnqueueRun.mockReset();
  mockUpdateConfig.mockReset();
  mockGetActiveForExecution.mockReset();
  mockMarkSeen.mockReset();
  mockMarkSeen.mockResolvedValue({ fresh: true });
});

function makeNode(config: Record<string, unknown> = {}): WorkflowNode {
  return {
    id: "n1",
    kind: "trigger",
    type: "new_audience",
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
    eventType: "new_audience",
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

describe("new_audience — schema", () => {
  it("accepts empty config (no required fields)", () => {
    expect(() => NewAudienceConfigSchema.parse({})).not.toThrow();
  });

  it("accepts snapshot shape with sorted id array", () => {
    expect(() =>
      NewAudienceConfigSchema.parse({
        pollingEnabled: true,
        snapshot: {
          knownListIds: ["a", "b", "c"],
          capturedAt: "2026-01-01T00:00:00Z",
        },
      }),
    ).not.toThrow();
  });

  it("rejects empty knownListIds entries", () => {
    expect(() =>
      NewAudienceConfigSchema.parse({
        snapshot: {
          knownListIds: ["a", "", "c"],
          capturedAt: "2026-01-01T00:00:00Z",
        },
      }),
    ).toThrow();
  });
});

// ─── Activate ───────────────────────────────────────────────────────────────

describe("new_audience — activate", () => {
  it("captures the baseline knownListIds (sorted)", async () => {
    mockListsList.mockResolvedValueOnce({
      lists: [
        { id: "list-zebra", name: "Zebra" },
        { id: "list-alpha", name: "Alpha" },
        { id: "list-mango", name: "Mango" },
      ],
      totalItems: 3,
    });
    const result = await activate({
      node: makeNode(),
      integration: makeIntegration(),
      workflowId: "w1",
    });
    expect(result.pollingEnabled).toBe(true);
    expect((result.snapshot as { knownListIds: string[] }).knownListIds).toEqual([
      "list-alpha",
      "list-mango",
      "list-zebra",
    ]);
  });

  it("throws MissingDataCenterError when integration lacks dc", async () => {
    await expect(
      activate({
        node: makeNode(),
        integration: makeIntegration({}),
        workflowId: "w1",
      }),
    ).rejects.toBeInstanceOf(MissingDataCenterError);
  });

  it("handles empty initial list set (empty baseline)", async () => {
    mockListsList.mockResolvedValueOnce({ lists: [], totalItems: 0 });
    const result = await activate({
      node: makeNode(),
      integration: makeIntegration(),
      workflowId: "w1",
    });
    expect((result.snapshot as { knownListIds: string[] }).knownListIds).toEqual(
      [],
    );
  });

  it("forwards count: 100 to wrapper", async () => {
    mockListsList.mockResolvedValueOnce({ lists: [], totalItems: 0 });
    await activate({
      node: makeNode(),
      integration: makeIntegration(),
      workflowId: "w1",
    });
    expect(mockListsList).toHaveBeenCalledWith(
      expect.objectContaining({ dc: "us21", count: 100 }),
    );
  });
});

// ─── Poll: unchanged → no fire ──────────────────────────────────────────────

describe("new_audience poll — baseline-first rule", () => {
  it("does NOT fire when current lists match snapshot", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeIntegration());
    mockListsList.mockResolvedValueOnce({
      lists: [{ id: "a" }, { id: "b" }],
      totalItems: 2,
    });
    const trigger = makeTrigger({
      pollingEnabled: true,
      snapshot: {
        knownListIds: ["a", "b"],
        capturedAt: "2026-01-01T00:00:00Z",
      },
    });
    await mailchimpNewAudiencePollingHandler.poll({
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
    const trigger = makeTrigger({ pollingEnabled: true });
    await mailchimpNewAudiencePollingHandler.poll({
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
      pollingEnabled: true,
      snapshot: {
        knownListIds: ["a"],
        capturedAt: "2026-01-01T00:00:00Z",
      },
    });
    await mailchimpNewAudiencePollingHandler.poll({
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
      pollingEnabled: true,
      snapshot: {
        knownListIds: ["a"],
        capturedAt: "2026-01-01T00:00:00Z",
      },
    });
    await expect(
      mailchimpNewAudiencePollingHandler.poll({
        trigger,
        accountId: "acct-test",
        userRole: "default",
        now: Date.now(),
      }),
    ).rejects.toBeInstanceOf(MissingDataCenterError);
  });
});

// ─── Poll: changed → fire ───────────────────────────────────────────────────

describe("new_audience poll — emit on diff", () => {
  it("emits ONE event per newly-observed list id with bounded payload", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeIntegration());
    mockListsList.mockResolvedValueOnce({
      lists: [
        { id: "a", name: "Old List" },
        {
          id: "b",
          name: "Brand New",
          date_created: "2026-01-02T12:00:00+00:00",
          contact: { company: "Acme", city: "SF" },
          stats: { member_count: 42 },
          // Wire-only extras that MUST NOT leak through.
          permission_reminder: "secret signup text",
          web_id: 99,
        },
      ],
      totalItems: 2,
    });
    const trigger = makeTrigger({
      pollingEnabled: true,
      snapshot: {
        knownListIds: ["a"],
        capturedAt: "2026-01-01T00:00:00Z",
      },
    });
    await mailchimpNewAudiencePollingHandler.poll({
      trigger,
      accountId: "acct-test",
      userRole: "default",
      now: Date.now(),
    });
    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
    const call = mockEnqueueRun.mock.calls[0]![0];
    expect(call.event.provider).toBe("mailchimp");
    expect(call.event.eventType).toBe("new_audience");
    expect(call.event.eventId).toBe("new_audience:b");
    expect(call.event.payload).toEqual({
      listId: "b",
      name: "Brand New",
      company: "Acme",
      memberCount: 42,
      dateCreated: "2026-01-02T12:00:00+00:00",
    });
    expect(call.event.payload).not.toHaveProperty("permission_reminder");
    expect(call.event.payload).not.toHaveProperty("web_id");
    expect(call.event.payload).not.toHaveProperty("contact");
    expect(call.event.payload).not.toHaveProperty("stats");
  });

  it("emits multiple events when multiple new lists appear", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeIntegration());
    mockListsList.mockResolvedValueOnce({
      lists: [
        { id: "a", name: "Old" },
        { id: "b", name: "New B" },
        { id: "c", name: "New C" },
      ],
      totalItems: 3,
    });
    const trigger = makeTrigger({
      pollingEnabled: true,
      snapshot: {
        knownListIds: ["a"],
        capturedAt: "2026-01-01T00:00:00Z",
      },
    });
    await mailchimpNewAudiencePollingHandler.poll({
      trigger,
      accountId: "acct-test",
      userRole: "default",
      now: Date.now(),
    });
    expect(mockEnqueueRun).toHaveBeenCalledTimes(2);
    const ids = mockEnqueueRun.mock.calls.map((c) => c[0].event.eventId);
    expect(ids.sort()).toEqual(["new_audience:b", "new_audience:c"]);
  });

  it("defensive nulls in payload when Mailchimp omits optional fields", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeIntegration());
    mockListsList.mockResolvedValueOnce({
      lists: [{ id: "b", name: "Brand New" }],
      totalItems: 1,
    });
    const trigger = makeTrigger({
      pollingEnabled: true,
      snapshot: {
        knownListIds: [],
        capturedAt: "2026-01-01T00:00:00Z",
      },
    });
    await mailchimpNewAudiencePollingHandler.poll({
      trigger,
      accountId: "acct-test",
      userRole: "default",
      now: Date.now(),
    });
    const call = mockEnqueueRun.mock.calls[0]![0];
    expect(call.event.payload).toEqual({
      listId: "b",
      name: "Brand New",
      company: null,
      memberCount: 0,
      dateCreated: null,
    });
  });

  it("snapshot grows monotonically — UNION old + observed", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeIntegration());
    mockListsList.mockResolvedValueOnce({
      lists: [{ id: "b" }],
      totalItems: 2,
    });
    const trigger = makeTrigger({
      pollingEnabled: true,
      snapshot: {
        knownListIds: ["a"],
        capturedAt: "2026-01-01T00:00:00Z",
      },
    });
    await mailchimpNewAudiencePollingHandler.poll({
      trigger,
      accountId: "acct-test",
      userRole: "default",
      now: 1700000000000,
    });
    const updatePatch = mockUpdateConfig.mock.calls[0]![1] as {
      snapshot: { knownListIds: string[] };
    };
    expect(updatePatch.snapshot.knownListIds).toEqual(["a", "b"]);
  });

  it("dedup outage fails-CLOSED: no enqueue", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeIntegration());
    mockListsList.mockResolvedValueOnce({
      lists: [{ id: "b" }],
      totalItems: 1,
    });
    mockMarkSeen.mockRejectedValueOnce(new Error("dedup down"));
    const warnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const trigger = makeTrigger({
      pollingEnabled: true,
      snapshot: {
        knownListIds: ["a"],
        capturedAt: "2026-01-01T00:00:00Z",
      },
    });
    await mailchimpNewAudiencePollingHandler.poll({
      trigger,
      accountId: "acct-test",
      userRole: "default",
      now: Date.now(),
    });
    expect(mockEnqueueRun).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("dedup hit prevents re-fire", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeIntegration());
    mockListsList.mockResolvedValueOnce({
      lists: [{ id: "b" }],
      totalItems: 1,
    });
    mockMarkSeen.mockResolvedValueOnce({ fresh: false });
    const trigger = makeTrigger({
      pollingEnabled: true,
      snapshot: {
        knownListIds: ["a"],
        capturedAt: "2026-01-01T00:00:00Z",
      },
    });
    await mailchimpNewAudiencePollingHandler.poll({
      trigger,
      accountId: "acct-test",
      userRole: "default",
      now: Date.now(),
    });
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });
});

// ─── Handler registration ───────────────────────────────────────────────────

describe("new_audience polling handler", () => {
  it("handler.id matches mailchimp/new_audience", () => {
    expect(mailchimpNewAudiencePollingHandler.id).toBe("mailchimp/new_audience");
  });

  it("default 5-minute cadence", () => {
    expect(mailchimpNewAudiencePollingHandler.getIntervalMs("default")).toBe(
      5 * 60 * 1000,
    );
  });
});
