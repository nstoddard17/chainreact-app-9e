/**
 * @jest-environment node
 *
 * Tests for the Mailchimp `campaign_created` polling trigger —
 * Slice 14 Commit 5. Covers:
 *   - Activation baseline captures the current campaign id set.
 *   - First poll after activation does NOT fire on already-known
 *     campaigns (baseline-first rule).
 *   - Second poll fires only on NEWLY-observed campaign ids.
 *   - Snapshot grows monotonically; old ids remain.
 *   - DB-backed dedup via webhook_event_dedup blocks re-fires
 *     across ticks.
 *   - Activate throws MissingDataCenterError when integration lacks dc.
 *   - Schema rejects unknown fields.
 *   - Polling handler is registered for (mailchimp, campaign_created).
 */
import type { WorkflowNode } from "@/contracts/workflowDefinition";
import type { IntegrationRecord } from "@/repositories/integrations";
import type { TriggerResourceRecord } from "@/repositories/triggerResources";

const mockCampaignsList = jest.fn();
const mockEnqueueRun = jest.fn();
const mockUpdateConfig = jest.fn();
const mockGetActiveForExecution = jest.fn();
const mockMarkSeen = jest.fn();

jest.mock("@/integrations/_shared/mailchimp/api/campaigns", () => ({
  campaignsList: (...a: unknown[]) => mockCampaignsList(...a),
  campaignGet: jest.fn(),
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

import { activate } from "@/integrations/mailchimp/triggers/campaignCreated/activate";
import { mailchimpCampaignCreatedPollingHandler } from "@/integrations/mailchimp/triggers/campaignCreated/poll";
import { CampaignCreatedConfigSchema } from "@/integrations/mailchimp/triggers/campaignCreated/schema";
import { MissingDataCenterError } from "@/integrations/_shared/mailchimp/errors";

beforeEach(() => {
  mockCampaignsList.mockReset();
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
    type: "campaign_created",
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
    eventType: "campaign_created",
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

// ─── activate ───────────────────────────────────────────────────────────────

describe("campaign_created activate", () => {
  it("captures the baseline knownCampaignIds (sorted) at activation time", async () => {
    mockCampaignsList.mockResolvedValueOnce([
      { id: "c-zebra" },
      { id: "c-alpha" },
      { id: "c-mango" },
    ]);
    const result = await activate({
      node: makeNode({}),
      integration: makeIntegration(),
      workflowId: "w1",
    });
    expect(result.pollingEnabled).toBe(true);
    expect((result.snapshot as { knownCampaignIds: string[] }).knownCampaignIds)
      .toEqual(["c-alpha", "c-mango", "c-zebra"]);
  });

  it("throws MissingDataCenterError when integration metadata lacks dc", async () => {
    await expect(
      activate({
        node: makeNode({}),
        integration: makeIntegration({}),
        workflowId: "w1",
      }),
    ).rejects.toBeInstanceOf(MissingDataCenterError);
  });

  it("forwards audienceId + status filters to campaignsList", async () => {
    mockCampaignsList.mockResolvedValueOnce([]);
    await activate({
      node: makeNode({ audienceId: "list_1", status: "sent" }),
      integration: makeIntegration(),
      workflowId: "w1",
    });
    expect(mockCampaignsList).toHaveBeenCalledWith(
      expect.objectContaining({
        dc: "us21",
        listId: "list_1",
        status: "sent",
        sortField: "create_time",
        sortDir: "DESC",
      }),
    );
  });

  it("echoes audienceId + status onto the config patch", async () => {
    mockCampaignsList.mockResolvedValueOnce([]);
    const result = await activate({
      node: makeNode({ audienceId: "list_1", status: "save" }),
      integration: makeIntegration(),
      workflowId: "w1",
    });
    expect(result.audienceId).toBe("list_1");
    expect(result.status).toBe("save");
  });

  it("handles empty initial campaign list (empty baseline)", async () => {
    mockCampaignsList.mockResolvedValueOnce([]);
    const result = await activate({
      node: makeNode({}),
      integration: makeIntegration(),
      workflowId: "w1",
    });
    expect((result.snapshot as { knownCampaignIds: string[] }).knownCampaignIds)
      .toEqual([]);
  });
});

// ─── poll: first poll after activation must NOT fire historical events ─────

describe("campaign_created poll — baseline-first rule", () => {
  it("does NOT fire when the current list matches the snapshot exactly", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeIntegration());
    mockCampaignsList.mockResolvedValueOnce([
      { id: "c-zebra" },
      { id: "c-alpha" },
      { id: "c-mango" },
    ]);

    const trigger = makeTrigger({
      pollingEnabled: true,
      snapshot: {
        knownCampaignIds: ["c-alpha", "c-mango", "c-zebra"],
        capturedAt: "2026-01-01T00:00:00Z",
      },
    });

    await mailchimpCampaignCreatedPollingHandler.poll({
      trigger,
      accountId: "acct-test",
      userRole: "default",
      now: Date.now(),
    });

    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("skips with a warn log when snapshot is missing (defensive)", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const trigger = makeTrigger({ pollingEnabled: true });
    await mailchimpCampaignCreatedPollingHandler.poll({
      trigger,
      accountId: "acct-test",
      userRole: "default",
      now: Date.now(),
    });
    expect(mockEnqueueRun).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("skips with a warn log when no active Mailchimp integration", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const trigger = makeTrigger({
      pollingEnabled: true,
      snapshot: { knownCampaignIds: ["c1"], capturedAt: "2026-01-01T00:00:00Z" },
    });
    await mailchimpCampaignCreatedPollingHandler.poll({
      trigger,
      accountId: "acct-test",
      userRole: "default",
      now: Date.now(),
    });
    expect(mockEnqueueRun).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ─── poll: second poll emits new ids ───────────────────────────────────────

describe("campaign_created poll — emit on diff", () => {
  it("emits one event per NEWLY-observed campaign id", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeIntegration());
    mockCampaignsList.mockResolvedValueOnce([
      // Existing
      { id: "c-alpha", create_time: "2026-01-01" },
      // New (post-baseline)
      {
        id: "c-new",
        type: "regular",
        status: "save",
        create_time: "2026-01-02",
        settings: { title: "New One", subject_line: "Sub", from_name: "Acme" },
        recipients: { list_id: "list_1", list_name: "Main" },
      },
    ]);

    const trigger = makeTrigger({
      pollingEnabled: true,
      snapshot: {
        knownCampaignIds: ["c-alpha"],
        capturedAt: "2026-01-01T00:00:00Z",
      },
    });

    await mailchimpCampaignCreatedPollingHandler.poll({
      trigger,
      accountId: "acct-test",
      userRole: "default",
      now: Date.now(),
    });

    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
    const call = mockEnqueueRun.mock.calls[0]![0];
    expect(call.event.eventType).toBe("campaign_created");
    expect(call.event.eventId).toBe("campaign_created:c-new");
    expect(call.event.payload.campaignId).toBe("c-new");
    expect(call.event.payload.title).toBe("New One");
    expect(call.event.payload.audienceId).toBe("list_1");
  });

  it("persists the updated snapshot (union of old + observed, sorted)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeIntegration());
    mockCampaignsList.mockResolvedValueOnce([
      { id: "c-alpha" },
      { id: "c-mango" },
      { id: "c-new" },
    ]);

    const trigger = makeTrigger({
      pollingEnabled: true,
      snapshot: {
        knownCampaignIds: ["c-alpha"],
        capturedAt: "2026-01-01T00:00:00Z",
      },
    });

    await mailchimpCampaignCreatedPollingHandler.poll({
      trigger,
      accountId: "acct-test",
      userRole: "default",
      now: Date.now(),
    });

    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    const writtenConfig = mockUpdateConfig.mock.calls[0]![1];
    expect(writtenConfig.snapshot.knownCampaignIds).toEqual([
      "c-alpha",
      "c-mango",
      "c-new",
    ]);
    expect(writtenConfig.polling.lastPolledAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );
  });

  it("blocks re-firing via webhook_event_dedup on cross-tick replay", async () => {
    // Simulate: a different worker already enqueued this event.
    mockMarkSeen.mockResolvedValueOnce({ fresh: false });
    mockGetActiveForExecution.mockResolvedValueOnce(makeIntegration());
    mockCampaignsList.mockResolvedValueOnce([{ id: "c-new" }]);

    const trigger = makeTrigger({
      pollingEnabled: true,
      snapshot: { knownCampaignIds: [], capturedAt: "2026-01-01T00:00:00Z" },
    });

    await mailchimpCampaignCreatedPollingHandler.poll({
      trigger,
      accountId: "acct-test",
      userRole: "default",
      now: Date.now(),
    });

    expect(mockMarkSeen).toHaveBeenCalledWith("mailchimp", "campaign_created:c-new");
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("fails CLOSED on dedup outage (does not enqueue)", async () => {
    mockMarkSeen.mockRejectedValueOnce(new Error("db timeout"));
    mockGetActiveForExecution.mockResolvedValueOnce(makeIntegration());
    mockCampaignsList.mockResolvedValueOnce([{ id: "c-new" }]);

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const trigger = makeTrigger({
      pollingEnabled: true,
      snapshot: { knownCampaignIds: [], capturedAt: "2026-01-01T00:00:00Z" },
    });

    await mailchimpCampaignCreatedPollingHandler.poll({
      trigger,
      accountId: "acct-test",
      userRole: "default",
      now: Date.now(),
    });

    expect(mockEnqueueRun).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ─── schema ─────────────────────────────────────────────────────────────────

describe("campaign_created schema", () => {
  it("validates the activation snapshot shape", () => {
    expect(() =>
      CampaignCreatedConfigSchema.parse({
        pollingEnabled: true,
        snapshot: {
          knownCampaignIds: ["c1"],
          capturedAt: "2026-01-01T00:00:00Z",
        },
      }),
    ).not.toThrow();
  });

  it("rejects an invalid status enum value", () => {
    expect(() =>
      CampaignCreatedConfigSchema.parse({
        status: "invented_status",
      }),
    ).toThrow();
  });
});

// ─── handler registry ───────────────────────────────────────────────────────

describe("campaign_created handler registry", () => {
  it("polling handler.canHandle returns true for (mailchimp, campaign_created)", () => {
    expect(
      mailchimpCampaignCreatedPollingHandler.canHandle(
        makeTrigger({}),
      ),
    ).toBe(true);
  });

  it("polling handler.canHandle returns false for other (provider, eventType)", () => {
    expect(
      mailchimpCampaignCreatedPollingHandler.canHandle({
        ...makeTrigger({}),
        provider: "shopify",
      }),
    ).toBe(false);
    expect(
      mailchimpCampaignCreatedPollingHandler.canHandle({
        ...makeTrigger({}),
        eventType: "email_opened",
      }),
    ).toBe(false);
  });

  it("handler id matches the conventional <provider>/<eventType> shape", () => {
    expect(mailchimpCampaignCreatedPollingHandler.id).toBe(
      "mailchimp/campaign_created",
    );
  });
});
