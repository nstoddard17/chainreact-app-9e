/**
 * One-off LIVE trigger smoke for the 2 Asana project webhook triggers (2026-07-04).
 *
 * Exercises the REAL provider-side lifecycle the direct-seed dev smoke explicitly
 * leaves uncovered: registerWorkflowTriggers -> POST /webhooks (real Asana) ->
 * X-Hook-Secret handshake against the DEPLOYED https://chainreact.app receive
 * route (shared Supabase) -> real task event in the watched project -> production
 * dispatcher enqueues -> production cron drains -> terminal run -> then
 * unregisterWorkflowTriggers -> DELETE /webhooks proven by a second delete
 * reading NotFoundError.
 *
 * Prints statuses, gids, and run ids only — never tokens or hook secrets.
 *
 * Run: npx tsx scripts/trash/asana-live-trigger-smoke.ts
 */
import { readFileSync, existsSync } from "node:fs";
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

const PROJECT_ID = process.env.SMOKE_ASANA_PROJECT_ID || "1216274999539841";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const { buildAsanaSmokeWorkflow } = await import("@/tests/trigger-smoke/asanaWebhookSmoke");
  const { registerWorkflowTriggers, unregisterWorkflowTriggers } = await import("@/services/triggers/lifecycle");
  const workflowsRepo = await import("@/repositories/workflows");
  const triggerResourcesRepo = await import("@/repositories/triggerResources");
  const { listByWorkflowServiceRole } = await import("@/repositories/workflowRunsDiagnostics");
  const { getActiveForExecution } = await import("@/repositories/integrations");
  const { refreshAndRetry } = await import("@/services/oauth/refreshAndRetry");
  const { tasksCreate, tasksUpdate } = await import("@/integrations/_shared/asana/api/tasks");
  const { webhooksDelete } = await import("@/integrations/_shared/asana/api/webhooks");
  const { NotFoundError } = await import("@/integrations/_shared/asana/errors");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const accountId = process.env.SMOKE_ACCOUNT_ID!;
  const userId = process.env.SMOKE_USER_ID!;
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const integration = await getActiveForExecution(accountId, "asana", null, { connectedByUserId: userId });
  if (!integration) throw new Error("no active asana integration under the smoke identity");

  const asanaCall = <T>(apiCall: (accessToken: string) => Promise<T>): Promise<T> =>
    refreshAndRetry({
      accountId: integration.accountId,
      provider: "asana",
      providerAccountId: integration.providerAccountId,
      apiCall,
    });

  const createdTaskGids: string[] = [];
  const failures: string[] = [];

  interface PhaseResult {
    label: string;
    webhookGid: string | null;
    notificationUrl: string | null;
    runId: string | null;
    runStatus: string | null;
    runCount: number;
    eventId: string | null;
    webhookDeleted: boolean;
    rowsCleaned: boolean;
  }

  async function runPhase(
    eventType: "new_task_in_project" | "task_updated_in_project",
    causeEvent: () => Promise<{ taskGid: string }>,
  ): Promise<PhaseResult> {
    const label = `asana:${eventType}`;
    console.log(`\n=== PHASE ${label} ===`);
    const wf = buildAsanaSmokeWorkflow(eventType, label, PROJECT_ID);

    // 1. Real active workflow row (owner = smoke account/user, creator-pinned credential).
    const { data: wfRow, error: wfErr } = await supabase
      .from("workflows")
      .insert({
        account_id: accountId,
        created_by_user_id: userId,
        name: `crsmoke-live-${eventType}`,
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

    let webhookGid: string | null = null;
    let notificationUrl: string | null = null;
    let runId: string | null = null;
    let runStatus: string | null = null;
    let runCount = 0;
    let eventId: string | null = null;
    let webhookDeleted = false;
    let rowsCleaned = false;

    try {
      // 2. REAL activation: POST /webhooks + handshake against production.
      const t0 = Date.now();
      await registerWorkflowTriggers(record);
      const row = await triggerResourcesRepo.findByWorkflowAndNode(workflowId, wf.triggerNodeId);
      const cfg = (row?.config ?? {}) as Record<string, unknown>;
      webhookGid = typeof cfg.webhookId === "string" ? cfg.webhookId : null;
      notificationUrl = typeof cfg.notificationUrl === "string" ? cfg.notificationUrl : null;
      console.log(
        `activated in ${Date.now() - t0}ms: webhookGid=${webhookGid} enabled=${cfg.webhookEnabled} ` +
          `handshakePending=${cfg.handshakePending} secretStored=${typeof cfg.hookSecretEncrypted === "string" && (cfg.hookSecretEncrypted as string).length > 0} ` +
          `url=${notificationUrl}`,
      );
      if (!webhookGid) throw new Error("activation did not persist webhookId");

      // 3. Cause the REAL provider event.
      const { taskGid } = await causeEvent();
      console.log(`caused real event (task ${taskGid}); waiting for production dispatch...`);

      // 4. Poll for the run (production receive -> dispatch -> enqueue).
      const deadline = Date.now() + 240_000;
      let runs: Awaited<ReturnType<typeof listByWorkflowServiceRole>> = [];
      while (Date.now() < deadline) {
        runs = await listByWorkflowServiceRole(workflowId, { includeRunning: true, limit: 50 });
        if (runs.length >= 1) break;
        await sleep(5000);
      }
      runCount = runs.length;
      if (runs.length === 0) {
        failures.push(`${label}: no run within 240s of the real event`);
        return {
          label, webhookGid, notificationUrl, runId, runStatus, runCount, eventId, webhookDeleted, rowsCleaned,
        };
      }
      const run = runs[0]!;
      runId = run.id;
      eventId = run.triggerEvent?.eventId ?? null;
      console.log(`run ${runId} appeared (status=${run.status}) eventId=${eventId}`);

      // Identity: the event must be OUR task + OUR project + the right type.
      const payload = (run.triggerEvent?.payload ?? {}) as Record<string, unknown>;
      if (run.triggerEvent?.eventType !== eventType) failures.push(`${label}: eventType mismatch (${run.triggerEvent?.eventType})`);
      if (payload.taskGid !== taskGid) failures.push(`${label}: taskGid mismatch`);
      if (payload.projectGid !== PROJECT_ID) failures.push(`${label}: projectGid mismatch`);

      // 5. Wait for PRODUCTION's cron drain to a terminal status.
      const terminalDeadline = Date.now() + 240_000;
      while (Date.now() < terminalDeadline) {
        const rec = await (await import("@/repositories/workflowRunsDiagnostics")).getByIdServiceRole(runId);
        runStatus = rec?.status ?? null;
        if (runStatus === "succeeded" || runStatus === "failed") break;
        await sleep(10_000);
      }
      console.log(`terminal status=${runStatus}`);
      if (runStatus !== "succeeded") failures.push(`${label}: run did not reach 'succeeded' (got ${runStatus})`);

      // 6. Exactly one run (no duplicate dispatch from redeliveries/heartbeats).
      const finalRuns = await listByWorkflowServiceRole(workflowId, { includeRunning: true, limit: 50 });
      runCount = finalRuns.length;
      if (runCount !== 1) failures.push(`${label}: expected exactly 1 run, got ${runCount}`);
    } finally {
      // 7. REAL deactivation: DELETE /webhooks + row removal.
      try {
        await unregisterWorkflowTriggers(record);
        const left = await triggerResourcesRepo.listByWorkflow(workflowId);
        rowsCleaned = left.length === 0;
        console.log(`deactivated; trigger_resources rows left=${left.length}`);
        if (webhookGid) {
          try {
            await asanaCall((accessToken) => webhooksDelete({ accessToken, webhookGid: webhookGid! }));
            failures.push(`${label}: webhook ${webhookGid} still existed after deactivation (second delete succeeded)`);
          } catch (err) {
            if (err instanceof NotFoundError) {
              webhookDeleted = true;
              console.log(`webhook ${webhookGid} confirmed gone (second delete -> 404)`);
            } else {
              failures.push(`${label}: webhook-gone probe errored: ${(err as Error).message}`);
            }
          }
        }
      } catch (err) {
        failures.push(`${label}: deactivation failed: ${(err as Error).message}`);
      }
      // 8. Soft-delete the smoke workflow row.
      await supabase
        .from("workflows")
        .update({ state: "deleted", deleted_at: new Date().toISOString() })
        .eq("id", workflowId);
    }
    return { label, webhookGid, notificationUrl, runId, runStatus, runCount, eventId, webhookDeleted, rowsCleaned };
  }

  // PHASE A — new_task_in_project: real task creation fires it.
  const stamp = new Date().toISOString();
  const a = await runPhase("new_task_in_project", async () => {
    const task = await asanaCall((accessToken) =>
      tasksCreate({
        accessToken,
        projectId: PROJECT_ID,
        name: `crsmoke-live-trigger ChainReact live smoke - Asana - ${stamp}`,
        notes: "crsmoke- live trigger verification - safe to ignore",
      }),
    );
    createdTaskGids.push(task.gid);
    return { taskGid: task.gid };
  });

  // PHASE B — task_updated_in_project: real rename of the phase-A task fires it.
  const b = await runPhase("task_updated_in_project", async () => {
    const gid = createdTaskGids[0];
    if (!gid) throw new Error("phase A task missing — cannot cause update event");
    await asanaCall((accessToken) =>
      tasksUpdate({ accessToken, taskGid: gid, name: `crsmoke-live-trigger UPDATED - ${stamp}` }),
    );
    return { taskGid: gid };
  });

  // Cleanup: complete the trigger-test task (archive disposition — no delete action).
  for (const gid of createdTaskGids) {
    try {
      await asanaCall((accessToken) => tasksUpdate({ accessToken, taskGid: gid, completed: true }));
      console.log(`cleanup: task ${gid} completed`);
    } catch (err) {
      failures.push(`cleanup: completing task ${gid} failed: ${(err as Error).message}`);
    }
  }
  // Cleanup: dedup rows for our real events (keyed on our task gids).
  for (const gid of createdTaskGids) {
    const { error } = await supabase
      .from("webhook_event_dedup")
      .delete()
      .eq("provider", "asana")
      .like("event_id", `%:${gid}:%`);
    if (error) console.log(`dedup cleanup note: ${error.message}`);
  }

  console.log("\n=== RESULTS ===");
  for (const r of [a, b]) {
    console.log(
      `${r.label}: run=${r.runId} status=${r.runStatus} runCount=${r.runCount} ` +
        `webhookDeleted=${r.webhookDeleted} rowsCleaned=${r.rowsCleaned}`,
    );
  }
  if (failures.length > 0) {
    console.log("\nFAILURES:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log("\nALL LIVE TRIGGER CHECKS PASSED");
})().then(() => process.exit(0)).catch((e) => {
  console.error("FATAL", (e as Error).message);
  process.exit(1);
});
