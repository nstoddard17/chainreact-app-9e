/**
 * @jest-environment node
 */
import {
  startMockHermesServer,
  selectFixture,
  fixtureBody,
  MOCK_HERMES_DEFAULT_PORT,
} from "../../e2e/helpers/mockHermesServer";
import { normalizeGatewayResponse } from "@/services/ai-guidance/gateway/gatewayResponseContract";

/**
 * 5.DUAL-BUILDER-1 CS-7F — the loopback mock-Hermes boundary used by the Ask React
 * live journey. These prove the mock is safe and that its responses pass the REAL
 * app response parser (normalizeGatewayResponse + validateWorkflowPlan) — so the
 * live journey exercises real parsing, not a bypass.
 */
describe("CS-7F mock Hermes gateway", () => {
  describe("selectFixture (deterministic, keyword-based)", () => {
    it("routes add/notification prompts to the additive fixture", () => {
      expect(selectFixture("Add a Slack notification after the lead is qualified")).toBe("additive");
    });
    it("routes change/follow-up prompts to the edit fixture", () => {
      expect(selectFixture("Change the notification message and add a follow-up step")).toBe("edit");
    });
    it("routes remove/delete prompts to the destructive fixture", () => {
      expect(selectFixture("Remove the existing follow-up step")).toBe("destructive");
    });
    it("routes split/branch prompts to the branching fixture", () => {
      expect(selectFixture("Split this workflow based on whether the amount is above 1000")).toBe("branching");
    });
    it("falls back to prose for an unrecognized prompt", () => {
      expect(selectFixture("hello there")).toBe("prose");
    });
    it("matches ONLY the user-goal line, not the surrounding system prompt", () => {
      // The system prompt legitimately contains 'remove'/'delete' edit-instruction keywords;
      // the goal line is 'Add ...', so it must route to additive — never destructive.
      const prompt = [
        "You can removeEdge / replaceEdge / removeNode as needed.",
        "User goal (their words): Add a Slack notification when a lead is created",
      ].join("\n");
      expect(selectFixture(prompt)).toBe("additive");
    });
    it("ambiguity safety: an ambiguous ask never falls through to the destructive fixture", () => {
      // No remove/delete/split marker → additive default, never destructive.
      expect(selectFixture("User goal (their words): help me with my workflow")).not.toBe("destructive");
      expect(selectFixture("User goal (their words): do something useful")).toBe("additive");
    });
  });

  describe("fixtures pass the REAL response parser", () => {
    it("additive → capability-validated WorkflowPlan skeleton (trigger + action)", () => {
      const n = normalizeGatewayResponse(fixtureBody("additive"));
      expect(n.ok).toBe(true);
      if (!n.ok) throw new Error("expected ok");
      expect(n.workflowPlan).not.toBeNull();
      expect(n.workflowPlan!.notApplied).toBe(true);
      expect(n.workflowPlan!.steps.length).toBe(2);
    });
    it("edit → updateNodeConfig(node_2.text) + addNode(new_ ref) + addEdge to the new_ ref", () => {
      const n = normalizeGatewayResponse(fixtureBody("edit"));
      expect(n.ok).toBe(true);
      if (!n.ok) throw new Error("expected ok");
      const ops = n.mutationOperations!;
      const update = ops.find((o) => o.op === "updateNodeConfig");
      expect(update).toBeTruthy();
      // Targets the notification's REAL editable field (text), not a phantom field.
      expect((update as { nodeId: string }).nodeId).toBe("node_2");
      expect(Object.keys((update as { config: Record<string, unknown> }).config)).toContain("text");
      // The added node MUST use the new_ ref prefix, else resolveEditableGraphRefs rejects it.
      const add = ops.find((o) => o.op === "addNode") as { node: { id: string } } | undefined;
      expect(add?.node.id.startsWith("new_")).toBe(true);
      // The addEdge endpoint references that same new_ ref (materialize re-mints it).
      const edge = ops.find((o) => o.op === "addEdge") as { edge: { to: string } } | undefined;
      expect(edge?.edge.to).toBe(add?.node.id);
    });
    it("destructive → removeNode(node_4 — the removable follow-up tail)", () => {
      const n = normalizeGatewayResponse(fixtureBody("destructive"));
      expect(n.ok).toBe(true);
      if (!n.ok) throw new Error("expected ok");
      const remove = n.mutationOperations!.find((o) => o.op === "removeNode") as
        | { nodeId: string }
        | undefined;
      expect(remove?.nodeId).toBe("node_4");
    });
    it("branching → a WorkflowPlan that uses advanced branching (native:if_then_condition)", () => {
      const n = normalizeGatewayResponse(fixtureBody("branching"));
      expect(n.ok).toBe(true);
      if (!n.ok) throw new Error("expected ok");
      // The plan must survive the REAL validateWorkflowPlan (non-null) and carry the branch step.
      expect(n.workflowPlan).not.toBeNull();
      expect(
        n.workflowPlan!.steps.some((s) => `${s.provider}:${s.type}` === "native:if_then_condition"),
      ).toBe(true);
    });
    it("prose fixture has NO plan/mutation (safe default)", () => {
      const n = normalizeGatewayResponse(fixtureBody("prose"));
      expect(n.ok).toBe(true);
      if (!n.ok) throw new Error("expected ok");
      expect(n.workflowPlan).toBeNull();
      expect(n.mutationOperations).toBeFalsy();
    });
  });

  describe("server lifecycle + safety", () => {
    it("binds to loopback, serves /health, answers guidance, and closes", async () => {
      const port = MOCK_HERMES_DEFAULT_PORT + 5; // avoid the fixed e2e port
      const handle = await startMockHermesServer({ port });
      try {
        expect(handle.baseUrl).toBe(`http://127.0.0.1:${port}`);

        const health = await fetch(`${handle.baseUrl}/health`);
        expect(health.status).toBe(200);
        expect((await health.json()).ok).toBe(true);

        const res = await fetch(`${handle.baseUrl}/api/hermes-agent/guidance`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt: "Add a notification" }),
        });
        expect(res.status).toBe(200);
        // The response is parseable by the REAL contract into a validated plan.
        const n = normalizeGatewayResponse(await res.json());
        expect(n.ok).toBe(true);
        if (!n.ok) throw new Error("expected ok");
        expect(n.workflowPlan).not.toBeNull();

        // Bounded diagnostics record the fixture NAME + counts — never the prompt.
        expect(handle.calls.total).toBe(1);
        expect(handle.calls.lastFixture).toBe("additive");
        expect(JSON.stringify(handle.calls)).not.toContain("notification");

        // Unknown route → 404 (fails clearly, no fixture leak).
        const notFound = await fetch(`${handle.baseUrl}/nope`);
        expect(notFound.status).toBe(404);
      } finally {
        await handle.close();
      }
      // After close the port is free (fail-closed: a later call would connect-refuse).
      await expect(fetch(`http://127.0.0.1:${port}/health`)).rejects.toBeTruthy();
    });
  });
});
