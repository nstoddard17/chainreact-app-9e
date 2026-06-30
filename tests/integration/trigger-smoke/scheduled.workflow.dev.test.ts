/**
 * @jest-environment node
 *
 * Trigger-smoke — native:schedule.fired LIVE dispatch proof (real dev DB).
 *
 * Drives the REAL scheduled-trigger dispatch path end-to-end:
 *   create active {schedule.fired → native no-op} workflow
 *     → arm via the real registerWorkflowTriggers (computes nextFireAt)
 *     → tick the real runScheduledTriggers BEFORE nextFireAt → assert 0 runs
 *     → tick AT nextFireAt → assert exactly 1 run via dispatchTriggerEvent
 *     → drain the durable-queue run → assert terminal 'succeeded'
 *     → unregister triggers + soft-delete the workflow.
 *
 * NO live-provider gates: the workflow is native-only (no external provider, no
 * send/broadcast, no resource mutation), so it needs only a real DB. The cron
 * orchestrator is GLOBAL, so the harness refuses to drive it (SKIP) if any OTHER
 * scheduled workflow would be due at the injected instant — blast radius 0.
 *
 * Run:
 *   ALLOW_DB_INTEGRATION_TESTS=true ALLOW_TRIGGER_SMOKE=true \
 *     npm run smoke:triggers:scheduled
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

import { runScheduledTriggerSmoke } from "@/tests/trigger-smoke/scheduledSmoke";
import { makeRealScheduledSmokeDeps } from "@/tests/trigger-smoke/scheduledSmokeDeps";

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

const RUN = ALLOW_DB && ALLOW_TRIGGER && !!URL && !!SERVICE_KEY && !!ACCOUNT_ID && !!USER_ID;
const describeLive = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP trigger smoke (scheduled) — needs ALLOW_DB_INTEGRATION_TESTS + ALLOW_TRIGGER_SMOKE + " +
      "Supabase env + SMOKE_ACCOUNT_ID + SMOKE_USER_ID. No live-provider gates required.",
  );
}

describeLive("trigger smoke: native:schedule.fired (real dev DB, dispatch path)", () => {
  const supabase = createClient(URL as string, SERVICE_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const deps = makeRealScheduledSmokeDeps({
    supabase,
    accountId: ACCOUNT_ID as string,
    userId: USER_ID as string,
  });

  it("arms, fires once through the scheduled dispatch path, reaches terminal, cleans up", async () => {
    const r = await runScheduledTriggerSmoke(deps);
    console.log(JSON.stringify({ event: "trigger-smoke.scheduled.result", ...r }));

    // A blast-radius SKIP (other scheduled rows due) is a safe non-failure; only a
    // real FAIL reds the suite. A PASS additionally asserts the full invariant.
    expect(r.outcome === "pass" || r.outcome === "skip").toBe(true);
    expect(r.cleaned).toBe(true);
    if (r.outcome === "pass") {
      expect(r.baselineRunCount).toBe(0);
      expect(r.afterRunCount).toBe(1);
      expect(r.terminalStatus).toBe("succeeded");
    }
  }, 60_000);
});
