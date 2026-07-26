/**
 * ANALYTICS-STRIPE-PAYMENTS-LIVE-CERT-1 Phase A — Stripe Payments READ-ONLY
 * live certification.
 *
 * WHY THIS EXISTS: the `stripe.payments` Custom Insights dataset is fully
 * implemented and fixture-proven but has shipped as `exposure: "preview"`
 * since CD-2 because no connected Stripe account has ever been available to
 * certify it against the real API. This harness is the certification gate: it
 * proves — live and read-only — the connected-account identity, test-mode
 * posture, charge projection wire types, `created[gte|lte]` push-down, the
 * publicly-offered customer filter, cursor pagination, the status domain the
 * aggregator normalizes, and the empty-window path. A passing run authorizes
 * flipping the single declarative `exposure` field to "public".
 *
 * STRICTLY READ-ONLY: GET /v1/balance, GET /v1/account, GET /v1/charges and
 * GET /v1/customers only. No charge, customer, refund, subscription, payout or
 * invoice is created, modified, captured, refunded or deleted; no Stripe
 * setting or scope changes. Credentials resolve only through the canonical
 * seam (getActiveForExecution + refreshAndRetry); ciphertext is never touched
 * and no token is printed. It reuses the SAME wrappers the dataset uses
 * (`chargesList` / `customersList` / the `stripe:customers` resolver) rather
 * than re-implementing the provider boundary.
 *
 * EVIDENCE SAFETY: prints status classes, counts, presence tallies, JS types,
 * distinct-value counts and timings only. It never prints the Stripe account
 * id, a charge id, a customer id, a customer name or email, an amount, a
 * description, receipt/card/payment-method detail, metadata, a failure
 * message, a token, or a raw payload. Charge ids and one customer id are held
 * transiently in memory ONLY to drive the pagination cursor and the customer
 * filter, and are never printed or recorded.
 *
 * Run:  npx tsx scripts/trash/stripe-payments-analytics-cert.ts
 */

import { readFileSync } from "node:fs";

function loadEnv(): void {
  for (const path of [
    "C:/Users/marcu/source/repos/ChainReactV2/.env.local",
    ".env.local",
  ]) {
    try {
      const text = readFileSync(path, "utf8");
      for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && process.env[m[1]!] === undefined) {
          process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
        }
      }
      return;
    } catch {
      /* next */
    }
  }
  throw new Error("no .env.local found");
}

type Verdict = "PASS" | "FAIL" | "SKIP";
const results: { check: string; verdict: Verdict; detail: string }[] = [];
function record(check: string, verdict: Verdict, detail: string): void {
  results.push({ check, verdict, detail });
  console.log(`[${verdict}] ${check} — ${detail}`);
}

function classify(err: unknown): string {
  const name = err instanceof Error ? err.constructor.name : typeof err;
  const status = (err as { status?: number } | null)?.status;
  return `${name}${status ? ` status=${status}` : ""}`;
}

/** The status domain services/analytics/insights/stripe/aggregate.ts normalizes. */
const KNOWN_STATUSES = new Set(["succeeded", "pending", "failed"]);
const CCY_RE = /^[a-z]{3}$/;

