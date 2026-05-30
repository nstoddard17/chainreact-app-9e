/**
 * @jest-environment node
 *
 * Tests for the Mailchimp `link_clicked` polling trigger —
 * Slice 14 Commit 5. Covers:
 *   - Activation captures totalClicks baseline.
 *   - First poll (no delta) does NOT emit.
 *   - Second poll emits one event per NEW (campaign, urlId, member).
 *   - URL filter narrows to one URL only when set.
 *   - Local knownClicks dedup + global webhook_event_dedup.
 *   - dc threading + MissingDataCenterError on missing dc.
 */
import type { WorkflowNode } from "@/contracts/workflowDefinition";
import type { IntegrationRecord } from "@/repositories/integrations";
import type { TriggerResourceRecord } from "@/repositories/triggerResources";

const mockCampaignsList = jest.fn();
const mockCampaignGet = jest.fn();
const mockReportSummary = jest.fn();
const mockReportClickDetails = jest.fn();
const mockReportClickDetailMembers = jest.fn();
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
  reportClickDetails: (...a: unknown[]) => mockReportClickDetails(...a),
  reportClickDetailMembers: (...a: unknown[]) =>
    mockReportClickDetailMembers(...a),
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

import { activate } from "@/integrations/mailchimp/triggers/linkClicked/activate";
import { mailchimpLinkClickedPollingHandler } from "@/integrations/mailchimp/triggers/linkClicked/poll";
import { MissingDataCenterError } from "@/integrations/_shared/mailchimp/errors";

beforeEach(() => {
  mockCampaignsList.mockReset();
  mockCampaignGet.mockReset();
  mockReportSummary.mockReset();
  mockReportClickDetails.mockReset();
  mockReportClickDetailMembers.mockReset();
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
    type: "link_clicked",
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
    eventType: "link_clicked",
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

describe("link_clicked activate", () => {
  it("captures totalClicks baseline for the watched campaign", async () => {
    mockReportSummary.mockResolvedValueOnce({
      clicks: { clicks_total: 5 },
    });
    const result = await activate({
      node: makeNode({ campaignId: "c1" }),
      integration: makeIntegration(),
      workflowId: "w1",
    });
    expect(result.pollingEnabled).toBe(true);
    expect(result.campaignId).toBe("c1");
    expect((result.snapshot as { campaigns: Record<string, { totalClicks: number }> })
      .campaigns).toEqual({ c1: { totalClicks: 5 } });
  });

  it("multi-campaign mode: snapshots 10 most-recent sent campaigns", async () => {
    mockCampaignsList.mockResolvedValueOnce([{ id: "c1" }, { id: "c2" }]);
    mockReportSummary
      .mockResolvedValueOnce({ clicks: { clicks_total: 3 } })
      .mockResolvedValueOnce({ clicks: { clicks_total: 7 } });
    const result = await activate({
      node: makeNode({}),
      integration: makeIntegration(),
      workflowId: "w1",
    });
    expect((result.snapshot as { campaigns: Record<string, { totalClicks: number }> })
      .campaigns).toEqual({
      c1: { totalClicks: 3 },
      c2: { totalClicks: 7 },
    });
  });

  it("echoes url filter onto config patch", async () => {
    mockReportSummary.mockResolvedValueOnce({ clicks: { clicks_total: 0 } });
    const result = await activate({
      node: makeNode({ campaignId: "c1", url: "https://acme.example/foo" }),
      integration: makeIntegration(),
      workflowId: "w1",
    });
    expect(result.url).toBe("https://acme.example/foo");
  });

  it("throws MissingDataCenterError when dc missing", async () => {
    await expect(
      activate({
        node: makeNode({}),
        integration: makeIntegration({}),
        workflowId: "w1",
      }),
    ).rejects.toBeInstanceOf(MissingDataCenterError);
  });
});

// ─── poll: baseline-first ──────────────────────────────────────────────────

describe("link_clicked poll — baseline-first", () => {
  it("does NOT fire when totalClicks has not changed", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeIntegration());
    mockReportSummary.mockResolvedValueOnce({ clicks: { clicks_total: 5 } });

    const trigger = makeTrigger({
      pollingEnabled: true,
      campaignId: "c1",
      snapshot: {
        campaigns: { c1: { totalClicks: 5 } },
        knownClicks: [],
        capturedAt: "2026-01-01T00:00:00Z",
      },
    });

    await mailchimpLinkClickedPollingHandler.poll({
      trigger,
      accountId: "acct-test",
      userRole: "default",
      now: Date.now(),
    });

    expect(mockReportClickDetails).not.toHaveBeenCalled();
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });
});

// ─── poll: emit on delta ───────────────────────────────────────────────────

