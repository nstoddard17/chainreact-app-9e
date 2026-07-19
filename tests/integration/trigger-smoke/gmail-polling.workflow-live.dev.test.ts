/**
 * @jest-environment node
 *
 * Trigger-smoke — Gmail POLLING LIVE dispatch proof (real dev DB + REAL Gmail),
 * one `it` per registered Gmail polling trigger:
 *
 *   gmail:new_email          — certified send_email self-send; subject-marker filter
 *   gmail:new_labeled_email  — certified create_label + send_email + add_label
 *   gmail:new_attachment     — proven smoke multipart self-send w/ marked attachment
 *
 * Each drives the REAL polling dispatch path: arm via registerWorkflowTriggers
 * (activation seeds snapshot.historyId from usersGetProfile) → baseline poll
 * fires 0 → run-unique crsmoke seed message → bounded re-poll → exactly 1 run
 * whose persisted trigger_event carries the marker → drain → terminal
 * 'succeeded' → advanced-cursor poll fires 0 more (WATERMARK) → REWOUND-cursor
 * poll re-surfaces the message and webhook_event_dedup drops it (DEDUP) →
 * cleanup (trash seed, delete smoke label, unregister, soft-delete, dedup row)
 * → 0 leaked.
 *
 * LIVE-PROVIDER surface: real Gmail API calls (profile, history.list,
 * messages.get, messages.send, labels create/delete, messages.modify,
 * messages.trash) against the action-certified smoke Gmail account. The ONLY
 * mailbox mutations are smoke-owned: marker messages (trashed; Gmail
 * auto-purges trash in 30 days) and one marker label per labeled run
 * (deleted). No mail leaves the account (self-send only).
 *
 * Run:
 *   ALLOW_DB_INTEGRATION_TESTS=true ALLOW_TRIGGER_SMOKE=true \
 *     npm run smoke:triggers:gmail
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

import {
  runGmailPollingSmoke,
  ALL_GMAIL_POLLING_SPECS,
} from "@/tests/trigger-smoke/gmailPollingSmoke";
import { makeRealGmailPollingSmokeDeps } from "@/tests/trigger-smoke/gmailPollingSmokeDeps";
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
    "SKIP trigger smoke (gmail polling) — needs ALLOW_DB_INTEGRATION_TESTS + " +
      "ALLOW_TRIGGER_SMOKE + Supabase env + SMOKE_LIVE_ACCOUNT_ID + SMOKE_LIVE_USER_ID " +
      "(+ a connected Gmail integration on the smoke account; arming fails loudly without it).",
  );
}

describeLive("trigger smoke: Gmail polling family (real dev DB + real Gmail, marker seeds)", () => {
  const supabase = createClient(URL as string, SERVICE_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const deps = makeRealGmailPollingSmokeDeps({
    supabase,
    accountId: ACCOUNT_ID as string,
    userId: USER_ID as string,
  });

  for (const spec of ALL_GMAIL_POLLING_SPECS) {
    it(`${spec.label}: arm → baseline 0 → marker seed fires 1, terminal succeeded, watermark + rewound dedup hold, 0 leaked`, async () => {
      const r = await runGmailPollingSmoke(deps, spec, {
        // Gmail history propagation can lag a few seconds after a send.
        afterPollAttempts: 10,
        afterPollSleepMs: 2000,
      });
      console.log(JSON.stringify({ event: "trigger-smoke.gmail-polling.result", ...r }));

      expect(r.outcome).toBe("pass");
      expect(r.cleaned).toBe(true);
      expect(r.armedHistoryId).not.toBeNull();
      expect(r.baselineRunCount).toBe(0);
      expect(r.afterRunCount).toBe(1);
      expect(r.identityMatched).toBe(true);
      expect(r.terminalStatus).toBe("succeeded");
      expect(r.afterWatermarkRunCount).toBe(1);
      expect(r.watermarkProven).toBe(true);
      expect(r.afterRewindRunCount).toBe(1);
      expect(r.dedupProven).toBe(true);
    }, 240_000);
  }
});
