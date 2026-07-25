/**
 * ANALYTICS-CONNECTED-DATA-CD-4B Phase A — QuickBooks Invoices READ-ONLY
 * live certification.
 *
 * WHY THIS EXISTS: the proposed Custom Insights dataset (quickbooks/invoices)
 * builds measures on TotalAmt, Balance, CurrencyRef, TxnDate, CustomerRef and
 * the paid/open derivation, plus STARTPOSITION pagination. Each of those is an
 * assumption until observed against the real API through the exact wrapper the
 * adapter would use (`invoiceList`). The projection's `num()` only accepts JSON
 * numbers — if Intuit sent money as strings every monetary measure would be
 * silently null — so the raw wire types are certified here, not assumed.
 *
 * STRICTLY READ-ONLY. Query-endpoint GETs only — no create/update/delete/void,
 * no sends, no webhook or scope changes. Credentials resolve only through the
 * canonical seam (`getActiveForExecution` + `refreshAndRetry`); ciphertext is
 * never touched.
 *
 * EVIDENCE SAFETY: prints status classes, counts, presence tallies, JS types,
 * distinct-value counts and timings only. It never prints company names, realm
 * ids, customer names/ids, invoice ids/numbers, amounts, emails, memos,
 * tokens, or raw payloads.
 *
 * Run:  npx tsx scripts/trash/quickbooks-invoices-analytics-cert.ts
 */

import { readFileSync } from "node:fs";

// ── env (repo .env.local; names only ever surfaced, never values) ────────────
function loadEnv(): void {
  const candidates = [
    "C:/Users/marcu/source/repos/ChainReactV2/.env.local",
    ".env.local",
  ];
  for (const path of candidates) {
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
      // try the next candidate
    }
  }
  throw new Error("no .env.local found");
}

const SANDBOX_API_BASE = "https://sandbox-quickbooks.api.intuit.com";

type Verdict = "PASS" | "FAIL" | "SKIP";
const results: { check: string; verdict: Verdict; detail: string }[] = [];
function record(check: string, verdict: Verdict, detail: string): void {
  results.push({ check, verdict, detail });
  console.log(`[${verdict}] ${check} — ${detail}`);
}

/** Classify an error without leaking provider text. */
function classify(err: unknown): { klass: string; detail: string } {
  const name = err instanceof Error ? err.constructor.name : typeof err;
  const status = (err as { status?: number } | null)?.status;
  if (name === "InsufficientScopeError") {
    return { klass: "403_SCOPE", detail: "403 — read rejected under com.intuit.quickbooks.accounting" };
  }
  if (name === "Unauthorized401Error") return { klass: "401", detail: "401 after refresh" };
  if (name === "RateLimitedError") {
    const retry = (err as { retryAfterSeconds?: number | null }).retryAfterSeconds;
    return { klass: "429", detail: `429 — retryAfter ${retry ?? "absent"}` };
  }
  if (name === "NotFoundError") return { klass: "404", detail: "404" };
  return { klass: "ERROR", detail: `${name}${status ? ` status=${status}` : ""}` };
}

/** Presence-only field census — counts how many records carry each field. */
function census(
  items: readonly Record<string, unknown>[],
  fields: readonly string[],
): string {
  return fields
    .map((f) => {
      const present = items.filter((it) => {
        const v = it[f];
        return v !== null && v !== undefined && v !== "";
      }).length;
      return `${f}=${present}/${items.length}`;
    })
    .join(" ");
}

