/**
 * One-off LIVE trigger certification for calendly:event_scheduled +
 * calendly:event_canceled (Phase 13, 2026-07-05).
 *
 * Exercises the REAL provider-side lifecycle the direct-seed dev smoke
 * explicitly leaves uncovered: real calendly:event_types resolver ->
 * registerWorkflowTriggers -> POST /webhook_subscriptions (real Calendly,
 * scope "user", V2-minted signing_key) -> a REAL booking/cancellation on the
 * live scheduling page -> production https://chainreact.app receive route
 * verifies Calendly-Webhook-Signature -> dispatch -> production cron drains ->
 * terminal run -> unregisterWorkflowTriggers -> DELETE proven by a second
 * delete reading 404.
 *
 * Prints statuses, ids, event-type names, and sanitized payload SHAPES only —
 * never tokens or signing keys. Invitee identity in test bookings is the
 * owner's own email (crsmoke label), no third-party PII.
 *
 * Phased so real bookings happen between activate and the await phases:
 *   npx tsx scripts/trash/calendly-live-cert.ts list-event-types
 *   npx tsx scripts/trash/calendly-live-cert.ts activate <eventTypeId> [mismatchEventTypeId]
 *   npx tsx scripts/trash/calendly-live-cert.ts await-scheduled
 *   npx tsx scripts/trash/calendly-live-cert.ts await-canceled
 *   npx tsx scripts/trash/calendly-live-cert.ts status
 *   npx tsx scripts/trash/calendly-live-cert.ts deactivate
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

const STATE_FILE = resolve(process.cwd(), "scripts/trash/calendly-live-cert-state.json");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface WfState {
  workflowId: string;
  triggerNodeId: string;
  triggerType: string;
  eventTypeId: string | null;
  subscriptionUri: string | null;
  notificationUrl: string | null;
}

interface CertState {
  eventTypeId: string;
  schedulingUrl: string | null;
  scheduled: WfState;
  canceled: WfState;
  mismatch: WfState | null;
  seenEventIds: string[];
  scheduledRunCount: number;
  canceledRunCount: number;
}

function readState(): CertState {
  return JSON.parse(readFileSync(STATE_FILE, "utf8")) as CertState;
}
function writeState(s: CertState): void {
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

const TRIGGER_NODE_ID = "live-cert-calendly-trigger";
const ACTION_NODE_ID = "live-cert-noop-action";

function buildWorkflowDefinition(triggerType: string, eventTypeId: string | null) {
  return {
    nodes: [
      {
        id: TRIGGER_NODE_ID,
        kind: "trigger",
        provider: "calendly",
        type: triggerType,
        config: eventTypeId ? { eventTypeId } : {},
        position: { x: 0, y: 0 },
      },
      {
        id: ACTION_NODE_ID,
        kind: "action",
        provider: "native",
        type: "if_then_condition",
        config: { input: "smoke", operator: "is_falsy", onFalse: "skip" },
        position: { x: 0, y: 160 },
      },
    ],
    edges: [{ id: "live-cert-edge", from: TRIGGER_NODE_ID, to: ACTION_NODE_ID }],
  };
}

(async () => {
  const phase = process.argv[2];
  if (!phase) throw new Error("usage: calendly-live-cert.ts <list-event-types|activate <eventTypeId> [mismatchId]|await-scheduled|await-canceled|status|deactivate>");

  const { createClient } = await import("@supabase/supabase-js");
  const { getActiveForExecution } = await import("@/repositories/integrations");
  const { refreshAndRetry } = await import("@/services/oauth/refreshAndRetry");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const accountId = process.env.SMOKE_ACCOUNT_ID!;
  const userId = process.env.SMOKE_USER_ID!;
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const integration = await getActiveForExecution(accountId, "calendly", null, { connectedByUserId: userId });
  if (!integration) throw new Error("no active calendly integration under the smoke identity");

  const calendlyCall = <T>(apiCall: (accessToken: string) => Promise<T>): Promise<T> =>
    refreshAndRetry({
      accountId: integration.accountId,
      provider: "calendly",
      providerAccountId: integration.providerAccountId,
      apiCall,
    });

  // ── Phase: list-event-types — LIVE option-source cert via the REAL resolver ──
  if (phase === "list-event-types") {
    const { calendlyEventTypesResolver } = await import("@/integrations/calendly/options/eventTypes");
    const ctx = { integration, deps: {}, q: "" } as never;
    const result = await calendlyEventTypesResolver.resolve(ctx);
    console.log(`calendly:event_types resolver returned ${result.items.length} item(s), hasMore=${result.hasMore}`);
    for (const item of result.items) console.log(`  - value=${item.value} label="${item.label}"`);

    // Local q-filter check.
    if (result.items.length > 0) {
      const firstLabel = result.items[0]!.label;
      const q = firstLabel.slice(0, Math.min(4, firstLabel.length));
      const searched = await calendlyEventTypesResolver.resolve({ integration, deps: {}, q } as never);
      console.log(`q="${q}" -> ${searched.items.length} item(s): ${searched.items.map((i) => i.label).join(", ")}`);
    }

    // Scheduling URLs for the booking step (console only; public URLs).
    const { eventTypesList } = await import("@/integrations/_shared/calendly/api/eventTypes");
    const md = integration.accountMetadata as { calendlyUserUri?: string };
    const page = await calendlyCall((accessToken) =>
      eventTypesList({ accessToken, userUri: md.calendlyUserUri!, count: 100 }),
    );
    for (const et of page.items) {
      const raw = et as { uri?: string; name?: string | null; scheduling_url?: string | null };
      console.log(`  scheduling_url for "${raw.name}": ${raw.scheduling_url ?? "(none)"} (uri tail: ${raw.uri?.split("/").pop()})`);
    }
    return;
  }

  // ── Phase: activate — real workflows + REAL POST /webhook_subscriptions ──
  if (phase === "activate") {
    const eventTypeId = process.argv[3];
    const mismatchEventTypeId = process.argv[4] ?? null;
    if (!eventTypeId) throw new Error("usage: activate <eventTypeId> [mismatchEventTypeId]");
    const { registerWorkflowTriggers } = await import("@/services/triggers/lifecycle");
    const workflowsRepo = await import("@/repositories/workflows");
    const triggerResourcesRepo = await import("@/repositories/triggerResources");

    async function createAndActivate(
      label: string,
      triggerType: string,
      filterEventTypeId: string | null,
    ): Promise<WfState> {
      const { data: wfRow, error: wfErr } = await supabase
        .from("workflows")
        .insert({
          account_id: accountId,
          created_by_user_id: userId,
          name: `crsmoke-live-calendly-${label}`,
          state: "active",
          draft_definition: buildWorkflowDefinition(triggerType, filterEventTypeId),
        })
        .select("id")
        .single<{ id: string }>();
      if (wfErr || !wfRow) throw new Error(`workflow insert failed (${label}): ${wfErr?.message}`);
      const workflowId = wfRow.id;

      const record = await workflowsRepo.getByIdServiceRole(workflowId);
      if (!record) throw new Error(`workflow record read-back failed (${label})`);

      const t0 = Date.now();
      await registerWorkflowTriggers(record);
      const row = await triggerResourcesRepo.findByWorkflowAndNode(workflowId, TRIGGER_NODE_ID);
      const cfg = (row?.config ?? {}) as Record<string, unknown>;
      const secretStored = typeof cfg.hookSecretEncrypted === "string" && (cfg.hookSecretEncrypted as string).length > 0;
      // The signing key was minted as 43-char base64url; the stored value must be
      // ciphertext, not that plaintext shape (defensive plaintext check without
      // ever printing either value).
      const looksEncrypted = secretStored && !/^[A-Za-z0-9_-]{43}$/.test(String(cfg.hookSecretEncrypted));
      console.log(
        `[${label}] workflow ${workflowId} activated in ${Date.now() - t0}ms: ` +
          `subscriptionUri=${cfg.subscriptionUri} enabled=${cfg.webhookEnabled} ` +
          `secretStored=${secretStored} secretLooksEncrypted=${looksEncrypted} ` +
          `calendlyUserId=${cfg.calendlyUserId} eventTypeId=${cfg.eventTypeId ?? "(none)"} url=${cfg.notificationUrl}`,
      );
      if (typeof cfg.subscriptionUri !== "string" || !secretStored || !looksEncrypted) {
        throw new Error(`[${label}] activation did not persist subscriptionUri/encrypted secret`);
      }
      if (!String(cfg.notificationUrl).startsWith("https://chainreact.app/api/webhooks/calendly")) {
        throw new Error(`[${label}] notification URL does not point at production`);
      }
      return {
        workflowId,
        triggerNodeId: TRIGGER_NODE_ID,
        triggerType,
        eventTypeId: filterEventTypeId,
        subscriptionUri: String(cfg.subscriptionUri),
        notificationUrl: String(cfg.notificationUrl),
      };
    }

    const scheduled = await createAndActivate("event_scheduled", "event_scheduled", eventTypeId);
    const canceled = await createAndActivate("event_canceled", "event_canceled", null);
    const mismatch = mismatchEventTypeId
      ? await createAndActivate("event_scheduled-mismatch", "event_scheduled", mismatchEventTypeId)
      : null;

    writeState({
      eventTypeId,
      schedulingUrl: null,
      scheduled,
      canceled,
      mismatch,
      seenEventIds: [],
      scheduledRunCount: 0,
      canceledRunCount: 0,
    });
    console.log("state written. Now make a REAL booking on the scheduling page, then run await-scheduled.");
    return;
  }

  const { listByWorkflowServiceRole, getByIdServiceRole } = await import("@/repositories/workflowRunsDiagnostics");

  async function awaitRun(
    wf: WfState,
    baselineCount: number,
    expect: {
      triggerType: string;
      changeKind: string;
      expectRescheduled?: boolean;
    },
  ) {
    const deadline = Date.now() + 300_000;
    let runs: Awaited<ReturnType<typeof listByWorkflowServiceRole>> = [];
    while (Date.now() < deadline) {
      runs = await listByWorkflowServiceRole(wf.workflowId, { includeRunning: true, limit: 50 });
      if (runs.length >= baselineCount + 1) break;
      await sleep(5000);
    }
    if (runs.length < baselineCount + 1) throw new Error(`no new run within 300s (have ${runs.length}, baseline ${baselineCount})`);
    if (runs.length > baselineCount + 1) throw new Error(`expected exactly 1 new run, got ${runs.length - baselineCount}`);
    const run = runs[0]!; // newest first
    console.log(`run ${run.id} appeared (status=${run.status}) eventId=${run.triggerEvent?.eventId}`);

    const payload = (run.triggerEvent?.payload ?? {}) as Record<string, unknown>;
    const serialized = JSON.stringify(payload);
    const checks: Array<[string, boolean]> = [
      [`eventType=${expect.triggerType}`, run.triggerEvent?.eventType === expect.triggerType],
      ["payload.changeKind", payload.changeKind === expect.changeKind],
      ["inviteeId present", typeof payload.inviteeId === "string" && (payload.inviteeId as string).length > 0],
      ["eventId (scheduled event uuid) present", typeof payload.eventId === "string"],
      ["subscriberUserId matches row", typeof payload.subscriberUserId === "string"],
      ["startTime present", typeof payload.startTime === "string"],
      ["meetingName present", typeof payload.meetingName === "string"],
      ["eventTypeId present", typeof payload.eventTypeId === "string"],
      ["no raw api URIs in payload", !serialized.includes("api.calendly.com")],
      [
        "dedup eventId is subscriber-scoped + timestamp-free",
        run.triggerEvent?.eventId === `${expect.triggerType}:${String(payload.subscriberUserId)}:${String(payload.inviteeId)}`,
      ],
    ];
    if (expect.expectRescheduled !== undefined) {
      checks.push([`rescheduled=${expect.expectRescheduled}`, payload.rescheduled === expect.expectRescheduled]);
    }
    for (const [label, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);

    // Sanitized live payload SHAPE (keys + types + safe scalars only — no invitee PII values).
    const shape: Record<string, string> = {};
    for (const [k, v] of Object.entries(payload)) {
      shape[k] = v === null ? "null" : Array.isArray(v) ? `array(${v.length})` : typeof v;
    }
    console.log(`live payload shape: ${JSON.stringify(shape)}`);
    console.log(
      `safe fields: rescheduled=${JSON.stringify(payload.rescheduled)} inviteeStatus=${JSON.stringify(payload.inviteeStatus)} ` +
        `locationType=${JSON.stringify((payload.location as Record<string, unknown> | null)?.type)} ` +
        `cancellation=${JSON.stringify(payload.cancellation ? Object.keys(payload.cancellation) : null)} ` +
        `oldInviteeId=${typeof payload.oldInviteeId} newInviteeId=${typeof payload.newInviteeId}`,
    );

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
    if (checks.some(([, ok]) => !ok)) throw new Error("identity/shape checks failed (see above)");
    if (runStatus !== "succeeded") throw new Error(`run did not reach 'succeeded' (got ${runStatus})`);
    return { runId: run.id, eventId: run.triggerEvent?.eventId ?? null };
  }

  // ── Phase: await-scheduled ──
  if (phase === "await-scheduled") {
    const state = readState();
    const r = await awaitRun(state.scheduled, state.scheduledRunCount, {
      triggerType: "event_scheduled",
      changeKind: "event_scheduled",
    });
    if (state.mismatch) {
      const mismatchRuns = await listByWorkflowServiceRole(state.mismatch.workflowId, { includeRunning: true, limit: 50 });
      console.log(
        `${mismatchRuns.length === 0 ? "PASS" : "FAIL"}: mismatch-filter workflow has 0 runs (got ${mismatchRuns.length}) — P-S2 eventTypeId no-match proven live`,
      );
      if (mismatchRuns.length !== 0) throw new Error("mismatch workflow fired — filter failed live");
    }
    state.scheduledRunCount += 1;
    if (r.eventId) state.seenEventIds.push(r.eventId);
    writeState(state);
    console.log("AWAIT-SCHEDULED PASSED");
    return;
  }

  // ── Phase: await-canceled ──
  if (phase === "await-canceled") {
    const state = readState();
    const expectRescheduled = process.argv[3] === "rescheduled";
    const r = await awaitRun(state.canceled, state.canceledRunCount, {
      triggerType: "event_canceled",
      changeKind: "event_canceled",
      expectRescheduled: expectRescheduled ? true : false,
    });
    state.canceledRunCount += 1;
    if (r.eventId) state.seenEventIds.push(r.eventId);
    writeState(state);
    console.log("AWAIT-CANCELED PASSED");
    return;
  }

  // ── Phase: status — run counts across the cert workflows ──
  if (phase === "status") {
    const state = readState();
    for (const wf of [state.scheduled, state.canceled, state.mismatch].filter(Boolean) as WfState[]) {
      const runs = await listByWorkflowServiceRole(wf.workflowId, { includeRunning: true, limit: 50 });
      console.log(`${wf.triggerType}${wf.eventTypeId ? ` (filter ${wf.eventTypeId})` : ""}: ${runs.length} run(s)`);
      for (const run of runs) {
        const p = (run.triggerEvent?.payload ?? {}) as Record<string, unknown>;
        console.log(`  - ${run.id} status=${run.status} eventId=${run.triggerEvent?.eventId} rescheduled=${JSON.stringify(p.rescheduled)} old=${typeof p.oldInviteeId === "string" ? "set" : "null"} new=${typeof p.newInviteeId === "string" ? "set" : "null"}`);
      }
    }
    return;
  }

  // ── Phase: deactivate — real DELETEs + 404 proofs + cleanup ──
  if (phase === "deactivate") {
    const state = readState();
    const { unregisterWorkflowTriggers } = await import("@/services/triggers/lifecycle");
    const workflowsRepo = await import("@/repositories/workflows");
    const triggerResourcesRepo = await import("@/repositories/triggerResources");
    const { webhookSubscriptionDelete } = await import("@/integrations/_shared/calendly/api/webhookSubscriptions");
    const { NotFoundError } = await import("@/integrations/_shared/calendly/errors");

    let allGone = true;
    let allRowsCleaned = true;
    for (const wf of [state.scheduled, state.canceled, state.mismatch].filter(Boolean) as WfState[]) {
      const record = await workflowsRepo.getByIdServiceRole(wf.workflowId);
      if (!record) throw new Error(`workflow record read-back failed (${wf.triggerType})`);
      await unregisterWorkflowTriggers(record);
      const left = await triggerResourcesRepo.listByWorkflow(wf.workflowId);
      if (left.length !== 0) allRowsCleaned = false;

      // Provider-side gone-proof: a second DELETE must read 404.
      const uuid = wf.subscriptionUri?.split("/").pop() ?? null;
      let gone = false;
      if (uuid) {
        try {
          await calendlyCall((accessToken) => webhookSubscriptionDelete({ accessToken, subscriptionUuid: uuid }));
          console.log(`FAIL: subscription ${uuid} still existed (second delete succeeded)`);
        } catch (err) {
          if (err instanceof NotFoundError) {
            gone = true;
            console.log(`[${wf.triggerType}] subscription ${uuid} confirmed gone (second delete -> 404)`);
          } else {
            console.log(`[${wf.triggerType}] gone-probe errored: ${(err as Error).message}`);
          }
        }
      }
      if (!gone) allGone = false;

      await supabase
        .from("workflows")
        .update({ state: "deleted", deleted_at: new Date().toISOString() })
        .eq("id", wf.workflowId);
      console.log(`[${wf.triggerType}] workflow soft-deleted; trigger rows left=${left.length}`);
    }

    for (const eventId of state.seenEventIds) {
      const { error } = await supabase
        .from("webhook_event_dedup")
        .delete()
        .eq("provider", "calendly")
        .eq("event_id", eventId);
      console.log(`dedup row cleanup (${eventId}): ${error ? error.message : "ok"}`);
    }
    if (!allGone || !allRowsCleaned) throw new Error("deactivation proof incomplete");
    console.log("DEACTIVATE PASSED");
    return;
  }

  throw new Error(`unknown phase ${phase}`);
})().then(() => process.exit(0)).catch((e) => {
  console.error("FATAL", (e as Error).message);
  process.exit(1);
});
