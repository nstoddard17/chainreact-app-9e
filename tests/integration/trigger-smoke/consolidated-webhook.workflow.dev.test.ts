/**
 * @jest-environment node
 *
 * Trigger-smoke — consolidated provider webhook LIVE dispatch proof (real dev
 * DB), on the generic direct-seed orchestrator. One `it` per provider spec:
 *
 *   stripe:event_received      — per-row whsec secret (smoke-minted), t=,v1=
 *   shopify:webhook_received   — REAL SHOPIFY_CLIENT_SECRET, base64 body HMAC
 *   hubspot:webhook_received   — REAL HUBSPOT_CLIENT_SECRET + HUBSPOT_APP_ID,
 *                                V3 canonical-string signature; app-sub + ref
 *                                seeding (shared-subscription model)
 *   mailchimp:audience_event   — no signature scheme; URL secrecy + audience
 *                                gate + allowlist + sha256(rawBody) dedup
 *
 * Each drives the REAL receipt path with a fully synthetic payload through the
 * REAL route: direct-seed registration → baseline 0 → signed synthetic event →
 * verify → normalize → dispatch → dedup → enqueue → drain → terminal
 * 'succeeded' → re-send same dedup identity → still 1 run → cleanup (0 leaked).
 *
 * HONEST SCOPE: V2 ingestion-path certs for each provider's event shape.
 * Provider-side subscription activation is NOT certified and no provider
 * delivered anything — no provider API is called at any point.
 *
 * Run:
 *   ALLOW_DB_INTEGRATION_TESTS=true ALLOW_TRIGGER_SMOKE=true \
 *     npx jest tests/integration/trigger-smoke/consolidated-webhook.workflow.dev.test.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

import {
  runDirectSeedWebhookSmoke,
  type DirectSeedWebhookSmokeResult,
} from "@/tests/trigger-smoke/directSeedWebhookSmoke";
import { STRIPE_EVENT_RECEIVED_SPEC } from "@/tests/trigger-smoke/stripeWebhookSmoke";
import { makeRealStripeWebhookSmokeDeps } from "@/tests/trigger-smoke/stripeWebhookSmokeDeps";
import { SHOPIFY_WEBHOOK_RECEIVED_SPEC } from "@/tests/trigger-smoke/shopifyWebhookSmoke";
import { makeRealShopifyWebhookSmokeDeps } from "@/tests/trigger-smoke/shopifyWebhookSmokeDeps";
import { HUBSPOT_WEBHOOK_RECEIVED_SPEC } from "@/tests/trigger-smoke/hubspotWebhookSmoke";
import { makeRealHubSpotWebhookSmokeDeps } from "@/tests/trigger-smoke/hubspotWebhookSmokeDeps";
import { MAILCHIMP_AUDIENCE_EVENT_SPEC } from "@/tests/trigger-smoke/mailchimpWebhookSmoke";
import { makeRealMailchimpWebhookSmokeDeps } from "@/tests/trigger-smoke/mailchimpWebhookSmokeDeps";
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
// NOTE: SMOKE_ACCOUNT_ID / SMOKE_USER_ID are deliberately NOT read here.
// They pointed at a real owner account, so every run wrote `trigger-smoke:*`
// workflows into production data that the harness then only SOFT-deleted. This
// suite now provisions a throwaway account per run and hard-deletes it in afterAll.

const BASE = ALLOW_DB && ALLOW_TRIGGER && !!URL && !!SERVICE_KEY;
const describeBase = BASE ? describe : describe.skip;

if (!BASE) {
  console.log(
    "SKIP trigger smoke (consolidated webhook) — needs ALLOW_DB_INTEGRATION_TESTS + " +
      "ALLOW_TRIGGER_SMOKE + Supabase env (provisions a throwaway smoke account per run).",
  );
}

const ASSERT_TIMEOUT_MS = 120_000;
const OPTS = {
  afterDeliverAttempts: 8,
  afterDeliverSleepMs: 500,
  dedupSettleMs: 1000,
} as const;

function assertPass(r: DirectSeedWebhookSmokeResult, expectedEventType: string): void {
  console.log(JSON.stringify({ event: "trigger-smoke.consolidated-webhook.result", ...r }));
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

describeBase("trigger smoke: consolidated webhook family (real dev DB, synthetic signed receipt)", () => {
  const supabase = createClient(URL as string, SERVICE_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Provisioned in beforeAll so nothing is created under a real account; the
  // ids are filled in before any `it` builds its deps from this object.
  const fixtures = createFixtureTracker();
  const config = {
    supabase,
    accountId: "",
    userId: "",
  };

  beforeAll(async () => {
    const { accountId, userId } = await provisionDisposableSmokeAccount(supabase, fixtures);
    config.accountId = accountId;
    config.userId = userId;
  });

  // Hard-deletes the throwaway account and everything created under it. Throws
  // if anything survives, so a leak fails the suite instead of accumulating.
  afterAll(async () => {
    await cleanupFixtures(supabase, fixtures);
  });

  // Stripe needs NO provider env — the signing secret is per-row and minted.
  it(
    "stripe:event_received: seed → synthetic signed event fires 1, terminal succeeded, dedup holds, 0 leaked",
    async () => {
      const r = await runDirectSeedWebhookSmoke(
        makeRealStripeWebhookSmokeDeps(config),
        STRIPE_EVENT_RECEIVED_SPEC,
        OPTS,
      );
      assertPass(r, "event_received");
    },
    ASSERT_TIMEOUT_MS,
  );

  const itShopify = process.env.SHOPIFY_CLIENT_SECRET ? it : it.skip;
  itShopify(
    "shopify:webhook_received: seed → synthetic signed event fires 1, terminal succeeded, dedup holds, 0 leaked",
    async () => {
      const r = await runDirectSeedWebhookSmoke(
        makeRealShopifyWebhookSmokeDeps(config),
        SHOPIFY_WEBHOOK_RECEIVED_SPEC,
        OPTS,
      );
      assertPass(r, "webhook_received");
    },
    ASSERT_TIMEOUT_MS,
  );

  const itHubspot =
    process.env.HUBSPOT_CLIENT_SECRET && process.env.HUBSPOT_APP_ID ? it : it.skip;
  itHubspot(
    "hubspot:webhook_received: seed app-sub+ref → synthetic signed event fires 1, terminal succeeded, dedup holds, 0 leaked",
    async () => {
      const r = await runDirectSeedWebhookSmoke(
        makeRealHubSpotWebhookSmokeDeps(config),
        HUBSPOT_WEBHOOK_RECEIVED_SPEC,
        OPTS,
      );
      assertPass(r, "webhook_received");
    },
    ASSERT_TIMEOUT_MS,
  );

  // Mailchimp needs NO provider env — there is no signature scheme.
  it(
    "mailchimp:audience_event: seed → synthetic form event fires 1, terminal succeeded, content-hash dedup holds, 0 leaked",
    async () => {
      const r = await runDirectSeedWebhookSmoke(
        makeRealMailchimpWebhookSmokeDeps(config),
        MAILCHIMP_AUDIENCE_EVENT_SPEC,
        OPTS,
      );
      assertPass(r, "audience_event");
    },
    ASSERT_TIMEOUT_MS,
  );
});
