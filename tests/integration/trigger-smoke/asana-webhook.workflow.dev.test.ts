/**
 * @jest-environment node
 *
 * Trigger-smoke — Asana webhook LIVE dispatch proof (real dev DB), direct-seed.
 *
 * Drives the REAL Asana webhook receipt path with fully synthetic, HMAC-signed
 * project webhook events (no real project/task, no Asana API call) for BOTH Asana
 * triggers (new_task_in_project / task_updated_in_project — Asana events are compact
 * gid-only objects, so no user-content-shaped data is fabricated):
 *   create active {asana:<trigger> -> native no-op} workflow
 *     -> DIRECT-SEED the trigger_resources row in its POST-ACTIVATION shape
 *       (provider asana / eventType <trigger> / keyed by workflowId+nodeId / config
 *       { projectId, hookSecretEncrypted: encryptToken(<smoke secret>) }) — NO
 *       activation hook, NO Asana API, NO real webhook created
 *     -> BASELINE: 0 runs before any delivery
 *     -> sign a synthetic Asana { events: [...] } body with the SAME per-row smoke
 *       secret (X-Hook-Signature = lowercase-hex HMAC-SHA256 over the raw body — the
 *       per-webhook secret model production uses) and POST it to the REAL
 *       POST /api/webhooks/asana?workflowId=&nodeId= (real per-row decrypt+verify ->
 *       classify -> event-type filter -> normalize -> dispatchTriggerEvent -> P-S2
 *       projectId filter -> dedup -> enqueue)
 *     -> assert exactly 1 run identifying the synthetic event -> drain -> 'succeeded'
 *     -> re-send the SAME event -> dedup keeps it at exactly 1 run
 *     -> delete the seeded row + soft-delete the workflow + delete the dedup row.
 *
 * DIRECT-SEED CONTRACT: certifies receive/verify/classify/filter/normalize/dispatch/
 * dedup/enqueue/drain/terminal. Does NOT certify the Asana provider-side lifecycle
 * (POST /webhooks + X-Hook-Secret handshake + DELETE /webhooks) — unit-tested at
 * tests/unit/integrations/asana/triggers/*, live proof needs owner credentials.
 *
 * NO live-provider gates: synthetic receipt, native no-op action, no Asana API. It
 * needs only a real DB + TOKEN_ENCRYPTION_KEY (to seed the encrypted per-row secret).
 * NO connected Asana account and NO app-level signing secret required (Asana secrets
 * are per-webhook).
 *
 * Run:
 *   ALLOW_DB_INTEGRATION_TESTS=true ALLOW_TRIGGER_SMOKE=true \
 *     npm run smoke:triggers:webhook   (slack + github + trello + monday + asana)
 *   or just this file:
 *   ALLOW_DB_INTEGRATION_TESTS=true ALLOW_TRIGGER_SMOKE=true \
 *     npx jest tests/integration/trigger-smoke/asana-webhook.workflow.dev.test.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  runAsanaWebhookSmoke,
  ALL_ASANA_WEBHOOK_SPECS,
} from "@/tests/trigger-smoke/asanaWebhookSmoke";
import { makeRealAsanaWebhookSmokeDeps } from "@/tests/trigger-smoke/asanaWebhookSmokeDeps";
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
    "SKIP trigger smoke (asana webhook) — needs ALLOW_DB_INTEGRATION_TESTS + ALLOW_TRIGGER_SMOKE + " +
      "Supabase env + TOKEN_ENCRYPTION_KEY (provisions a throwaway smoke account per run). " +
      "No live-provider gates / no connected Asana account / no app-level signing secret required " +
      "(direct-seed; Asana secrets are per-webhook).",
  );
}

describeLive("trigger smoke: asana webhook lifecycle (real dev DB, direct-seeded synthetic webhook)", () => {
  let supabase: SupabaseClient;
  // Provisioned in beforeAll so nothing is created under a real account.
  const fixtures = createFixtureTracker();
  let deps: ReturnType<typeof makeRealAsanaWebhookSmokeDeps>;

  beforeAll(async () => {
    supabase = createClient(URL!, SERVICE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { accountId, userId } = await provisionDisposableSmokeAccount(supabase, fixtures);
    deps = makeRealAsanaWebhookSmokeDeps({ supabase, accountId, userId });
  });

  // Hard-deletes the throwaway account and everything created under it. Throws
  // if anything survives, so a leak fails the suite instead of accumulating.
  afterAll(async () => {
    await cleanupFixtures(supabase, fixtures);
  });

  for (const spec of ALL_ASANA_WEBHOOK_SPECS) {
    it(`${spec.label}: seed -> synthetic signed event fires 1, terminal succeeded, dedup holds, 0 leaked`, async () => {
      const r = await runAsanaWebhookSmoke(deps, spec, {
        afterDeliverAttempts: 8,
        afterDeliverSleepMs: 500,
        dedupSettleMs: 1000,
      });
      console.log(JSON.stringify({ event: "trigger-smoke.asana-webhook.result", ...r }));

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
