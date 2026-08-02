/**
 * @jest-environment node
 *
 * Trigger-smoke — Calendly webhook LIVE dispatch proof (real dev DB), direct-seed.
 *
 * Drives the REAL Calendly webhook receipt path for BOTH triggers with fully
 * synthetic, HMAC-signed invitee deliveries (no real booking, no Calendly API call):
 *   create active {calendly:<trigger> -> native no-op} workflow
 *     -> DIRECT-SEED the trigger_resources row in its POST-ACTIVATION shape
 *       (provider calendly / eventType per trigger / keyed by workflowId+nodeId /
 *       config { calendlyUserId, hookSecretEncrypted: encryptToken(<smoke key>) })
 *       — NO activation hook, NO Calendly API, NO real subscription created
 *     -> BASELINE: 0 runs before any delivery
 *     -> sign a synthetic invitee envelope with the SAME per-row smoke key
 *       (Calendly-Webhook-Signature = t=<unix>,v1=<hex HMAC-SHA256 over
 *       "<t>.<raw body>" — the per-subscription secret model production uses) and
 *       POST it to the REAL POST /api/webhooks/calendly?workflowId=&nodeId=
 *       (real per-row decrypt+verify -> invitee.* event gate -> normalize ->
 *       dispatchTriggerEvent -> P-S2 subscriber filter -> dedup -> enqueue)
 *     -> assert exactly 1 run identifying the synthetic event -> drain -> 'succeeded'
 *     -> re-send the SAME body -> dedup keeps it at exactly 1 run
 *     -> delete the seeded row + soft-delete the workflow + delete the dedup row.
 *
 * DIRECT-SEED CONTRACT: certifies receive/verify/gate/normalize/dispatch/dedup/
 * enqueue/drain/terminal. Does NOT certify the Calendly provider-side lifecycle
 * (POST/DELETE /webhook_subscriptions) — unit-tested at
 * tests/unit/integrations/calendly/triggers/*, live proof needs owner credentials
 * on a PAID Calendly plan (Phase 13).
 *
 * NO live-provider gates: synthetic receipt, native no-op action, no Calendly API.
 * It needs only a real DB + TOKEN_ENCRYPTION_KEY (to seed the encrypted per-row
 * key). NO connected Calendly account and NO app-level signing secret required
 * (Calendly signing keys are per-subscription, V2-minted).
 *
 * Run:
 *   ALLOW_DB_INTEGRATION_TESTS=true ALLOW_TRIGGER_SMOKE=true \
 *     npm run smoke:triggers:webhook   (slack + github + trello + monday + asana + typeform + calendly)
 *   or just this file:
 *   ALLOW_DB_INTEGRATION_TESTS=true ALLOW_TRIGGER_SMOKE=true \
 *     npx jest tests/integration/trigger-smoke/calendly-webhook.workflow.dev.test.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  CALENDLY_SMOKE_SPECS,
  runCalendlyWebhookSmoke,
} from "@/tests/trigger-smoke/calendlyWebhookSmoke";
import { makeRealCalendlyWebhookSmokeDeps } from "@/tests/trigger-smoke/calendlyWebhookSmokeDeps";
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
const TOKEN_KEY = process.env.TOKEN_ENCRYPTION_KEY;
// NOTE: SMOKE_ACCOUNT_ID / SMOKE_USER_ID are deliberately NOT read here.
// They pointed at a real owner account, so every run wrote `trigger-smoke:*`
// workflows into production data that the harness then only SOFT-deleted. This
// suite now provisions a throwaway account per run and hard-deletes it in afterAll.

const RUN = ALLOW_DB && ALLOW_TRIGGER && !!URL && !!SERVICE_KEY && !!TOKEN_KEY;
const describeLive = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP trigger smoke (calendly webhook) — needs ALLOW_DB_INTEGRATION_TESTS + ALLOW_TRIGGER_SMOKE + " +
      "Supabase env + TOKEN_ENCRYPTION_KEY (provisions a throwaway smoke account per run). " +
      "No live-provider gates / no connected Calendly account / no app-level signing secret required " +
      "(direct-seed; Calendly signing keys are per-subscription, V2-minted).",
  );
}

describeLive("trigger smoke: calendly webhook lifecycle (real dev DB, direct-seeded synthetic webhooks)", () => {
  let supabase: SupabaseClient;
  // Provisioned in beforeAll so nothing is created under a real account.
  const fixtures = createFixtureTracker();
  let deps: ReturnType<typeof makeRealCalendlyWebhookSmokeDeps>;

  beforeAll(async () => {
    supabase = createClient(URL!, SERVICE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { accountId, userId } = await provisionDisposableSmokeAccount(supabase, fixtures);
    deps = makeRealCalendlyWebhookSmokeDeps({ supabase, accountId, userId });
  });

  // Hard-deletes the throwaway account and everything created under it. Throws
  // if anything survives, so a leak fails the suite instead of accumulating.
  afterAll(async () => {
    await cleanupFixtures(supabase, fixtures);
  });

  it.each(CALENDLY_SMOKE_SPECS.map((s) => [s.triggerType, s] as const))(
    "calendly:%s: seed -> synthetic signed event fires 1, terminal succeeded, dedup holds, 0 leaked",
    async (_label, spec) => {
      const r = await runCalendlyWebhookSmoke(spec, deps, {
        afterDeliverAttempts: 8,
        afterDeliverSleepMs: 500,
        dedupSettleMs: 1000,
      });
      console.log(
        JSON.stringify({ event: "trigger-smoke.calendly-webhook.result", ...r }),
      );

      expect(r.outcome).toBe("pass");
      expect(r.cleaned).toBe(true);
      expect(r.seededEventType).toBe(spec.triggerType);
      expect(r.baselineRunCount).toBe(0);
      expect(r.deliverHttpStatus).toBe(200);
      expect(r.afterRunCount).toBe(1);
      expect(r.identityMatched).toBe(true);
      expect(r.terminalStatus).toBe("succeeded");
      expect(r.afterRedeliverRunCount).toBe(1);
      expect(r.dedupProven).toBe(true);
    },
    120_000,
  );
});
