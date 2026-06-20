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
 * Optional:
 *   SMOKE_PROVIDER=<id> — run only one provider's live fixtures (e.g.
 *   SMOKE_PROVIDER=google-drive). Unset runs every fixture; unconfigured
 *   providers self-skip. Mirrors the inventory `--provider` flag. The filter
 *   only narrows WHICH fixtures run — it never bypasses any fixture-level env
 *   or write/destructive gate.
 *
 * Run (bash):
 *   ALLOW_DB_INTEGRATION_TESTS=true ALLOW_LIVE_PROVIDER_SMOKE=true \
 *     SMOKE_ACCOUNT_ID=... SMOKE_USER_ID=... SMOKE_SLACK_CONNECTED=1 \
 *     npm run smoke:actions:run:workflow:live
 *
 *   # one provider only:
 *   ALLOW_DB_INTEGRATION_TESTS=true ALLOW_LIVE_PROVIDER_SMOKE=true \
 *     SMOKE_ACCOUNT_ID=... SMOKE_USER_ID=... SMOKE_PROVIDER=google-drive \
 *     SMOKE_GOOGLE_DRIVE_CONNECTED=1 \
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
import { isCertifiedLivePass } from "@/scripts/chainreact/smoke/certification";

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
const ALLOW_WRITE = process.env.ALLOW_LIVE_PROVIDER_WRITE_SMOKE === "true";
const HAS_SLACK_CHANNEL = !!process.env.SMOKE_SLACK_CHANNEL_ID;
// Optional single-provider scope (mirrors the inventory `--provider` flag).
const PROVIDER_FILTER = process.env.SMOKE_PROVIDER || null;
// Explicit full-regression sweep: re-run actions already certified LIVE_PASS
// (default is to CERTIFIED-SKIP them to conserve task budget + provider calls).
const RERUN_PASSED =
  process.env.SMOKE_RERUN_PASSED === "1" || process.env.SMOKE_RERUN_PASSED === "true";
/** True when the given provider's fixtures are in scope this run. */
const inScope = (provider: string): boolean =>
  PROVIDER_FILTER === null || PROVIDER_FILTER === provider;
const RUN = ALLOW_DB && ALLOW_LIVE && !!URL && !!SERVICE_KEY && !!ACCOUNT_ID && !!USER_ID;

const describeLive = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP action-smoke LIVE workflow harness — needs ALLOW_DB_INTEGRATION_TESTS=true AND " +
      "ALLOW_LIVE_PROVIDER_SMOKE=true with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + " +
      "SMOKE_ACCOUNT_ID + SMOKE_USER_ID (runs real provider calls for liveSafe fixtures). " +
      "Optional SMOKE_PROVIDER=<id> scopes the run to one provider.",
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
        providerFilter: PROVIDER_FILTER,
        includeDestructive: ALLOW_DESTRUCTIVE,
        allowDestructive: ALLOW_DESTRUCTIVE,
        allowWrite: ALLOW_WRITE,
        terminalReadAttempts: 5,
        // This is THE live verification runner: turn the certification planner
        // ON so a default sweep skips already-certified LIVE_PASS actions
        // (CERT-SKIP) and conserves task budget + provider calls. The operator
        // opts into a full regression sweep with SMOKE_RERUN_PASSED=1.
        applyCertificationPlanner: true,
        rerunPassed: RERUN_PASSED,
      },
      deps,
    );
    // Always print the human report so the operator sees PASS / FAIL / SKIP +
    // the grouped missing-env summary (env names only — no secrets).
    console.log(renderExecutionHuman(report));

    expect(report.mode).toBe("workflow-live");
    expect(report.totals.fail).toBe(0);

    // Every result is tagged with the live boundary; the report leaks no secrets.
    const serialized = renderExecutionJson(report);
    expect(report.results.every((r) => r.providerBoundary === "live")).toBe(true);
    expect(serialized).not.toMatch(/xox[abprs]-/);

    // A provider filter narrows the result set to that provider only.
    if (PROVIDER_FILTER) {
      expect(report.results.every((r) => r.provider === PROVIDER_FILTER)).toBe(true);
    }

    // The native baseline always runs live + passes (when in scope).
    if (inScope("native")) {
      const native = report.results.find(
        (r) => r.provider === "native" && r.action === "format_transformer",
      );
      expect(native?.outcome).toBe("pass");
    }

    // The Slack WRITE fixture: when already certified LIVE_PASS it is
    // CERTIFIED-SKIPPED by default (no re-post); under SMOKE_RERUN_PASSED=1 it
    // posts a real message only when the write gate AND the channel id are set;
    // otherwise it SKIPs (never runs by accident).
    if (inScope("slack")) {
      const send = report.results.find((r) => r.action === "send_channel_message");
      expect(send?.liveRisk).toBe("write");
      const sendCertSkipped = !RERUN_PASSED && isCertifiedLivePass("slack", "send_channel_message");
      if (sendCertSkipped) {
        expect(send?.outcome).toBe("certified-skip");
      } else if (ALLOW_WRITE && HAS_SLACK_CHANNEL) {
        expect(send?.outcome).toBe("pass");
      } else {
        expect(send?.outcome).toBe("skip");
      }

      // The destructive fixture is never liveSafe (and never LIVE_PASS) → always
      // skipped here, regardless of the planner.
      const del = report.results.find((r) => r.action === "delete_message");
      expect(del?.outcome).toBe("skip");
    }
  }, 30_000);
});
