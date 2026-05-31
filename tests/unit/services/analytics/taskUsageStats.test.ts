/**
 * @jest-environment node
 *
 * Tests for services/analytics/taskUsageStats.ts (Slice 4.COST-7).
 * Pure folds are tested directly with synthetic events; the async owner
 * functions are tested against a mocked repo (no DB).
 */

const mockList = jest.fn();
jest.mock("@/repositories/taskUsageEvents", () => ({
  listEventsForAnalytics: (...a: unknown[]) => mockList(...a),
}));

import type { TaskUsageEventRecord } from "@/repositories/taskUsageEvents";
import {
  summarizeTaskUsageEvents,
  groupTaskUsageByProvider,
  groupTaskUsageByNodeType,
  groupTaskUsageByWorkflow,
  groupTaskUsageByAccount,
  rankTaskGroups,
  getTaskUsageOverview,
  getTaskUsageByProvider,
  getTaskUsageByWorkflow,
  getMostExpensiveWorkflows,
  getTaskUsageForAccount,
} from "@/services/analytics/taskUsageStats";

beforeEach(() => mockList.mockReset());

function ev(p: Partial<TaskUsageEventRecord> = {}): TaskUsageEventRecord {
  return {
    id: "x",
    workflowId: "wf-1",
    workflowRunId: "run-1",
    nodeId: null,
    provider: null,
    nodeType: null,
    nodeKind: null,
    eventType: "node_task_charged",
    billable: true,
    tasksCharged: 1,
    estimatedTasks: null,
    actualTasks: null,
    chargeOn: null,
    costReason: null,
    costPolicyVersion: "v1",
    testMode: false,
    metadata: {},
    createdAt: "2026-05-25T00:00:00Z",
    ...p,
  } as TaskUsageEventRecord;
}

describe("summarizeTaskUsageEvents", () => {
  it("rolls up totals, billable/non-billable, test-mode, and enum breakdowns", () => {
    const summary = summarizeTaskUsageEvents([
      ev({
        eventType: "run_estimate_recorded",
        billable: false,
        tasksCharged: 0,
        estimatedTasks: 3,
        actualTasks: 2,
        costPolicyVersion: "v1",
      }),
      ev({
        eventType: "node_task_charged",
        billable: true,
        tasksCharged: 1,
        actualTasks: 1,
        chargeOn: "success",
        costReason: "provider_action",
        costPolicyVersion: "v1",
      }),
      ev({
        eventType: "node_task_charged",
        billable: true,
        tasksCharged: 2,
        actualTasks: 2,
        chargeOn: "success",
        costReason: "egress",
        costPolicyVersion: "v2",
        testMode: true,
      }),
    ]);
    expect(summary.totalEvents).toBe(3);
    expect(summary.totalTasksCharged).toBe(3);
    expect(summary.totalEstimatedTasks).toBe(3);
    expect(summary.totalActualTasks).toBe(5);
    expect(summary.billableEventCount).toBe(2);
    expect(summary.nonBillableEventCount).toBe(1);
    expect(summary.testModeEventCount).toBe(1);
    expect(summary.byEventType).toEqual({
      run_estimate_recorded: 1,
      node_task_charged: 2,
    });
    expect(summary.byChargeOn).toEqual({ success: 2 });
    expect(summary.byCostReason).toEqual({ provider_action: 1, egress: 1 });
    expect(summary.byCostPolicyVersion).toEqual({ v1: 2, v2: 1 });
  });

  it("returns zeros for an empty list", () => {
    expect(summarizeTaskUsageEvents([])).toEqual({
      totalEvents: 0,
      totalTasksCharged: 0,
      totalEstimatedTasks: 0,
      totalActualTasks: 0,
      billableEventCount: 0,
      nonBillableEventCount: 0,
      testModeEventCount: 0,
      byEventType: {},
      byChargeOn: {},
      byCostReason: {},
      byCostPolicyVersion: {},
    });
  });
});

describe("grouping", () => {
  const events = [
    ev({ provider: "gmail", nodeType: "send_email", workflowId: "wf-1", accountId: "u1", tasksCharged: 1, billable: true }),
    ev({ provider: "gmail", nodeType: "send_email", workflowId: "wf-1", accountId: "u1", tasksCharged: 1, billable: true }),
    ev({ provider: "slack", nodeType: "post_message", workflowId: "wf-2", accountId: "u2", tasksCharged: 3, billable: true }),
    ev({ provider: null, nodeType: null, workflowId: null, eventType: "run_estimate_recorded", billable: false, tasksCharged: 0 }),
  ];

  it("groups by provider (skips provider-less rows)", () => {
    const g = groupTaskUsageByProvider(events);
    expect(Object.keys(g).sort()).toEqual(["gmail", "slack"]);
    expect(g.gmail).toMatchObject({ count: 2, tasksCharged: 2, billableCount: 2 });
    expect(g.slack).toMatchObject({ count: 1, tasksCharged: 3 });
  });

  it("groups by node type as provider:type", () => {
    const g = groupTaskUsageByNodeType(events);
    expect(Object.keys(g).sort()).toEqual(["gmail:send_email", "slack:post_message"]);
    expect(g["gmail:send_email"]!.count).toBe(2);
  });

  it("groups by workflow (skips workflow-less rows)", () => {
    const g = groupTaskUsageByWorkflow(events);
    expect(Object.keys(g).sort()).toEqual(["wf-1", "wf-2"]);
    expect(g["wf-1"]!.tasksCharged).toBe(2);
    expect(g["wf-2"]!.tasksCharged).toBe(3);
  });

  it("groups by user", () => {
    const g = groupTaskUsageByAccount(events);
    expect(g.u1!.tasksCharged).toBe(2);
    expect(g.u2!.tasksCharged).toBe(3);
  });
});

