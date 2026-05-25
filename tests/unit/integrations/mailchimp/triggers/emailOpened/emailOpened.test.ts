/**
 * @jest-environment node
 *
 * Tests for the Mailchimp `email_opened` polling trigger —
 * Slice 14 Commit 5. Covers:
 *   - Activation captures per-campaign totalOpens baseline.
 *   - Single-campaign mode: only watches config.campaignId.
 *   - Multi-campaign mode: pulls 10 most-recent sent campaigns.
 *   - First poll (baseline equals current) does NOT emit.
 *   - Second poll emits one event per NEW member open.
 *   - Local knownOpens snapshot blocks intra-row re-fires.
 *   - DB-backed dedup via webhook_event_dedup blocks cross-tick replays.
 *   - dc threading + refreshAndRetry wrapping.
 *   - MissingDataCenterError on missing dc.
 */
import type { WorkflowNode } from "@/contracts/workflowDefinition";
import type { IntegrationRecord } from "@/repositories/integrations";
import type { TriggerResourceRecord } from "@/repositories/triggerResources";

const mockCampaignsList = jest.fn();
const mockCampaignGet = jest.fn();
const mockReportSummary = jest.fn();
const mockReportOpenDetails = jest.fn();
const mockEnqueueRun = jest.fn();
const mockUpdateConfig = jest.fn();
const mockGetActiveForExecution = jest.fn();
const mockMarkSeen = jest.fn();

jest.mock("@/integrations/_shared/mailchimp/api/campaigns", () => ({
  campaignsList: (...a: unknown[]) => mockCampaignsList(...a),
  campaignGet: (...a: unknown[]) => mockCampaignGet(...a),
}));

