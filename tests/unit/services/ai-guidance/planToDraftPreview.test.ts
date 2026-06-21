/**
 * @jest-environment node
 *
 * Deterministic plan → draft preview conversion (HERMES-AGENT-DRAFT-PREVIEW).
 * Proves planToDraftPreview turns a validated WorkflowPlan into an EPHEMERAL, non-applied preview:
 * preview-only ids, notApplied on preview+nodes+edges, labels carried straight from the plan, missing
 * field-keys surfaced as warnings/missingInputs (never executable config), linear sequence edges, and
 * null for unconvertible plans. Static scan: the module imports no repo/builder-store/DB/secret path.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { planToDraftPreview } from "@/services/ai-guidance/preview/planToDraftPreview";
import { DRAFT_PREVIEW_NOTICE } from "@/contracts/workflowPlanPreview";
import type { WorkflowPlan, WorkflowPlanStep } from "@/contracts/guidanceSession";

function plan(steps: WorkflowPlanStep[], extra: Partial<WorkflowPlan> = {}): WorkflowPlan {
  return { schemaVersion: 1, title: "Lead follow-up", summary: "Watch then notify.", steps, notApplied: true, ...extra };
}

describe("planToDraftPreview — happy path", () => {
  const out = planToDraftPreview(
    plan([
      { ref: "s0", role: "trigger", provider: "gmail", type: "new_email", purpose: "watch inbox" },
      { ref: "s1", role: "action", provider: "slack", type: "send_message", purpose: "notify" },
    ]),
  )!;

  it("returns a preview stamped notApplied (preview + every node + every edge)", () => {
    expect(out).not.toBeNull();
    expect(out.notApplied).toBe(true);
    expect(out.nodes.every((n) => n.notApplied === true)).toBe(true);
    expect(out.edges.every((e) => e.notApplied === true)).toBe(true);
  });

  it("uses PREVIEW-ONLY ids (preview-step-N / preview-edge-N), never real/db ids", () => {
    expect(out.nodes.map((n) => n.previewId)).toEqual(["preview-step-1", "preview-step-2"]);
    expect(out.edges.map((e) => e.previewId)).toEqual(["preview-edge-1"]);
    expect(out.edges[0]).toMatchObject({ fromPreviewId: "preview-step-1", toPreviewId: "preview-step-2" });
  });

  it("carries provider/type LABELS straight from the validated plan", () => {
    expect(out.nodes[0]).toMatchObject({ role: "trigger", provider: "gmail", type: "new_email", label: "gmail:new_email" });
    expect(out.nodes[1]).toMatchObject({ role: "action", provider: "slack", type: "send_message", label: "slack:send_message" });
  });

  it("carries the plan title/summary and the fixed review notice", () => {
    expect(out.title).toBe("Lead follow-up");
    expect(out.summary).toBe("Watch then notify.");
    expect(out.notice).toBe(DRAFT_PREVIEW_NOTICE);
    expect(out.notice).toBe("Preview only — your workflow has not changed.");
  });

  it("builds a linear sequence: N steps → N-1 edges in order", () => {
    const three = planToDraftPreview(
      plan([
        { ref: "s0", role: "trigger", provider: "gmail", type: "new_email", purpose: "a" },
        { ref: "s1", role: "logic", provider: "", type: "filter", purpose: "b" },
        { ref: "s2", role: "action", provider: "slack", type: "send_message", purpose: "c" },
      ]),
    )!;
    expect(three.nodes).toHaveLength(3);
    expect(three.edges).toHaveLength(2);
  });
});

describe("planToDraftPreview — missing info → warnings, never config", () => {
  const out = planToDraftPreview(
    plan([
      { ref: "s0", role: "action", provider: "slack", type: "send_message", purpose: "notify", requiredInputs: ["channel", "text"] },
    ]),
  )!;

  it("surfaces required field KEYS as node.missingInputs + a readable warning", () => {
    expect(out.nodes[0]!.missingInputs).toEqual(["channel", "text"]);
    expect(out.warnings).toContain("Step 1 (slack:send_message) still needs: channel, text");
  });

  it("never emits executable config / values / credentials in the preview", () => {
    const s = JSON.stringify(out);
    for (const needle of ["config", "value", "token", "secret", "credential", "accountId", "draftDefinition"]) {
      expect(s).not.toContain(needle);
    }
  });
});

describe("planToDraftPreview — unconvertible → null", () => {
  it("returns null for an empty plan / missing steps / null", () => {
    expect(planToDraftPreview(plan([]))).toBeNull();
    expect(planToDraftPreview(null)).toBeNull();
    expect(planToDraftPreview(undefined)).toBeNull();
    expect(planToDraftPreview({ schemaVersion: 1, title: "", summary: "", notApplied: true } as unknown as WorkflowPlan)).toBeNull();
  });
});

describe("planToDraftPreview — no persistence/mutation surface (static)", () => {
  it("the module imports no repository / builder store / DB / mutation path", () => {
    const src = readFileSync(resolve(process.cwd(), "services/ai-guidance/preview/planToDraftPreview.ts"), "utf8");
    for (const pat of [
      /@\/repositories\//,
      /createClient|supabase/i,
      /draftDefinition|saveDraft|updateWorkflow|applyWorkflowPatch|createWorkflow|deleteWorkflow|activateWorkflow/,
      /useGraphSlice|graphSlice|builder.*store/i,
      /nousresearch|api\.openai\.com|hermesAgentGatewayClient/i,
    ]) {
      expect({ pat: String(pat), matched: pat.test(src) }).toEqual({ pat: String(pat), matched: false });
    }
  });
});
