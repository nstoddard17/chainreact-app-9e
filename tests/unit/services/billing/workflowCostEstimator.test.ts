/**
 * @jest-environment node
 *
 * Tests for services/billing/workflowCostEstimator.ts (Slice 4.COST-2, Part B).
 *
 * These exercise the estimator against the REAL discovery registry, so every
 * provider/native key below is a genuinely-registered action/trigger. The
 * estimator is read-only: a deductTasks mock proves no billing side effect.
 */

// Guard: the estimator must never deduct tasks. Mock the billing repo and
// assert it is never touched. (The estimator does not import it; this proves
// no transitive call path bills.)
const mockDeductTasks = jest.fn();
jest.mock("@/repositories/userBilling", () => ({
  deductTasks: (...args: unknown[]) => mockDeductTasks(...args),
  getUsage: jest.fn(),
}));

import type { WorkflowDefinition, WorkflowNode } from "@/contracts/workflowDefinition";
import {
  estimateWorkflowTaskCost,
  estimateNodeTaskCost,
  summarizeWorkflowCost,
} from "@/services/billing/workflowCostEstimator";

beforeEach(() => mockDeductTasks.mockReset());

function node(
  id: string,
  kind: "trigger" | "action",
  provider: string,
  type: string,
  config: Record<string, unknown> = {},
): WorkflowNode {
  return { id, kind, provider, type, config, position: { x: 0, y: 0 } };
}

function def(nodes: WorkflowNode[], edges: WorkflowDefinition["edges"] = []): WorkflowDefinition {
  return { nodes, edges };
}

describe("workflowCostEstimator — totals", () => {
  it("trigger + 3 provider actions estimates 3 tasks/run", () => {
    const estimate = estimateWorkflowTaskCost(
      def([
        node("t", "trigger", "native", "manual.run"),
        node("a1", "action", "gmail", "send_email"),
        node("a2", "action", "gmail", "create_draft"),
        node("a3", "action", "slack", "send_channel_message"),
      ]),
    );
    expect(estimate.estimatedTasksPerRun).toBe(3);
    expect(estimate.billableNodes).toHaveLength(3);
    expect(estimate.unknownCostNodes).toHaveLength(0);
  });

  it("native control-flow nodes add no task cost", () => {
    const estimate = estimateWorkflowTaskCost(
      def([
        node("t", "trigger", "native", "manual.run"),
        node("if", "action", "native", "if_then_condition"),
        node("r", "action", "native", "router"),
        node("d", "action", "native", "delay"),
        node("f", "action", "native", "format_transformer"),
        node("a1", "action", "gmail", "send_email"),
      ]),
    );
    // Only the gmail action bills; all control-flow is 0.
    expect(estimate.estimatedTasksPerRun).toBe(1);
    expect(estimate.billableNodes).toHaveLength(1);
    expect(estimate.nonBillableNodes.map((n) => n.nodeId).sort()).toEqual([
      "d",
      "f",
      "if",
      "r",
      "t",
    ]);
  });

  it("native:http_request adds 1 task", () => {
    const estimate = estimateWorkflowTaskCost(
      def([
        node("t", "trigger", "native", "manual.run"),
        node("h", "action", "native", "http_request"),
      ]),
    );
    expect(estimate.estimatedTasksPerRun).toBe(1);
    expect(estimate.billableNodes[0]?.nodeId).toBe("h");
    expect(estimate.billableNodes[0]?.reason).toBe("native_external_egress");
  });

  it("a trigger-only workflow estimates 0 tasks/run", () => {
    const estimate = estimateWorkflowTaskCost(
      def([node("t", "trigger", "native", "manual.run")]),
    );
    expect(estimate.estimatedTasksPerRun).toBe(0);
    expect(estimate.billableNodes).toHaveLength(0);
  });
});

