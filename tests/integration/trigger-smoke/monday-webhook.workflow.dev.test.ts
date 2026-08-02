/**
 * @jest-environment node
 *
 * Trigger-smoke — Monday webhook LIVE dispatch proof (real dev DB), direct-seed.
 *
 * Drives the REAL Monday webhook receipt path with fully synthetic, HMAC-signed board
 * webhook events (no real board/item, no Monday API call) for the safe lifecycle
 * triggers new_item / item_moved / new_subitem:
 *   create active {monday:<trigger> -> native no-op} workflow
 *     -> DIRECT-SEED the trigger_resources row (provider monday / eventType <trigger> /
 *       keyed by workflowId+nodeId / config { eventType, boardId }) — NO activation
 *       hook, NO Monday API, NO real webhook created
 *     -> assert the seeded event_type is the canonical dispatch key
 *     -> BASELINE: 0 runs before any delivery
 *     -> sign a synthetic Monday { event } body with the REAL MONDAY_SIGNING_SECRET
 *       (x-monday-signature = lowercase-hex HMAC-SHA256 over the raw body) and POST it
 *       to the REAL POST /api/webhooks/monday?workflowId=&nodeId= (real verify ->
 *       classify -> event-type filter -> normalize -> dispatchTriggerEvent -> dedup ->
 *       enqueue)
 *     -> assert exactly 1 run whose trigger_event identifies the synthetic event
 *       (deterministic dedup key + board/item ids + changeKind)
 *     -> drain the durable-queue run -> assert terminal 'succeeded'
 *     -> re-send the SAME event -> assert dedup keeps it at exactly 1 run
 *     -> delete the seeded trigger_resources row + soft-delete the workflow + delete
 *       the dedup row.
 *
 * DIRECT-SEED CONTRACT: certifies the receive/verify/classify/filter/normalize/
 * dispatch/dedup/enqueue/drain/terminal path. Does NOT certify Monday provider-side
 * subscription activation (create_webhook / delete_webhook via the Monday API). See
 * the harness header + readiness checkpoint. Monday signs the raw body only (no
 * callbackURL binding), so the harness signs the exact bytes it POSTs and production
 * verification is UNWEAKENED.
 *
 * NO live-provider gates: synthetic receipt, native no-op action, no Monday API. It
 * needs only a real DB + MONDAY_SIGNING_SECRET. NO connected Monday account required.
 *
 * Run:
 *   ALLOW_DB_INTEGRATION_TESTS=true ALLOW_TRIGGER_SMOKE=true \
 *     npm run smoke:triggers:webhook   (runs slack + github + trello + monday)
 *   or just this file:
 *   ALLOW_DB_INTEGRATION_TESTS=true ALLOW_TRIGGER_SMOKE=true \
 *     npx jest tests/integration/trigger-smoke/monday-webhook.workflow.dev.test.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  runMondayWebhookSmoke,
  ALL_MONDAY_WEBHOOK_SPECS,
} from "@/tests/trigger-smoke/mondayWebhookSmoke";
import { makeRealMondayWebhookSmokeDeps } from "@/tests/trigger-smoke/mondayWebhookSmokeDeps";
import { cleanupFixtures, createFixtureTracker } from "@/tests/helpers/dbFixtureCleanup";
import { provisionDisposableSmokeAccount } from "@/tests/helpers/smokeAccount";

function loadEnvLocal(): void {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    if (process.env[key]) continue;
    let v = m[2]!.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[key] = v;
  }
}
loadEnvLocal();

const ALLOW_DB = process.env.ALLOW_DB_INTEGRATION_TESTS === "true";
const ALLOW_TRIGGER = process.env.ALLOW_TRIGGER_SMOKE === "true";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SIGNING_SECRET = process.env.MONDAY_SIGNING_SECRET;
// NOTE: SMOKE_ACCOUNT_ID / SMOKE_USER_ID are deliberately NOT read here.
// They pointed at a real owner account, so every run wrote `trigger-smoke:*`
// workflows into production data that the harness then only SOFT-deleted. This
// suite now provisions a throwaway account per run and hard-deletes it in afterAll.

const RUN = ALLOW_DB && ALLOW_TRIGGER && !!URL && !!SERVICE_KEY && !!SIGNING_SECRET;
const describeLive = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP trigger smoke (monday webhook) — needs ALLOW_DB_INTEGRATION_TESTS + ALLOW_TRIGGER_SMOKE + " +
      "Supabase env + MONDAY_SIGNING_SECRET (provisions a throwaway smoke account per run). " +
      "No live-provider gates / no connected Monday account required (direct-seed).",
  );
}

describeLive("trigger smoke: monday webhook lifecycle (real dev DB, direct-seeded synthetic webhook)", () => {
  let supabase: SupabaseClient;
  // Provisioned in beforeAll so nothing is created under a real account.
  const fixtures = createFixtureTracker();
  let deps: ReturnType<typeof makeRealMondayWebhookSmokeDeps>;

  beforeAll(async () => {
    supabase = createClient(URL!, SERVICE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { accountId, userId } = await provisionDisposableSmokeAccount(supabase, fixtures);
    deps = makeRealMondayWebhookSmokeDeps({ supabase, accountId, userId });
  });

  // Hard-deletes the throwaway account and everything created under it. Throws
  // if anything survives, so a leak fails the suite instead of accumulating.
  afterAll(async () => {
    await cleanupFixtures(supabase, fixtures);
  });

  for (const spec of ALL_MONDAY_WEBHOOK_SPECS) {
    it(`${spec.label}: seed -> synthetic signed event fires 1, terminal succeeded, dedup holds, 0 leaked`, async () => {
      const r = await runMondayWebhookSmoke(deps, spec, {
        afterDeliverAttempts: 8,
        afterDeliverSleepMs: 500,
        dedupSettleMs: 1000,
      });
      console.log(JSON.stringify({ event: "trigger-smoke.monday-webhook.result", ...r }));

      expect(r.outcome).toBe("pass");
      expect(r.cleaned).toBe(true);
      expect(r.seededEventType).toBe(spec.eventType);
      expect(r.baselineRunCount).toBe(0);
      expect(r.deliverHttpStatus).toBe(200);
      expect(r.afterRunCount).toBe(1);
      expect(r.identityMatched).toBe(true);
      expect(r.terminalStatus).toBe("succeeded");
      expect(r.afterRedeliverRunCount).toBe(1);
      expect(r.dedupProven).toBe(true);
    }, 120_000);
  }
});
