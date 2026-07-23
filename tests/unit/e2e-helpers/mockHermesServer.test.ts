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
    it("falls back to prose for an unrecognized prompt", () => {
      expect(selectFixture("hello there")).toBe("prose");
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
    it("edit → updateNodeConfig + addNode operations", () => {
      const n = normalizeGatewayResponse(fixtureBody("edit"));
      expect(n.ok).toBe(true);
      if (!n.ok) throw new Error("expected ok");
      expect(n.mutationOperations!.some((o) => o.op === "updateNodeConfig")).toBe(true);
      expect(n.mutationOperations!.some((o) => o.op === "addNode")).toBe(true);
    });
    it("destructive → removeNode operation", () => {
      const n = normalizeGatewayResponse(fixtureBody("destructive"));
      expect(n.ok).toBe(true);
      if (!n.ok) throw new Error("expected ok");
      expect(n.mutationOperations!.some((o) => o.op === "removeNode")).toBe(true);
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
