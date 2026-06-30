/**
 * @jest-environment node
 *
 * Trigger-smoke — Microsoft OneNote note-polling family LIVE dispatch proof.
 *
 * Real dev DB + real Microsoft Graph (OneNote). One `it` per trigger, driving the
 * spec-driven `runOneNotePollingSmoke`:
 *   - new_note     : locate smoke section → activate → poll(0) → create_page → poll(1, "created")
 *   - updated_note : locate smoke section → seed baseline page (scoped) → activate
 *                    → poll(0) → update_page → poll(1, "updated", same page)
 * then drain → terminal 'succeeded' → delete every smoke-owned page (certified
 * delete_page) → 0 leaked. The borrowed operator section is never deleted.
 *
 * If no operator-provisioned smoke/test-named OneNote section exists, the run SKIPS
 * (never writes to a real notebook). Drives the per-trigger OneNote poll handler
 * (the fn runOne calls), NOT the global runPollingTriggers().
 *
 * Gates (mutates OneNote pages → real provider write):
 *   ALLOW_DB_INTEGRATION_TESTS + ALLOW_TRIGGER_SMOKE + ALLOW_LIVE_PROVIDER_SMOKE +
 *   ALLOW_LIVE_PROVIDER_WRITE_SMOKE + ALLOW_DESTRUCTIVE_PROVIDER_SMOKE +
 *   Supabase env + SMOKE_ACCOUNT_ID + SMOKE_USER_ID + SMOKE_MICROSOFT_ONENOTE_CONNECTED
 *
 * Run:
 *   ALLOW_DB_INTEGRATION_TESTS=true ALLOW_TRIGGER_SMOKE=true \
 *     ALLOW_LIVE_PROVIDER_SMOKE=true ALLOW_LIVE_PROVIDER_WRITE_SMOKE=true \
 *     ALLOW_DESTRUCTIVE_PROVIDER_SMOKE=true SMOKE_MICROSOFT_ONENOTE_CONNECTED=1 \
 *     npm run smoke:triggers:onenote
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

import {
  runOneNotePollingSmoke,
  NEW_NOTE_SPEC,
  type OneNotePollingTriggerSpec,
} from "@/tests/trigger-smoke/onenotePollingSmoke";
import { makeRealOneNotePollingSmokeDeps } from "@/tests/trigger-smoke/onenotePollingSmokeDeps";

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
const ALLOW_LIVE = process.env.ALLOW_LIVE_PROVIDER_SMOKE === "true";
const ALLOW_WRITE = process.env.ALLOW_LIVE_PROVIDER_WRITE_SMOKE === "true";
const ALLOW_DESTRUCTIVE = process.env.ALLOW_DESTRUCTIVE_PROVIDER_SMOKE === "true";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ACCOUNT_ID = process.env.SMOKE_ACCOUNT_ID;
const USER_ID = process.env.SMOKE_USER_ID;
const ONENOTE_CONNECTED = process.env.SMOKE_MICROSOFT_ONENOTE_CONNECTED === "1";

const RUN =
  ALLOW_DB && ALLOW_TRIGGER && ALLOW_LIVE && ALLOW_WRITE && ALLOW_DESTRUCTIVE &&
  !!URL && !!SERVICE_KEY && !!ACCOUNT_ID && !!USER_ID && ONENOTE_CONNECTED;

const describeLive = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP trigger smoke (onenote polling) — needs ALLOW_DB_INTEGRATION_TESTS + ALLOW_TRIGGER_SMOKE + " +
      "ALLOW_LIVE_PROVIDER_SMOKE + ALLOW_LIVE_PROVIDER_WRITE_SMOKE + ALLOW_DESTRUCTIVE_PROVIDER_SMOKE + " +
      "Supabase env + SMOKE_ACCOUNT_ID + SMOKE_USER_ID + SMOKE_MICROSOFT_ONENOTE_CONNECTED.",
  );
}

describeLive("trigger smoke: microsoft-onenote note-polling family (real dev DB + Graph)", () => {
  const supabase = createClient(URL as string, SERVICE_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const deps = makeRealOneNotePollingSmokeDeps({
    supabase,
    accountId: ACCOUNT_ID as string,
    userId: USER_ID as string,
  });

  // Only new_note is live-certifiable. updated_note is BLOCKED (probe-proven): the
  // certified update_page (Graph PATCH /pages/{id}/content) does NOT change the page's
  // lastModifiedDateTime, which is the ONLY thing updated_note keys on — so an API
  // content edit can never fire it, and no certified action bumps lastModifiedDateTime
  // without a production change (out of lane). Its spec + unit tests stay authored; it
  // is deliberately excluded from the live cert list. See the readiness checkpoint §12.
  const specs: OneNotePollingTriggerSpec[] = [NEW_NOTE_SPEC];

  for (const spec of specs) {
    it(`${spec.label}: baseline poll 0, post-baseline change fires 1, terminal succeeded, 0 leaked`, async () => {
      // Bounded re-poll absorbs Graph's OneNote create→read propagation lag.
      const r = await runOneNotePollingSmoke(deps, spec, { afterPollAttempts: 8, afterPollSleepMs: 2000 });
      console.log(JSON.stringify({ event: "trigger-smoke.onenote-polling.result", ...r }));

      // A SKIP (no operator smoke section) is a safe non-failure; only FAIL reds the suite.
      expect(r.outcome === "pass" || r.outcome === "skip").toBe(true);
      expect(r.cleaned).toBe(true);
      if (r.outcome === "pass") {
        expect(r.baselineRunCount).toBe(0);
        expect(r.afterRunCount).toBe(1);
        expect(r.identityMatched).toBe(true);
        expect(r.terminalStatus).toBe("succeeded");
      }
    }, 240_000);
  }
});
