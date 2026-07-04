/**
 * One-off LIVE trigger certification for typeform:new_response_in_form (2026-07-04).
 *
 * Exercises the REAL provider-side lifecycle the direct-seed dev smoke explicitly
 * leaves uncovered: real typeform:forms resolver -> registerWorkflowTriggers ->
 * PUT /forms/{id}/webhooks/{tag} (real Typeform, V2-minted secret, NO event_types
 * in the body — the documented ambiguity under test) -> a REAL response submitted
 * to the live form -> production https://chainreact.app receive route verifies
 * Typeform-Signature -> dispatch -> production cron drains -> terminal run ->
 * unregisterWorkflowTriggers -> DELETE proven by a second delete reading 404.
 *
 * Prints statuses, ids, and form titles only — never tokens or hook secrets.
 *
 * Phased so the real response can be submitted between activate and await-run:
 *   npx tsx scripts/trash/typeform-live-cert.ts list-forms
 *   npx tsx scripts/trash/typeform-live-cert.ts activate <formId>
 *   npx tsx scripts/trash/typeform-live-cert.ts await-run
 *   npx tsx scripts/trash/typeform-live-cert.ts deactivate
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(): void {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const l of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const k = m[1]!;
    if (process.env[k]) continue;
    let v = m[2]!.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}
loadEnv();

const STATE_FILE = resolve(process.cwd(), "scripts/trash/typeform-live-cert-state.json");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface CertState {
  workflowId: string;
  triggerNodeId: string;
  formId: string;
  webhookTag: string | null;
  webhookId: string | null;
  notificationUrl: string | null;
  runId?: string | null;
  eventId?: string | null;
}

function readState(): CertState {
  return JSON.parse(readFileSync(STATE_FILE, "utf8")) as CertState;
}

(async () => {
  const phase = process.argv[2];
  if (!phase) throw new Error("usage: typeform-live-cert.ts <list-forms|activate <formId>|await-run|deactivate>");

  const { createClient } = await import("@supabase/supabase-js");
  const { getActiveForExecution } = await import("@/repositories/integrations");
  const { refreshAndRetry } = await import("@/services/oauth/refreshAndRetry");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const accountId = process.env.SMOKE_ACCOUNT_ID!;
  const userId = process.env.SMOKE_USER_ID!;
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const integration = await getActiveForExecution(accountId, "typeform", null, { connectedByUserId: userId });
  if (!integration) throw new Error("no active typeform integration under the smoke identity");

  const typeformCall = <T>(apiCall: (accessToken: string) => Promise<T>): Promise<T> =>
    refreshAndRetry({
      accountId: integration.accountId,
      provider: "typeform",
      providerAccountId: integration.providerAccountId,
      apiCall,
    });

  // ── Phase: list-forms — LIVE option-source cert via the REAL resolver ──
  if (phase === "list-forms") {
    const { typeformFormsResolver } = await import("@/integrations/typeform/options/forms");
    const ctx = { integration, deps: {}, q: "" } as never;
    const result = await typeformFormsResolver.resolve(ctx);
    console.log(`typeform:forms resolver returned ${result.items.length} item(s), hasMore=${result.hasMore}`);
    for (const item of result.items) console.log(`  - value=${item.value} label="${item.label}"`);

    // Search pass-through check (server-side `search` + local filter).
    if (result.items.length > 0) {
      const firstLabel = result.items[0]!.label;
      const q = firstLabel.slice(0, Math.min(4, firstLabel.length));
      const searched = await typeformFormsResolver.resolve({ integration, deps: {}, q } as never);
      console.log(`search q="${q}" -> ${searched.items.length} item(s): ${searched.items.map((i) => i.label).join(", ")}`);
    }

    // Public display link for the response-submission step (console only).
    const { typeformRequest } = await import("@/integrations/_shared/typeform/api/_request");
    for (const item of result.items) {
      const form = await typeformCall((accessToken) =>
        typeformRequest<{ id?: string; _links?: { display?: string } }>({
          accessToken,
          method: "GET",
          path: `/forms/${encodeURIComponent(String(item.value))}`,
          resourceForNotFound: `form ${String(item.value)}`,
        }),
      );
      console.log(`  display url for ${item.value}: ${form._links?.display ?? "(none)"}`);
    }
    return;
  }

  // ── Phase: activate — real workflow + REAL PUT webhook (no event_types) ──
  if (phase === "activate") {
    const formId = process.argv[3];
    if (!formId) throw new Error("usage: activate <formId>");
    const { buildTypeformSmokeWorkflow } = await import("@/tests/trigger-smoke/typeformWebhookSmoke");
    const { registerWorkflowTriggers } = await import("@/services/triggers/lifecycle");
    const workflowsRepo = await import("@/repositories/workflows");
    const triggerResourcesRepo = await import("@/repositories/triggerResources");

    const wf = buildTypeformSmokeWorkflow(formId);
    const { data: wfRow, error: wfErr } = await supabase
      .from("workflows")
      .insert({
        account_id: accountId,
        created_by_user_id: userId,
        name: "crsmoke-live-typeform-new_response_in_form",
        state: "active",
        draft_definition: wf.definition,
      })
      .select("id")
      .single<{ id: string }>();
    if (wfErr || !wfRow) throw new Error(`workflow insert failed: ${wfErr?.message}`);
    const workflowId = wfRow.id;
    console.log(`workflow ${workflowId} created (active)`);

    const record = await workflowsRepo.getByIdServiceRole(workflowId);
    if (!record) throw new Error("workflow record read-back failed");

    // REAL activation: PUT /forms/{id}/webhooks/{tag} with V2-minted secret,
    // body WITHOUT event_types (the documented ambiguity under live test).
    const t0 = Date.now();
    await registerWorkflowTriggers(record);
    const row = await triggerResourcesRepo.findByWorkflowAndNode(workflowId, wf.triggerNodeId);
    const cfg = (row?.config ?? {}) as Record<string, unknown>;
    console.log(
      `activated in ${Date.now() - t0}ms: webhookId=${cfg.webhookId} tag=${cfg.webhookTag} ` +
        `enabled=${cfg.webhookEnabled} secretStored=${typeof cfg.hookSecretEncrypted === "string" && (cfg.hookSecretEncrypted as string).length > 0} ` +
        `url=${cfg.notificationUrl}`,
    );
    if (typeof cfg.webhookId !== "string" || typeof cfg.webhookTag !== "string") {
      throw new Error("activation did not persist webhookId/webhookTag");
    }
    console.log("event_types OMITTED from the PUT body and the live PUT succeeded (ambiguity resolved: optional).");

    writeFileSync(
      STATE_FILE,
      JSON.stringify(
        {
          workflowId,
          triggerNodeId: wf.triggerNodeId,
          formId,
          webhookTag: cfg.webhookTag,
          webhookId: cfg.webhookId,
          notificationUrl: cfg.notificationUrl,
        },
        null,
        2,
      ),
    );
    console.log("state written. Now submit a REAL response to the form, then run await-run.");
    return;
  }

  // ── Phase: await-run — production receive -> dispatch -> drain -> terminal ──
  if (phase === "await-run") {
    const state = readState();
    const { listByWorkflowServiceRole, getByIdServiceRole } = await import("@/repositories/workflowRunsDiagnostics");

    const deadline = Date.now() + 240_000;
    let runs: Awaited<ReturnType<typeof listByWorkflowServiceRole>> = [];
    while (Date.now() < deadline) {
      runs = await listByWorkflowServiceRole(state.workflowId, { includeRunning: true, limit: 50 });
      if (runs.length >= 1) break;
      await sleep(5000);
    }
    if (runs.length === 0) throw new Error("no run within 240s of the real response");
    const run = runs[0]!;
    console.log(`run ${run.id} appeared (status=${run.status}) eventId=${run.triggerEvent?.eventId}`);

    const payload = (run.triggerEvent?.payload ?? {}) as Record<string, unknown>;
    const checks: Array<[string, boolean]> = [
      ["eventType=new_response_in_form", run.triggerEvent?.eventType === "new_response_in_form"],
      ["payload.formId matches", payload.formId === state.formId],
      ["payload.changeKind", payload.changeKind === "new_response_in_form"],
      ["responseToken present", typeof payload.responseToken === "string" && (payload.responseToken as string).length > 0],
      ["answers is array", Array.isArray(payload.answers)],
      ["response_url NOT in payload", !JSON.stringify(payload).includes("response_url") && !("responseUrl" in payload)],
      ["eventId token-scoped (no timestamp)", run.triggerEvent?.eventId === `new_response_in_form:${state.formId}:${String(payload.responseToken)}`],
    ];
    for (const [label, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
    console.log(`answers projection: ${JSON.stringify(payload.answers)}`);
    console.log(`hidden: ${JSON.stringify(payload.hidden)} score: ${JSON.stringify(payload.score)} formTitle: ${JSON.stringify(payload.formTitle)}`);

    // Terminal via PRODUCTION's cron drain.
    const terminalDeadline = Date.now() + 240_000;
    let runStatus: string | null = null;
    while (Date.now() < terminalDeadline) {
      const rec = await getByIdServiceRole(run.id);
      runStatus = rec?.status ?? null;
      if (runStatus === "succeeded" || runStatus === "failed") break;
      await sleep(10_000);
    }
    console.log(`terminal status=${runStatus}`);

    const finalRuns = await listByWorkflowServiceRole(state.workflowId, { includeRunning: true, limit: 50 });
    console.log(`run count=${finalRuns.length} (expected exactly 1)`);

    writeFileSync(
      STATE_FILE,
      JSON.stringify({ ...state, runId: run.id, eventId: run.triggerEvent?.eventId ?? null }, null, 2),
    );
    if (checks.some(([, ok]) => !ok)) throw new Error("identity/shape checks failed (see above)");
    if (runStatus !== "succeeded") throw new Error(`run did not reach 'succeeded' (got ${runStatus})`);
    if (finalRuns.length !== 1) throw new Error(`expected exactly 1 run, got ${finalRuns.length}`);
    console.log("AWAIT-RUN PASSED");
    return;
  }

  // ── Phase: deactivate — real DELETE + 404 proof + cleanup ──
  if (phase === "deactivate") {
    const state = readState();
    const { unregisterWorkflowTriggers } = await import("@/services/triggers/lifecycle");
    const workflowsRepo = await import("@/repositories/workflows");
    const triggerResourcesRepo = await import("@/repositories/triggerResources");
    const { webhookDelete } = await import("@/integrations/_shared/typeform/api/webhooks");
    const { NotFoundError } = await import("@/integrations/_shared/typeform/errors");

    const record = await workflowsRepo.getByIdServiceRole(state.workflowId);
    if (!record) throw new Error("workflow record read-back failed");

    await unregisterWorkflowTriggers(record);
    const left = await triggerResourcesRepo.listByWorkflow(state.workflowId);
    console.log(`deactivated; trigger_resources rows left=${left.length}`);

    // Provider-side gone-proof: a second DELETE must read 404.
    let webhookDeleted = false;
    if (state.webhookTag) {
      try {
        await typeformCall((accessToken) =>
          webhookDelete({ accessToken, formId: state.formId, tag: state.webhookTag! }),
        );
        console.log(`FAIL: webhook tag=${state.webhookTag} still existed (second delete succeeded)`);
      } catch (err) {
        if (err instanceof NotFoundError) {
          webhookDeleted = true;
          console.log(`webhook tag=${state.webhookTag} confirmed gone (second delete -> 404)`);
        } else {
          console.log(`webhook-gone probe errored: ${(err as Error).message}`);
        }
      }
    }

    // Soft-delete the smoke workflow; remove the dedup row for our event.
    await supabase
      .from("workflows")
      .update({ state: "deleted", deleted_at: new Date().toISOString() })
      .eq("id", state.workflowId);
    if (state.eventId) {
      const { error } = await supabase
        .from("webhook_event_dedup")
        .delete()
        .eq("provider", "typeform")
        .eq("event_id", state.eventId);
      console.log(`dedup row cleanup: ${error ? error.message : "ok"}`);
    }
    console.log(`workflow soft-deleted; rowsCleaned=${left.length === 0}; webhookDeleted=${webhookDeleted}`);
    if (!webhookDeleted || left.length !== 0) throw new Error("deactivation proof incomplete");
    console.log("DEACTIVATE PASSED");
    return;
  }

  throw new Error(`unknown phase ${phase}`);
})().then(() => process.exit(0)).catch((e) => {
  console.error("FATAL", (e as Error).message);
  process.exit(1);
});
