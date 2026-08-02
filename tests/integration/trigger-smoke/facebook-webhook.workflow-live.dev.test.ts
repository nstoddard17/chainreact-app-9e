/**
 * @jest-environment node
 *
 * Trigger-smoke — Facebook Page webhook LIVE proof (real dev DB, real route,
 * real dispatch/filter/dedup), one `it` per registered Facebook trigger:
 *
 *   facebook:new_post / new_comment
 *
 * HONESTY SCOPE (see facebookWebhookSmoke.ts — the Slack-message-batch
 * policy): the event is fully SYNTHETIC (Facebook did NOT deliver; no Page
 * subscription exists; all ids + message text are smoke-minted crsmoke
 * markers, no real Page or post is touched) but it is signed with the REAL
 * FACEBOOK_CLIENT_SECRET and POSTed through the REAL /api/webhooks/facebook
 * route — verify → classify → normalize → dispatchTriggerEvent → the
 * registered pageId filter (positive match on the seeded row) → dedup →
 * enqueue → drain all run UNCHANGED. The production path does NO provider
 * fetch for this event shape, so real Page resources would add zero
 * ingestion coverage. Provider-side Page subscription activation is NOT
 * certified. The GET hub.challenge branch is probed on its FAIL-CLOSED path
 * only (403, challenge not echoed) — the local env does not carry
 * FACEBOOK_WEBHOOK_VERIFY_TOKEN.
 *
 * LIVE-PROVIDER surface: none (no Facebook API call, no send).
 *
 * Run:
 *   ALLOW_DB_INTEGRATION_TESTS=true ALLOW_TRIGGER_SMOKE=true \
 *     npm run smoke:triggers:facebook
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  runDirectSeedWebhookSmoke,
  type DirectSeedWebhookSmokeResult,
} from "@/tests/trigger-smoke/directSeedWebhookSmoke";
import { ALL_FACEBOOK_WEBHOOK_SPECS } from "@/tests/trigger-smoke/facebookWebhookSmoke";
import {
  makeRealFacebookWebhookSmokeDeps,
  probeFacebookVerifyHandshakeRejects,
} from "@/tests/trigger-smoke/facebookWebhookSmokeDeps";
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

const RUN =
  ALLOW_DB &&
  ALLOW_TRIGGER &&
  !!URL &&
  !!SERVICE_KEY &&
  !!ACCOUNT_ID &&
  !!USER_ID &&
  !!process.env.FACEBOOK_CLIENT_SECRET;
const describeLive = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP trigger smoke (facebook webhook) — needs ALLOW_DB_INTEGRATION_TESTS + " +
      "ALLOW_TRIGGER_SMOKE + Supabase env + SMOKE_LIVE_ACCOUNT_ID + SMOKE_LIVE_USER_ID + " +
      "FACEBOOK_CLIENT_SECRET.",
  );
}

function assertPass(r: DirectSeedWebhookSmokeResult, expectedEventType: string): void {
  console.log(JSON.stringify({ event: "trigger-smoke.facebook-webhook.result", ...r }));
  expect(r.outcome).toBe("pass");
  expect(r.cleaned).toBe(true);
  expect(r.seededEventType).toBe(expectedEventType);
  expect(r.baselineRunCount).toBe(0);
  expect(r.deliverHttpStatus).toBe(200);
  expect(r.afterRunCount).toBe(1);
  expect(r.identityMatched).toBe(true);
  expect(r.terminalStatus).toBe("succeeded");
  expect(r.afterRedeliverRunCount).toBe(1);
  expect(r.dedupProven).toBe(true);
}

describeLive("trigger smoke: Facebook Page webhook family (real dev DB + real dispatch)", () => {
  let supabase: SupabaseClient;
  let config: { supabase: SupabaseClient; accountId: string; userId: string };

  beforeAll(() => {
    supabase = createClient(URL!, SERVICE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    config = {
      supabase,
      accountId: ACCOUNT_ID as string,
      userId: USER_ID as string,
    };
  });

  it("GET hub.challenge with a wrong verify token is rejected 403 and never echoed", async () => {
    const probe = await probeFacebookVerifyHandshakeRejects();
    expect(probe.status).toBe(403);
    expect(probe.body).not.toContain("crsmoke-challenge-");
  }, 30_000);

  for (const spec of ALL_FACEBOOK_WEBHOOK_SPECS) {
    it(
      `${spec.label}: seed row → signed synthetic feed change fires 1 (filter positive match), terminal succeeded, dedup holds, 0 leaked`,
      async () => {
        const r = await runDirectSeedWebhookSmoke(
          makeRealFacebookWebhookSmokeDeps(config, spec),
          spec,
          { afterDeliverAttempts: 8, afterDeliverSleepMs: 1000, dedupSettleMs: 1500 },
        );
        assertPass(r, spec.expectedEventType);
      },
      120_000,
    );
  }
});
