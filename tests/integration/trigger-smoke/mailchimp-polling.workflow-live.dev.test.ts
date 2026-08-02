/**
 * @jest-environment node
 *
 * Trigger-smoke — Mailchimp POLLING LIVE dispatch proof (real dev DB + REAL
 * Mailchimp), one `it` per seedable Mailchimp polling trigger:
 *
 *   mailchimp:subscriber_added_to_segment — certified add_subscriber + add_tag
 *       (tags ARE static segments); plus-addressed crsmoke member B fires it
 *   mailchimp:segment_updated             — same tag-add flips member_count 1→2
 *   mailchimp:campaign_created            — smoke-only inline DRAFT campaign
 *       (never sent; marker title); deleted after
 *
 * Each drives the REAL polling dispatch path: prepare seeds + settles →
 * arm via registerWorkflowTriggers (activation captures the baseline
 * snapshot) → baseline poll fires 0 → run-unique crsmoke change → bounded
 * re-poll → exactly 1 run carrying the marker → drain → terminal 'succeeded'
 * → absorbed-snapshot poll fires 0 more (WATERMARK) → the pre-change snapshot
 * is RESTORED and re-polled: the poller re-detects the change and
 * webhook_event_dedup drops it (DEDUP) → cleanup (delete_permanent members,
 * delete smoke segment + draft campaign, unregister, soft-delete, dedup rows)
 * → 0 leaked.
 *
 * LIVE-PROVIDER surface: real Mailchimp API calls against the action-certified
 * smoke account's audience. Mutations are smoke-owned only: plus-addressed
 * members (permanently deleted), one marker tag segment per segment run
 * (deleted), one DRAFT campaign (deleted, never sent). NO mail is sent at any
 * point.
 *
 * Run:
 *   ALLOW_DB_INTEGRATION_TESTS=true ALLOW_TRIGGER_SMOKE=true \
 *     npm run smoke:triggers:mailchimp
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  runMailchimpPollingSmoke,
  ALL_MAILCHIMP_POLLING_SPECS,
} from "@/tests/trigger-smoke/mailchimpPollingSmoke";
import { makeRealMailchimpPollingSmokeDeps } from "@/tests/trigger-smoke/mailchimpPollingSmokeDeps";
import { resolveLiveSmokeAccount } from "@/tests/helpers/smokeAccount";

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
// Live smoke must name its target account EXPLICITLY (SMOKE_LIVE_*). It must
// never inherit the general-purpose SMOKE_ACCOUNT_ID, which pointed at a real
// production account and caused smoke workflows to be written into real data.
const LIVE_ACCOUNT = resolveLiveSmokeAccount();
const ACCOUNT_ID = LIVE_ACCOUNT?.accountId;
const USER_ID = LIVE_ACCOUNT?.userId;

const RUN = ALLOW_DB && ALLOW_TRIGGER && !!URL && !!SERVICE_KEY && !!ACCOUNT_ID && !!USER_ID;
const describeLive = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP trigger smoke (mailchimp polling) — needs ALLOW_DB_INTEGRATION_TESTS + " +
      "ALLOW_TRIGGER_SMOKE + Supabase env + SMOKE_LIVE_ACCOUNT_ID + SMOKE_LIVE_USER_ID " +
      "(+ a connected Mailchimp integration with an audience; prepare fails loudly without it).",
  );
}

describeLive("trigger smoke: Mailchimp polling family (real dev DB + real Mailchimp, marker seeds)", () => {
  let supabase: SupabaseClient;
  let deps: ReturnType<typeof makeRealMailchimpPollingSmokeDeps>;

  beforeAll(() => {
    supabase = createClient(URL!, SERVICE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    deps = makeRealMailchimpPollingSmokeDeps({
      supabase,
      accountId: ACCOUNT_ID as string,
      userId: USER_ID as string,
      pinnedAudienceId: process.env.SMOKE_MAILCHIMP_AUDIENCE_ID ?? null,
    });
  });

  for (const spec of ALL_MAILCHIMP_POLLING_SPECS) {
    it(`${spec.label}: prepare → baseline 0 → marker change fires 1, terminal succeeded, watermark + restored-snapshot dedup hold, 0 leaked`, async () => {
      const r = await runMailchimpPollingSmoke(deps, spec, {
        // Mailchimp read-side propagation (tag → segment membership/count)
        // can lag several seconds.
        afterPollAttempts: 10,
        afterPollSleepMs: 2500,
      });
      console.log(JSON.stringify({ event: "trigger-smoke.mailchimp-polling.result", ...r }));

      expect(r.outcome).toBe("pass");
      expect(r.cleaned).toBe(true);
      expect(r.snapshotPresent).toBe(true);
      expect(r.baselineRunCount).toBe(0);
      expect(r.afterRunCount).toBe(1);
      expect(r.identityMatched).toBe(true);
      expect(r.terminalStatus).toBe("succeeded");
      expect(r.afterWatermarkRunCount).toBe(1);
      expect(r.watermarkProven).toBe(true);
      expect(r.afterRestoreRunCount).toBe(1);
      expect(r.dedupProven).toBe(true);
    }, 300_000);
  }
});
