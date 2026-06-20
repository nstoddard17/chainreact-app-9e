/**
 * @jest-environment node
 *
 * REACT-AGENT-CS-7E — LIVE smoke of the React Agent repair proposal/apply audit trail
 * against the V2 Supabase project.
 *
 * Drives the REAL `runAuthorizedCapability` seam + the REAL live `reactAgentAuditRecorder`
 * (service-role insert into `react_agent_audit_events`) + the REAL deterministic patch
 * pipeline (`assessApplyReadiness` / `executeWorkflowPatch`) + the REAL `repairPatchRef`,
 * then reads the rows back service-role and asserts:
 *   1. repair PROPOSAL success row (proposes_change, proposed_patch_ref non-null).
 *   2. approved APPLY success row (requires_approval, credit_feature null, ref MATCHES the
 *      proposal row) + the workflow draft actually changes + NO state deactivation + NO
 *      ai_cost_events row (apply makes no model call).
 *   3. STALE apply → failed row (optimistic revision guard).
 *   4. BLOCKED/not-applyable apply → failed row.
 *   5. no raw patch/config/model text in any audit metadata.
 *
 * What is NOT exercised here (and why): the HTTP route + its SSR-cookie-gated persistence
 * (`updateDraftDefinitionIfRevisionMatches`) and the OpenAI model call — both require a
 * browser/cookie session or a paid non-deterministic model call, neither of which is the
 * subject of CS-7's audit governance. The route wiring + mapping are covered by the CS-7d
 * unit tests; here we reproduce the apply persistence with the SAME pure executor + an
 * optimistic service-role write (mirrors the repo's `(id, account_id, updated_at)` guard).
 *
 * DESTRUCTIVE + OPT-IN: creates a throwaway user + smoke workflow + audit rows, all cleaned
 * up in afterAll. Set ALLOW_DB_INTEGRATION_TESTS=true with the URL + anon + service keys.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { reactAgentService } from "@/services/ai/reactAgent";
import { reactAgentAuditRecorder } from "@/services/ai/reactAgent/audit";
import { repairPatchRef } from "@/services/ai/repair/repairPatchRef";
import { assessApplyReadiness } from "@/services/workflows/patch/applySafety";
import { executeWorkflowPatch } from "@/services/workflows/patch/executeWorkflowPatch";
import { resolveFieldSensitivity } from "@/services/workflows/patch/resolveFieldSensitivity";
import type { PatchOperation } from "@/services/workflows/patch/types";
import type { WorkflowDefinition } from "@/contracts/workflow";

function loadEnvLocal(): void {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    if (process.env[key]) continue;
    let v = m[2]!.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[key] = v;
  }
}
loadEnvLocal();

const ALLOW = process.env.ALLOW_DB_INTEGRATION_TESTS === "true";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RUN = ALLOW && !!URL && !!SERVICE_KEY;
const describeDb = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP react-agent repair apply audit smoke — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.",
  );
}

interface AuditRow {
  id: string;
  account_id: string | null;
  actor_user_id: string | null;
  workflow_id: string | null;
  capability_id: string;
  intent: string;
  mode: string;
  credit_feature: string | null;
  audit_kind: string;
  outcome: string;
  reason: string | null;
  proposed_patch_ref: string | null;
  metadata: Record<string, unknown>;
}

describeDb("REACT-AGENT-CS-7E — repair proposal/apply audit live smoke", () => {
  let admin: SupabaseClient;
  let userId = "";
  let accountId = "";
  let workflowId = "";
  let startRev = "";
  let startState = "";
  const insertedAuditIds: string[] = [];

  // The SAME applyable operations for proposal + apply, so the refs MUST correlate.
  const NODE_ID = "smoke-node-1";
  const SMOKE_OPS: PatchOperation[] = [{ op: "moveNode", nodeId: NODE_ID, position: { x: 123, y: 456 } }];
  let smokeDef: WorkflowDefinition;
  let expectedRef: string;

  async function readAudit(auditKind: string): Promise<AuditRow[]> {
    const { data, error } = await admin
      .from("react_agent_audit_events")
      .select("*")
      .eq("account_id", accountId)
      .eq("audit_kind", auditKind)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`readAudit: ${error.message}`);
    for (const r of (data ?? []) as AuditRow[]) if (!insertedAuditIds.includes(r.id)) insertedAuditIds.push(r.id);
    return (data ?? []) as AuditRow[];
  }

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const slug = `cs7e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { data: u, error: uErr } = await admin.auth.admin.createUser({
      email: `react-agent-cs7e-${slug}@chainreact.test`,
      password: `Pw-${slug}!`,
      email_confirm: true,
    });
    if (uErr || !u.user) throw new Error(`createUser: ${uErr?.message ?? "no user"}`);
    userId = u.user.id;

    const { data: acct, error: aErr } = await admin
      .from("accounts").select("id").eq("type", "personal").eq("owner_user_id", userId).single<{ id: string }>();
    if (aErr || !acct) throw new Error(`personal account: ${aErr?.message ?? "none"}`);
    accountId = acct.id;

    smokeDef = {
      nodes: [{ id: NODE_ID, kind: "action", provider: "core", type: "noop", config: {}, position: { x: 0, y: 0 } }],
      edges: [],
    } as unknown as WorkflowDefinition;

    const { data: wf, error: wErr } = await admin
      .from("workflows")
      .insert({ account_id: accountId, created_by_user_id: userId, name: "CS-7E smoke", draft_definition: smokeDef })
      .select("id, updated_at, state")
      .single<{ id: string; updated_at: string; state: string }>();
    if (wErr || !wf) throw new Error(`create workflow: ${wErr?.message ?? "none"}`);
    workflowId = wf.id;
    startRev = wf.updated_at;
    startState = wf.state;

    expectedRef = repairPatchRef({ workflowId, baseRevision: startRev, operations: SMOKE_OPS })!;
  });

  afterAll(async () => {
    if (!admin) return;
    if (insertedAuditIds.length) await admin.from("react_agent_audit_events").delete().in("id", insertedAuditIds);
    if (accountId) await admin.from("react_agent_audit_events").delete().eq("account_id", accountId); // sweep
    if (workflowId) await admin.from("workflows").delete().eq("id", workflowId);
    if (accountId) {
      await admin.from("ai_cost_events").delete().eq("account_id", accountId);
      await admin.from("account_billing").delete().eq("account_id", accountId);
      await admin.from("account_memberships").delete().eq("account_id", accountId);
      await admin.from("accounts").delete().eq("id", accountId);
    }
    if (userId) {
      await admin.from("user_profiles").delete().eq("id", userId);
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) console.warn(`cleanup user ${userId}: ${error.message}`);
    }
  });

  function expectNoLeak(row: AuditRow): void {
    // The seam attaches NO metadata; the ref is a one-way hash.
    expect(row.metadata).toEqual({});
    const s = JSON.stringify(row);
    for (const needle of ["moveNode", "removeNode", "position", "123", "456", NODE_ID]) {
      expect(s).not.toContain(needle);
    }
  }

  it("1. repair PROPOSAL success → react_agent.repair_proposal row (proposes_change, ref non-null)", async () => {
    await reactAgentService.runAuthorizedCapability({
      scope: { userId, accountId, workflowId },
      intent: "propose_repair",
      capabilityId: "repair_proposal",
      auditRecorder: reactAgentAuditRecorder,
      classifyResult: (r: { ok: boolean }) => (r.ok ? "success" : "failed"),
      deriveProposedPatchRef: (r: { ok: boolean; preview: { workflowId: string; apply: { applyable: boolean; operations: PatchOperation[]; baseRevision: string } } }) =>
        r.ok && r.preview.apply.applyable
          ? repairPatchRef({ workflowId: r.preview.workflowId, baseRevision: r.preview.apply.baseRevision, operations: r.preview.apply.operations })
          : null,
      // Stubbed applyable-preview result (no model call — model is out of audit scope).
      exec: async () => ({
        ok: true,
        preview: { ok: true, workflowId, apply: { applyable: true, operations: SMOKE_OPS, baseRevision: startRev } },
        model: { modelId: "smoke", tier: "fast" },
      }),
    });

    const rows = await readAudit("react_agent.repair_proposal");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      account_id: accountId, actor_user_id: userId, workflow_id: workflowId,
      capability_id: "repair_proposal", intent: "propose_repair", mode: "proposes_change",
      outcome: "success",
    });
    expect(rows[0]!.proposed_patch_ref).toBe(expectedRef);
    expect(rows[0]!.proposed_patch_ref).toMatch(/^repair_patch_sha256:[0-9a-f]{64}$/);
    expectNoLeak(rows[0]!);
  });

  it("2. approved APPLY success → react_agent.repair_apply row; draft mutates; no deactivation; no cost event", async () => {
    // Run the REAL deterministic apply pipeline as the seam exec, persisting via an
    // optimistic service-role write that mirrors updateDraftDefinitionIfRevisionMatches.
    const exec = async () => {
      const fieldSensitivity = resolveFieldSensitivity(SMOKE_OPS, smokeDef.nodes);
      const readiness = assessApplyReadiness({
        operations: SMOKE_OPS,
        validation: { ok: true, requiresConfirmation: false },
        baseRevision: startRev, previewRevision: startRev, currentRevision: startRev,
        workflowActive: startState === "active",
        currentNodeIds: smokeDef.nodes.map((n) => n.id),
        fieldSensitivity,
      });
      if (!readiness.applyable) return { ok: false as const, code: "NOT_APPLYABLE" as const, blockedCategories: readiness.blockedCategories };
      const executed = executeWorkflowPatch(smokeDef, SMOKE_OPS, readiness, { fieldSensitivity });
      if (!executed.ok) return { ok: false as const, code: "EXECUTION_FAILED" as const };
      const { data: updated } = await admin
        .from("workflows").update({ draft_definition: executed.updatedDefinition })
        .eq("id", workflowId).eq("account_id", accountId).eq("updated_at", startRev)
        .select("updated_at").maybeSingle<{ updated_at: string }>();
      if (!updated) return { ok: false as const, code: "STALE_PATCH" as const };
      return { ok: true as const, currentRevision: updated.updated_at, appliedOperations: executed.appliedOperations };
    };

    await reactAgentService.runAuthorizedCapability({
      scope: { userId, accountId, workflowId },
      intent: "apply_repair",
      capabilityId: "repair_apply",
      auditRecorder: reactAgentAuditRecorder,
      classifyResult: (r: { ok: boolean }) => (r.ok ? "success" : "failed"),
      deriveProposedPatchRef: () => expectedRef,
      exec,
    });

    const rows = await readAudit("react_agent.repair_apply");
    const success = rows.find((r) => r.outcome === "success");
    expect(success).toBeDefined();
    expect(success!).toMatchObject({
      account_id: accountId, actor_user_id: userId, workflow_id: workflowId,
      capability_id: "repair_apply", intent: "apply_repair", mode: "requires_approval",
      credit_feature: null, outcome: "success",
    });
    // proposed_patch_ref on the APPLY row MATCHES the PROPOSAL row's (same patch identity).
    expect(success!.proposed_patch_ref).toBe(expectedRef);
    expectNoLeak(success!);

    // Draft actually mutated (node moved) + NO deactivation (state unchanged) + revision bumped.
    const { data: wf } = await admin
      .from("workflows").select("draft_definition, state, updated_at").eq("id", workflowId).single<{ draft_definition: WorkflowDefinition; state: string; updated_at: string }>();
    const movedNode = (wf!.draft_definition.nodes as Array<{ id: string; position: { x: number; y: number } }>).find((n) => n.id === NODE_ID);
    expect(movedNode!.position).toEqual({ x: 123, y: 456 });
    expect(wf!.state).toBe(startState); // no lifecycle deactivation
    expect(wf!.updated_at).not.toBe(startRev);

    // Apply made NO model call → NO ai_cost_events row for this workflow.
    const { data: costRows } = await admin.from("ai_cost_events").select("id").eq("workflow_id", workflowId);
    expect(costRows ?? []).toHaveLength(0);
  });

  it("3. STALE apply (old revision) → react_agent.repair_apply failed row; draft unchanged", async () => {
    const exec = async () => {
      // Optimistic write against the now-stale startRev → matches no row → STALE_PATCH.
      const { data: updated } = await admin
        .from("workflows").update({ draft_definition: { ...smokeDef, nodes: [] } })
        .eq("id", workflowId).eq("account_id", accountId).eq("updated_at", startRev)
        .select("updated_at").maybeSingle<{ updated_at: string }>();
      if (!updated) return { ok: false as const, code: "STALE_PATCH" as const };
      return { ok: true as const, currentRevision: updated.updated_at, appliedOperations: [] };
    };
    await reactAgentService.runAuthorizedCapability({
      scope: { userId, accountId, workflowId },
      intent: "apply_repair", capabilityId: "repair_apply",
      auditRecorder: reactAgentAuditRecorder,
      classifyResult: (r: { ok: boolean }) => (r.ok ? "success" : "failed"),
      deriveProposedPatchRef: () => expectedRef,
      exec,
    });

    const failed = (await readAudit("react_agent.repair_apply")).filter((r) => r.outcome === "failed");
    expect(failed.length).toBeGreaterThanOrEqual(1);
    expect(failed[failed.length - 1]).toMatchObject({ capability_id: "repair_apply", mode: "requires_approval", outcome: "failed" });
    expect(failed[failed.length - 1]!.reason).toBeTruthy(); // safe enum reason, never raw
    expectNoLeak(failed[failed.length - 1]!);

    // The stale attempt did NOT mutate the draft (node still at the applied position).
    const { data: wf } = await admin.from("workflows").select("draft_definition").eq("id", workflowId).single<{ draft_definition: WorkflowDefinition }>();
    expect((wf!.draft_definition.nodes as unknown[]).length).toBe(1);
  });

  it("4. BLOCKED/not-applyable apply (removeNode) → react_agent.repair_apply failed row (no write attempted)", async () => {
    const blockedOps: PatchOperation[] = [{ op: "removeNode", nodeId: NODE_ID }];
    const exec = async () => {
      const fieldSensitivity = resolveFieldSensitivity(blockedOps, smokeDef.nodes);
      const readiness = assessApplyReadiness({
        operations: blockedOps,
        validation: { ok: true, requiresConfirmation: false },
        baseRevision: startRev, previewRevision: startRev, currentRevision: startRev,
        workflowActive: false, currentNodeIds: [NODE_ID], fieldSensitivity,
      });
      // removeNode is apply-BLOCKED (DESTRUCTIVE_DELETION) → not applyable, no write.
      if (!readiness.applyable) return { ok: false as const, code: "NOT_APPLYABLE" as const, blockedCategories: readiness.blockedCategories };
      return { ok: true as const, currentRevision: startRev, appliedOperations: [] };
    };
    await reactAgentService.runAuthorizedCapability({
      scope: { userId, accountId, workflowId },
      intent: "apply_repair", capabilityId: "repair_apply",
      auditRecorder: reactAgentAuditRecorder,
      classifyResult: (r: { ok: boolean }) => (r.ok ? "success" : "failed"),
      deriveProposedPatchRef: () => repairPatchRef({ workflowId, baseRevision: startRev, operations: blockedOps }),
      exec,
    });
    const failed = (await readAudit("react_agent.repair_apply")).filter((r) => r.outcome === "failed");
    expect(failed.length).toBeGreaterThanOrEqual(2); // stale (test 3) + blocked (this)
    expectNoLeak(failed[failed.length - 1]!);
  });
});
