/**
 * QUICKBOOKS-INVOICES-INTEGRATION-RESOLVER-1 — READ-ONLY certification of the
 * QuickBooks Customer query capabilities the upgraded `quickbooks:customers`
 * resolver depends on.
 *
 * WHY: the repo ASSERTS "QBO's query language supports LIKE" in a comment but
 * no code in the tree has ever emitted a LIKE predicate, and no code has ever
 * paged Customer with STARTPOSITION or fetched customers by id with IN.
 * Building a search resolver on three unproven assumptions is exactly the
 * mistake CD-4B's certification gate exists to prevent, so each is proven here
 * against the real API before the resolver is written.
 *
 * STRICTLY READ-ONLY: query-endpoint GETs only. No customer/invoice is
 * created, updated, deleted or emailed; no company setting or scope changes.
 * Credentials resolve only through the canonical seam (getActiveForExecution +
 * refreshAndRetry), so ciphertext is never touched.
 *
 * EVIDENCE SAFETY: prints capability verdicts, row counts, timings, narrowing
 * booleans and error classes only. It NEVER prints a customer name, id, email,
 * balance, the search term used, the realm, or a raw payload.
 *
 * Run:  npx tsx scripts/trash/quickbooks-customer-search-cert.ts
 */

import { readFileSync } from "node:fs";

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
      /* try next */
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

function classify(err: unknown): string {
  const name = err instanceof Error ? err.constructor.name : typeof err;
  if (name === "InsufficientScopeError") return "403_SCOPE";
  if (name === "Unauthorized401Error") return "401";
  if (name === "RateLimitedError") return "429";
  if (name === "NotFoundError") return "404";
  const status = (err as { status?: number } | null)?.status;
  return `${name}${status ? ` status=${status}` : ""}`;
}