describe("workflowCostEstimator — node breakdown + unknowns", () => {
  it("an unknown node produces a warning instead of crashing", () => {
    const estimate = estimateWorkflowTaskCost(
      def([
        node("t", "trigger", "native", "manual.run"),
        node("x", "action", "acme", "do_thing"),
        node("a1", "action", "gmail", "send_email"),
      ]),
    );
    expect(estimate.estimatedTasksPerRun).toBe(1); // gmail only
    expect(estimate.unknownCostNodes.map((n) => n.nodeId)).toEqual(["x"]);
    expect(
      estimate.warnings.some(
        (w) => w.code === "UNKNOWN_NODE_TYPE" && w.nodeId === "x",
      ),
    ).toBe(true);
  });

  it("node breakdown includes billable and non-billable nodes with metadata", () => {
    const estimate = estimateWorkflowTaskCost(
      def([
        node("t", "trigger", "native", "manual.run"),
        node("r", "action", "native", "router"),
        node("a1", "action", "gmail", "send_email"),
      ]),
    );
    expect(estimate.nodeBreakdown).toHaveLength(3);
    const gmail = estimate.nodeBreakdown.find((n) => n.nodeId === "a1")!;
    expect(gmail.billable).toBe(true);
    expect(gmail.estimatedTasks).toBe(1);
    expect(gmail.displayName).toBeTruthy(); // resolved from registry meta
    expect(gmail.category).toBeTruthy();
    const router = estimate.nodeBreakdown.find((n) => n.nodeId === "r")!;
    expect(router.billable).toBe(false);
    expect(router.estimatedTasks).toBe(0);
  });

  it("estimateNodeTaskCost grounds displayName/category/risk in registry meta", () => {
    const b = estimateNodeTaskCost(node("h", "action", "native", "http_request"));
    expect(b.billable).toBe(true);
    expect(b.displayName).toBeTruthy();
    expect(b.riskLevel).toBe("high"); // native:http_request meta is high-risk
  });

  it("surfaces cost source: 'override' for an overridden node, 'default_policy' otherwise (COST-4)", () => {
    expect(estimateNodeTaskCost(node("h", "action", "native", "http_request")).source).toBe("override");
    expect(estimateNodeTaskCost(node("a1", "action", "gmail", "send_email", { to: ["x@y.com"] })).source).toBe("default_policy");
    expect(estimateNodeTaskCost(node("r", "action", "native", "router")).source).toBe("default_policy");
  });
});

describe("workflowCostEstimator — trigger-cadence warnings (no run-frequency guessing)", () => {
  it("event-driven (webhook) trigger warns EVENT_VOLUME_UNKNOWN", () => {
    const estimate = estimateWorkflowTaskCost(
      def([
        node("t", "trigger", "hubspot", "webhook_received"),
        node("a1", "action", "gmail", "send_email"),
      ]),
    );
    expect(estimate.warnings.some((w) => w.code === "EVENT_VOLUME_UNKNOWN")).toBe(
      true,
    );
  });

  it("polling trigger warns EVENT_VOLUME_UNKNOWN", () => {
    const estimate = estimateWorkflowTaskCost(
      def([node("t", "trigger", "gmail", "new_email")]),
    );
    expect(estimate.warnings.some((w) => w.code === "EVENT_VOLUME_UNKNOWN")).toBe(
      true,
    );
  });

  it("scheduled trigger warns SCHEDULE_ESTIMATE_UNAVAILABLE (monthly deferred)", () => {
    const estimate = estimateWorkflowTaskCost(
      def([node("t", "trigger", "native", "schedule.fired")]),
    );
    expect(
      estimate.warnings.some((w) => w.code === "SCHEDULE_ESTIMATE_UNAVAILABLE"),
    ).toBe(true);
  });

  it("manual trigger emits no cadence warning", () => {
    const estimate = estimateWorkflowTaskCost(
      def([node("t", "trigger", "native", "manual.run")]),
    );
    expect(estimate.warnings).toHaveLength(0);
  });

  it("branching (labeled edges) carries a BRANCHING_UPPER_BOUND warning", () => {
    const estimate = estimateWorkflowTaskCost(
      def(
        [
          node("t", "trigger", "native", "manual.run"),
          node("if", "action", "native", "if_then_condition"),
          node("a1", "action", "gmail", "send_email"),
        ],
        [
          { id: "e1", from: "t", to: "if" },
          { id: "e2", from: "if", to: "a1", label: "true" },
        ],
      ),
    );
    expect(
      estimate.warnings.some((w) => w.code === "BRANCHING_UPPER_BOUND"),
    ).toBe(true);
  });
});

