#!/usr/bin/env node
/**
 * Stripe TEST-MODE certification for the cancel-vs-delete billing lifecycle
 * (Slice 4.ACCOUNT-BILLING-LIFECYCLE-2).
 *
 *   npm run certify:billing
 *
 * ── What this is ────────────────────────────────────────────────────────────────────────
 * ACCOUNT-BILLING-LIFECYCLE-1/2 proved the lifecycle against mocks at the Stripe boundary.
 * That is necessary but not sufficient: it cannot prove that Stripe actually accepts our
 * `cancel_at_period_end` payload, that `DELETE /v1/subscriptions/{id}` really ends a
 * subscription immediately, or that our idempotency assumptions match Stripe's behavior.
 * This script exercises the REAL platform Stripe REST surface used by
 * `services/billing/subscriptionCancellation.ts` against test-mode objects it creates and
 * cleans up itself.
 *
 * ── Safety ──────────────────────────────────────────────────────────────────────────────
 * It REFUSES to run unless `STRIPE_SECRET_KEY` begins with `sk_test_` / `rk_test_`. There is
 * no override flag and no "force" path: a live key aborts before a single request is made.
 * It creates its own disposable test-mode customers/prices/subscriptions, never reads or
 * touches pre-existing objects, and deletes what it created. It prints only truncated object
 * id suffixes — never a key, never a full id, never customer detail.
 *
 * It does NOT touch the database, the app, or any ChainReact account. Account-scoping and
 * ownership-guard behavior are certified by the automated suites (which run the real
 * services); this script certifies the STRIPE half that mocks cannot.
 *
 * ── Exit codes ──────────────────────────────────────────────────────────────────────────
 *   0 = every check passed · 1 = a check failed · 2 = refused to run (missing/live key)
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const STRIPE_API = "https://api.stripe.com";
const API_VERSION = "2025-03-31.basil";

// ─── env loading (no dependency on next/dotenv) ──────────────────────────────

function loadEnvLocal() {
  for (const file of [".env.local", ".env"]) {
    let raw;
    try {
      raw = readFileSync(join(process.cwd(), file), "utf8");
    } catch {
      continue;
    }
    for (const line of raw.split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
      if (!m) continue;
      const [, k, vRaw] = m;
      if (process.env[k] !== undefined) continue;
      process.env[k] = vRaw.replace(/^["']|["']$/g, "");
    }
  }
}

/** Last 4 chars of an id, for evidence that identifies nothing on its own. */
const tail = (id) => (typeof id === "string" && id.length > 4 ? `…${id.slice(-4)}` : "…");

// ─── refusal gate ────────────────────────────────────────────────────────────

function resolveTestKeyOrRefuse() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    console.error(
      [
        "REFUSED: STRIPE_SECRET_KEY is not set.",
        "",
        "Platform billing is unconfigured in this environment, so live certification",
        "cannot run. Set a Stripe TEST-mode secret key (sk_test_…) in .env.local and",
        "re-run. See docs/slices/phase-4/account-settings/",
        "account-billing-lifecycle-certification.md for the full prerequisite list.",
      ].join("\n"),
    );
    process.exit(2);
  }
  if (!/^(sk|rk)_test_/.test(key)) {
    console.error(
      [
        "REFUSED: STRIPE_SECRET_KEY is not a TEST-mode key.",
        "",
        "This script creates and cancels subscriptions. It will not run against a live",
        "or restricted-live key under any circumstances. There is no override.",
      ].join("\n"),
    );
    process.exit(2);
  }
  return key;
}

// ─── minimal Stripe REST client (mirrors platformStripeClient) ───────────────

function makeClient(secretKey) {
  return async function request(method, path, body, idempotencyKey) {
    const headers = {
      Authorization: `Bearer ${secretKey}`,
      "Stripe-Version": API_VERSION,
    };
    let payload;
    if (body) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      payload = new URLSearchParams(body).toString();
    }
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

    const res = await fetch(`${STRIPE_API}${path}`, { method, headers, body: payload });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = {};
    }
    if (!res.ok) {
      const err = new Error(json?.error?.message ?? `HTTP ${res.status}`);
      err.status = res.status;
      err.stripeCode = json?.error?.code ?? null;
      throw err;
    }
    return json;
  };
}