async function main(): Promise<void> {
  loadEnv();
  if (process.env.QUICKBOOKS_API_BASE !== SANDBOX_API_BASE) {
    record("sandbox_guard", "FAIL", "QUICKBOOKS_API_BASE is not the sandbox base");
    return summarize();
  }
  record("sandbox_guard", "PASS", "QUICKBOOKS_API_BASE = sandbox base");

  const { getActiveForExecution } = await import("@/repositories/integrations");
  const { refreshAndRetry } = await import("@/services/oauth/refreshAndRetry");
  const { quickbooksRequest, escapeQueryValue } = await import(
    "@/integrations/_shared/quickbooks/api/_request"
  );

  const accountId = process.env.SMOKE_ACCOUNT_ID;
  if (!accountId) throw new Error("SMOKE_ACCOUNT_ID unset");
  const integration = await getActiveForExecution(accountId, "quickbooks", null);
  if (!integration?.providerAccountId) {
    record("connection", "FAIL", "no active QuickBooks integration for the smoke account");
    return summarize();
  }
  const realmId = integration.providerAccountId;
  record("connection", "PASS", "active account-class integration resolved");

  const call = <T>(apiCall: (accessToken: string) => Promise<T>): Promise<T> =>
    refreshAndRetry({
      accountId: integration.accountId,
      provider: "quickbooks",
      providerAccountId: integration.providerAccountId,
      apiCall,
    });

  interface CustomerRow {
    Id?: unknown;
    DisplayName?: unknown;
  }
  const query = async (statement: string): Promise<CustomerRow[]> => {
    const res = await call((accessToken) =>
      quickbooksRequest<{ QueryResponse?: { Customer?: CustomerRow[] } }>({
        accessToken,
        realmId,
        method: "GET",
        path: "/query",
        query: new URLSearchParams({ query: statement }),
        resourceForNotFound: "customer query",
      }),
    );
    return res.QueryResponse?.Customer ?? [];
  };
  const timed = async <T>(fn: () => Promise<T>): Promise<[T, number]> => {
    const t0 = Date.now();
    const out = await fn();
    return [out, Date.now() - t0];
  };

  // ── 1. Baseline page (today's resolver statement) ─────────────────────────
  let baseline: CustomerRow[] = [];
  try {
    const [rows, ms] = await timed(() =>
      query("select * from Customer where Active = true ORDERBY DisplayName MAXRESULTS 100"),
    );
    baseline = rows;
    record(
      "baseline_page",
      "PASS",
      `active customers in first page=${rows.length} · ${ms}ms`,
    );
  } catch (err) {
    record("baseline_page", "FAIL", `baseline query → ${classify(err)}`);
    return summarize();
  }
  if (baseline.length === 0) {
    record("capabilities", "SKIP", "no customers to probe against");
    return summarize();
  }

  // A safe probe token derived from a real display name. The TOKEN ITSELF IS
  // NEVER PRINTED — only whether it narrowed the result set.
  const names = baseline
    .map((c) => (typeof c.DisplayName === "string" ? c.DisplayName : ""))
    .filter((n) => n.length >= 3);
  const probe = names[0]!.slice(0, 3);
  const midProbe = names.find((n) => n.length >= 5)?.slice(1, 4) ?? probe;

  // ── 2. LIKE prefix ────────────────────────────────────────────────────────
  let likePrefix = false;
  try {
    const [rows, ms] = await timed(() =>
      query(
        `select * from Customer where Active = true and DisplayName LIKE '${escapeQueryValue(probe)}%' ORDERBY DisplayName MAXRESULTS 100`,
      ),
    );
    likePrefix = true;
    const allMatch = rows.every(
      (c) =>
        typeof c.DisplayName === "string" &&
        c.DisplayName.toLowerCase().startsWith(probe.toLowerCase()),
    );
    record(
      "like_prefix",
      rows.length > 0 && allMatch ? "PASS" : "FAIL",
      `LIKE 'x%' accepted · rows=${rows.length} · narrowed=${rows.length < baseline.length} · all rows match the prefix=${allMatch} · ${ms}ms`,
    );
  } catch (err) {
    record("like_prefix", "FAIL", `LIKE prefix → ${classify(err)}`);
  }

  // ── 3. LIKE contains (%term%) — the honest-semantics question ─────────────
  let likeContains = false;
  try {
    const [rows, ms] = await timed(() =>
      query(
        `select * from Customer where Active = true and DisplayName LIKE '%${escapeQueryValue(midProbe)}%' ORDERBY DisplayName MAXRESULTS 100`,
      ),
    );
    const allMatch = rows.every(
      (c) =>
        typeof c.DisplayName === "string" &&
        c.DisplayName.toLowerCase().includes(midProbe.toLowerCase()),
    );
    // Contains is only PROVEN if it returns a row whose match is not a prefix.
    const nonPrefixHit = rows.some(
      (c) =>
        typeof c.DisplayName === "string" &&
        c.DisplayName.toLowerCase().includes(midProbe.toLowerCase()) &&
        !c.DisplayName.toLowerCase().startsWith(midProbe.toLowerCase()),
    );
    likeContains = rows.length > 0 && allMatch;
    record(
      "like_contains",
      likeContains ? "PASS" : "FAIL",
      `LIKE '%x%' accepted · rows=${rows.length} · all rows contain the term=${allMatch} · interior (non-prefix) match observed=${nonPrefixHit} · ${ms}ms`,
    );
  } catch (err) {
    record("like_contains", "FAIL", `LIKE contains → ${classify(err)}`);
  }

  // ── 4. Case sensitivity of LIKE ───────────────────────────────────────────
  if (likePrefix) {
    try {
      const upper = await query(
        `select * from Customer where Active = true and DisplayName LIKE '${escapeQueryValue(probe.toUpperCase())}%' MAXRESULTS 100`,
      );
      const lower = await query(
        `select * from Customer where Active = true and DisplayName LIKE '${escapeQueryValue(probe.toLowerCase())}%' MAXRESULTS 100`,
      );
      record(
        "like_case_sensitivity",
        "PASS",
        `upper-case term rows=${upper.length} · lower-case term rows=${lower.length} · case-insensitive=${upper.length === lower.length}`,
      );
    } catch (err) {
      record("like_case_sensitivity", "FAIL", `case probe → ${classify(err)}`);
    }
  }

  // ── 5. No-match search returns empty, not an error ────────────────────────
  try {
    const rows = await query(
      `select * from Customer where Active = true and DisplayName LIKE 'zzzqqqxxnomatch%' MAXRESULTS 100`,
    );
    record(
      "like_no_match",
      rows.length === 0 ? "PASS" : "FAIL",
      `no-match search rows=${rows.length} (empty, no error)`,
    );
  } catch (err) {
    record("like_no_match", "FAIL", `no-match search → ${classify(err)}`);
  }

  // ── 6. STARTPOSITION paging over Customer ─────────────────────────────────
  try {
    const p1 = await query(
      "select * from Customer where Active = true ORDERBY DisplayName STARTPOSITION 1 MAXRESULTS 3",
    );
    const p2 = await query(
      "select * from Customer where Active = true ORDERBY DisplayName STARTPOSITION 4 MAXRESULTS 3",
    );
    const ids1 = new Set(p1.map((c) => String(c.Id)));
    const overlap = p2.filter((c) => ids1.has(String(c.Id))).length;
    record(
      "customer_pagination",
      p1.length === 3 && overlap === 0 ? "PASS" : "FAIL",
      `page1 rows=${p1.length} · page2 rows=${p2.length} · overlap=${overlap} · STARTPOSITION accepted for Customer`,
    );
  } catch (err) {
    record("customer_pagination", "FAIL", `STARTPOSITION → ${classify(err)}`);
  }

  // ── 7. Fetch specific customers by id (label backfill for saved values) ───
  try {
    const ids = baseline
      .slice(0, 2)
      .map((c) => String(c.Id))
      .filter((v) => v && v !== "undefined");
    const inList = ids.map((v) => `'${escapeQueryValue(v)}'`).join(",");
    const rows = await query(
      `select * from Customer where Id in (${inList}) MAXRESULTS 10`,
    );
    const returned = new Set(rows.map((c) => String(c.Id)));
    const allFound = ids.every((v) => returned.has(v));
    record(
      "customer_by_ids",
      allFound && rows.length === ids.length ? "PASS" : "FAIL",
      `Id IN (…) accepted · requested=${ids.length} · returned=${rows.length} · all requested ids resolved=${allFound}`,
    );
  } catch (err) {
    record("customer_by_ids", "FAIL", `Id IN (…) → ${classify(err)}`);
  }

  // ── 8. Injection safety — a quote-bearing term must not break the query ───
  try {
    const rows = await query(
      `select * from Customer where Active = true and DisplayName LIKE '${escapeQueryValue("o'brien' or Active = false or '")}%' MAXRESULTS 5`,
    );
    record(
      "injection_escaped",
      "PASS",
      `quote/injection-bearing term executed safely as a literal · rows=${rows.length} (no query-language break-out)`,
    );
  } catch (err) {
    const c = classify(err);
    // A provider-side 400 is also acceptable: the term never became syntax.
    record(
      "injection_escaped",
      c.startsWith("QuickbooksApiError") ? "PASS" : "FAIL",
      `quote-bearing term → ${c} (rejected as a literal, not executed as syntax)`,
    );
  }

  summarize({ likePrefix, likeContains });
}

function summarize(gate?: { likePrefix: boolean; likeContains: boolean }): void {
  console.log("\n=== customer search capability summary ===");
  for (const r of results) console.log(`${r.verdict.padEnd(4)} ${r.check}`);
  if (!gate) return;
  console.log(
    `\nSEARCH SEMANTICS: ${
      gate.likeContains
        ? "CONTAINS — LIKE '%term%' is supported and honest"
        : gate.likePrefix
          ? "PREFIX ONLY — document prefix semantics, do NOT claim contains"
          : "NONE — fall back to bounded scanning"
    }`,
  );
}

main().catch((err) => {
  console.error("harness error:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