async function main(): Promise<void> {
  loadEnv();

  const { stripeApiBase } = await import("@/integrations/_shared/stripe/api/_base");

  // ── 0. Real-provider guard — refuse a mocked/overridden base ──────────────
  const base = stripeApiBase();
  if (process.env.STRIPE_API_BASE || base !== "https://api.stripe.com") {
    record("live_guard", "FAIL", "STRIPE_API_BASE override detected — refusing a mock run");
    return summarize();
  }
  record("live_guard", "PASS", "no API-base override — calls hit the real Stripe API");

  const { getActiveForExecution } = await import("@/repositories/integrations");
  const { refreshAndRetry, Unauthorized401Error } = await import(
    "@/services/oauth/refreshAndRetry"
  );
  const { chargesList } = await import("@/integrations/stripe/api/charges");
  const { stripeCustomersResolver } = await import("@/integrations/stripe/options/customers");

  // ── 1. Connection through the canonical seam ──────────────────────────────
  const accountId = process.env.SMOKE_ACCOUNT_ID;
  if (!accountId) throw new Error("SMOKE_ACCOUNT_ID unset");
  const integration = await getActiveForExecution(accountId, "stripe", null);
  if (!integration) {
    record(
      "connection",
      "FAIL",
      "no active Stripe integration for the development account — an approved Stripe TEST-mode account must be connected before certification can run",
    );
    return summarize({ blocked: true, reason: "no connected Stripe test account" });
  }
  record(
    "connection",
    "PASS",
    `active Stripe integration resolved through getActiveForExecution (stored connected-account ref present=${integration.providerAccountId !== null})`,
  );

  const call = <T>(apiCall: (accessToken: string) => Promise<T>): Promise<T> =>
    refreshAndRetry({
      accountId: integration.accountId,
      provider: "stripe",
      providerAccountId: integration.providerAccountId,
      apiCall,
    });
  const timed = async <T>(fn: () => Promise<T>): Promise<[T, number]> => {
    const t0 = Date.now();
    return [await fn(), Date.now() - t0];
  };

  // Raw GET that preserves rate-limit headers (stripeRequest discards them).
  let rateHeadersSeen: string[] = [];
  const rawGet = async <T>(accessToken: string, path: string): Promise<T> => {
    const res = await fetch(`${base}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    const rl = [...res.headers.keys()].filter(
      (h) => h.toLowerCase().includes("ratelimit") || h.toLowerCase() === "retry-after",
    );
    if (rl.length > 0) rateHeadersSeen = rl;
    if (res.status === 401) throw new Unauthorized401Error(`Stripe GET ${path} returned HTTP 401`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  };

  // ── 2. Test-mode posture — /v1/balance carries `livemode`, no identity ────
  let testMode = false;
  try {
    const [balance, ms] = await timed(() =>
      call((t) => rawGet<{ livemode?: unknown }>(t, "/v1/balance")),
    );
    testMode = balance.livemode === false;
    record(
      "test_mode",
      testMode ? "PASS" : "FAIL",
      testMode
        ? `GET /v1/balance 200 in ${ms}ms · livemode=false — credential is an approved TEST-mode connection (no balance figure read)`
        : `GET /v1/balance 200 in ${ms}ms · livemode is not false — refusing to certify against a LIVE customer payment account without separate authorization`,
    );
  } catch (err) {
    record("test_mode", "FAIL", `GET /v1/balance → ${classify(err)}`);
  }
  if (!testMode) {
    return summarize({ blocked: true, reason: "connection is not an approved test-mode account" });
  }

  // ── 3. Account ownership — stored connection determines the account ───────
  try {
    const [account, ms] = await timed(() =>
      call((t) => rawGet<{ id?: unknown }>(t, "/v1/account")),
    );
    // The id is compared transiently and NEVER printed.
    const matches =
      integration.providerAccountId === null ||
      String(account.id) === String(integration.providerAccountId);
    record(
      "account_ownership",
      matches ? "PASS" : "FAIL",
      `GET /v1/account 200 in ${ms}ms · returned account matches the stored connection=${matches} · the Stripe account is fixed by the stored credential — no request parameter selects it (the dataset query contract has no account field)`,
    );
  } catch (err) {
    record("account_ownership", "FAIL", `GET /v1/account → ${classify(err)}`);
  }

  // ── 4. Charge read + projected wire types ────────────────────────────────
  const nowSec = Math.floor(Date.now() / 1000);
  const yearAgoSec = nowSec - 366 * 24 * 60 * 60;
  let rows: Awaited<ReturnType<typeof chargesList>>["data"] = [];
  try {
    const [page, ms] = await timed(() =>
      call((t) =>
        chargesList({
          accessToken: t,
          createdGte: yearAgoSec,
          createdLte: nowSec,
          limit: 100,
        }),
      ),
    );
    rows = page.data;
    const intAmounts = rows.filter((c) => Number.isInteger(c.amount)).length;
    const numCreated = rows.filter((c) => typeof c.created === "number").length;
    const isoCcy = rows.filter((c) => typeof c.currency === "string" && CCY_RE.test(c.currency)).length;
    const strStatus = rows.filter((c) => typeof c.status === "string").length;
    const boolPaid = rows.filter((c) => typeof c.paid === "boolean").length;
    const boolRefunded = rows.filter((c) => typeof c.refunded === "boolean").length;
    const custLinked = rows.filter((c) => typeof c.customer === "string" && c.customer.length > 0).length;
    record(
      "charge_read",
      rows.length > 0 ? "PASS" : "FAIL",
      rows.length > 0
        ? `GET /v1/charges 200 in ${ms}ms over a 366-day window · rows=${rows.length} · has_more=${page.has_more} · created number=${numCreated}/${rows.length} · amount integer minor-units=${intAmounts}/${rows.length} · currency ISO-lowercase=${isoCcy}/${rows.length} · status string=${strStatus}/${rows.length} · customer-linked=${custLinked}/${rows.length} · [wire-only, NOT read by the dataset scanner: paid boolean=${boolPaid}/${rows.length} · refunded boolean=${boolRefunded}/${rows.length}]`
        : "0 charges in the last 366 days — payment semantics CANNOT be certified",
    );
  } catch (err) {
    record("charge_read", "FAIL", `charge list → ${classify(err)}`);
  }
  if (rows.length === 0) {
    return summarize({ blocked: true, reason: "no charges in the connected test account" });
  }

  // ── 5. Amount + currency shape ───────────────────────────────────────────
  const nonInt = rows.filter((c) => !Number.isInteger(c.amount)).length;
  const negative = rows.filter((c) => c.amount < 0).length;
  const missingCcy = rows.filter(
    (c) => typeof c.currency !== "string" || !CCY_RE.test(c.currency),
  ).length;
  const distinctCcy = new Set(rows.map((c) => c.currency)).size;
  record(
    "amount_shape",
    nonInt === 0 ? "PASS" : "FAIL",
    `non-integer amounts=${nonInt} · negative amounts=${negative} · amounts arrive as integer MINOR units (no string coercion path) · consistent with the dataset's integer minor-unit accumulation`,
  );
  record(
    "currency_shape",
    missingCcy === 0 ? "PASS" : "FAIL",
    `charges missing an ISO-shaped currency=${missingCcy}/${rows.length} · distinct currencies observed=${distinctCcy} · every monetary record carries its own currency — no implicit USD path is reachable`,
  );

  // ── 6. Status domain normalizes through the existing aggregator ──────────
  const statuses = new Set(rows.map((c) => c.status));
  const unknown = [...statuses].filter((s) => !KNOWN_STATUSES.has(s));
  const succeeded = rows.filter((c) => c.status === "succeeded").length;
  const failed = rows.filter((c) => c.status === "failed").length;
  const pending = rows.filter((c) => c.status === "pending").length;
  record(
    "status_domain",
    unknown.length === 0 && succeeded > 0 ? "PASS" : "FAIL",
    `distinct statuses=${statuses.size} · outside the aggregator's declared {succeeded,pending,failed} domain=${unknown.length} · succeeded=${succeeded} pending=${pending} failed=${failed} · charges carrying the wire refunded flag=${rows.filter((c) => c.refunded).length} — the dataset deliberately never reads it, so refunds are NOT subtracted from gross`,
  );

  // ── 7. created[gte|lte] push-down narrows ────────────────────────────────
  const created = rows.map((c) => c.created).sort((a, b) => a - b);
  const distinctDates = new Set(
    rows.map((c) => new Date(c.created * 1000).toISOString().slice(0, 10)),
  ).size;
  try {
    const cutoff = created[Math.floor(created.length / 2)]!;
    const page = await call((t) =>
      chargesList({ accessToken: t, createdGte: cutoff, createdLte: nowSec, limit: 100 }),
    );
    const allIn = page.data.every((c) => c.created >= cutoff);
    const narrowed = page.data.length <= rows.length && created[0]! < cutoff;
    record(
      "date_filter",
      allIn && page.data.length <= rows.length ? "PASS" : "FAIL",
      `created[gte]/created[lte] push-down · rows=${page.data.length} (from ${rows.length}) · all inside window=${allIn} · strictly narrowed=${narrowed} · distinct created dates in the full window=${distinctDates}`,
    );
  } catch (err) {
    record("date_filter", "FAIL", `date-filtered charge list → ${classify(err)}`);
  }

  // ── 8. Cursor pagination — no duplicates, no skips, terminal page ────────
  try {
    const pageSize = Math.max(1, Math.min(3, Math.ceil(rows.length / 2)));
    const seen = new Set<string>();
    const order: number[] = [];
    let startingAfter: string | undefined;
    let pages = 0;
    let duplicate = 0;
    let terminal = false;
    while (pages < 5) {
      const page = await call((t) =>
        chargesList({
          accessToken: t,
          createdGte: yearAgoSec,
          createdLte: nowSec,
          limit: pageSize,
          ...(startingAfter ? { startingAfter } : {}),
        }),
      );
      pages += 1;
      for (const c of page.data) {
        if (seen.has(c.id)) duplicate += 1;
        seen.add(c.id);
        order.push(c.created);
      }
      if (!page.has_more || page.data.length === 0) {
        terminal = true;
        break;
      }
      startingAfter = page.data[page.data.length - 1]!.id;
    }
    const newestFirst = order.every((v, i) => i === 0 || order[i - 1]! >= v);
    const reference = rows.slice(0, seen.size).map((c) => c.id);
    const skipped = reference.filter((id) => !seen.has(id)).length;
    record(
      "pagination",
      duplicate === 0 && skipped === 0 ? "PASS" : "FAIL",
      `pages walked=${pages} · pageSize=${pageSize} · distinct records=${seen.size} · duplicates=${duplicate} · skipped vs reference prefix=${skipped} · created non-increasing (newest-first bias holds)=${newestFirst} · terminated by has_more=false=${terminal} · starting_after cursor accepted`,
    );
  } catch (err) {
    record("pagination", "FAIL", `paged walk → ${classify(err)}`);
  }

  // ── 9. Customer filter — the publicly offered dataset filter ─────────────
  const linked = rows.filter((c) => typeof c.customer === "string" && c.customer.length > 0);
  if (linked.length === 0) {
    record(
      "customer_filter",
      "FAIL",
      "no customer-linked charges exist in the test account — the dataset's publicly offered customer filter CANNOT be certified (owner action: supply Stripe test data with a customer-linked charge, or explicitly approve removing the filter)",
    );
  } else {
    try {
      // Resolve through the same `stripe:customers` resolver the picker uses.
      const resolved = await stripeCustomersResolver.resolve({
        userId: process.env.SMOKE_USER_ID ?? "cert-harness",
        integration,
        q: "",
        deps: {},
      });
      const targetCustomer = linked[0]!.customer as string;
      const pickerOffersTarget = resolved.items.some((i) => i.value === targetCustomer);
      const labelsLeakEmail = resolved.items.some((i) => /@/.test(i.label));
      const page = await call((t) =>
        chargesList({
          accessToken: t,
          customer: targetCustomer,
          createdGte: yearAgoSec,
          createdLte: nowSec,
          limit: 100,
        }),
      );
      const allMatch = page.data.every((c) => c.customer === targetCustomer);
      const narrowed = page.data.length <= rows.length;
      record(
        "customer_filter",
        allMatch && narrowed && !labelsLeakEmail ? "PASS" : "FAIL",
        `stripe:customers resolver returned ${resolved.items.length} option(s) (hasMore=${resolved.hasMore}) · picker offers the target customer=${pickerOffersTarget} · option labels contain an email=${labelsLeakEmail} · server-side customer narrowing: rows=${page.data.length} (from ${rows.length}) · all rows belong to the selected customer=${allMatch} · the customer id is a server-side list param only and never enters a fact or an aggregate`,
      );
    } catch (err) {
      record("customer_filter", "FAIL", `customer-filtered charge list → ${classify(err)}`);
    }
  }

  // ── 10. Empty window ─────────────────────────────────────────────────────
  try {
    const page = await call((t) =>
      chargesList({
        accessToken: t,
        createdGte: Math.floor(Date.UTC(1971, 0, 1) / 1000),
        createdLte: Math.floor(Date.UTC(1972, 0, 1) / 1000),
        limit: 5,
      }),
    );
    record(
      "empty_window",
      page.data.length === 0 && page.has_more === false ? "PASS" : "FAIL",
      `rows=${page.data.length} · has_more=${page.has_more}`,
    );
  } catch (err) {
    record("empty_window", "FAIL", `empty-window charge list → ${classify(err)}`);
  }

  // ── 11. Rate-limit posture ───────────────────────────────────────────────
  record(
    "rate_limit_metadata",
    rateHeadersSeen.length > 0 ? "PASS" : "SKIP",
    rateHeadersSeen.length > 0
      ? `rate-limit/retry-after header names observed on responses=${rateHeadersSeen.length} (presence only) · no 429 provoked; provider 429 classification stays fixture-tested`
      : "no rate-limit headers observed on read responses · no 429 provoked; provider 429 classification stays fixture-tested",
  );

  // ── 12. Minimum useful data for public exposure ──────────────────────────
  const sufficient =
    rows.length >= 2 && succeeded >= 1 && linked.length >= 1 && distinctDates > 1;
  record(
    "data_sufficiency",
    sufficient ? "PASS" : "FAIL",
    `charges=${rows.length} (need ≥2) · succeeded=${succeeded} (need ≥1) · customer-linked=${linked.length} (need ≥1) · distinct created dates=${distinctDates} (need >1) · currency present on all=${missingCcy === 0}`,
  );

  summarize({ blocked: false });
}

function summarize(gate?: { blocked: boolean; reason?: string }): void {
  console.log("\n=== Stripe Payments live-certification summary ===");
  for (const r of results) console.log(`${r.verdict.padEnd(4)} ${r.check}`);
  if (!gate) {
    console.log("\nPHASE B AUTHORIZED: NO — prerequisites failed before any read");
    return;
  }
  const failed = results.filter((r) => r.verdict === "FAIL").map((r) => r.check);
  if (failed.length === 0 && !gate.blocked) {
    console.log("\nPHASE B AUTHORIZED: YES");
    return;
  }
  console.log(
    `\nPHASE B AUTHORIZED: NO — ${
      gate.blocked && failed.length === 0
        ? gate.reason ?? "insufficient live data"
        : `failing: ${failed.join(", ")}`
    }`,
  );
}

main().catch((err) => {
  console.error("harness error:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