describe("link_clicked poll — emit on delta", () => {
  it("emits one event per (campaign, urlId, subscriber) tuple", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeIntegration());
    mockReportSummary.mockResolvedValueOnce({ clicks: { clicks_total: 6 } });
    mockReportClickDetails.mockResolvedValueOnce([
      { id: "u1", url: "https://acme.example/foo", total_clicks: 3 },
      { id: "u2", url: "https://acme.example/bar", total_clicks: 3 },
    ]);
    mockReportClickDetailMembers
      .mockResolvedValueOnce([
        { email_address: "a@x.com", list_id: "list_1", clicks: 1 },
        { email_address: "b@x.com", list_id: "list_1", clicks: 2 },
      ])
      .mockResolvedValueOnce([
        { email_address: "c@x.com", list_id: "list_1", clicks: 1 },
      ]);

    const trigger = makeTrigger({
      pollingEnabled: true,
      campaignId: "c1",
      snapshot: {
        campaigns: { c1: { totalClicks: 0 } },
        knownClicks: [],
        capturedAt: "2026-01-01T00:00:00Z",
      },
    });

    await mailchimpLinkClickedPollingHandler.poll({
      trigger,
      accountId: "acct-test",
      userRole: "default",
      now: Date.now(),
    });

    expect(mockEnqueueRun).toHaveBeenCalledTimes(3);
    const events = mockEnqueueRun.mock.calls.map(
      (c: unknown[]) => (c[0] as { event: { payload: unknown; eventId: string } }).event,
    );
    expect(events.map((e: { eventId: string }) => e.eventId)).toEqual([
      "link_clicked:c1:u1:a@x.com",
      "link_clicked:c1:u1:b@x.com",
      "link_clicked:c1:u2:c@x.com",
    ]);
  });

  it("URL filter narrows to one URL only", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeIntegration());
    mockReportSummary.mockResolvedValueOnce({ clicks: { clicks_total: 6 } });
    mockReportClickDetails.mockResolvedValueOnce([
      { id: "u1", url: "https://acme.example/foo" },
      { id: "u2", url: "https://acme.example/bar" },
    ]);
    mockReportClickDetailMembers.mockResolvedValueOnce([
      { email_address: "a@x.com", clicks: 1 },
    ]);

    const trigger = makeTrigger({
      pollingEnabled: true,
      campaignId: "c1",
      url: "https://acme.example/foo",
      snapshot: {
        campaigns: { c1: { totalClicks: 0 } },
        knownClicks: [],
        capturedAt: "2026-01-01T00:00:00Z",
      },
    });

    await mailchimpLinkClickedPollingHandler.poll({
      trigger,
      accountId: "acct-test",
      userRole: "default",
      now: Date.now(),
    });

    // Only ONE members fetch — for the filtered URL.
    expect(mockReportClickDetailMembers).toHaveBeenCalledTimes(1);
    expect(mockReportClickDetailMembers).toHaveBeenCalledWith(
      expect.objectContaining({ urlId: "u1" }),
    );
    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
    const event = mockEnqueueRun.mock.calls[0]![0].event;
    expect(event.payload.url).toBe("https://acme.example/foo");
  });

  it("local knownClicks blocks repeat firing within the same row", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeIntegration());
    mockReportSummary.mockResolvedValueOnce({ clicks: { clicks_total: 6 } });
    mockReportClickDetails.mockResolvedValueOnce([
      { id: "u1", url: "https://acme.example/foo" },
    ]);
    mockReportClickDetailMembers.mockResolvedValueOnce([
      { email_address: "a@x.com", clicks: 1 },
    ]);

    const trigger = makeTrigger({
      pollingEnabled: true,
      campaignId: "c1",
      snapshot: {
        campaigns: { c1: { totalClicks: 5 } },
        knownClicks: ["c1:u1:a@x.com"],
        capturedAt: "2026-01-01T00:00:00Z",
      },
    });

    await mailchimpLinkClickedPollingHandler.poll({
      trigger,
      accountId: "acct-test",
      userRole: "default",
      now: Date.now(),
    });

    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("global dedup blocks cross-tick replays + adds to local snapshot", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeIntegration());
    mockReportSummary.mockResolvedValueOnce({ clicks: { clicks_total: 6 } });
    mockReportClickDetails.mockResolvedValueOnce([
      { id: "u1", url: "https://acme.example/foo" },
    ]);
    mockReportClickDetailMembers.mockResolvedValueOnce([
      { email_address: "a@x.com", clicks: 1 },
    ]);
    mockMarkSeen.mockResolvedValueOnce({ fresh: false });

    const trigger = makeTrigger({
      pollingEnabled: true,
      campaignId: "c1",
      snapshot: {
        campaigns: { c1: { totalClicks: 0 } },
        knownClicks: [],
        capturedAt: "2026-01-01T00:00:00Z",
      },
    });

    await mailchimpLinkClickedPollingHandler.poll({
      trigger,
      accountId: "acct-test",
      userRole: "default",
      now: Date.now(),
    });

    expect(mockEnqueueRun).not.toHaveBeenCalled();
    const written = mockUpdateConfig.mock.calls[0]![1];
    expect(written.snapshot.knownClicks).toContain("c1:u1:a@x.com");
  });
});

// ─── handler registry ──────────────────────────────────────────────────────

describe("link_clicked handler registry", () => {
  it("canHandle matches (mailchimp, link_clicked)", () => {
    expect(
      mailchimpLinkClickedPollingHandler.canHandle(makeTrigger({})),
    ).toBe(true);
  });

  it("canHandle rejects other (provider, eventType)", () => {
    expect(
      mailchimpLinkClickedPollingHandler.canHandle({
        ...makeTrigger({}),
        eventType: "email_opened",
      }),
    ).toBe(false);
  });

  it("handler id matches the conventional shape", () => {
    expect(mailchimpLinkClickedPollingHandler.id).toBe("mailchimp/link_clicked");
  });
});
