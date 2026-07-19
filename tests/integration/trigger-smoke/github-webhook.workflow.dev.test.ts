/**
 * @jest-environment node
 *
 * Trigger-smoke — github:new_commit LIVE dispatch proof (real dev DB), direct-seed.
 *
 * Drives the REAL GitHub webhook receipt path with a fully synthetic, HMAC-signed
 * push delivery (no real repo, no GitHub API call):
 *   create active {github:new_commit → native no-op} workflow
 *     → DIRECT-SEED the trigger_resources row (provider github / eventType
 *       new_commit / keyed by workflowId+nodeId) — NO activation hook, NO GitHub
 *       API, NO real webhook created
 *     → assert the seeded event_type is the canonical dispatch key
 *     → BASELINE: 0 runs before any delivery
 *     → sign a synthetic push body with the REAL GITHUB_WEBHOOK_SECRET
 *       (X-Hub-Signature-256: sha256=<hex>) and POST it to the REAL
 *       POST /api/webhooks/github?workflowId=&nodeId= (real verify → normalize →
 *       dispatchTriggerEvent → dedup → enqueue)
 *     → assert exactly 1 run whose trigger_event identifies the synthetic delivery
 *       (deliveryId + repo + head commit sha)
 *     → drain the durable-queue run → assert terminal 'succeeded'
 *     → re-send the SAME delivery id → assert dedup keeps it at exactly 1 run
 *     → delete the seeded trigger_resources row + soft-delete the workflow + delete
 *       the dedup row.
 *
 * DIRECT-SEED CONTRACT: this certifies the receive/verify/normalize/dispatch/dedup/
 * enqueue/drain/terminal path. It does NOT certify GitHub provider-side subscription
 * activation (webhook create/delete via the GitHub API) — that is intentionally not
 * exercised. See the harness header + readiness checkpoint §16.
 *
 * NO live-provider gates: synthetic receipt, native no-op action, no GitHub API. It
 * needs only a real DB + GITHUB_WEBHOOK_SECRET to sign the synthetic request the
 * production route verifies. Production verification is UNWEAKENED — only the payload
 * is synthetic. NO connected GitHub account required.
 *
 * Run:
 *   ALLOW_DB_INTEGRATION_TESTS=true ALLOW_TRIGGER_SMOKE=true \
 *     npm run smoke:triggers:webhook   (runs slack + github)
 *   or just this file:
 *   ALLOW_DB_INTEGRATION_TESTS=true ALLOW_TRIGGER_SMOKE=true \
 *     npx jest tests/integration/trigger-smoke/github-webhook.workflow.dev.test.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

import { runGitHubWebhookSmoke } from "@/tests/trigger-smoke/githubWebhookSmoke";
import { makeRealGitHubWebhookSmokeDeps } from "@/tests/trigger-smoke/githubWebhookSmokeDeps";
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
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;
// NOTE: SMOKE_ACCOUNT_ID / SMOKE_USER_ID are deliberately NOT read here.
// They pointed at a real owner account, so every run wrote `trigger-smoke:*`
// workflows into production data that the harness then only SOFT-deleted. This
// suite now provisions a throwaway account per run and hard-deletes it in afterAll.

const RUN = ALLOW_DB && ALLOW_TRIGGER && !!URL && !!SERVICE_KEY && !!WEBHOOK_SECRET;
const describeLive = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP trigger smoke (github webhook) — needs ALLOW_DB_INTEGRATION_TESTS + ALLOW_TRIGGER_SMOKE + " +
      "Supabase env + GITHUB_WEBHOOK_SECRET (provisions a throwaway smoke account per run). " +
      "No live-provider gates / no connected GitHub account required (direct-seed).",
  );
}

describeLive("trigger smoke: github:new_commit (real dev DB, direct-seeded synthetic webhook)", () => {
  const supabase = createClient(URL as string, SERVICE_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Provisioned in beforeAll so nothing is created under a real account.
  const fixtures = createFixtureTracker();
  let deps: ReturnType<typeof makeRealGitHubWebhookSmokeDeps>;

  beforeAll(async () => {
    const { accountId, userId } = await provisionDisposableSmokeAccount(supabase, fixtures);
    deps = makeRealGitHubWebhookSmokeDeps({ supabase, accountId, userId });
  });

  // Hard-deletes the throwaway account and everything created under it. Throws
  // if anything survives, so a leak fails the suite instead of accumulating.
  afterAll(async () => {
    await cleanupFixtures(supabase, fixtures);
  });

  it("seed → synthetic signed push fires 1, terminal succeeded, dedup holds, 0 leaked", async () => {
    const r = await runGitHubWebhookSmoke(deps, {
      afterDeliverAttempts: 8,
      afterDeliverSleepMs: 500,
      dedupSettleMs: 1000,
    });
    console.log(JSON.stringify({ event: "trigger-smoke.github-webhook.result", ...r }));

    expect(r.outcome).toBe("pass");
    expect(r.cleaned).toBe(true);
    expect(r.seededEventType).toBe("new_commit");
    expect(r.baselineRunCount).toBe(0);
    expect(r.deliverHttpStatus).toBe(200);
    expect(r.afterRunCount).toBe(1);
    expect(r.identityMatched).toBe(true);
    expect(r.terminalStatus).toBe("succeeded");
    expect(r.afterRedeliverRunCount).toBe(1);
    expect(r.dedupProven).toBe(true);
  }, 120_000);
});
