/**
 * @jest-environment node
 *
 * Tests for services/billing/taskCostPolicy.ts (Slice 4.COST-2, Part A).
 *
 * The policy is a pure function of (node, meta?) — these tests construct
 * minimal node shapes and pass a meta only as the "this provider node is
 * registered" grounding signal (the policy reads its presence, not its
 * fields). No registry, DB, or network is involved.
 */

import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import {
  TASK_COST_POLICY_VERSION,
  classifyNodeTaskCost,
  getTaskCostOverride,
  getTaskCostPolicyVersion,
  isBillableNode,
} from "@/services/billing/taskCostPolicy";

type NodeLike = { kind: "trigger" | "action"; provider: string; type: string };

function actionNode(provider: string, type: string): NodeLike {
  return { kind: "action", provider, type };
}
function triggerNode(provider: string, type: string): NodeLike {
  return { kind: "trigger", provider, type };
}

// Presence-only stub — the policy never reads meta fields, only existence.
const registeredAction = {} as ActionMeta;
const registeredTrigger = {} as TriggerMeta;

describe("taskCostPolicy — provider actions", () => {
  it("a registered provider action defaults to 1 task on success", () => {
    const cost = classifyNodeTaskCost(
      actionNode("gmail", "send_email"),
      registeredAction,
    );
    expect(cost).toEqual({
      billable: true,
      baseTasks: 1,
      chargeOn: "success",
      reason: "provider_action",
      policyVersion: "v1",
      source: "default_policy",
    });
  });

  it("an UNGROUNDED provider action (no meta) is unknown, not silently billed", () => {
    const cost = classifyNodeTaskCost(actionNode("acme", "do_thing"));
    expect(cost.billable).toBe(false);
    expect(cost.baseTasks).toBe(0);
    expect(cost.reason).toBe("unknown_node");
    expect(cost.chargeOn).toBe("none");
  });
});

describe("taskCostPolicy — native nodes", () => {
  it("native:http_request is billable (1 task, external egress)", () => {
    const cost = classifyNodeTaskCost(actionNode("native", "http_request"));
    expect(cost.billable).toBe(true);
    expect(cost.baseTasks).toBe(1);
    expect(cost.reason).toBe("native_external_egress");
    expect(cost.chargeOn).toBe("success");
  });

  it.each([
    "if_then_condition",
    "router",
    "delay",
    "format_transformer",
  ])("native:%s control-flow node is 0 tasks", (type) => {
    const cost = classifyNodeTaskCost(actionNode("native", type));
    expect(cost.billable).toBe(false);
    expect(cost.baseTasks).toBe(0);
    expect(cost.reason).toBe("native_control_flow");
  });

  it("an unrecognized native type is unknown (safe non-billable)", () => {
    const cost = classifyNodeTaskCost(actionNode("native", "teleport"));
    expect(cost.billable).toBe(false);
    expect(cost.reason).toBe("unknown_node");
  });

  it("a transient empty type is unknown, not billed", () => {
    const cost = classifyNodeTaskCost(actionNode("gmail", ""));
    expect(cost.billable).toBe(false);
    expect(cost.reason).toBe("unknown_node");
  });
});

describe("taskCostPolicy — triggers never bill", () => {
  it.each([
    ["native", "manual.run"], // manual
    ["native", "schedule.fired"], // scheduled
    ["gmail", "new_email"], // polling
    ["hubspot", "webhook_received"], // webhook
  ])("trigger %s:%s is 0 tasks", (provider, type) => {
    const cost = classifyNodeTaskCost(
      triggerNode(provider, type),
      registeredTrigger,
    );
    expect(cost.billable).toBe(false);
    expect(cost.baseTasks).toBe(0);
    expect(cost.reason).toBe("trigger");
    expect(cost.chargeOn).toBe("none");
  });

  it("triggers are 0 even without a meta (kind drives the decision)", () => {
    const cost = classifyNodeTaskCost(triggerNode("slack", "new_message"));
    expect(cost.billable).toBe(false);
    expect(cost.reason).toBe("trigger");
  });
});