describe("workflowCostEstimator — safety + purity", () => {
  it("never includes secrets / raw config values in the output", () => {
    const secrets = {
      accessToken: "ACCESS-aaa",
      refreshToken: "REFRESH-bbb",
      apiSecret: "APISECRET-ccc",
      clientSecret: "CLIENTSECRET-ddd",
      webhookSecret: "WEBHOOKSECRET-eee",
      botToken: "BOTTOKEN-fff",
      Authorization: "Bearer SECRET-ggg",
      to: "someone@example.com",
      body: "RAW-SECRET-BODY-hhh",
    };
    const estimate = estimateWorkflowTaskCost(
      def([
        node("t", "trigger", "native", "manual.run"),
        node("a1", "action", "gmail", "send_email", secrets),
        node("h", "action", "native", "http_request", {
          url: "https://x/y",
          headers: { Authorization: "Bearer SECRET-ggg" },
        }),
      ]),
    );
    const serialized = JSON.stringify(estimate);
    for (const value of Object.values(secrets)) {
      expect(serialized).not.toContain(value);
    }
    // And no config KEY names leak either.
    for (const key of Object.keys(secrets)) {
      if (key === "to" || key === "body") continue; // generic words; values asserted above
      expect(serialized).not.toContain(key);
    }
  });

  it("performs no billing deduction (deductTasks never called)", () => {
    estimateWorkflowTaskCost(
      def([
        node("t", "trigger", "native", "manual.run"),
        node("a1", "action", "gmail", "send_email"),
        node("h", "action", "native", "http_request"),
      ]),
    );
    expect(mockDeductTasks).not.toHaveBeenCalled();
  });

  it("is deterministic — identical definition yields identical estimate", () => {
    const d = def([
      node("t", "trigger", "native", "manual.run"),
      node("a1", "action", "gmail", "send_email"),
      node("r", "action", "native", "router"),
      node("x", "action", "acme", "nope"),
    ]);
    expect(estimateWorkflowTaskCost(d)).toEqual(estimateWorkflowTaskCost(d));
  });

  it("does not mutate the input definition", () => {
    const d = def([
      node("t", "trigger", "native", "manual.run"),
      node("a1", "action", "gmail", "send_email"),
    ]);
    const snapshot = JSON.stringify(d);
    estimateWorkflowTaskCost(d);
    expect(JSON.stringify(d)).toBe(snapshot);
  });

  it("summarizeWorkflowCost returns a compact, consistent summary", () => {
    const d = def([
      node("t", "trigger", "native", "manual.run"),
      node("a1", "action", "gmail", "send_email"),
      node("r", "action", "native", "router"),
      node("x", "action", "acme", "nope"),
    ]);
    const summary = summarizeWorkflowCost(d);
    const full = estimateWorkflowTaskCost(d);
    expect(summary.estimatedTasksPerRun).toBe(full.estimatedTasksPerRun);
    expect(summary.billableCount).toBe(full.billableNodes.length);
    expect(summary.nonBillableCount).toBe(full.nonBillableNodes.length);
    expect(summary.unknownCount).toBe(full.unknownCostNodes.length);
    expect(summary.policyVersion).toBe(full.policyVersion);
  });
});
