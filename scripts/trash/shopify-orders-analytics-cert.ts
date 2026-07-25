/**
 * ANALYTICS-CONNECTED-DATA-CD-4C Phase A — Shopify Orders READ-ONLY live
 * certification.
 *
 * WHY THIS EXISTS: the proposed Custom Insights dataset (shopify/orders)
 * builds measures on total_price, currency, financial_status,
 * fulfillment_status, cancelled_at, test, and created_at filtering with
 * Link-header cursor pagination. The FIXED analytics source projects only 4 of
 * those fields, so fulfillment status, cancellation, test markers and the
 * `order=created_at desc` sort have NEVER been observed through this codebase.
 * Each is proven against the real API before any dataset code is written.
 *
 * STRICTLY READ-ONLY: GET /shop.json and GET /orders.json only. No order is
 * created, updated, cancelled, refunded or fulfilled; no customer/product/
 * inventory change; no scope or store-configuration change. Credentials
 * resolve only through the canonical seam (getActiveForExecution +
 * refreshAndRetry); ciphertext is never touched.
 *
 * EVIDENCE SAFETY: prints status classes, counts, presence tallies, JS types,
 * distinct-value counts and timings only. It never prints the shop name or
 * domain, an order id or number, a customer, a product, an amount, an email,
 * a token, or a raw payload. Order ids are read transiently ONLY to check
 * page-boundary uniqueness and are never printed.
 *
 * Run:  npx tsx scripts/trash/shopify-orders-analytics-cert.ts
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

interface RawOrder {
  id?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  cancelled_at?: unknown;
  total_price?: unknown;
  currency?: unknown;
  financial_status?: unknown;
  fulfillment_status?: unknown;
  test?: unknown;
}

const CERT_FIELDS =
  "id,created_at,updated_at,cancelled_at,total_price,currency,financial_status,fulfillment_status,test";
const AMOUNT_RE = /^-?\d+\.\d{2}$/;

function distinct(rows: RawOrder[], f: keyof RawOrder): number {
  return new Set(
    rows.map((r) => r[f]).filter((v) => v !== null && v !== undefined && v !== ""),
  ).size;
}

async function main(): Promise<void> {
  loadEnv();
  if (process.env.SHOPIFY_API_BASE_OVERRIDE) {
    record("live_guard", "FAIL", "SHOPIFY_API_BASE_OVERRIDE is set — refusing a mock run");
    return summarize();
  }
  record("live_guard", "PASS", "no API-base override — calls hit the real Shopify Admin API");

  const { getActiveForExecution } = await import("@/repositories/integrations");
  const { refreshAndRetry } = await import("@/services/oauth/refreshAndRetry");
  const { shopifyRequest } = await import("@/integrations/_shared/shopify/api/_request");
  const { shopifyApiBase } = await import("@/integrations/_shared/shopify/api/_base");
  const { nextPageInfo } = await import("@/services/analytics/sources/shopify/api");

  const accountId = process.env.SMOKE_ACCOUNT_ID;
  if (!accountId) throw new Error("SMOKE_ACCOUNT_ID unset");
  const integration = await getActiveForExecution(accountId, "shopify", null);
  if (!integration?.providerAccountId) {
    record("connection", "FAIL", "no active Shopify integration for the smoke account");
    return summarize();
  }
  const shopDomain = integration.providerAccountId;
  record("connection", "PASS", "active account-class Shopify integration resolved (shop domain present)");

  const call = <T>(apiCall: (accessToken: string) => Promise<T>): Promise<T> =>
    refreshAndRetry({
      accountId: integration.accountId,
      provider: "shopify",
      providerAccountId: integration.providerAccountId,
      apiCall,
    });
  const timed = async <T>(fn: () => Promise<T>): Promise<[T, number]> => {
    const t0 = Date.now();
    return [await fn(), Date.now() - t0];
  };

  // Raw page fetch that keeps the Link header + rate-limit header (the shared
  // shopifyRequest discards headers). GET only.
  const fetchPage = (accessToken: string, url: string) =>
    fetch(url, {
      method: "GET",
      headers: { "X-Shopify-Access-Token": accessToken, Accept: "application/json" },
    }).then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { orders?: RawOrder[] };
      return {
        orders: body.orders ?? [],
        link: res.headers.get("link"),
        callLimit: res.headers.get("x-shopify-shop-api-call-limit"),
      };
    });
  const base = shopifyApiBase(shopDomain);

  // ── 1. Shop identity — the stored connection owns the shop it queries ─────
  try {
    const [shop, ms] = await timed(() =>
      call((accessToken) =>
        shopifyRequest<{ shop?: { myshopify_domain?: unknown; currency?: unknown } }>({
          shopDomain,
          accessToken,
          method: "GET",
          path: "/shop.json",
          resourceForNotFound: "shop",
        }),
      ),
    );
    const matches = shop.shop?.myshopify_domain === shopDomain;
    const shopCurrencyIso =
      typeof shop.shop?.currency === "string" && /^[A-Z]{3}$/.test(shop.shop.currency);
    record(
      "shop_identity",
      matches ? "PASS" : "FAIL",
      `GET /shop.json 200 in ${ms}ms · returned shop matches the stored connection=${matches} · shop currency present+ISO=${shopCurrencyIso}`,
    );
  } catch (err) {
    record("shop_identity", "FAIL", `GET /shop.json → ${classify(err)}`);
  }

  // ── 2. Wire types over a bounded page ─────────────────────────────────────
  let rows: RawOrder[] = [];
  let callLimitSeen = false;
  try {
    const first = new URLSearchParams({
      status: "any",
      order: "created_at desc",
      limit: "50",
      fields: CERT_FIELDS,
    });
    const [page, ms] = await timed(() =>
      call((t) => fetchPage(t, `${base}/orders.json?${first}`)),
    );
    rows = page.orders;
    callLimitSeen = page.callLimit !== null;
    const t = (f: keyof RawOrder) => [...new Set(rows.map((r) => typeof r[f]))].join(",");
    const createdIso = rows.filter(
      (r) => typeof r.created_at === "string" && !Number.isNaN(Date.parse(r.created_at)),
    ).length;
    const amountShaped = rows.filter(
      (r) => typeof r.total_price === "string" && AMOUNT_RE.test(r.total_price),
    ).length;
    const currencyIso = rows.filter(
      (r) => typeof r.currency === "string" && /^[A-Z]{3}$/.test(r.currency),
    ).length;
    const cancelledShape = rows.filter(
      (r) =>
        r.cancelled_at === null ||
        r.cancelled_at === undefined ||
        (typeof r.cancelled_at === "string" && !Number.isNaN(Date.parse(r.cancelled_at))),
    ).length;
    const fulfillShape = rows.filter(
      (r) => r.fulfillment_status === null || typeof r.fulfillment_status === "string",
    ).length;
    record(
      rows.length > 0 ? "order_wire_types" : "order_wire_types",
      rows.length > 0 ? "PASS" : "FAIL",
      rows.length > 0
        ? `rows=${rows.length} · id js=[${t("id")}] · test js=[${t("test")}] · created_at ISO=${createdIso}/${rows.length} · total_price decimal-string=${amountShaped}/${rows.length} · currency ISO=${currencyIso}/${rows.length} · cancelled_at null-or-ISO=${cancelledShape}/${rows.length} · fulfillment_status null-or-string=${fulfillShape}/${rows.length} · ${ms}ms`
        : "0 orders in the store — wire types unobservable",
    );
  } catch (err) {
    record("order_wire_types", "FAIL", `orders read → ${classify(err)}`);
  }
  if (rows.length === 0) {
    record(
      "order_semantics",
      "FAIL",
      "no orders exist — amount/currency/status semantics and pagination CANNOT be certified",
    );
    return summarize({ blocked: true });
  }

  // ── 3. Status + state domains actually present ───────────────────────────
  const fin = new Set(
    rows.map((r) => (typeof r.financial_status === "string" ? r.financial_status : "«absent»")),
  );
  const ful = new Set(
    rows.map((r) => (typeof r.fulfillment_status === "string" ? r.fulfillment_status : "«null»")),
  );
  const KNOWN_FIN = new Set([
    "pending", "authorized", "partially_paid", "paid", "partially_refunded", "refunded", "voided",
  ]);
  const KNOWN_FUL = new Set(["«null»", "fulfilled", "partial", "restocked"]);
  const finUnknown = [...fin].filter((s) => s !== "«absent»" && !KNOWN_FIN.has(s)).length;
  const fulUnknown = [...ful].filter((s) => !KNOWN_FUL.has(s)).length;
  const paidCount = rows.filter((r) => r.financial_status === "paid").length;
  const testCount = rows.filter((r) => r.test === true).length;
  const cancelledCount = rows.filter(
    (r) => typeof r.cancelled_at === "string" && r.cancelled_at.length > 0,
  ).length;
  record(
    "status_domains",
    paidCount > 0 ? "PASS" : "FAIL",
    `distinct financial_status=${fin.size} (outside the documented domain=${finUnknown}) · distinct fulfillment_status=${ful.size} (outside documented=${fulUnknown}) · paid=${paidCount}/${rows.length} · test orders=${testCount}/${rows.length} · cancelled=${cancelledCount}/${rows.length} · distinct created dates=${
      new Set(
        rows.map((r) => (typeof r.created_at === "string" ? r.created_at.slice(0, 10) : "")),
      ).size
    } · distinct currency=${distinct(rows, "currency")}`,
  );

  // ── 4. created_at filtering narrows ──────────────────────────────────────
  const dates = rows
    .map((r) => (typeof r.created_at === "string" ? r.created_at : ""))
    .filter(Boolean)
    .sort();
  try {
    const cutoff = dates[Math.floor(dates.length / 2)]!;
    const q = new URLSearchParams({
      status: "any",
      created_at_min: cutoff,
      limit: "50",
      fields: CERT_FIELDS,
    });
    const page = await call((t) => fetchPage(t, `${base}/orders.json?${q}`));
    const allIn = page.orders.every(
      (r) => typeof r.created_at === "string" && Date.parse(r.created_at) >= Date.parse(cutoff),
    );
    const narrowed = page.orders.length < rows.length || dates[0]! < cutoff;
    record(
      "date_filter",
      allIn && narrowed ? "PASS" : "FAIL",
      `created_at_min push-down · rows=${page.orders.length} (from ${rows.length}) · all inside window=${allIn} · narrowed=${narrowed}`,
    );
  } catch (err) {
    record("date_filter", "FAIL", `date-filtered read → ${classify(err)}`);
  }

  // ── 5. Cursor pagination with the explicit created_at sort ───────────────
  try {
    const seen = new Set<string>();
    const createdSeq: number[] = [];
    let url: string | null =
      `${base}/orders.json?${new URLSearchParams({
        status: "any",
        order: "created_at desc",
        limit: "2",
        fields: CERT_FIELDS,
      })}`;
    let pages = 0;
    let duplicate = 0;
    let short = false;
    while (url && pages < 6) {
      const page: Awaited<ReturnType<typeof fetchPage> extends Promise<infer R> ? Promise<R> : never> =
        await call((t) => fetchPage(t, url!));
      pages += 1;
      for (const r of page.orders) {
        const id = String(r.id);
        if (seen.has(id)) duplicate += 1;
        seen.add(id);
        if (typeof r.created_at === "string") createdSeq.push(Date.parse(r.created_at));
      }
      const cursor = nextPageInfo(page.link);
      if (!cursor || page.orders.length === 0) {
        short = true;
        url = null;
      } else {
        url = `${base}/orders.json?${new URLSearchParams({
          limit: "2",
          page_info: cursor,
          fields: CERT_FIELDS,
        })}`;
      }
    }
    const ordered = createdSeq.every((v, i) => i === 0 || createdSeq[i - 1]! >= v);
    // Reference: the first N ids of the 50-row page must equal the walked ids.
    const reference = rows.slice(0, seen.size).map((r) => String(r.id));
    const skipped = reference.filter((id) => !seen.has(id)).length;
    record(
      "pagination",
      duplicate === 0 && ordered && skipped === 0 ? "PASS" : "FAIL",
      `pages walked=${pages} · pageSize=2 · distinct ids=${seen.size} · duplicates=${duplicate} · skipped vs reference prefix=${skipped} · created_at non-increasing=${ordered} · terminated by missing next-cursor=${short} · order=created_at desc accepted with page_info follow-ups=true`,
    );
  } catch (err) {
    record("pagination", "FAIL", `paged walk → ${classify(err)}`);
  }

  // ── 6. Empty window behaves as empty ─────────────────────────────────────
  try {
    const q = new URLSearchParams({
      status: "any",
      created_at_min: "1971-01-01T00:00:00Z",
      created_at_max: "1971-12-31T23:59:59Z",
      limit: "5",
      fields: CERT_FIELDS,
    });
    const page = await call((t) => fetchPage(t, `${base}/orders.json?${q}`));
    record(
      "empty_window",
      page.orders.length === 0 && nextPageInfo(page.link) === null ? "PASS" : "FAIL",
      `rows=${page.orders.length} · next cursor=${nextPageInfo(page.link) !== null}`,
    );
  } catch (err) {
    record("empty_window", "FAIL", `empty-window read → ${classify(err)}`);
  }

  record(
    "rate_limit_metadata",
    callLimitSeen ? "PASS" : "SKIP",
    callLimitSeen
      ? "X-Shopify-Shop-Api-Call-Limit header observed on responses (bucket telemetry available)"
      : "call-limit header not observed",
  );

  summarize({ blocked: false });
}

function summarize(gate?: { blocked: boolean }): void {
  console.log("\n=== CD-4C Phase A summary ===");
  for (const r of results) console.log(`${r.verdict.padEnd(4)} ${r.check}`);
  if (!gate) {
    console.log("\nPHASE B AUTHORIZED: NO — prerequisites failed before any read");
    return;
  }
  const failed = results.filter((r) => r.verdict === "FAIL").map((r) => r.check);
  console.log(
    `\nPHASE B AUTHORIZED: ${
      failed.length === 0 && !gate.blocked
        ? "YES — every certified check passed"
        : `NO — ${gate.blocked ? "insufficient live data" : `failing: ${failed.join(", ")}`}`
    }`,
  );
}

main().catch((err) => {
  console.error("harness error:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
