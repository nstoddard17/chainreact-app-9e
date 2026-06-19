/**
 * @jest-environment node
 *
 * Action smoke harness — LIVE-connected workflow mode against a real dev DB +
 * real providers (double-gated).
 *
 * Runs `liveSafe` fixtures through the SAME manual run-now path as the app, but in
 * engine REAL mode (testMode=false) so the provider handler actually calls the
 * provider API. This is the one path that can hit a live provider, so it is gated
 * behind TWO explicit opt-ins on top of the DB gates.
 *
 * SAFETY:
 *   - Only `liveSafe: true` fixtures run; everything else SKIPs before any
 *     workflow is created.
 *   - The seeded fixtures are read-only (Slack conversations.list) + a pure native
 *     transform. No write/destructive fixture is liveSafe.
 *   - Destructive fixtures additionally need includeDestructive +
 *     ALLOW_DESTRUCTIVE_PROVIDER_SMOKE — neither is set here by default.
 *   - Real runs consume one task from SMOKE_ACCOUNT_ID's balance.
 *   - Reports carry only status + sanitized reasons — never provider output,
 *     tokens, signed URLs, or bytes.
 *
 * Requirements (else the suite SKIPs — never fails in CI):
 *   ALLOW_DB_INTEGRATION_TESTS=true
 *   ALLOW_LIVE_PROVIDER_SMOKE=true
 *   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-loaded from .env.local)
 *   SMOKE_ACCOUNT_ID + SMOKE_USER_ID
 *   provider connection env per fixture (e.g. SMOKE_SLACK_CONNECTED=1 — needs a
 *   real Slack connection on SMOKE_ACCOUNT_ID; otherwise the Slack fixture SKIPs).
 *
 * Run (bash):
 *   ALLOW_DB_INTEGRATION_TESTS=true ALLOW_LIVE_PROVIDER_SMOKE=true \
 *     SMOKE_ACCOUNT_ID=... SMOKE_USER_ID=... SMOKE_SLACK_CONNECTED=1 \
 *     npm run smoke:actions:run:workflow:live
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { ALL_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import { runActionSmokeWorkflowMode } from "@/tests/smoke-actions/harness";
import { makeRealWorkflowRunDeps } from "@/tests/smoke-actions/workflowRunDeps";
import { renderExecutionHuman, renderExecutionJson } from "@/scripts/chainreact/smoke/core";

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
const ALLOW_LIVE = process.env.ALLOW_LIVE_PROVIDER_SMOKE === "true";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ACCOUNT_ID = process.env.SMOKE_ACCOUNT_ID;
const USER_ID = process.env.SMOKE_USER_ID;
const ALLOW_DESTRUCTIVE = process.env.ALLOW_DESTRUCTIVE_PROVIDER_SMOKE === "true";
const RUN = ALLOW_DB && ALLOW_LIVE && !!URL && !!SERVICE_KEY && !!ACCOUNT_ID && !!USER_ID;

const describeLive = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP action-smoke LIVE workflow harness — needs ALLOW_DB_INTEGRATION_TESTS=true AND " +
      "ALLOW_LIVE_PROVIDER_SMOKE=true with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + " +
      "SMOKE_ACCOUNT_ID + SMOKE_USER_ID (runs real provider calls for liveSafe fixtures).",
  );
}

describeLive("action smoke: LIVE-connected workflow mode (real dev DB + providers)", () => {
  const supabase = createClient(URL as string, SERVICE_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const deps = makeRealWorkflowRunDeps({
    supabase,
    accountId: ACCOUNT_ID as string,
    userId: USER_ID as string,
    newUuid: randomUUID,
  });

  it("runs liveSafe fixtures live and reaches terminal persisted state with no FAIL", async () => {
    const report = await runActionSmokeWorkflowMode(
      ALL_SMOKE_FIXTURES,
      {
        live: true,
        includeDestructive: ALLOW_DESTRUCTIVE,
        allowDestructive: ALLOW_DESTRUCTIVE,
        terminalReadAttempts: 5,
      },
      deps,
    );
    if (!report.ok) {
      console.error(renderExecutionHuman(report));
    }
    expect(report.mode).toBe("workflow-live");
    expect(report.totals.fail).toBe(0);

    // Every result is tagged with the live boundary; the report leaks no secrets.
    const serialized = renderExecutionJson(report);
    expect(report.results.every((r) => r.providerBoundary === "live")).toBe(true);
    expect(serialized).not.toMatch(/xox[abprs]-/);

    // The native baseline always runs live + passes.
    const native = report.results.find(
      (r) => r.provider === "native" && r.action === "format_transformer",
    );
    expect(native?.outcome).toBe("pass");

    // Non-liveSafe fixtures are skipped even in live mode.
    const send = report.results.find((r) => r.action === "send_channel_message");
    expect(send?.outcome).toBe("skip");
  }, 30_000);
});
