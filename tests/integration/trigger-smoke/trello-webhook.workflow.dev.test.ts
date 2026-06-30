/**
 * @jest-environment node
 *
 * Trigger-smoke — trello:new_card LIVE dispatch proof (real dev DB), direct-seed.
 *
 * Drives the REAL Trello webhook receipt path with a fully synthetic, HMAC-signed
 * createCard board webhook (no real board/card, no Trello API call):
 *   create active {trello:new_card → native no-op} workflow
 *     → DIRECT-SEED the trigger_resources row (provider trello / eventType new_card /
 *       keyed by workflowId+nodeId / config { callbackURL, eventType, boardId }) —
 *       NO activation hook, NO Trello API, NO real webhook created
 *     → assert the seeded event_type is the canonical dispatch key
 *     → BASELINE: 0 runs before any delivery
 *     → sign a synthetic createCard body with the REAL TRELLO_CLIENT_SECRET
 *       (X-Trello-Webhook = base64 HMAC-SHA1 over rawBody + the SEEDED callbackURL)
 *       and POST it to the REAL POST /api/webhooks/trello?workflowId=&nodeId= (real
 *       verify → classify → filter → normalize → dispatchTriggerEvent → dedup →
 *       enqueue)
 *     → assert exactly 1 run whose trigger_event identifies the synthetic card
 *       (action id + card id + board id)
 *     → drain the durable-queue run → assert terminal 'succeeded'
 *     → re-send the SAME action id → assert dedup keeps it at exactly 1 run
 *     → delete the seeded trigger_resources row + soft-delete the workflow + delete
 *       the dedup row.
 *
 * DIRECT-SEED CONTRACT: certifies the receive/verify/classify/filter/normalize/
 * dispatch/dedup/enqueue/drain/terminal path. Does NOT certify Trello provider-side
 * subscription activation (webhook create/delete via the Trello API). See the harness
 * header + readiness checkpoint §17. Trello's HMAC binds the callbackURL; the harness
 * seeds a known callbackURL and signs with that same string, so verification passes
 * without a real Trello-registered URL and production verification is UNWEAKENED.
 *
 * NO live-provider gates: synthetic receipt, native no-op action, no Trello API. It
 * needs only a real DB + TRELLO_CLIENT_SECRET. NO connected Trello account required.
 *
 * Run:
 *   ALLOW_DB_INTEGRATION_TESTS=true ALLOW_TRIGGER_SMOKE=true \
 *     npm run smoke:triggers:webhook   (runs slack + github + trello)
 *   or just this file:
 *   ALLOW_DB_INTEGRATION_TESTS=true ALLOW_TRIGGER_SMOKE=true \
 *     npx jest tests/integration/trigger-smoke/trello-webhook.workflow.dev.test.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

import { runTrelloWebhookSmoke } from "@/tests/trigger-smoke/trelloWebhookSmoke";
import { makeRealTrelloWebhookSmokeDeps } from "@/tests/trigger-smoke/trelloWebhookSmokeDeps";

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
const ACCOUNT_ID = process.env.SMOKE_ACCOUNT_ID;
const USER_ID = process.env.SMOKE_USER_ID;
const CLIENT_SECRET = process.env.TRELLO_CLIENT_SECRET;

const RUN =
  ALLOW_DB &&
  ALLOW_TRIGGER &&
  !!URL &&
  !!SERVICE_KEY &&
  !!ACCOUNT_ID &&
  !!USER_ID &&
  !!CLIENT_SECRET;
const describeLive = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP trigger smoke (trello webhook) — needs ALLOW_DB_INTEGRATION_TESTS + ALLOW_TRIGGER_SMOKE + " +
      "Supabase env + SMOKE_ACCOUNT_ID + SMOKE_USER_ID + TRELLO_CLIENT_SECRET. " +
      "No live-provider gates / no connected Trello account required (direct-seed).",
  );
}

describeLive("trigger smoke: trello:new_card (real dev DB, direct-seeded synthetic webhook)", () => {
  const supabase = createClient(URL as string, SERVICE_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const deps = makeRealTrelloWebhookSmokeDeps({
    supabase,
    accountId: ACCOUNT_ID as string,
    userId: USER_ID as string,
  });

  it("seed → synthetic signed createCard fires 1, terminal succeeded, dedup holds, 0 leaked", async () => {
    const r = await runTrelloWebhookSmoke(deps, {
      afterDeliverAttempts: 8,
      afterDeliverSleepMs: 500,
      dedupSettleMs: 1000,
    });
    console.log(JSON.stringify({ event: "trigger-smoke.trello-webhook.result", ...r }));

    expect(r.outcome).toBe("pass");
    expect(r.cleaned).toBe(true);
    expect(r.seededEventType).toBe("new_card");
    expect(r.baselineRunCount).toBe(0);
    expect(r.deliverHttpStatus).toBe(200);
    expect(r.afterRunCount).toBe(1);
    expect(r.identityMatched).toBe(true);
    expect(r.terminalStatus).toBe("succeeded");
    expect(r.afterRedeliverRunCount).toBe(1);
    expect(r.dedupProven).toBe(true);
  }, 120_000);
});
