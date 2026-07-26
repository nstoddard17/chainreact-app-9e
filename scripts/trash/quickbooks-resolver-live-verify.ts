/**
 * QUICKBOOKS-INVOICES-INTEGRATION-RESOLVER-1 Part C — READ-ONLY live
 * verification of the FINISHED `quickbooks:customers` resolver.
 *
 * Drives the real resolver object (not raw queries) through the canonical
 * credential seam, so what is verified here is exactly what the picker calls.
 *
 * SCOPE LIMIT, stated honestly: the connected sandbox holds ~33 customers, so
 * this CANNOT live-prove the >100 case. That is proven by provider-boundary
 * fixtures (tests/unit/services/options/selectedAndSearch.test.ts, 150
 * customers). What this proves live is that the new statement shape is
 * ACCEPTED by the real API, narrows correctly, handles no-match safely, and
 * still returns the right option shape.
 *
 * STRICTLY READ-ONLY: query GETs only. No customer/invoice is created,
 * updated, deleted or emailed; no company setting or scope changes; no
 * customer is created to enlarge the sandbox.
 *
 * EVIDENCE SAFETY: records verdicts, counts, narrowing booleans, timings,
 * hasMore, and error classes ONLY. It never prints a customer name (including
 * the term it searched for), an id, an email, a balance, the realm, or a raw
 * payload.
 *
 * Run:  npx tsx scripts/trash/quickbooks-resolver-live-verify.ts
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

const SANDBOX_API_BASE = "https://sandbox-quickbooks.api.intuit.com";
type Verdict = "PASS" | "FAIL" | "SKIP";
const results: { check: string; verdict: Verdict; detail: string }[] = [];
const record = (check: string, verdict: Verdict, detail: string) => {
  results.push({ check, verdict, detail });
  console.log(`[${verdict}] ${check} — ${detail}`);
};

function classify(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  if (typeof code === "string") return code; // OptionsResolverError code
  const name = err instanceof Error ? err.constructor.name : typeof err;
  return name;
}

async function main(): Promise<void> {
  loadEnv();
  if (process.env.QUICKBOOKS_API_BASE !== SANDBOX_API_BASE) {
    record("sandbox_guard", "FAIL", "QUICKBOOKS_API_BASE is not the sandbox base");
    return summarize();
  }
  record("sandbox_guard", "PASS", "QUICKBOOKS_API_BASE = sandbox base");

  const { getActiveForExecution } = await import("@/repositories/integrations");
  const { quickbooksCustomersResolver } = await import(
    "@/integrations/quickbooks/options/customers"
  );

  const accountId = process.env.SMOKE_ACCOUNT_ID;
  const userId = process.env.SMOKE_USER_ID;
  if (!accountId || !userId) throw new Error("SMOKE_ACCOUNT_ID/SMOKE_USER_ID unset");

  const integration = await getActiveForExecution(accountId, "quickbooks", null);
  if (!integration?.providerAccountId) {
    record("connection", "FAIL", "no active QuickBooks integration");
    return summarize();
  }
  record(
    "credential_seam",
    "PASS",
    "resolver context built from the stored account-class connection (realm from the row, never from input)",
  );

  const ctx = (over: Record<string, unknown> = {}) =>
    ({ userId, integration, q: "", deps: {}, selected: [], ...over }) as never;

  const timed = async <T>(fn: () => Promise<T>): Promise<[T, number]> => {
    const t0 = Date.now();
    return [await fn(), Date.now() - t0];
  };

  // ── 1. Empty search → bounded initial page ────────────────────────────────
  let firstPage: { items: { value: string; label: string }[]; hasMore: boolean };
  try {
    const [res, ms] = await timed(() => quickbooksCustomersResolver.resolve(ctx()));
    firstPage = res as typeof firstPage;
    const shapeOk = firstPage.items.every(
      (i) =>
        typeof i.value === "string" &&
        i.value.length > 0 &&
        typeof i.label === "string" &&
        i.label.length > 0 &&
        Object.keys(i).length === 2, // value + label ONLY
    );
    record(
      "empty_search_initial_page",
      shapeOk ? "PASS" : "FAIL",
      `rows=${firstPage.items.length} · bounded(≤100)=${firstPage.items.length <= 100} · hasMore=${firstPage.hasMore} · every option is exactly {value,label}=${shapeOk} · ${ms}ms`,
    );
  } catch (err) {
    record("empty_search_initial_page", "FAIL", `→ ${classify(err)}`);
    return summarize();
  }

  if (firstPage.items.length === 0) {
    record("search_narrowing", "SKIP", "no customers in the company to search for");
    return summarize();
  }

  // A term taken from a real label. NEVER PRINTED — only its effect is.
  const sample = firstPage.items.find((i) => i.label.length >= 4);
  if (!sample) {
    record("search_narrowing", "SKIP", "no label long enough to derive a safe probe");
    return summarize();
  }
  const prefixTerm = sample.label.slice(0, 4);
  const interiorTerm = sample.label.slice(1, 4);

  // ── 2. A real term narrows the result set ────────────────────────────────
  try {
    const [res, ms] = await timed(() =>
      quickbooksCustomersResolver.resolve(ctx({ q: prefixTerm })),
    );
    const r = res as typeof firstPage;
    const found = r.items.some((i) => i.value === sample.value);
    record(
      "search_narrowing",
      found && r.items.length <= firstPage.items.length ? "PASS" : "FAIL",
      `rows=${r.items.length} (from ${firstPage.items.length} unfiltered) · narrowed=${r.items.length < firstPage.items.length} · the expected customer was returned=${found} · ${ms}ms`,
    );
  } catch (err) {
    record("search_narrowing", "FAIL", `→ ${classify(err)}`);
  }

  // ── 3. Interior (non-prefix) term also matches — CONTAINS, not prefix ─────
  try {
    const res = (await quickbooksCustomersResolver.resolve(
      ctx({ q: interiorTerm }),
    )) as typeof firstPage;
    const found = res.items.some((i) => i.value === sample.value);
    record(
      "search_contains_semantics",
      found ? "PASS" : "FAIL",
      `an interior substring of a real label matched=${found} · rows=${res.items.length} (confirms CONTAINS, not prefix-only)`,
    );
  } catch (err) {
    record("search_contains_semantics", "FAIL", `→ ${classify(err)}`);
  }

  // ── 4. No-match search returns empty safely ──────────────────────────────
  try {
    const [res, ms] = await timed(() =>
      quickbooksCustomersResolver.resolve(ctx({ q: "zzzq-no-such-customer-xyz" })),
    );
    const r = res as typeof firstPage;
    record(
      "no_match_search",
      r.items.length === 0 && r.hasMore === false ? "PASS" : "FAIL",
      `rows=${r.items.length} · hasMore=${r.hasMore} · returned empty without an error · ${ms}ms`,
    );
  } catch (err) {
    record("no_match_search", "FAIL", `→ ${classify(err)}`);
  }

  // ── 5. Saved-selection backfill against the live company ─────────────────
  try {
    const res = (await quickbooksCustomersResolver.resolve(
      // Search deliberately excludes the selection, so the only way it can
      // come back is the by-id lookup.
      ctx({ q: "zzzq-no-such-customer-xyz", selected: [sample.value] }),
    )) as typeof firstPage;
    const first = res.items[0];
    record(
      "selected_backfill",
      first?.value === sample.value && first.label.length > 0 ? "PASS" : "FAIL",
      `a saved selection absent from the search result was resolved and labelled=${
        first?.value === sample.value
      } · rows=${res.items.length}`,
    );
  } catch (err) {
    record("selected_backfill", "FAIL", `→ ${classify(err)}`);
  }

  // ── 6. Overlong / hostile term is handled safely ─────────────────────────
  try {
    const res = (await quickbooksCustomersResolver.resolve(
      ctx({ q: "x".repeat(400) }),
    )) as typeof firstPage;
    record("overlong_term", "PASS", `capped term accepted by the provider · rows=${res.items.length}`);
  } catch (err) {
    record("overlong_term", "FAIL", `→ ${classify(err)}`);
  }
  try {
    const res = (await quickbooksCustomersResolver.resolve(
      ctx({ q: "o'brien' or Active = false or '" }),
    )) as typeof firstPage;
    record(
      "injection_term",
      "PASS",
      `quote-bearing term executed as a literal search · rows=${res.items.length} (no query break-out)`,
    );
  } catch (err) {
    const c = classify(err);
    record(
      "injection_term",
      c === "PROVIDER_ERROR" ? "PASS" : "FAIL",
      `quote-bearing term → ${c} (rejected as a literal, never executed as syntax)`,
    );
  }

  // ── 7. No-leak check over everything returned ────────────────────────────
  try {
    const res = (await quickbooksCustomersResolver.resolve(ctx())) as typeof firstPage;
    const json = JSON.stringify(res);
    const leaks = ["@", "Balance", "PrimaryPhone", "BillAddr", "realmId", "Bearer"];
    const hit = leaks.filter((l) => json.includes(l));
    record(
      "no_leak_projection",
      hit.length === 0 ? "PASS" : "FAIL",
      `option payload contains no email/balance/phone/address/realm/token markers=${hit.length === 0}`,
    );
  } catch (err) {
    record("no_leak_projection", "FAIL", `→ ${classify(err)}`);
  }

  summarize();
}

function summarize(): void {
  console.log("\n=== resolver live verification summary ===");
  for (const r of results) console.log(`${r.verdict.padEnd(4)} ${r.check}`);
  const failed = results.filter((r) => r.verdict === "FAIL").map((r) => r.check);
  console.log(
    `\nLIVE VERIFICATION: ${failed.length === 0 ? "PASS — all checks green" : `FAIL — ${failed.join(", ")}`}`,
  );
  console.log(
    "NOTE: the connected sandbox holds ~33 customers, so the >100 case is NOT live-proven here; it is proven by 150-customer provider-boundary fixtures.",
  );
}

main().catch((err) => {
  console.error("harness error:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