describe("taskCostPolicy — invariants", () => {
  it("every classification carries the policy version", () => {
    expect(getTaskCostPolicyVersion()).toBe(TASK_COST_POLICY_VERSION);
    expect(getTaskCostPolicyVersion()).toBeTruthy();
    const cost = classifyNodeTaskCost(
      actionNode("gmail", "send_email"),
      registeredAction,
    );
    expect(cost.policyVersion).toBe(TASK_COST_POLICY_VERSION);
  });

  it("AI operations are NOT workflow tasks — no workflow node yields chargeOn 'ai_call'", () => {
    // AI cost is a separate ledger (future ai_cost_events). The workflow
    // task policy must never classify a node as an AI charge.
    const representative: NodeLike[] = [
      actionNode("gmail", "send_email"),
      actionNode("native", "http_request"),
      actionNode("native", "router"),
      triggerNode("native", "manual.run"),
      actionNode("acme", "unknown"),
    ];
    for (const n of representative) {
      const cost = classifyNodeTaskCost(
        n,
        n.kind === "action" && n.provider !== "native"
          ? registeredAction
          : undefined,
      );
      expect(cost.chargeOn).not.toBe("ai_call");
    }
  });

  it("default-policy nodes carry source 'default_policy'", () => {
    expect(classifyNodeTaskCost(actionNode("native", "router")).source).toBe("default_policy");
    expect(
      classifyNodeTaskCost(actionNode("gmail", "send_email"), registeredAction).source,
    ).toBe("default_policy");
  });

  it("isBillableNode mirrors classifyNodeTaskCost.billable", () => {
    expect(isBillableNode(actionNode("native", "http_request"))).toBe(true);
    expect(isBillableNode(actionNode("native", "router"))).toBe(false);
    expect(
      isBillableNode(actionNode("gmail", "send_email"), registeredAction),
    ).toBe(true);
    expect(isBillableNode(triggerNode("native", "manual.run"))).toBe(false);
  });

  it("is deterministic — identical inputs give identical output", () => {
    const n = actionNode("gmail", "send_email");
    expect(classifyNodeTaskCost(n, registeredAction)).toEqual(
      classifyNodeTaskCost(n, registeredAction),
    );
  });
});

describe("taskCostPolicy — central cost overrides (COST-4)", () => {
  it("a central override wins over the category default (native:http_request)", () => {
    const cost = classifyNodeTaskCost(actionNode("native", "http_request"));
    expect(cost.billable).toBe(true);
    expect(cost.baseTasks).toBe(1);
    expect(cost.reason).toBe("native_external_egress");
    expect(cost.chargeOn).toBe("success");
    expect(cost.source).toBe("override");
  });

  it("getTaskCostOverride returns the entry for an overridden action", () => {
    const o = getTaskCostOverride("native", "http_request", "action");
    expect(o).toMatchObject({ billable: true, baseTasks: 1, reason: "native_external_egress" });
  });

  it("getTaskCostOverride returns undefined for a default node", () => {
    expect(getTaskCostOverride("gmail", "send_email", "action")).toBeUndefined();
    expect(getTaskCostOverride("native", "router", "action")).toBeUndefined();
  });

  it("getTaskCostOverride never returns an override for a trigger", () => {
    // Even if a provider:type collided with an override key, triggers are free.
    expect(getTaskCostOverride("native", "http_request", "trigger")).toBeUndefined();
  });

  it("triggers stay 0 regardless of the override map", () => {
    const cost = classifyNodeTaskCost(triggerNode("native", "http_request"));
    expect(cost.billable).toBe(false);
    expect(cost.reason).toBe("trigger");
  });

  it("the http_request override carries no perItemTasks (loop math not applied yet)", () => {
    const o = getTaskCostOverride("native", "http_request", "action");
    expect(o?.perItemTasks).toBeUndefined();
    // The reserved perItemTasks field exists on the contract for future
    // bulk/loop nodes but no override uses it and the estimator never
    // multiplies by it in this slice.
    expect(classifyNodeTaskCost(actionNode("native", "http_request")).perItemTasks).toBeUndefined();
  });
});