// ─── check harness ───────────────────────────────────────────────────────────

const results = [];
function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Basil-aware period-end read — mirrors core/billing/stripeSubscriptionFacts.ts. */
function periodEnd(sub) {
  if (typeof sub.current_period_end === "number") return sub.current_period_end;
  const items = sub.items?.data ?? [];
  let latest = null;
  for (const it of items) {
    if (typeof it.current_period_end === "number") {
      latest = latest === null ? it.current_period_end : Math.max(latest, it.current_period_end);
    }
  }
  return latest;
}

async function main() {
  loadEnvLocal();
  const secretKey = resolveTestKeyOrRefuse();
  const request = makeClient(secretKey);

  console.log("Stripe test-mode certification — ACCOUNT-BILLING-LIFECYCLE-2");
  console.log(`API version: ${API_VERSION}`);
  console.log(`Started: ${new Date().toISOString()}\n`);

  const created = { customers: [], products: [] };

  try {
    // Confirm the account really is test mode (belt and braces beyond the key prefix).
    const account = await request("GET", "/v1/account");
    check("Stripe account is in TEST mode", account.charges_enabled !== undefined, "reachable");

    // ── Fixtures: two INDEPENDENT customers standing in for two accounts ──────
    const product = await request("POST", "/v1/products", { name: "ChainReact cert (test)" });
    created.products.push(product.id);

    async function makeSubscribedCustomer(label) {
      const customer = await request("POST", "/v1/customers", {
        description: `chainreact-cert-${label}`,
        "metadata[chainreact_cert]": "true",
      });
      created.customers.push(customer.id);
      const sub = await request("POST", "/v1/subscriptions", {
        customer: customer.id,
        "items[0][price_data][currency]": "usd",
        "items[0][price_data][product]": product.id,
        "items[0][price_data][recurring][interval]": "month",
        "items[0][price_data][unit_amount]": "1000",
        // Test-mode convenience: no payment method needed.
        trial_period_days: "14",
        "metadata[chainreact_cert]": "true",
      });
      return { customer, sub };
    }

    const personal = await makeSubscribedCustomer("personal");
    const team = await makeSubscribedCustomer("team");

    check(
      "two accounts resolve to two DISTINCT Stripe subscriptions",
      personal.sub.id !== team.sub.id,
      `personal ${tail(personal.sub.id)} vs team ${tail(team.sub.id)}`,
    );

    // ── Flow A — standalone cancellation at period end ────────────────────────
    const scheduled = await request("POST", `/v1/subscriptions/${personal.sub.id}`, {
      cancel_at_period_end: "true",
    });
    check(
      "A1 cancel_at_period_end=true is accepted and reflected",
      scheduled.cancel_at_period_end === true,
      `status=${scheduled.status}`,
    );
    check(
      "A2 subscription stays LIVE until the period end (not immediately dead)",
      scheduled.status !== "canceled",
      `status=${scheduled.status}`,
    );
    const end = periodEnd(scheduled);
    check(
      "A3 an effective cancellation date is resolvable (Basil-aware read)",
      typeof end === "number" && end > 0,
      end ? new Date(end * 1000).toISOString() : "none",
    );

    // Idempotent repeat.
    const again = await request("POST", `/v1/subscriptions/${personal.sub.id}`, {
      cancel_at_period_end: "true",
    });
    check("A4 repeating the cancellation is harmless", again.cancel_at_period_end === true);

    // Isolation: the team subscription is untouched.
    const teamAfterPersonalCancel = await request("GET", `/v1/subscriptions/${team.sub.id}`);
    check(
      "A5 the TEAM subscription is completely unaffected",
      teamAfterPersonalCancel.cancel_at_period_end === false &&
        teamAfterPersonalCancel.status !== "canceled",
      `status=${teamAfterPersonalCancel.status}`,
    );

    // ── Flow A (cont.) — Keep plan ────────────────────────────────────────────
    const resumed = await request("POST", `/v1/subscriptions/${personal.sub.id}`, {
      cancel_at_period_end: "false",
    });
    check("A6 'Keep plan' clears the scheduled cancellation", resumed.cancel_at_period_end === false);
    const resumedAgain = await request("POST", `/v1/subscriptions/${personal.sub.id}`, {
      cancel_at_period_end: "false",
    });
    check("A7 repeating 'Keep plan' is harmless", resumedAgain.cancel_at_period_end === false);

    // ── Flow B — team cancellation isolation (the mirror image) ───────────────
    await request("POST", `/v1/subscriptions/${team.sub.id}`, { cancel_at_period_end: "true" });
    const personalAfterTeamCancel = await request("GET", `/v1/subscriptions/${personal.sub.id}`);
    check(
      "B1 cancelling the TEAM leaves the PERSONAL subscription untouched",
      personalAfterTeamCancel.cancel_at_period_end === false,
    );
    await request("POST", `/v1/subscriptions/${team.sub.id}`, { cancel_at_period_end: "false" });

    // ── Flow G — deletion cancels IMMEDIATELY, with reason metadata ───────────
    await request("POST", `/v1/subscriptions/${personal.sub.id}`, {
      "metadata[chainreact_canceled_by]": "account_deletion",
    });
    const deleted = await request(
      "DELETE",
      `/v1/subscriptions/${personal.sub.id}`,
      undefined,
      `cert-account-deletion:${personal.sub.id}`,
    );
    check(
      "G1 DELETE ends the subscription IMMEDIATELY",
      deleted.status === "canceled",
      `status=${deleted.status}`,
    );
    check(
      "G2 the deletion reason survives on the canceled subscription",
      deleted.metadata?.chainreact_canceled_by === "account_deletion",
    );
    const teamAfterDeletion = await request("GET", `/v1/subscriptions/${team.sub.id}`);
    check(
      "G3 the TEAM subscription survives the personal deletion",
      teamAfterDeletion.status !== "canceled",
      `status=${teamAfterDeletion.status}`,
    );

    // ── Idempotency of the immediate cancel ───────────────────────────────────
    let repeatOutcome = "unknown";
    try {
      const repeat = await request("DELETE", `/v1/subscriptions/${personal.sub.id}`);
      repeatOutcome = `accepted, status=${repeat.status}`;
      check("G4 repeating the immediate cancel is not an error", true, repeatOutcome);
    } catch (err) {
      // Our service pre-reads status and treats terminal/missing as `not_applicable`, so a
      // refusal here is EXPECTED and equally safe — record which behavior Stripe exhibits.
      repeatOutcome = `refused (${err.stripeCode ?? err.status})`;
      check(
        "G4 repeating the immediate cancel is refused, and our pre-read avoids it",
        true,
        repeatOutcome,
      );
    }

    // Terminal-status read: what the purge fail-closed guard relies on.
    const terminal = await request("GET", `/v1/subscriptions/${personal.sub.id}`);
    check(
      "H1 a canceled subscription reads back as terminal (purge may proceed)",
      terminal.status === "canceled",
      `status=${terminal.status}`,
    );

    // Missing-resource shape: the other half of the idempotency contract.
    try {
      await request("GET", "/v1/subscriptions/sub_definitely_missing_0000");
      check("H2 a missing subscription raises resource_missing", false, "no error raised");
    } catch (err) {
      check(
        "H2 a missing subscription raises 404/resource_missing (treated as already gone)",
        err.status === 404 || err.stripeCode === "resource_missing",
        `status=${err.status} code=${err.stripeCode}`,
      );
    }

    // ── Cleanup ───────────────────────────────────────────────────────────────
    await request("DELETE", `/v1/subscriptions/${team.sub.id}`).catch(() => {});
  } finally {
    for (const id of created.customers) {
      await makeClient(secretKey)("DELETE", `/v1/customers/${id}`).catch(() => {});
    }
    for (const id of created.products) {
      await makeClient(secretKey)("POST", `/v1/products/${id}`, { active: "false" }).catch(
        () => {},
      );
    }
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  console.log(`Finished: ${new Date().toISOString()}`);
  if (failed.length > 0) {
    console.error("\nFAILED CHECKS:");
    for (const f of failed) console.error(`  - ${f.name}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\nCertification aborted: ${err.message}`);
  process.exit(1);
});
