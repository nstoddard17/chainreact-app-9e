/**
 * @jest-environment node
 *
 * Trigger-smoke — Slack webhook LIVE dispatch proof (real dev DB), spec-driven.
 *
 * One `it` per registered Slack webhook spec (ALL_SLACK_WEBHOOK_SPECS: the
 * lifecycle/metadata batch + the message.* batch incl. one filtered variant),
 * each driving the REAL receipt path with a fully synthetic, signed payload
 * (no real channel/file/message, no provider call):
 *   create active {slack trigger → native no-op} workflow
 *     → arm via the real registerWorkflowTriggers (pure trigger_resources upsert;
 *       Slack needs no provider-side subscription / no integration)
 *     → assert the stored event_type is the canonical dispatch key
 *     → BASELINE: 0 runs before any delivery
 *     → sign a synthetic event_callback (the spec supplies the inner event) with the
 *       REAL SLACK_SIGNING_SECRET and POST it to the REAL POST /api/webhooks/slack
 *       (real HMAC verify → normalize → dispatchTriggerEvent → dedup → enqueue)
 *     → assert exactly 1 run whose trigger_event identifies the synthetic event
 *     → drain the durable-queue run → assert terminal 'succeeded'
 *     → re-send the SAME event_id → assert dedup keeps it at exactly 1 run
 *     → unregister triggers + soft-delete the workflow + delete the dedup row.
 *
 * NO live-provider gates: the receipt is synthetic and the wired action is a
 * native no-op (no send/broadcast, no resource mutation, no Slack API call). It
 * needs only a real DB + SLACK_SIGNING_SECRET to sign the synthetic request the
 * production route verifies. Production signature verification is UNWEAKENED —
 * only the payload contents are synthetic. NO connected Slack account required.
 *
 * Run:
 *   ALLOW_DB_INTEGRATION_TESTS=true ALLOW_TRIGGER_SMOKE=true \
 *     npm run smoke:triggers:webhook
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

import {
  runSlackWebhookSmoke,
  ALL_SLACK_WEBHOOK_SPECS,
} from "@/tests/trigger-smoke/slackWebhookSmoke";
import { makeRealSlackWebhookSmokeDeps } from "@/tests/trigger-smoke/slackWebhookSmokeDeps";
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
const SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
// NOTE: SMOKE_ACCOUNT_ID / SMOKE_USER_ID are deliberately NOT read here.
// They pointed at a real owner account, so every run wrote `trigger-smoke:*`
// workflows into production data that the harness then only SOFT-deleted. This
// suite now provisions a throwaway account per run and hard-deletes it in afterAll.

const RUN = ALLOW_DB && ALLOW_TRIGGER && !!URL && !!SERVICE_KEY && !!SIGNING_SECRET;
const describeLive = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP trigger smoke (slack webhook) — needs ALLOW_DB_INTEGRATION_TESTS + ALLOW_TRIGGER_SMOKE + " +
      "Supabase env + SLACK_SIGNING_SECRET (provisions a throwaway smoke account per run). " +
      "No live-provider gates / no connected Slack account required.",
  );
}

describeLive("trigger smoke: Slack webhook family (real dev DB, synthetic webhook receipt)", () => {
  const supabase = createClient(URL as string, SERVICE_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Provisioned in beforeAll so nothing is created under a real account.
  const fixtures = createFixtureTracker();
  let deps: ReturnType<typeof makeRealSlackWebhookSmokeDeps>;

  beforeAll(async () => {
    const { accountId, userId } = await provisionDisposableSmokeAccount(supabase, fixtures);
    deps = makeRealSlackWebhookSmokeDeps({ supabase, accountId, userId });
  });

  // Hard-deletes the throwaway account and everything created under it. Throws
  // if anything survives, so a leak fails the suite instead of accumulating.
  afterAll(async () => {
    await cleanupFixtures(supabase, fixtures);
  });

  for (const spec of ALL_SLACK_WEBHOOK_SPECS) {
    it(`${spec.label}: arm → synthetic signed event fires 1, terminal succeeded, dedup holds, 0 leaked`, async () => {
      const r = await runSlackWebhookSmoke(deps, spec, {
        afterDeliverAttempts: 8,
        afterDeliverSleepMs: 500,
        dedupSettleMs: 1000,
      });
      console.log(JSON.stringify({ event: "trigger-smoke.slack-webhook.result", ...r }));

      expect(r.outcome).toBe("pass");
      expect(r.cleaned).toBe(true);
      expect(r.registeredEventType).toBe(spec.eventType);
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