jest.mock("@/integrations/_shared/mailchimp/api/reports", () => ({
  reportSummary: (...a: unknown[]) => mockReportSummary(...a),
  reportOpenDetails: (...a: unknown[]) => mockReportOpenDetails(...a),
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

import { activate } from "@/integrations/mailchimp/triggers/emailOpened/activate";
import { mailchimpEmailOpenedPollingHandler } from "@/integrations/mailchimp/triggers/emailOpened/poll";
import { MissingDataCenterError } from "@/integrations/_shared/mailchimp/errors";

beforeEach(() => {
  mockCampaignsList.mockReset();
  mockCampaignGet.mockReset();
  mockReportSummary.mockReset();
  mockReportOpenDetails.mockReset();
  mockEnqueueRun.mockReset();
  mockUpdateConfig.mockReset();
  mockGetActiveForExecution.mockReset();
  mockMarkSeen.mockReset();
  mockMarkSeen.mockResolvedValue({ fresh: true });
  mockCampaignGet.mockResolvedValue({
    settings: { title: "Newsletter", subject_line: "Hi" },
  });
});

function makeNode(config: Record<string, unknown>): WorkflowNode {
  return {
    id: "n1",
    kind: "trigger",
    type: "email_opened",
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
    eventType: "email_opened",
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

// ─── activate ───────────────────────────────────────────────────────────────

describe("email_opened activate", () => {
  it("single-campaign mode: snapshots ONLY config.campaignId", async () => {
    mockReportSummary.mockResolvedValueOnce({
      id: "c1",
      opens: { opens_total: 42 },
    });
    const result = await activate({
      node: makeNode({ campaignId: "c1" }),
      integration: makeIntegration(),
      workflowId: "w1",
    });
    expect(mockCampaignsList).not.toHaveBeenCalled();
    expect(result.campaignId).toBe("c1");
    expect((result.snapshot as { campaigns: Record<string, { totalOpens: number }> })
      .campaigns).toEqual({ c1: { totalOpens: 42 } });
  });

  it("multi-campaign mode: pulls 10 most-recent sent campaigns", async () => {
    mockCampaignsList.mockResolvedValueOnce([
      { id: "c1" },
      { id: "c2" },
      { id: "c3" },
    ]);
    mockReportSummary
      .mockResolvedValueOnce({ opens: { opens_total: 5 } })
      .mockResolvedValueOnce({ opens: { opens_total: 10 } })
      .mockResolvedValueOnce({ opens: { opens_total: 15 } });

    const result = await activate({
      node: makeNode({}),
      integration: makeIntegration(),
      workflowId: "w1",
    });

    expect(mockCampaignsList).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "sent",
        sortField: "send_time",
        sortDir: "DESC",
        count: 10,
      }),
    );
    expect((result.snapshot as { campaigns: Record<string, { totalOpens: number }> })
      .campaigns).toEqual({
      c1: { totalOpens: 5 },
      c2: { totalOpens: 10 },
      c3: { totalOpens: 15 },
    });
  });

  it("activation reports a campaign with 0 opens when summary fetch fails", async () => {
    mockReportSummary.mockRejectedValueOnce(new Error("report failure"));
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = await activate({
      node: makeNode({ campaignId: "c1" }),
      integration: makeIntegration(),
      workflowId: "w1",
    });
    expect((result.snapshot as { campaigns: Record<string, { totalOpens: number }> })
      .campaigns.c1!.totalOpens).toBe(0);
    warnSpy.mockRestore();
  });

  it("throws MissingDataCenterError when dc is missing", async () => {
    await expect(
      activate({
        node: makeNode({}),
        integration: makeIntegration({}),
        workflowId: "w1",
      }),
    ).rejects.toBeInstanceOf(MissingDataCenterError);
  });

  it("includes empty knownOpens array in snapshot", async () => {
    mockReportSummary.mockResolvedValueOnce({ opens: { opens_total: 0 } });
    const result = await activate({
      node: makeNode({ campaignId: "c1" }),
      integration: makeIntegration(),
      workflowId: "w1",
    });
    expect((result.snapshot as { knownOpens: string[] }).knownOpens).toEqual([]);
  });
});

// ─── poll: baseline-first rule ─────────────────────────────────────────────

describe("email_opened poll — baseline-first", () => {
  it("does NOT fire when totalOpens has not changed", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeIntegration());
    mockReportSummary.mockResolvedValueOnce({ opens: { opens_total: 42 } });

    const trigger = makeTrigger({
      pollingEnabled: true,
      campaignId: "c1",
      snapshot: {
        campaigns: { c1: { totalOpens: 42 } },
        knownOpens: [],
        capturedAt: "2026-01-01T00:00:00Z",
      },
    });

    await mailchimpEmailOpenedPollingHandler.poll({
      trigger,
      userRole: "default",
      now: Date.now(),
    });

    expect(mockReportOpenDetails).not.toHaveBeenCalled();
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("skips when no snapshot present (defensive)", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const trigger = makeTrigger({ pollingEnabled: true, campaignId: "c1" });
    await mailchimpEmailOpenedPollingHandler.poll({
      trigger,
      userRole: "default",
      now: Date.now(),
    });
    expect(mockEnqueueRun).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ─── poll: emit on delta ───────────────────────────────────────────────────

describe("email_opened poll — emit on delta", () => {
  it("emits one event per new member when totalOpens delta > 0", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeIntegration());
    mockReportSummary.mockResolvedValueOnce({ opens: { opens_total: 44 } });
    mockReportOpenDetails.mockResolvedValueOnce([
      {
        email_id: "id-a",
        email_address: "a@x.com",
        list_id: "list_1",
        opens: [{ timestamp: "2026-01-02T10:00:00Z" }],
        opens_count: 1,
      },
      {
        email_id: "id-b",
        email_address: "b@x.com",
        list_id: "list_1",
        opens: [{ timestamp: "2026-01-02T09:00:00Z" }],
        opens_count: 1,
      },
    ]);

    const trigger = makeTrigger({
      pollingEnabled: true,
      campaignId: "c1",
      snapshot: {
        campaigns: { c1: { totalOpens: 42 } },
        knownOpens: [],
        capturedAt: "2026-01-01T00:00:00Z",
      },
    });

    await mailchimpEmailOpenedPollingHandler.poll({
      trigger,
      userRole: "default",
      now: Date.now(),
    });

    // Detail fetch sized to the delta (2).
    expect(mockReportOpenDetails).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: "c1", count: 2 }),
    );
    expect(mockEnqueueRun).toHaveBeenCalledTimes(2);
    const firstEvent = mockEnqueueRun.mock.calls[0]![0].event;
    expect(firstEvent.eventType).toBe("email_opened");
    expect(firstEvent.eventId).toBe("email_opened:c1:a@x.com");
    expect(firstEvent.payload.email).toBe("a@x.com");
    expect(firstEvent.payload.openTime).toBe("2026-01-02T10:00:00Z");
    expect(firstEvent.payload.campaignTitle).toBe("Newsletter");
  });

  it("dedups by (campaign, email) — same member opening again does NOT fire", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeIntegration());
    mockReportSummary.mockResolvedValueOnce({ opens: { opens_total: 43 } });
    mockReportOpenDetails.mockResolvedValueOnce([
      {
        email_address: "a@x.com",
        opens: [{ timestamp: "2026-01-02T11:00:00Z" }],
        opens_count: 2,
      },
    ]);

    // a@x.com already in knownOpens from a previous tick.
    const trigger = makeTrigger({
      pollingEnabled: true,
      campaignId: "c1",
      snapshot: {
        campaigns: { c1: { totalOpens: 42 } },
        knownOpens: ["c1:a@x.com"],
        capturedAt: "2026-01-01T00:00:00Z",
      },
    });

    await mailchimpEmailOpenedPollingHandler.poll({
      trigger,
      userRole: "default",
      now: Date.now(),
    });

    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("persists updated snapshot with grown knownOpens + new totalOpens", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeIntegration());
    mockReportSummary.mockResolvedValueOnce({ opens: { opens_total: 43 } });
    mockReportOpenDetails.mockResolvedValueOnce([
      { email_address: "a@x.com", opens: [{ timestamp: "2026-01-02T10:00:00Z" }] },
    ]);

    const trigger = makeTrigger({
      pollingEnabled: true,
      campaignId: "c1",
      snapshot: {
        campaigns: { c1: { totalOpens: 42 } },
        knownOpens: [],
        capturedAt: "2026-01-01T00:00:00Z",
      },
    });

    await mailchimpEmailOpenedPollingHandler.poll({
      trigger,
      userRole: "default",
      now: Date.now(),
    });

    const written = mockUpdateConfig.mock.calls[0]![1];
    expect(written.snapshot.campaigns).toEqual({ c1: { totalOpens: 43 } });
    expect(written.snapshot.knownOpens).toEqual(["c1:a@x.com"]);
  });

  it("blocks re-firing via webhook_event_dedup on cross-tick replay", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeIntegration());
    mockReportSummary.mockResolvedValueOnce({ opens: { opens_total: 43 } });
    mockReportOpenDetails.mockResolvedValueOnce([
      { email_address: "a@x.com", opens: [{ timestamp: "2026-01-02T10:00:00Z" }] },
    ]);
    mockMarkSeen.mockResolvedValueOnce({ fresh: false });

    const trigger = makeTrigger({
      pollingEnabled: true,
      campaignId: "c1",
      snapshot: {
        campaigns: { c1: { totalOpens: 42 } },
        knownOpens: [],
        capturedAt: "2026-01-01T00:00:00Z",
      },
    });

    await mailchimpEmailOpenedPollingHandler.poll({
      trigger,
      userRole: "default",
      now: Date.now(),
    });

    expect(mockMarkSeen).toHaveBeenCalledWith("mailchimp", "email_opened:c1:a@x.com");
    expect(mockEnqueueRun).not.toHaveBeenCalled();
    // Local knownOpens should also be updated to skip next tick.
    const written = mockUpdateConfig.mock.calls[0]![1];
    expect(written.snapshot.knownOpens).toContain("c1:a@x.com");
  });
});

// ─── handler registry ──────────────────────────────────────────────────────

describe("email_opened handler registry", () => {
  it("canHandle matches (mailchimp, email_opened)", () => {
    expect(
      mailchimpEmailOpenedPollingHandler.canHandle(makeTrigger({})),
    ).toBe(true);
  });

  it("canHandle rejects other (provider, eventType)", () => {
    expect(
      mailchimpEmailOpenedPollingHandler.canHandle({
        ...makeTrigger({}),
        eventType: "link_clicked",
      }),
    ).toBe(false);
  });

  it("handler id matches the conventional shape", () => {
    expect(mailchimpEmailOpenedPollingHandler.id).toBe("mailchimp/email_opened");
  });
});
