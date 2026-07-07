/**
 * One-off LIVE trigger smoke for the 3 ASANA-2 project webhook triggers
 * (task_completed / task_assigned / comment_added_to_task) — 2026-07-06.
 *
 * Same shape as the ASANA-1 driver (asana-live-trigger-smoke.ts): REAL
 * registerWorkflowTriggers -> POST /webhooks (real Asana) -> X-Hook-Secret
 * handshake against the DEPLOYED https://chainreact.app receive route
 * (shared Supabase) -> real provider events -> production dispatch + cron
 * drain -> terminal run -> unregisterWorkflowTriggers -> DELETE /webhooks
 * proven by a second delete reading NotFoundError.
 *
 * ASANA-2 additions per phase:
 *   - PRE-FLIGHT: proves the reconnected token actually carries the NEW
 *     stories:read scope (GET /stories/{gid}) before arming anything.
 *   - task_completed: NEGATIVE first (rename while armed -> no run), then
 *     complete -> exactly one run with the timestamp-free task-scoped key.
 *   - task_assigned: assign "me" -> one run w/ newAssigneeGid; NEGATIVE
 *     unassign -> still exactly one run.
 *   - comment_added_to_task: comment -> one run w/ commentText+authorName
 *     (proves the production post-fetch under stories:read); NEGATIVE
 *     complete-the-task (emits a marked_complete system story) -> still
 *     exactly one run.
 *
 * Prints statuses, gids, and run ids only — never tokens or hook secrets.
 *
 * Run: npx tsx scripts/trash/asana2-live-trigger-smoke.ts
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
const NEGATIVE_WAIT_MS = 75_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const { buildAsanaSmokeWorkflow } = await import("@/tests/trigger-smoke/asanaWebhookSmoke");
  const { registerWorkflowTriggers, unregisterWorkflowTriggers } = await import("@/services/triggers/lifecycle");
  const workflowsRepo = await import("@/repositories/workflows");
  const triggerResourcesRepo = await import("@/repositories/triggerResources");
  const runsDiag = await import("@/repositories/workflowRunsDiagnostics");
  const { getActiveForExecution } = await import("@/repositories/integrations");
  const { refreshAndRetry, InsufficientScopeError } = await import("@/services/oauth/refreshAndRetry");
  const { tasksCreate, tasksUpdate } = await import("@/integrations/_shared/asana/api/tasks");
  const { asanaRequest } = await import("@/integrations/_shared/asana/api/_request");
  const { storiesCreateForTask, storiesGet } = await import("@/integrations/_shared/asana/api/stories");
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
  const capturedEventIds: string[] = [];
  const failures: string[] = [];

  // ── PRE-FLIGHT: stories:read live probe ─────────────────────────────────
  console.log("=== PRE-FLIGHT stories:read probe ===");
  const probeTask = await asanaCall((t) =>
    tasksCreate({
      accessToken: t,
      projectId: PROJECT_ID,
      name: `crsmoke-asana2-scope-probe - safe to ignore - ${new Date().toISOString()}`,
    }),
  );
  createdTaskGids.push(probeTask.gid);
  const probeStory = await asanaCall((t) =>
    storiesCreateForTask({ accessToken: t, taskGid: probeTask.gid, text: "crsmoke-asana2 scope probe comment" }),
  );
  try {
    const read = await asanaCall((t) => storiesGet({ accessToken: t, storyGid: probeStory.gid }));
    console.log(
      `stories:read OK — story ${read.gid} subtype=${read.resource_subtype} textLen=${read.text?.length ?? 0}`,
    );
  } catch (err) {
    if (err instanceof InsufficientScopeError) {
      console.error(
        "ABORT: GET /stories/{gid} returned 403 — the reconnected token does NOT carry stories:read. " +
          "Add the scope in the Asana console and reconnect again.",
      );
      process.exit(2);
    }
    throw err;
  }

  interface PhaseResult {
    label: string;
    webhookGid: string | null;
    runId: string | null;
    runStatus: string | null;
    runCount: number;
    eventId: string | null;
    negativeHeld: boolean | null;
    webhookDeleted: boolean;
    rowsCleaned: boolean;
  }

  interface PhaseSpec {
    eventType: "task_completed" | "task_assigned" | "comment_added_to_task";
    /** Optional negative event fired while armed BEFORE the positive (expect 0 runs). */
    negativeBefore?: (taskGid: string) => Promise<string>;
    /** The positive event (expect exactly 1 run). Returns identity expectations. */
    positive: (taskGid: string) => Promise<{ desc: string; checkPayload: (p: Record<string, unknown>) => void }>;
    /** Optional negative event fired AFTER the positive (expect still exactly 1 run). */
    negativeAfter?: (taskGid: string) => Promise<string>;
  }

  async function runPhase(spec: PhaseSpec): Promise<PhaseResult> {
    const label = `asana:${spec.eventType}`;
    console.log(`\n=== PHASE ${label} ===`);
    const wf = buildAsanaSmokeWorkflow(spec.eventType, label, PROJECT_ID);

    const { data: wfRow, error: wfErr } = await supabase
      .from("workflows")
      .insert({
        account_id: accountId,
        created_by_user_id: userId,
        name: `crsmoke-live-${spec.eventType}`,
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
    let runId: string | null = null;
    let runStatus: string | null = null;
    let runCount = 0;
    let eventId: string | null = null;
    let negativeHeld: boolean | null = null;
    let webhookDeleted = false;
    let rowsCleaned = false;

    try {
      // 1. Phase-owned task.
      const task = await asanaCall((t) =>
        tasksCreate({
          accessToken: t,
          projectId: PROJECT_ID,
          name: `crsmoke-asana2-${spec.eventType} - safe to ignore - ${new Date().toISOString()}`,
        }),
      );
      createdTaskGids.push(task.gid);
      console.log(`phase task ${task.gid} created`);

      // 2. REAL activation against the deployed receive route.
      const t0 = Date.now();
      await registerWorkflowTriggers(record);
      const row = await triggerResourcesRepo.findByWorkflowAndNode(workflowId, wf.triggerNodeId);
      const cfg = (row?.config ?? {}) as Record<string, unknown>;
      webhookGid = typeof cfg.webhookId === "string" ? cfg.webhookId : null;
      console.log(
        `activated in ${Date.now() - t0}ms: webhookGid=${webhookGid} enabled=${cfg.webhookEnabled} ` +
          `secretStored=${typeof cfg.hookSecretEncrypted === "string" && (cfg.hookSecretEncrypted as string).length > 0} ` +
          `url=${typeof cfg.notificationUrl === "string" ? cfg.notificationUrl : null}`,
      );
      if (!webhookGid) throw new Error("activation did not persist webhookId");

      // 3. NEGATIVE-BEFORE (expect zero runs while armed).
      if (spec.negativeBefore) {
        const desc = await spec.negativeBefore(task.gid);
        console.log(`negative-before caused (${desc}); waiting ${NEGATIVE_WAIT_MS / 1000}s to confirm NO run...`);
        await sleep(NEGATIVE_WAIT_MS);
        const runs = await runsDiag.listByWorkflowServiceRole(workflowId, { includeRunning: true, limit: 50 });
        if (runs.length !== 0) {
          negativeHeld = false;
          failures.push(`${label}: negative-before fired ${runs.length} run(s) — expected 0`);
        } else {
          negativeHeld = true;
          console.log("negative-before held: 0 runs");
        }
      }

      // 4. POSITIVE event.
      const { desc, checkPayload } = await spec.positive(task.gid);
      console.log(`positive caused (${desc}); waiting for production dispatch...`);

      const deadline = Date.now() + 240_000;
      let runs: Awaited<ReturnType<typeof runsDiag.listByWorkflowServiceRole>> = [];
      while (Date.now() < deadline) {
        runs = await runsDiag.listByWorkflowServiceRole(workflowId, { includeRunning: true, limit: 50 });
        if (runs.length >= 1) break;
        await sleep(5000);
      }
      runCount = runs.length;
      if (runs.length === 0) {
        failures.push(`${label}: no run within 240s of the real positive event`);
        return { label, webhookGid, runId, runStatus, runCount, eventId, negativeHeld, webhookDeleted, rowsCleaned };
      }
      const run = runs[0]!;
      runId = run.id;
      eventId = run.triggerEvent?.eventId ?? null;
      if (eventId) capturedEventIds.push(eventId);
      console.log(`run ${runId} appeared (status=${run.status}) eventId=${eventId}`);

      const payload = (run.triggerEvent?.payload ?? {}) as Record<string, unknown>;
      if (run.triggerEvent?.eventType !== spec.eventType) {
        failures.push(`${label}: eventType mismatch (${run.triggerEvent?.eventType})`);
      }
      if (payload.projectGid !== PROJECT_ID) failures.push(`${label}: projectGid mismatch`);
      try {
        checkPayload(payload);
      } catch (err) {
        failures.push(`${label}: payload identity check failed: ${(err as Error).message}`);
      }

      // 5. Terminal drain.
      const terminalDeadline = Date.now() + 240_000;
      while (Date.now() < terminalDeadline) {
        const rec = await runsDiag.getByIdServiceRole(runId);
        runStatus = rec?.status ?? null;
        if (runStatus === "succeeded" || runStatus === "failed") break;
        await sleep(10_000);
      }
      console.log(`terminal status=${runStatus}`);
      if (runStatus !== "succeeded") failures.push(`${label}: run did not reach 'succeeded' (got ${runStatus})`);

      // 6. NEGATIVE-AFTER (expect still exactly 1 run).
      if (spec.negativeAfter) {
        const desc2 = await spec.negativeAfter(task.gid);
        console.log(`negative-after caused (${desc2}); waiting ${NEGATIVE_WAIT_MS / 1000}s to confirm STILL 1 run...`);
        await sleep(NEGATIVE_WAIT_MS);
      }

      // 7. Exactly-one check (also covers redeliveries/multi-parent).
      const finalRuns = await runsDiag.listByWorkflowServiceRole(workflowId, { includeRunning: true, limit: 50 });
      runCount = finalRuns.length;
      if (runCount !== 1) failures.push(`${label}: expected exactly 1 run, got ${runCount}`);
      if (spec.negativeAfter) {
        negativeHeld = negativeHeld !== false && runCount === 1;
      }
    } finally {
      try {
        await unregisterWorkflowTriggers(record);
        const left = await triggerResourcesRepo.listByWorkflow(workflowId);
        rowsCleaned = left.length === 0;
        console.log(`deactivated; trigger_resources rows left=${left.length}`);
        if (webhookGid) {
          try {
            await asanaCall((t) => webhooksDelete({ accessToken: t, webhookGid: webhookGid! }));
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
      await supabase
        .from("workflows")
        .update({ state: "deleted", deleted_at: new Date().toISOString() })
        .eq("id", workflowId);
    }
    return { label, webhookGid, runId, runStatus, runCount, eventId, negativeHeld, webhookDeleted, rowsCleaned };
  }

  // ── PHASE C — task_completed ─────────────────────────────────────────────
  const c = await runPhase({
    eventType: "task_completed",
    negativeBefore: async (taskGid) => {
      await asanaCall((t) => tasksUpdate({ accessToken: t, taskGid, name: `crsmoke-asana2-renamed - ${Date.now()}` }));
      return "plain rename (non-completed field change)";
    },
    positive: async (taskGid) => {
      await asanaCall((t) => tasksUpdate({ accessToken: t, taskGid, completed: true }));
      return {
        desc: "task completed",
        checkPayload: (p) => {
          if (p.taskGid !== taskGid) throw new Error("taskGid mismatch");
          if (p.changeKind !== "task_completed") throw new Error("changeKind mismatch");
          if (typeof p.completedAt !== "string" || p.completedAt.length === 0) throw new Error("completedAt missing");
        },
      };
    },
  });
  if (c.eventId && /\d{4}-\d{2}-\d{2}T/.test(c.eventId)) {
    failures.push("task_completed: eventId carries a timestamp — expected the timestamp-free task-scoped key");
  }

  // ── PHASE D — task_assigned ──────────────────────────────────────────────
  const d = await runPhase({
    eventType: "task_assigned",
    positive: async (taskGid) => {
      await asanaCall((t) => tasksUpdate({ accessToken: t, taskGid, assigneeGid: "me" }));
      return {
        desc: "task assigned to the connected user",
        checkPayload: (p) => {
          if (p.taskGid !== taskGid) throw new Error("taskGid mismatch");
          if (p.changeKind !== "task_assigned") throw new Error("changeKind mismatch");
          if (typeof p.newAssigneeGid !== "string" || p.newAssigneeGid.length === 0) {
            throw new Error("newAssigneeGid missing");
          }
        },
      };
    },
    negativeAfter: async (taskGid) => {
      // Asana unassigns with `assignee: null` — the typed wrapper can't send
      // null, so this one call goes through the raw request helper.
      await asanaCall((t) =>
        asanaRequest<{ gid: string }>({
          accessToken: t,
          method: "PUT",
          path: `/tasks/${encodeURIComponent(taskGid)}`,
          data: { assignee: null },
          resourceForNotFound: `task ${taskGid} (unassign)`,
        }),
      );
      return "task UNassigned (assignee -> null; post-fetch gate must drop)";
    },
  });

  // ── PHASE E — comment_added_to_task ──────────────────────────────────────
  const commentText = `crsmoke-asana2 live comment - safe to ignore - ${new Date().toISOString()}`;
  const e = await runPhase({
    eventType: "comment_added_to_task",
    positive: async (taskGid) => {
      const story = await asanaCall((t) =>
        storiesCreateForTask({ accessToken: t, taskGid, text: commentText }),
      );
      console.log(`comment story ${story.gid} created`);
      return {
        desc: "comment added",
        checkPayload: (p) => {
          if (p.taskGid !== taskGid) throw new Error("taskGid mismatch");
          if (p.changeKind !== "comment_added_to_task") throw new Error("changeKind mismatch");
          if (p.commentText !== commentText) throw new Error("commentText mismatch");
          if (typeof p.authorName !== "string" || p.authorName.length === 0) throw new Error("authorName missing");
          if (typeof p.storyGid !== "string" || p.storyGid.length === 0) throw new Error("storyGid missing");
        },
      };
    },
    negativeAfter: async (taskGid) => {
      // Completing the task emits a marked_complete SYSTEM story (story+added,
      // subtype != comment_added) — the server filter/matcher must not fire.
      await asanaCall((t) => tasksUpdate({ accessToken: t, taskGid, completed: true }));
      return "task completed (marked_complete system story; not a comment)";
    },
  });

  // ── Cleanup: complete every crsmoke task (archive disposition). ──────────
  for (const gid of createdTaskGids) {
    try {
      await asanaCall((t) => tasksUpdate({ accessToken: t, taskGid: gid, completed: true }));
      console.log(`cleanup: task ${gid} completed`);
    } catch (err) {
      failures.push(`cleanup: completing task ${gid} failed: ${(err as Error).message}`);
    }
  }
  // Dedup rows for our captured events (exact ids) + task-scoped safety sweep.
  for (const id of capturedEventIds) {
    const { error } = await supabase.from("webhook_event_dedup").delete().eq("provider", "asana").eq("event_id", id);
    if (error) console.log(`dedup cleanup note: ${error.message}`);
  }
  for (const gid of createdTaskGids) {
    await supabase.from("webhook_event_dedup").delete().eq("provider", "asana").like("event_id", `%:${gid}`);
    await supabase.from("webhook_event_dedup").delete().eq("provider", "asana").like("event_id", `%:${gid}:%`);
  }

  console.log("\n=== RESULTS ===");
  for (const r of [c, d, e]) {
    console.log(
      `${r.label}: run=${r.runId} status=${r.runStatus} runCount=${r.runCount} negativeHeld=${r.negativeHeld} ` +
        `webhookDeleted=${r.webhookDeleted} rowsCleaned=${r.rowsCleaned}`,
    );
  }
  if (failures.length > 0) {
    console.log("\nFAILURES:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log("\nALL ASANA-2 LIVE TRIGGER CHECKS PASSED");
})().then(() => process.exit(0)).catch((err) => {
  console.error("FATAL", (err as Error).message);
  process.exit(1);
});