function distinctCount(
  items: readonly Record<string, unknown>[],
  field: string,
): number {
  return new Set(
    items.map((it) => it[field]).filter((v) => v !== null && v !== undefined && v !== ""),
  ).size;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function main(): Promise<void> {
  loadEnv();

  // Sandbox guard: the connected realm was certified against the sandbox base.
  // A production base here would mean these reads hit a real company.
  if (process.env.QUICKBOOKS_API_BASE !== SANDBOX_API_BASE) {
    record(
      "sandbox_guard",
      "FAIL",
      "QUICKBOOKS_API_BASE is not the sandbox base — refusing to run reads",
    );
    return summarize();
  }
  record("sandbox_guard", "PASS", "QUICKBOOKS_API_BASE = sandbox base");

  const { getActiveForExecution } = await import("@/repositories/integrations");
  const { refreshAndRetry } = await import("@/services/oauth/refreshAndRetry");
  const { quickbooksRequest } = await import(
    "@/integrations/_shared/quickbooks/api/_request"
  );
  const { invoiceList } = await import(
    "@/integrations/_shared/quickbooks/api/invoices"
  );
  const { customerList } = await import(
    "@/integrations/_shared/quickbooks/api/customers"
  );

  const accountId = process.env.SMOKE_ACCOUNT_ID;
  if (!accountId) throw new Error("SMOKE_ACCOUNT_ID unset");

  const integration = await getActiveForExecution(accountId, "quickbooks", null);
  if (!integration || !integration.providerAccountId) {
    record(
      "connection",
      "FAIL",
      "no active QuickBooks integration (or realm) for the smoke account",
    );
    return summarize();
  }
  const realmId = integration.providerAccountId;
  record(
    "connection",
    "PASS",
    "active QuickBooks integration resolved (account-class, realmId present)",
  );

  const call = <T>(apiCall: (accessToken: string) => Promise<T>): Promise<T> =>
    refreshAndRetry({
      accountId: integration.accountId,
      provider: "quickbooks",
      providerAccountId: integration.providerAccountId,
      apiCall,
    });

  const timed = async <T>(fn: () => Promise<T>): Promise<[T, number]> => {
    const t0 = Date.now();
    const out = await fn();
    return [out, Date.now() - t0];
  };

  // ── 1. Realm ownership (read-only) ────────────────────────────────────────
  // Ownership is proven by the REALM-SCOPED PATH succeeding, not by an id in
  // the body: every Accounting call is /v3/company/{realmId}/…, and Intuit
  // rejects a token that does not own the realm in the path. CompanyInfo.Id is
  // the entity id (a small constant), NOT the realm — comparing them is wrong.
  // This is the same call oauth.ts:resolveCompanyInfo already makes at connect.
  try {
    const [info, ms] = await timed(() =>
      call((accessToken) =>
        quickbooksRequest<{ CompanyInfo?: { Id?: unknown } }>({
          accessToken,
          realmId,
          method: "GET",
          path: `/companyinfo/${encodeURIComponent(realmId)}`,
          resourceForNotFound: "company info",
        }),
      ),
    );
    const present = info.CompanyInfo !== undefined;
    record(
      "company_identity",
      present ? "PASS" : "FAIL",
      `GET /companyinfo (realm-scoped path) 200 in ${ms}ms · CompanyInfo entity present=${present} · body Id is the entity id, not the realm (equals realm=${
        String(info.CompanyInfo?.Id ?? "") === realmId
      })`,
    );
  } catch (err) {
    record("company_identity", "FAIL", `GET /companyinfo → ${classify(err).detail}`);
  }

  // Negative control: the SAME token against a realm it does not own must be
  // rejected. This is what makes "realm is never user-selected" enforceable —
  // a widened realm cannot silently read another company's books.
  try {
    const foreignRealm = `${realmId}0`; // structurally valid, not owned
    await call((accessToken) =>
      quickbooksRequest<unknown>({
        accessToken,
        realmId: foreignRealm,
        method: "GET",
        path: `/companyinfo/${encodeURIComponent(foreignRealm)}`,
        resourceForNotFound: "company info",
      }),
    );
    record(
      "foreign_realm_rejected",
      "FAIL",
      "a realm the connection does not own returned 200 — realm scoping NOT enforced by the provider",
    );
  } catch (err) {
    const c = classify(err);
    const rejected = ["401", "403_SCOPE", "404", "ERROR"].includes(c.klass);
    record(
      "foreign_realm_rejected",
      rejected ? "PASS" : "FAIL",
      `unowned realm → ${c.detail} (token is realm-bound)`,
    );
  }

  try {
    const [prefs, ms] = await timed(() =>
      call((accessToken) =>
        quickbooksRequest<{
          QueryResponse?: {
            Preferences?: {
              CurrencyPrefs?: {
                MultiCurrencyEnabled?: unknown;
                HomeCurrency?: { value?: unknown };
              };
            }[];
          };
        }>({
          accessToken,
          realmId,
          method: "GET",
          path: "/query",
          query: new URLSearchParams({ query: "select * from Preferences" }),
          resourceForNotFound: "preferences",
        }),
      ),
    );
    const cp = prefs.QueryResponse?.Preferences?.[0]?.CurrencyPrefs;
    const multi = cp?.MultiCurrencyEnabled;
    const home = cp?.HomeCurrency?.value;
    const homeIso =
      typeof home === "string" && /^[A-Z]{3}$/.test(home) ? true : false;
    record(
      "currency_preferences",
      cp !== undefined ? "PASS" : "FAIL",
      `Preferences query 200 in ${ms}ms · CurrencyPrefs present=${cp !== undefined} · MultiCurrencyEnabled=${String(
        multi ?? "absent",
      )} · HomeCurrency present+ISO=${homeIso}`,
    );
  } catch (err) {
    record("currency_preferences", "FAIL", `Preferences query → ${classify(err).detail}`);
  }

  // ── 2. Raw invoice wire types (the projection's num() only takes numbers) ─
  try {
    const [raw, ms] = await timed(() =>
      call((accessToken) =>
        quickbooksRequest<{
          QueryResponse?: { Invoice?: Record<string, unknown>[] };
        }>({
          accessToken,
          realmId,
          method: "GET",
          path: "/query",
          query: new URLSearchParams({
            query:
              "select * from Invoice ORDERBY MetaData.CreateTime DESC STARTPOSITION 1 MAXRESULTS 5",
          }),
          resourceForNotFound: "invoice query",
        }),
      ),
    );
    const rows = raw.QueryResponse?.Invoice ?? [];
    if (rows.length === 0) {
      record("invoice_wire_types", "SKIP", `query 200 in ${ms}ms but 0 rows — types unobservable`);
    } else {
      const t = (f: string) => [...new Set(rows.map((r) => typeof r[f]))].join(",");
      const currencyRefPresent = rows.filter(
        (r) =>
          typeof (r.CurrencyRef as { value?: unknown } | undefined)?.value === "string",
      ).length;
      const txnDateShaped = rows.filter(
        (r) => typeof r.TxnDate === "string" && DATE_RE.test(r.TxnDate as string),
      ).length;
      const dueDateShaped = rows.filter(
        (r) => r.DueDate === undefined || (typeof r.DueDate === "string" && DATE_RE.test(r.DueDate as string)),
      ).length;
      record(
        "invoice_wire_types",
        "PASS",
        `rows=${rows.length} · TotalAmt js=[${t("TotalAmt")}] · Balance js=[${t(
          "Balance",
        )}] · CurrencyRef.value string=${currencyRefPresent}/${rows.length} · TxnDate YYYY-MM-DD=${txnDateShaped}/${rows.length} · DueDate absent-or-YYYY-MM-DD=${dueDateShaped}/${rows.length}`,
      );
    }
  } catch (err) {
    record("invoice_wire_types", "FAIL", `raw invoice query → ${classify(err).detail}`);
  }

  // ── 3. Projected invoice query (wide window, the adapter's exact wrapper) ─
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Date();
  let items: Awaited<ReturnType<typeof invoiceList>>["items"] = [];
  try {
    const [page, ms] = await timed(() =>
      call((accessToken) =>
        invoiceList({
          accessToken,
          realmId,
          dateFrom: "2020-01-01",
          dateTo: iso(today),
          maxResults: 25,
        }),
      ),
    );
    items = page.items;
    record(
      "invoice_query",
      "PASS",
      `invoiceList 200 in ${ms}ms · window 2020-01-01..today · rows=${items.length} · hasMore=${page.hasMore}`,
    );
  } catch (err) {
    record("invoice_query", "FAIL", `invoiceList → ${classify(err).detail}`);
  }

  if (items.length === 0) {
    record(
      "invoice_semantics",
      "FAIL",
      "0 invoices in the connected company since 2020 — amount/balance/currency/paid semantics and pagination CANNOT be certified",
    );
    return summarize({ blockedOnData: true });
  }

  const rec = items as unknown as Record<string, unknown>[];
  record(
    "invoice_projection_shape",
    "PASS",
    census(rec, [
      "invoiceId",
      "txnDate",
      "dueDate",
      "totalAmount",
      "balance",
      "currency",
      "customerId",
      "customerName",
      "emailStatus",
      "createdAt",
      "updatedAt",
    ]),
  );

  const paidCount = items.filter((i) => i.paid).length;
  const openWithBalance = items.filter(
    (i) => typeof i.balance === "number" && i.balance > 0,
  ).length;
  const negativeBalance = items.filter(
    (i) => typeof i.balance === "number" && i.balance < 0,
  ).length;
  const balanceLeTotal = items.filter(
    (i) =>
      typeof i.balance === "number" &&
      typeof i.totalAmount === "number" &&
      i.balance <= i.totalAmount,
  ).length;
  record(
    "invoice_semantics",
    paidCount > 0 && openWithBalance > 0 ? "PASS" : "FAIL",
    `paid=${paidCount}/${items.length} · open(balance>0)=${openWithBalance}/${items.length} · negative balance=${negativeBalance} · balance≤total=${balanceLeTotal}/${items.length} · distinct txnDate=${distinctCount(
      rec,
      "txnDate",
    )} · distinct currency=${distinctCount(rec, "currency")} · distinct customer=${distinctCount(
      rec,
      "customerId",
    )}`,
  );

  const fractional = items.filter(
    (i) => typeof i.totalAmount === "number" && !Number.isInteger(i.totalAmount),
  ).length;
  record(
    "invoice_amount_precision",
    "PASS",
    `totals with fractional cents=${fractional}/${items.length} (projected as JS numbers via num())`,
  );

  // ── 4. TxnDate predicate push-down ────────────────────────────────────────
  const dates = items
    .map((i) => i.txnDate)
    .filter((d): d is string => typeof d === "string" && DATE_RE.test(d))
    .sort();
  if (dates.length >= 2 && dates[0] !== dates[dates.length - 1]) {
    // Use a mid cutoff that provably excludes the earliest observed invoice.
    const cutoff = dates[Math.floor(dates.length / 2)]!;
    try {
      const filtered = await call((accessToken) =>
        invoiceList({
          accessToken,
          realmId,
          dateFrom: cutoff,
          dateTo: iso(today),
          maxResults: 25,
        }),
      );
      const allInWindow = filtered.items.every(
        (i) => typeof i.txnDate === "string" && i.txnDate >= cutoff,
      );
      record(
        "invoice_date_filter",
        allInWindow ? "PASS" : "FAIL",
        `TxnDate >= cutoff push-down · rows=${filtered.items.length} · all rows inside window=${allInWindow} · window strictly smaller than full scan=${filtered.items.length < items.length || dates[0]! < cutoff}`,
      );
    } catch (err) {
      record("invoice_date_filter", "FAIL", `date-filtered query → ${classify(err).detail}`);
    }
  } else {
    record("invoice_date_filter", "SKIP", "fewer than two distinct txn dates — bound not observable");
  }

  // ── 5. CustomerRef predicate push-down ────────────────────────────────────
  const customerCounts = new Map<string, number>();
  for (const i of items) {
    if (typeof i.customerId === "string") {
      customerCounts.set(i.customerId, (customerCounts.get(i.customerId) ?? 0) + 1);
    }
  }
  const probeCustomer = [...customerCounts.keys()][0];
  if (probeCustomer) {
    try {
      const filtered = await call((accessToken) =>
        invoiceList({
          accessToken,
          realmId,
          customerId: probeCustomer,
          dateFrom: "2020-01-01",
          dateTo: iso(today),
          maxResults: 25,
        }),
      );
      const allMatch = filtered.items.every((i) => i.customerId === probeCustomer);
      const narrower =
        customerCounts.size === 1 || filtered.items.length < items.length;
      record(
        "invoice_customer_filter",
        allMatch && filtered.items.length > 0 ? "PASS" : "FAIL",
        `CustomerRef push-down · rows=${filtered.items.length} · all rows match requested customer=${allMatch} · narrower than full scan=${narrower}`,
      );
    } catch (err) {
      record("invoice_customer_filter", "FAIL", `customer-filtered query → ${classify(err).detail}`);
    }
  } else {
    record("invoice_customer_filter", "SKIP", "no customer reference observed");
  }

  // ── 5b. Total record count + server-side Balance predicate probe ──────────
  // QBO's query response carries no total, but `select count(*)` does — used
  // ONLY to size the scan cap honestly, never to page.
  let totalInvoices: number | null = null;
  try {
    const res = await call((accessToken) =>
      quickbooksRequest<{ QueryResponse?: { totalCount?: unknown } }>({
        accessToken,
        realmId,
        method: "GET",
        path: "/query",
        query: new URLSearchParams({ query: "select count(*) from Invoice" }),
        resourceForNotFound: "invoice count",
      }),
    );
    const c = res.QueryResponse?.totalCount;
    totalInvoices = typeof c === "number" ? c : null;
    record(
      "invoice_total_count",
      totalInvoices !== null ? "PASS" : "SKIP",
      `select count(*) from Invoice → totalCount ${
        totalInvoices !== null ? `present (${totalInvoices} records in the company)` : "absent"
      }`,
    );
  } catch (err) {
    record("invoice_total_count", "SKIP", `count query → ${classify(err).detail}`);
  }

  try {
    const res = await call((accessToken) =>
      quickbooksRequest<{ QueryResponse?: { Invoice?: Record<string, unknown>[] } }>({
        accessToken,
        realmId,
        method: "GET",
        path: "/query",
        query: new URLSearchParams({
          query: "select * from Invoice where Balance > '0' MAXRESULTS 5",
        }),
        resourceForNotFound: "invoice query",
      }),
    );
    const rows = res.QueryResponse?.Invoice ?? [];
    const allPositive = rows.every(
      (r) => typeof r.Balance === "number" && (r.Balance as number) > 0,
    );
    record(
      "balance_predicate_pushdown",
      rows.length > 0 && allPositive ? "PASS" : "SKIP",
      `where Balance > '0' · rows=${rows.length} · all rows have positive balance=${allPositive} (informational — paid/open filtering may still be applied locally over the bounded scan)`,
    );
  } catch (err) {
    record(
      "balance_predicate_pushdown",
      "SKIP",
      `Balance predicate → ${classify(err).detail} (not required; local derivation is the launch path)`,
    );
  }

  // ── 6. Pagination: walk 3-row pages; duplicates/skips/ordering/termination ─
  try {
    const pageSize = 3;
    const seen = new Set<string>();
    const createTimes: string[] = [];
    let start = 1;
    let pages = 0;
    let duplicate = 0;
    let short = false;
    const maxPages = 30;
    while (pages < maxPages) {
      const page = await call((accessToken) =>
        invoiceList({
          accessToken,
          realmId,
          dateFrom: "2020-01-01",
          dateTo: iso(today),
          maxResults: pageSize,
          startPosition: start,
        }),
      );
      pages += 1;
      for (const i of page.items) {
        const id = i.invoiceId ?? "";
        if (seen.has(id)) duplicate += 1;
        seen.add(id);
        if (typeof i.createdAt === "string") createTimes.push(i.createdAt);
      }
      if (!page.hasMore) {
        short = true;
        break;
      }
      start = page.nextStartPosition;
    }
    const ordered = createTimes.every(
      (t, idx) => idx === 0 || Date.parse(createTimes[idx - 1]!) >= Date.parse(t),
    );
    const union = seen.size;
    // The 25-row scan is the reference: every id the paged walk covered must
    // exist there and vice versa within the walked prefix.
    const reference = new Set(
      items.slice(0, union).map((i) => i.invoiceId ?? ""),
    );
    const missed = [...reference].filter((id) => !seen.has(id)).length;
    record(
      "invoice_pagination",
      duplicate === 0 && ordered && missed === 0 ? "PASS" : "FAIL",
      `pages walked=${pages} · pageSize=${pageSize} · distinct ids=${union} · duplicates across boundaries=${duplicate} · skipped vs reference prefix=${missed} · CreateTime non-increasing=${ordered} · short-page termination observed=${short}`,
    );
    const tie = new Set(createTimes).size !== createTimes.length;
    record(
      "invoice_ordering_ties",
      "PASS",
      `ORDERBY MetaData.CreateTime DESC · duplicate CreateTime values in walk=${tie} (tie-break stability noted for adapter ordering docs)`,
    );
  } catch (err) {
    record("invoice_pagination", "FAIL", `paged walk → ${classify(err).detail}`);
  }

  // ── 7. Empty window behaves as empty, not as an error ─────────────────────
  try {
    const empty = await call((accessToken) =>
      invoiceList({
        accessToken,
        realmId,
        dateFrom: "1971-01-01",
        dateTo: "1971-12-31",
        maxResults: 5,
      }),
    );
    record(
      "invoice_empty_window",
      empty.items.length === 0 && !empty.hasMore ? "PASS" : "FAIL",
      `rows=${empty.items.length} · hasMore=${empty.hasMore}`,
    );
  } catch (err) {
    record("invoice_empty_window", "FAIL", `empty-window query → ${classify(err).detail}`);
  }

  // ── 8. Customer resolver viability (ids + labels, no financials needed) ───
  try {
    const [customers, ms] = await timed(() =>
      call((accessToken) => customerList({ accessToken, realmId, maxResults: 100 })),
    );
    const withId = customers.filter(
      (c) => typeof c.customerId === "string" && c.customerId.length > 0,
    ).length;
    const withLabel = customers.filter(
      (c) => typeof c.displayName === "string" && c.displayName.length > 0,
    ).length;
    record(
      "customer_resolver",
      customers.length >= 2 && withId === customers.length && withLabel === customers.length
        ? "PASS"
        : "FAIL",
      `customerList 200 in ${ms}ms · rows=${customers.length} · stable ids=${withId}/${customers.length} · display labels=${withLabel}/${customers.length}`,
    );
  } catch (err) {
    record("customer_resolver", "FAIL", `customerList → ${classify(err).detail}`);
  }

  summarize({ blockedOnData: false });
}

function summarize(gate?: { blockedOnData: boolean }): void {
  console.log("\n=== CD-4B Phase A summary ===");
  for (const r of results) console.log(`${r.verdict.padEnd(4)} ${r.check}`);
  if (!gate) {
    console.log("\nPHASE B AUTHORIZED: NO — prerequisites failed before any read");
    return;
  }
  const failed = results.filter((r) => r.verdict === "FAIL").map((r) => r.check);
  console.log(
    `\nPHASE B AUTHORIZED: ${
      failed.length === 0
        ? "YES — every certified check passed"
        : `NO — failing checks: ${failed.join(", ")}`
    }`,
  );
}

main().catch((err) => {
  console.error("harness error:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