describe("rankTaskGroups", () => {
  it("ranks by tasksCharged desc and honors limit", () => {
    const events = [
      ev({ workflowId: "wf-low", tasksCharged: 1 }),
      ev({ workflowId: "wf-high", tasksCharged: 10 }),
      ev({ workflowId: "wf-mid", tasksCharged: 5 }),
    ];
    const ranked = rankTaskGroups(groupTaskUsageByWorkflow(events), 2);
    expect(ranked.map((r) => r.key)).toEqual(["wf-high", "wf-mid"]);
    expect(ranked[0]!.tasksCharged).toBe(10);
  });

  it("empty groups → empty ranking", () => {
    expect(rankTaskGroups({}, 5)).toEqual([]);
  });
});

describe("async owner functions forward range to repo + fold", () => {
  it("getTaskUsageOverview loads then summarizes", async () => {
    mockList.mockResolvedValueOnce([ev({ tasksCharged: 4, actualTasks: 4 })]);
    const out = await getTaskUsageOverview({ from: "A", to: "B" });
    expect(mockList).toHaveBeenCalledWith({ from: "A", to: "B" });
    expect(out.totalTasksCharged).toBe(4);
  });

  it("getTaskUsageByProvider folds repo rows", async () => {
    mockList.mockResolvedValueOnce([
      ev({ provider: "stripe", tasksCharged: 2 }),
      ev({ provider: "stripe", tasksCharged: 1 }),
    ]);
    const out = await getTaskUsageByProvider({ from: "A" });
    expect(out.stripe!.tasksCharged).toBe(3);
  });

  it("getTaskUsageByWorkflow strips limit from the repo range arg", async () => {
    mockList.mockResolvedValueOnce([ev({ workflowId: "wf-9", tasksCharged: 7 })]);
    const out = await getTaskUsageByWorkflow({ from: "A", to: "B", limit: 5 });
    expect(mockList).toHaveBeenCalledWith({ from: "A", to: "B" });
    expect(out[0]).toMatchObject({ key: "wf-9", tasksCharged: 7 });
  });

  it("getMostExpensiveWorkflows ranks workflows", async () => {
    mockList.mockResolvedValueOnce([
      ev({ workflowId: "wf-a", tasksCharged: 1 }),
      ev({ workflowId: "wf-b", tasksCharged: 9 }),
    ]);
    const out = await getMostExpensiveWorkflows({ limit: 1 });
    expect(out).toHaveLength(1);
    expect(out[0]!.key).toBe("wf-b");
  });

  it("getTaskUsageForAccount passes accountId to the repo", async () => {
    mockList.mockResolvedValueOnce([ev({ accountId: "u-target", tasksCharged: 2 })]);
    const out = await getTaskUsageForAccount({ accountId: "u-target", from: "A" });
    expect(mockList).toHaveBeenCalledWith({ accountId: "u-target", from: "A" });
    expect(out.totalTasksCharged).toBe(2);
  });

  it("empty repo result → zeroed overview", async () => {
    mockList.mockResolvedValueOnce([]);
    const out = await getTaskUsageOverview({});
    expect(out.totalEvents).toBe(0);
    expect(out.totalTasksCharged).toBe(0);
  });
});

describe("no metadata / secret leakage", () => {
  it("aggregates never echo metadata, secrets, or raw config", () => {
    const secretMarkers = [
      "ACCESSTOKEN-aaa",
      "REFRESHTOKEN-bbb",
      "APISECRET-ccc",
      "CLIENTSECRET-ddd",
      "WEBHOOKSECRET-eee",
      "BOTTOKEN-fff",
      "BEARER-ggg",
      "PASSWORD-hhh",
      "MESSAGEBODY-iii",
      "FILECONTENTS-jjj",
      "RAWCONFIG-kkk",
    ];
    const metadata = {
      accessToken: "ACCESSTOKEN-aaa",
      refreshToken: "REFRESHTOKEN-bbb",
      apiSecret: "APISECRET-ccc",
      clientSecret: "CLIENTSECRET-ddd",
      webhookSecret: "WEBHOOKSECRET-eee",
      botToken: "BOTTOKEN-fff",
      Authorization: "BEARER-ggg",
      password: "PASSWORD-hhh",
      messageBody: "MESSAGEBODY-iii",
      fileContents: "FILECONTENTS-jjj",
      config: { to: "RAWCONFIG-kkk" },
    };
    const events = [
      ev({ provider: "gmail", nodeType: "send_email", tasksCharged: 1, metadata }),
      ev({ provider: "slack", nodeType: "post_message", tasksCharged: 2, metadata }),
    ];
    const serialized = JSON.stringify({
      overview: summarizeTaskUsageEvents(events),
      byProvider: groupTaskUsageByProvider(events),
      byNodeType: groupTaskUsageByNodeType(events),
      byWorkflow: rankTaskGroups(groupTaskUsageByWorkflow(events)),
      byAccount: rankTaskGroups(groupTaskUsageByAccount(events)),
    });
    for (const marker of secretMarkers) expect(serialized).not.toContain(marker);
    // No aggregate output field carries a raw metadata payload.
    expect(serialized).not.toContain("metadata");
  });
});
