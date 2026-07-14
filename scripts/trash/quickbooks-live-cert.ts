/**
 * QUICKBOOKS-1 owner-runnable Phase 13 sandbox live-certification harness.
 *
 * This is the guided driver Marcus runs from an environment that HAS a
 * connected QuickBooks sandbox realm + the sandbox env pins (the coding
 * shell has neither). It reuses REAL V2 internals only — option resolvers,
 * typed API wrappers, the trigger lifecycle, the provider-agnostic dispatch,
 * the deployed webhook route, and the existing action-smoke live harness —
 * and mocks nothing.
 *
 * It is deliberately NON-DESTRUCTIVE: it creates marked `crsmoke-` sandbox
 * artifacts (customer / $1 draft invoice) and leaves them (QUICKBOOKS-1 ships
 * no delete/void by design; sandbox companies are disposable). It never marks
 * QuickBooks live-complete — it prints an evidence draft for a human to judge.
 *
 * NO OBJECT PINS REQUIRED. Marcus provides ONLY:
 *   QUICKBOOKS_API_BASE=https://sandbox-quickbooks.api.intuit.com
 *   QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN=<Intuit portal verifier token>
 *   SMOKE_QUICKBOOKS_SEND_TO=<safe test email>   # OPTIONAL — required ONLY to
 *                                                # certify send_invoice; without
 *                                                # it send_invoice is skipped
 *                                                # (blocked-for-safety), all
 *                                                # other actions still run.
 * The customer id, item id, and invoice id are AUTO-DISCOVERED / AUTO-CREATED
 * by the `prepare` phase — never owner-provided. (SMOKE_QUICKBOOKS_CUSTOMER_ID
 * / _ITEM_ID / _INVOICE_ID / _CUSTOMER_NAME are accepted only as optional
 * debug overrides.)
 *
 * Prints statuses / ids / counts / sanitized payload SHAPES only — never
 * tokens, secrets, verifier tokens, or raw provider bodies.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PHASES (run in order; the read-only ones are automated, triggers are
 * owner-guided because a real Intuit webhook needs a real sandbox change):
 *
 *   npx tsx scripts/trash/quickbooks-live-cert.ts run
 *        → env + realm + options + security + actions, back to back
 *          (everything that can be certified without waiting on a webhook).
 *
 *   npx tsx scripts/trash/quickbooks-live-cert.ts env         # Phase 0
 *   npx tsx scripts/trash/quickbooks-live-cert.ts realm       # Phase 1
 *   npx tsx scripts/trash/quickbooks-live-cert.ts options     # Phase 2 (resolver cert)
 *   npx tsx scripts/trash/quickbooks-live-cert.ts prepare     # Phase 2.5 (auto-discover item; auto-create customer+invoice)
 *   npx tsx scripts/trash/quickbooks-live-cert.ts actions     # Phase 3 (real engine; uses prepared ids)
 *   npx tsx scripts/trash/quickbooks-live-cert.ts security    # Phase 5
 *
 *   # Phase 4 — triggers (guided; run these around real sandbox changes):
 *   npx tsx scripts/trash/quickbooks-live-cert.ts triggers:activate
 *   npx tsx scripts/trash/quickbooks-live-cert.ts triggers:drive-created   # optional: API-creates customer+invoice
 *   npx tsx scripts/trash/quickbooks-live-cert.ts triggers:await-customer
 *   npx tsx scripts/trash/quickbooks-live-cert.ts triggers:await-invoice
 *   #   → now record a payment in the QuickBooks sandbox UI (see printed steps)
 *   npx tsx scripts/trash/quickbooks-live-cert.ts triggers:await-payment
 *   #   → make a PARTIAL payment first (assert no invoice_paid), then COMPLETE it
 *   npx tsx scripts/trash/quickbooks-live-cert.ts triggers:await-invoice-paid
 *   npx tsx scripts/trash/quickbooks-live-cert.ts triggers:status
 *   npx tsx scripts/trash/quickbooks-live-cert.ts triggers:deactivate
 *
 *   npx tsx scripts/trash/quickbooks-live-cert.ts evidence    # Phase 6 (closeout draft)
 *   npx tsx scripts/trash/quickbooks-live-cert.ts guide       # print this runbook
 * ─────────────────────────────────────────────────────────────────────────
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";

// ── .env.local loader (never overrides an already-set process env) ──────────
function loadEnv(): void {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const l of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const k = m[1]!;
    if (process.env[k]) continue;
    let v = m[2]!.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[k] = v;
  }
}
loadEnv();

const SANDBOX_API_BASE = "https://sandbox-quickbooks.api.intuit.com";
const STATE_FILE = resolve(process.cwd(), "scripts/trash/quickbooks-live-cert-state.json");
const TRIGGER_NODE_ID = "live-cert-quickbooks-trigger";
const ACTION_NODE_ID = "live-cert-noop-action";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type TriggerKind =
  | "customer_created"
  | "invoice_created"
  | "payment_received"
  | "invoice_paid";

interface WfState {
  kind: TriggerKind;
  workflowId: string;
  baselineRunCount: number;
}
interface CertState {
  realmId: string | null;
  /** Auto-selected invoice-able sandbox item (no owner pin). */
  itemId: string | null;
  itemName: string | null;
  /** Smoke customer the runner CREATED (marker display name = its CUSTOMER_NAME). */
  preparedCustomerId: string | null;
  preparedCustomerName: string | null;
  /** Smoke DRAFT invoice the runner CREATED. */
  preparedInvoiceId: string | null;
  /** Whether a safe send-to mailbox was available at prepare time. */
  sendToPresent: boolean;
  /** Objects the trigger phase creates to drive customer_created/invoice_created. */
  createdCustomerId: string | null;
  createdInvoiceId: string | null;
  workflows: WfState[];
  seenEventIds: string[];
  results: Record<string, string>;
}

function readState(): CertState {
  if (!existsSync(STATE_FILE)) {
    return {
      realmId: null,
      itemId: null,
      itemName: null,
      preparedCustomerId: null,
      preparedCustomerName: null,
      preparedInvoiceId: null,
      sendToPresent: false,
      createdCustomerId: null,
      createdInvoiceId: null,
      workflows: [],
      seenEventIds: [],
      results: {},
    };
  }
  return JSON.parse(readFileSync(STATE_FILE, "utf8")) as CertState;
}
function writeState(s: CertState): void {
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}
function recordResult(key: string, value: string): void {
  const s = readState();
  s.results[key] = value;
  writeState(s);
}

// ── Phase 0 — env check (pure; no imports, safe to run anywhere) ────────────
const REQUIRED_ENV: Array<{ name: string; expect?: string; note: string }> = [
  { name: "NEXT_PUBLIC_APP_URL", expect: "https://chainreact.app", note: "deployed origin the Intuit portal webhook points at" },
  { name: "QUICKBOOKS_CLIENT_ID", note: "Intuit app key (Development keys for sandbox)" },
  { name: "QUICKBOOKS_CLIENT_SECRET", note: "Intuit app secret" },
  { name: "QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN", note: "portal Webhooks section verifier token (per environment)" },
  { name: "QUICKBOOKS_API_BASE", expect: SANDBOX_API_BASE, note: "sandbox flag — MUST be the sandbox base when using Development keys" },
  { name: "NEXT_PUBLIC_SUPABASE_URL", note: "dev DB the connected realm lives in" },
  { name: "SUPABASE_SERVICE_ROLE_KEY", note: "service-role read for integration/run rows" },
  { name: "SMOKE_ACCOUNT_ID", note: "account that owns the QuickBooks connection" },
  { name: "SMOKE_USER_ID", note: "user who connected QuickBooks" },
];
// Optional. SEND_TO is the ONLY meaningful owner value beyond the two tokens —
// it gates send_invoice. The *_ID / _NAME vars are debug overrides only; the
// runner auto-discovers/creates them in the `prepare` phase.
const OPTIONAL_ENV = [
  { name: "SMOKE_QUICKBOOKS_SEND_TO", note: "safe test email — REQUIRED only to certify send_invoice; absent → send_invoice skipped (blocked-for-safety)" },
  { name: "SMOKE_QUICKBOOKS_CUSTOMER_ID", note: "debug override (else auto-created)" },
  { name: "SMOKE_QUICKBOOKS_ITEM_ID", note: "debug override (else auto-discovered)" },
  { name: "SMOKE_QUICKBOOKS_INVOICE_ID", note: "debug override (else auto-created)" },
  { name: "SMOKE_QUICKBOOKS_CUSTOMER_NAME", note: "debug override (else the created customer's marker name)" },
];

function phaseEnv(): boolean {
  console.log("=== PHASE 0 — environment check ===");
  let ok = true;
  for (const { name, expect, note } of REQUIRED_ENV) {
    const val = process.env[name];
    if (!val) {
      console.log(`FAIL: ${name} is not set — ${note}`);
      ok = false;
      continue;
    }
    if (expect && val !== expect) {
      // API_BASE / APP_URL / CONNECTED mismatches are the classic footguns.
      console.log(`WARN: ${name} is set but not "${expect}" (got "${name === "QUICKBOOKS_CLIENT_ID" ? "***" : val}") — ${note}`);
      if (name === "QUICKBOOKS_API_BASE") {
        console.log("      → a non-sandbox base means calls hit PRODUCTION; sandbox cert needs the sandbox base.");
        ok = false;
      }
      continue;
    }
    console.log(`PASS: ${name} set${expect ? ` (= ${expect})` : ""}`);
  }
  console.log("\nOptional (customer/item/invoice ids are AUTO-DISCOVERED/CREATED — not owner-provided):");
  for (const { name, note } of OPTIONAL_ENV) {
    console.log(`  ${process.env[name] ? "set" : "unset"}: ${name} — ${note}`);
  }
  if (!process.env.SMOKE_QUICKBOOKS_SEND_TO) {
    console.log("  → SMOKE_QUICKBOOKS_SEND_TO not set: send_invoice will be SKIPPED (blocked-for-safety); every other action still runs.");
  }
  console.log(`\nExpected webhook URL (Intuit portal): ${process.env.NEXT_PUBLIC_APP_URL ?? "?"}/api/webhooks/quickbooks`);
  recordResult("phase0_env", ok ? "PASS" : "FAIL");
  console.log(ok ? "\nPhase 0 PASS" : "\nPhase 0 FAIL — fix the above before continuing.");
  return ok;
}

// ── Shared bootstrap for the DB/provider phases ─────────────────────────────
async function bootstrap() {
  const { createClient } = await import("@supabase/supabase-js");
  const { getActiveForExecution } = await import("@/repositories/integrations");
  const { refreshAndRetry } = await import("@/services/oauth/refreshAndRetry");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const accountId = process.env.SMOKE_ACCOUNT_ID!;
  const userId = process.env.SMOKE_USER_ID!;
  if (!url || !key || !accountId || !userId) {
    throw new Error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SMOKE_ACCOUNT_ID / SMOKE_USER_ID (run the `env` phase)");
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const integration = await getActiveForExecution(accountId, "quickbooks", null, {
    connectedByUserId: userId,
  });
  if (!integration) {
    throw new Error(
      "Blocked because this environment cannot access the connected QuickBooks integration/realm. " +
        "Once run in an environment with DB/app access and QUICKBOOKS_API_BASE + QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN, " +
        "the runner will auto-discover/create customer, item, and invoice data.",
    );
  }
  const call = <T>(apiCall: (accessToken: string) => Promise<T>): Promise<T> =>
    refreshAndRetry({
      accountId: integration.accountId,
      provider: "quickbooks",
      providerAccountId: integration.providerAccountId,
      apiCall,
    });
  return { supabase, accountId, userId, integration, call };
}

// ── Phase 1 — integration / realm check + one harmless read + refresh ───────
async function phaseRealm(): Promise<void> {
  console.log("=== PHASE 1 — integration / realm check ===");
  const { integration, call } = await bootstrap();
  const { customerList } = await import("@/integrations/_shared/quickbooks/api/customers");

  const realmId = integration.providerAccountId;
  console.log(`PASS: active integration row id=${integration.id}`);
  console.log(`PASS: realmId (providerAccountId) persisted = ${realmId}`);
  console.log(`displayName: ${integration.displayName ?? "(none)"}`);
  console.log(`scopes: ${integration.scopes.length} granted`);
  // Sanitized metadata: keys + only company/country-ish string values (never secret).
  const md = integration.accountMetadata as Record<string, unknown>;
  const mdKeys = Object.keys(md);
  console.log(`accountMetadata keys: [${mdKeys.join(", ")}]`);
  for (const k of mdKeys) {
    const v = md[k];
    if (typeof v === "string" && /company|country|name|realm|locale|region/i.test(k)) {
      console.log(`  ${k} = ${v}`);
    }
  }

  // One harmless read — proves the token works AND exercises refreshAndRetry's
  // auto-refresh-on-401 path (the certification "refresh works" criterion).
  const customers = await call((accessToken) =>
    customerList({ accessToken, realmId, maxResults: 1 }),
  );
  console.log(`PASS: harmless read call (customerList maxResults=1) returned ${customers.length} row(s) via refreshAndRetry`);
  console.log("      (refreshAndRetry auto-refreshes on a 401; a passing call proves the refresh path is wired)");

  const s = readState();
  s.realmId = realmId;
  writeState(s);
  recordResult("phase1_realm", "PASS");
  console.log("\nPhase 1 PASS");
}

// ── Phase 2 — option sources via the REAL resolvers (+ pin discovery) ───────
async function phaseOptions(): Promise<void> {
  console.log("=== PHASE 2 — option sources (real resolvers) ===");
  const { integration } = await bootstrap();
  const userId = process.env.SMOKE_USER_ID!;

  const { quickbooksCustomersResolver } = await import("@/integrations/quickbooks/options/customers");
  const { quickbooksInvoicesResolver } = await import("@/integrations/quickbooks/options/invoices");
  const { quickbooksItemsResolver, quickbooksTermsResolver, quickbooksTaxCodesResolver } =
    await import("@/integrations/quickbooks/options/catalog");

  const resolvers = [
    quickbooksCustomersResolver,
    quickbooksItemsResolver,
    quickbooksTermsResolver,
    quickbooksTaxCodesResolver,
    quickbooksInvoicesResolver,
  ];

  const deps: Record<string, string> = {};
  const ctx = { userId, integration, q: "", deps };
  let allOk = true;

  for (const r of resolvers) {
    try {
      const res = await r.resolve(ctx);
      const sample = res.items.slice(0, 3).map((i) => i.label);
      const bounded = res.items.length <= 100;
      console.log(
        `${bounded ? "PASS" : "WARN"}: ${r.source} → ${res.items.length} item(s), hasMore=${res.hasMore}` +
          (sample.length ? ` | sample labels: ${JSON.stringify(sample)}` : " | (empty in this sandbox)"),
      );
      if (!bounded) allOk = false;
    } catch (err) {
      console.log(`FAIL: ${r.source} → ${(err as Error).message}`);
      allOk = false;
    }
  }

  console.log("\n(Customer / item / invoice ids are AUTO-DISCOVERED/CREATED by the `prepare` phase — no owner pins.)");
  recordResult("phase2_options", allOk ? "PASS" : "FAIL");
  console.log(allOk ? "\nPhase 2 PASS" : "\nPhase 2 had failures (see above).");
}

// ── Phase 2.5 — auto-discover an item + auto-create the smoke customer+invoice ──
//   Removes every owner-provided object pin: the runner selects a usable
//   sandbox item and mints its own crsmoke- customer + $1 draft invoice, then
//   persists their ids for the action phase to consume. Debug overrides
//   (SMOKE_QUICKBOOKS_*_ID) short-circuit discovery/creation when present.
async function phasePrepare(): Promise<void> {
  console.log("=== PHASE 2.5 — prepare (auto-discover item; auto-create customer + invoice) ===");
  const { integration, call } = await bootstrap();
  const { itemList, termList, taxCodeList } = await import("@/integrations/_shared/quickbooks/api/catalog");
  const { customerCreate, customerGet, customerList } = await import("@/integrations/_shared/quickbooks/api/customers");
  const { invoiceCreate, invoiceGet, invoiceList } = await import("@/integrations/_shared/quickbooks/api/invoices");
  const realmId = integration.providerAccountId;
  const s = readState();
  s.realmId = realmId;

  // Inventory read (evidence + discovery). All bounded, names-only.
  const [customers, items, terms, taxCodes, invoicePage] = await Promise.all([
    call((t) => customerList({ accessToken: t, realmId, maxResults: 100 })),
    call((t) => itemList({ accessToken: t, realmId, maxResults: 100 })),
    call((t) => termList({ accessToken: t, realmId, maxResults: 100 })),
    call((t) => taxCodeList({ accessToken: t, realmId, maxResults: 100 })),
    call((t) => invoiceList({ accessToken: t, realmId, maxResults: 5 })),
  ]);
  console.log(
    `discovered: ${customers.length} customer(s), ${items.length} item(s), ${terms.length} term(s), ` +
      `${taxCodes.length} tax code(s), ${invoicePage.items.length} recent invoice(s)`,
  );

  // 1. Auto-select a usable invoice-able item (itemList already filters to
  //    active Service/Inventory/NonInventory). Stop clearly if the sandbox has none.
  const itemOverride = process.env.SMOKE_QUICKBOOKS_ITEM_ID;
  const item = itemOverride
    ? { id: itemOverride, name: items.find((i) => i.id === itemOverride)?.name ?? itemOverride }
    : items[0];
  if (!item) {
    recordResult("phase2_5_prepare", "BLOCKED(no-item)");
    writeState(s);
    throw new Error(
      "No usable sandbox item found. Create ONE Product/Service item in the QuickBooks sandbox company " +
        "(Sales → Products and services → New → Service), then re-run `prepare`. " +
        "(Do NOT provide an item id by hand unless debugging.)",
    );
  }
  s.itemId = item.id;
  s.itemName = item.name;
  console.log(`PASS: auto-selected item ${item.id} ("${item.name}")`);

  // 2. Create the smoke customer (marker display name; email = safe SEND_TO if provided).
  const sendTo = process.env.SMOKE_QUICKBOOKS_SEND_TO ?? null;
  s.sendToPresent = !!sendTo;
  const marker = `crsmoke quickbooks ${new Date().toISOString()}`;
  const custOverride = process.env.SMOKE_QUICKBOOKS_CUSTOMER_ID;
  if (custOverride) {
    const existing = await call((t) => customerGet({ accessToken: t, realmId, customerId: custOverride }));
    if (!existing) throw new Error(`SMOKE_QUICKBOOKS_CUSTOMER_ID=${custOverride} not found in the sandbox`);
    s.preparedCustomerId = existing.customerId;
    s.preparedCustomerName = existing.displayName;
    console.log(`PASS: using override customer ${existing.customerId} ("${existing.displayName}")`);
  } else {
    const created = await call((t) =>
      customerCreate({
        accessToken: t,
        realmId,
        displayName: `${marker} Customer`,
        email: sendTo ?? undefined, // safe mailbox only; never a real customer address
        notes: `${marker} - live-cert - safe to ignore`,
      }),
    );
    // Independent read-back proof.
    const readBack = created.customerId
      ? await call((t) => customerGet({ accessToken: t, realmId, customerId: created.customerId! }))
      : null;
    if (!readBack) throw new Error("smoke customer create read-back failed");
    s.preparedCustomerId = readBack.customerId;
    s.preparedCustomerName = readBack.displayName;
    console.log(
      `PASS: created smoke customer ${readBack.customerId} ("${readBack.displayName}")` +
        `${sendTo ? " with safe SEND_TO email" : " (no email — send_invoice will be skipped)"} ; read-back OK`,
    );
  }

  // 3. Create the smoke DRAFT invoice (smoke customer + discovered item, $1). Read-back proof.
  const invOverride = process.env.SMOKE_QUICKBOOKS_INVOICE_ID;
  if (invOverride) {
    const existing = await call((t) => invoiceGet({ accessToken: t, realmId, invoiceId: invOverride }));
    if (!existing) throw new Error(`SMOKE_QUICKBOOKS_INVOICE_ID=${invOverride} not found in the sandbox`);
    s.preparedInvoiceId = existing.invoiceId;
    console.log(`PASS: using override invoice ${existing.invoiceId}`);
  } else {
    const invoice = await call((t) =>
      invoiceCreate({
        accessToken: t,
        realmId,
        customerId: s.preparedCustomerId!,
        lines: [{ itemId: item.id, amount: 1, description: `${marker} line - safe to ignore` }],
        customerEmail: sendTo ?? undefined,
        privateNote: `${marker} invoice - safe to ignore`,
      }),
    );
    const readBack = invoice.invoiceId
      ? await call((t) => invoiceGet({ accessToken: t, realmId, invoiceId: invoice.invoiceId! }))
      : null;
    if (!readBack) throw new Error("smoke invoice create read-back failed");
    s.preparedInvoiceId = readBack.invoiceId;
    console.log(`PASS: created $1 draft invoice ${readBack.invoiceId} for customer ${s.preparedCustomerId}; read-back OK`);
  }

  writeState(s);
  recordResult("phase2_5_prepare", "PASS");
  console.log(
    `\nPhase 2.5 PASS — the action phase will use: customer=${s.preparedCustomerId} ` +
      `name="${s.preparedCustomerName}" item=${s.itemId} invoice=${s.preparedInvoiceId} ` +
      `sendTo=${s.sendToPresent ? "present" : "absent (send_invoice skipped)"}`,
  );
}

// ── Phase 3 — 7 actions through the REAL workflow engine (existing harness) ──
//   Reuses the canonical live action-smoke harness, but AUTO-POPULATES the
//   object env it consumes from the `prepare` phase's discovered/created ids —
//   Marcus never supplies a customer/item/invoice id.
function phaseActions(): void {
  console.log("=== PHASE 3 — action smoke through the real workflow engine ===");
  const s = readState();
  if (!s.preparedCustomerId || !s.itemId || !s.preparedInvoiceId || !s.preparedCustomerName) {
    throw new Error("run the `prepare` phase first — it auto-discovers the item and auto-creates the smoke customer + invoice.");
  }
  console.log("Delegating to the canonical live action-smoke harness scoped to quickbooks.");
  console.log("Runs create_customer / find_customer / get_customer / create_invoice /");
  console.log("send_invoice / get_invoice / list_invoices through the SAME manual run-now");
  console.log("engine path as the app (testMode=false), reusing the shipped fixtures.");
  console.log(`Using auto-prepared: customer=${s.preparedCustomerId} item=${s.itemId} invoice=${s.preparedInvoiceId}`);

  const sendTo = process.env.SMOKE_QUICKBOOKS_SEND_TO;
  if (!sendTo) {
    console.log("send_invoice: SKIP (blocked-for-safety) — no SMOKE_QUICKBOOKS_SEND_TO. Every other action still runs.");
  }

  const testPath = "tests/integration/smoke-actions/run-all.workflow-live.dev.test.ts";
  // Auto-feed the fixture harness's object env from the prepared state.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ALLOW_DB_INTEGRATION_TESTS: "true",
    ALLOW_LIVE_PROVIDER_SMOKE: "true",
    ALLOW_LIVE_PROVIDER_WRITE_SMOKE: "true",
    SMOKE_PROVIDER: "quickbooks",
    SMOKE_RERUN_PASSED: "1",
    SMOKE_QUICKBOOKS_CONNECTED: "true",
    SMOKE_QUICKBOOKS_CUSTOMER_ID: s.preparedCustomerId,
    SMOKE_QUICKBOOKS_CUSTOMER_NAME: s.preparedCustomerName,
    SMOKE_QUICKBOOKS_ITEM_ID: s.itemId,
    SMOKE_QUICKBOOKS_INVOICE_ID: s.preparedInvoiceId,
  };

  const res = spawnSync("npx", ["jest", testPath], { env, stdio: "inherit", shell: true });
  const ok = res.status === 0;
  recordResult("phase3_actions", ok ? "PASS" : `FAIL(exit=${res.status})`);
  console.log(
    ok
      ? "\nPhase 3 PASS — see the harness PASS/FAIL/SKIP table above (send_invoice SKIPs without SEND_TO)."
      : `\nPhase 3 reported non-zero (exit ${res.status}). Read the table above: an env SKIP is not a bug, a FAIL is.`,
  );
}

// ── Phase 5 — webhook security / routing (safe live probes) ─────────────────
async function phaseSecurity(): Promise<void> {
  console.log("=== PHASE 5 — webhook security / routing ===");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const verifier = process.env.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN;
  if (!appUrl || !verifier) {
    throw new Error("NEXT_PUBLIC_APP_URL and QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN required (run the `env` phase)");
  }
  const endpoint = `${appUrl.replace(/\/$/, "")}/api/webhooks/quickbooks`;
  let allOk = true;

  // 5.0 — GET service-info: sanity that the deploy actually has the route.
  {
    const r = await fetch(endpoint, { method: "GET" });
    const ok = r.status === 200;
    console.log(`${ok ? "PASS" : "FAIL"}: GET ${endpoint} → ${r.status} (service-info; proves the deploy has QuickBooks webhook code)`);
    if (!ok) allOk = false;
  }

  // 5.1 — invalid signature → 401 (never accept an unsigned/forged delivery).
  {
    const body = JSON.stringify({ eventNotifications: [] });
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "intuit-signature": "not-a-valid-signature" },
      body,
    });
    const ok = r.status === 401;
    console.log(`${ok ? "PASS" : "FAIL"}: POST with a bad intuit-signature → ${r.status} (expected 401)`);
    if (!ok) allOk = false;
  }

  // 5.2 — validly-signed but UNKNOWN realm → 200 quiet ack, dropped, NO dispatch.
  //   Proves realm-scoped credential resolution: a company we don't hold a
  //   connection for cannot cause any workflow to run (no cross-tenant fan-out).
  {
    const bogusRealm = "9999999999999999999"; // not a real connected realm
    const body = JSON.stringify({
      eventNotifications: [
        {
          realmId: bogusRealm,
          dataChangeEvent: {
            entities: [
              { name: "Customer", id: "999999999", operation: "Create", lastUpdated: "2020-01-01T00:00:00Z" },
            ],
          },
        },
      ],
    });
    const sig = createHmac("sha256", verifier).update(body, "utf8").digest("base64");
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "intuit-signature": sig },
      body,
    });
    const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    const dropped = Number(json.droppedNoIntegration ?? 0);
    const dispatched = Number(json.dispatched ?? -1);
    const ok = r.status === 200 && dropped >= 1 && dispatched === 0;
    console.log(
      `${ok ? "PASS" : "FAIL"}: validly-signed UNKNOWN-realm delivery → ${r.status} ` +
        `droppedNoIntegration=${dropped} dispatched=${dispatched} (expected 200 / dropped≥1 / dispatched=0)`,
    );
    if (!ok) allOk = false;
  }

  // 5.3 — boundaries that CANNOT be safely probed against production.
  console.log("NOTE: missing-verifier-token → 503 is NOT probed live (cannot unset the deployed env). " +
    "Covered by tests/unit/integrations/quickbooks/webhooks/receive.test.ts.");
  console.log("NOTE: paused/disabled-workflow no-dispatch + realmId-scoped dedup keys are asserted by the " +
    "provider-agnostic dispatcher tests + normalize/receive unit suites; the trigger phase re-confirms " +
    "exactly-once + realm-match live.");

  recordResult("phase5_security", allOk ? "PASS" : "FAIL");
  console.log(allOk ? "\nPhase 5 PASS" : "\nPhase 5 had failures (see above).");
}

// ── Phase 4 helpers — trigger interest workflows ────────────────────────────
function buildWorkflowDefinition(triggerType: TriggerKind) {
  return {
    nodes: [
      { id: TRIGGER_NODE_ID, kind: "trigger", provider: "quickbooks", type: triggerType, config: {}, position: { x: 0, y: 0 } },
      {
        id: ACTION_NODE_ID,
        kind: "action",
        provider: "native",
        type: "if_then_condition",
        config: { input: "smoke", operator: "is_falsy", onFalse: "skip" },
        position: { x: 0, y: 160 },
      },
    ],
    edges: [{ id: "live-cert-edge", from: TRIGGER_NODE_ID, to: ACTION_NODE_ID }],
  };
}

async function phaseTriggersActivate(): Promise<void> {
  console.log("=== PHASE 4 — activate trigger-interest workflows ===");
  const { supabase, accountId, userId } = await bootstrap();
  const { registerWorkflowTriggers } = await import("@/services/triggers/lifecycle");
  const workflowsRepo = await import("@/repositories/workflows");
  const triggerResourcesRepo = await import("@/repositories/triggerResources");

  const kinds: TriggerKind[] = ["customer_created", "invoice_created", "payment_received", "invoice_paid"];
  const workflows: WfState[] = [];

  for (const kind of kinds) {
    const { data: wfRow, error } = await supabase
      .from("workflows")
      .insert({
        account_id: accountId,
        created_by_user_id: userId,
        name: `crsmoke-live-quickbooks-${kind}`,
        state: "active",
        draft_definition: buildWorkflowDefinition(kind),
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !wfRow) throw new Error(`workflow insert failed (${kind}): ${error?.message}`);

    const record = await workflowsRepo.getByIdServiceRole(wfRow.id);
    if (!record) throw new Error(`workflow read-back failed (${kind})`);
    await registerWorkflowTriggers(record);
    const row = await triggerResourcesRepo.findByWorkflowAndNode(wfRow.id, TRIGGER_NODE_ID);
    const cfg = (row?.config ?? {}) as Record<string, unknown>;
    console.log(`PASS: ${kind} activated — workflow ${wfRow.id}; interest row realmId=${cfg.realmId ?? "(stamped at dispatch)"}`);
    workflows.push({ kind, workflowId: wfRow.id, baselineRunCount: 0 });
  }

  const s = readState();
  s.workflows = workflows;
  writeState(s);

  console.log("\nNext — produce REAL Intuit webhook deliveries, then run the await phases:");
  console.log("  • customer_created + invoice_created: run `triggers:drive-created` (API-creates a marked customer + $1 draft invoice),");
  console.log("    OR create a Customer and an Invoice by hand in the QuickBooks sandbox UI.");
  console.log("  • payment_received: record a payment against the invoice in the sandbox UI (Receive payment).");
  console.log("  • invoice_paid: make a PARTIAL payment first (assert no invoice_paid fires), THEN complete it.");
  console.log("Phase 4 activation PASS");
}

async function phaseTriggersDriveCreated(): Promise<void> {
  console.log("=== PHASE 4 — drive customer_created + invoice_created via the API ===");
  const { integration, call } = await bootstrap();
  const { customerCreate } = await import("@/integrations/_shared/quickbooks/api/customers");
  const { invoiceCreate } = await import("@/integrations/_shared/quickbooks/api/invoices");
  const realmId = integration.providerAccountId;
  const marker = `crsmoke-${new Date().toISOString().replace(/[:.]/g, "-")}`;

  const customer = await call((t) =>
    customerCreate({ accessToken: t, realmId, displayName: `${marker}-Customer`, notes: `${marker} live-cert - safe to ignore` }),
  );
  console.log(`PASS: created customer ${customer.customerId} (DisplayName ${marker}-Customer)`);

  const s = readState();
  s.createdCustomerId = customer.customerId ?? null;
  const itemId = process.env.SMOKE_QUICKBOOKS_ITEM_ID ?? s.itemId;
  if (!itemId) {
    console.log("SKIP invoice creation: no item available — run the `prepare` phase first (it auto-discovers an item), or create the invoice in the sandbox UI.");
    writeState(s);
    return;
  }
  const invoice = await call((t) =>
    invoiceCreate({
      accessToken: t,
      realmId,
      customerId: customer.customerId!,
      lines: [{ itemId, amount: 1, description: `${marker} live-cert line - safe to ignore` }],
      privateNote: `${marker} live-cert invoice - safe to ignore`,
    }),
  );
  console.log(`PASS: created $1 draft invoice ${invoice.invoiceId} for customer ${customer.customerId}`);
  console.log(`\nThese two creates should each deliver a webhook → run triggers:await-customer and triggers:await-invoice.`);
  console.log(`For payment_received / invoice_paid, receive a payment against invoice ${invoice.invoiceId} in the sandbox UI.`);
  s.createdInvoiceId = invoice.invoiceId ?? null;
  writeState(s);
}

async function awaitTrigger(kind: TriggerKind, timeoutMs = 300_000): Promise<void> {
  console.log(`=== PHASE 4 — await ${kind} run ===`);
  const s = readState();
  const wf = s.workflows.find((w) => w.kind === kind);
  if (!wf) throw new Error(`no activated workflow for ${kind} — run triggers:activate first`);
  const { integration } = await bootstrap();
  const { listByWorkflowServiceRole, getByIdServiceRole } = await import("@/repositories/workflowRunsDiagnostics");

  const deadline = Date.now() + timeoutMs;
  let runs: Awaited<ReturnType<typeof listByWorkflowServiceRole>> = [];
  while (Date.now() < deadline) {
    runs = await listByWorkflowServiceRole(wf.workflowId, { includeRunning: true, limit: 50 });
    if (runs.length >= wf.baselineRunCount + 1) break;
    await sleep(5000);
  }

  let pass = true;
  const fail = (m: string) => {
    pass = false;
    console.log(`FAIL: ${m}`);
  };

  if (runs.length < wf.baselineRunCount + 1) {
    fail(`no new run within ${timeoutMs / 1000}s (have ${runs.length}, baseline ${wf.baselineRunCount})`);
    recordResult(`trigger_${kind}`, "FAIL(no-run)");
    return;
  }
  if (runs.length > wf.baselineRunCount + 1) fail(`expected exactly 1 new run, got ${runs.length - wf.baselineRunCount} (double-fire?)`);

  const run = runs[0]!; // newest first
  const ev = run.triggerEvent;
  const payload = (ev?.payload ?? {}) as Record<string, unknown>;
  console.log(`run ${run.id} appeared (status=${run.status}) eventId=${ev?.eventId}`);

  if (ev?.eventType !== kind) fail(`eventType=${ev?.eventType}, expected ${kind}`);
  if (ev?.providerAccountId !== integration.providerAccountId) fail(`realm mismatch: providerAccountId=${ev?.providerAccountId}`);
  if (payload.realmId !== integration.providerAccountId) fail(`payload.realmId mismatch`);
  const expectedPrefix = `${kind}:${integration.providerAccountId}:`;
  if (typeof ev?.eventId === "string" && !ev.eventId.startsWith(expectedPrefix)) {
    fail(`dedup eventId not realm-scoped as ${expectedPrefix}<entityId> (got ${ev.eventId})`);
  }
  if (typeof ev?.eventId === "string" && /\d{4}-\d{2}-\d{2}T/.test(ev.eventId)) {
    fail(`dedup eventId carries a timestamp — expected the durable entity-scoped key`);
  }

  // Sanitized payload SHAPE (keys + types only — no PII values).
  const shape: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload)) {
    shape[k] = v === null ? "null" : Array.isArray(v) ? `array(${v.length})` : typeof v;
  }
  console.log(`live payload shape: ${JSON.stringify(shape)}`);

  // Terminal via production's cron drain.
  const terminalDeadline = Date.now() + 240_000;
  let status: string | null = run.status;
  while (Date.now() < terminalDeadline) {
    const rec = await getByIdServiceRole(run.id);
    status = rec?.status ?? null;
    if (status === "succeeded" || status === "failed") break;
    await sleep(10_000);
  }
  console.log(`terminal status=${status}`);
  if (status !== "succeeded") fail(`run did not reach 'succeeded' (got ${status})`);

  // Commit the new baseline + remember the eventId for dedup cleanup.
  wf.baselineRunCount = runs.length;
  if (ev?.eventId) s.seenEventIds.push(ev.eventId);
  writeState(s);
  recordResult(`trigger_${kind}`, pass ? "PASS" : "FAIL");
  console.log(pass ? `\n${kind} PASS (exactly one run, realm-matched, terminal succeeded)` : `\n${kind} FAIL (see above)`);
}

async function phaseTriggersStatus(): Promise<void> {
  console.log("=== PHASE 4 — trigger run status ===");
  const s = readState();
  const { listByWorkflowServiceRole } = await import("@/repositories/workflowRunsDiagnostics");
  for (const wf of s.workflows) {
    const runs = await listByWorkflowServiceRole(wf.workflowId, { includeRunning: true, limit: 50 });
    console.log(`${wf.kind}: ${runs.length} run(s) [baseline ${wf.baselineRunCount}] — workflow ${wf.workflowId}`);
    for (const run of runs) {
      console.log(`  - ${run.id} status=${run.status} eventId=${run.triggerEvent?.eventId}`);
    }
  }
  console.log("\nReminder: invoice_paid must have exactly ONE run — and only after the FULL payment, " +
    "never after the partial. Payment Create+Update must not double-fire it.");
}

async function phaseTriggersDeactivate(): Promise<void> {
  console.log("=== PHASE 4 — deactivate + cleanup ===");
  const { supabase } = await bootstrap();
  const { unregisterWorkflowTriggers } = await import("@/services/triggers/lifecycle");
  const workflowsRepo = await import("@/repositories/workflows");
  const triggerResourcesRepo = await import("@/repositories/triggerResources");

  const s = readState();
  let allClean = true;
  for (const wf of s.workflows) {
    const record = await workflowsRepo.getByIdServiceRole(wf.workflowId);
    if (record) {
      await unregisterWorkflowTriggers(record);
      const left = await triggerResourcesRepo.listByWorkflow(wf.workflowId);
      if (left.length !== 0) allClean = false;
      console.log(`${wf.kind}: deactivated; trigger_resources rows left=${left.length}`);
    }
    await supabase
      .from("workflows")
      .update({ state: "deleted", deleted_at: new Date().toISOString() })
      .eq("id", wf.workflowId);
  }
  for (const eventId of s.seenEventIds) {
    const { error } = await supabase
      .from("webhook_event_dedup")
      .delete()
      .eq("provider", "quickbooks")
      .eq("event_id", eventId);
    console.log(`dedup row cleanup (${eventId}): ${error ? error.message : "ok"}`);
  }
  recordResult("phase4_deactivate", allClean ? "PASS" : "FAIL");
  console.log("\nArtifacts LEFT in the sandbox (by design — no delete/void shipped):");
  console.log(`  customer: ${s.createdCustomerId ?? "(none created by this harness)"}`);
  console.log(`  invoice:  ${s.createdInvoiceId ?? "(none created by this harness)"}`);
  console.log("  + any customer/invoice/payment you created by hand in the sandbox UI.");
  console.log("  Void/delete them manually in the sandbox UI if you want a clean company, or leave them (disposable).");
  console.log(allClean ? "\nPhase 4 deactivate PASS (interest rows cleaned; cert workflows soft-deleted)" : "\nPhase 4 deactivate: some trigger rows remained (see above)");
}

// ── Phase 6 — evidence draft ────────────────────────────────────────────────
function phaseEvidence(): void {
  const s = readState();
  const r = s.results;
  const g = (k: string) => r[k] ?? "NOT-RUN";
  console.log(`## QUICKBOOKS-1 sandbox live completion closeout

**Provider:** quickbooks
**Status:** ${Object.values(r).some((v) => v.startsWith("FAIL")) ? "blocked/partial (see FAILs)" : "partial — fill in after every phase run"} — a human decides live-complete
**Environment tested:** QuickBooks sandbox
**Run timestamp:** <fill: date of the run>
**Commit/deploy checked:** <fill: deployed commit that served ${process.env.NEXT_PUBLIC_APP_URL ?? "chainreact.app"}>

### OAuth / realm
- Phase 0 env: ${g("phase0_env")}; Phase 1 realm/refresh: ${g("phase1_realm")} (realmId ${s.realmId ?? "?"})

### Option sources
| Source | Result | Notes |
|---|---|---|
| quickbooks:customers/items/terms/tax_codes/invoices | ${g("phase2_options")} | see the Phase 2 per-source PASS lines |

### Actions
| Action | Result | Notes |
|---|---|---|
| create/find/get customer, create/send/get/list invoice | ${g("phase3_actions")} | Phase 3 ran them through the real engine; see the harness table |

### Triggers
| Trigger | Result | Notes |
|---|---|---|
| quickbooks:customer_created | ${g("trigger_customer_created")} | exactly-one + realm-match + terminal |
| quickbooks:invoice_created | ${g("trigger_invoice_created")} | exactly-one + realm-match + terminal |
| quickbooks:payment_received | ${g("trigger_payment_received")} | exactly-one + bounded payload |
| quickbooks:invoice_paid | ${g("trigger_invoice_paid")} | one fire only after FULL payment |

### Invoice-paid behavior
- Partial payment must NOT fire invoice_paid; full payment fires exactly one; Payment Create+Update must not double-fire (invoice-identity dedup). Confirm from triggers:status.

### Webhook security/routing
- Phase 5: ${g("phase5_security")} (GET service-info; bad-signature → 401; validly-signed unknown-realm → 200 dropped, no dispatch)

### Cleanup/artifacts
- prepare (auto-created): customer ${s.preparedCustomerId ?? "-"} ("${s.preparedCustomerName ?? "-"}"), draft invoice ${s.preparedInvoiceId ?? "-"}, item used ${s.itemId ?? "-"}.
- trigger phase (auto-created): customer ${s.createdCustomerId ?? "-"}, invoice ${s.createdInvoiceId ?? "-"} + any payment recorded by hand in the sandbox UI.
- Deactivate: ${g("phase4_deactivate")}. No delete/void shipped by design — marked sandbox artifacts are left (disposable company).

### Remaining owner actions
- Production leg: complete the Intuit App Assessment → production keys → production redirect/webhook/env → redeploy → re-run this harness against a LIVE company (not sandbox).
`);
}

function printGuide(): void {
  console.log(`QUICKBOOKS-1 owner-runnable Phase 13 sandbox live-cert harness.

Owner provides ONLY:  QUICKBOOKS_API_BASE=${SANDBOX_API_BASE}
                      QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN=<Intuit portal verifier token>
                      SMOKE_QUICKBOOKS_SEND_TO=<safe test email>   (optional; needed only for send_invoice)
Plus the standard dev-DB access already in .env.local (SUPABASE url/key, SMOKE_ACCOUNT_ID, SMOKE_USER_ID).
Customer / item / invoice ids are AUTO-DISCOVERED/CREATED — never owner-provided.

Automated, no-wait phases (run this one line):
  npx tsx scripts/trash/quickbooks-live-cert.ts run
    → env → realm → options → prepare → security → actions

Individual phases:
  env | realm | options | prepare | actions | security

Guided trigger phases (run around REAL sandbox changes — a webhook needs a real change):
  triggers:activate            # arm the 4 interest workflows
  triggers:drive-created       # API-create a customer + $1 invoice (drives customer_created + invoice_created)
  triggers:await-customer      # wait for exactly one customer_created run
  triggers:await-invoice       # wait for exactly one invoice_created run
  # → in the QuickBooks sandbox UI: Receive payment (partial first)
  triggers:await-payment       # wait for exactly one payment_received run
  # → in the sandbox UI: complete the remaining balance
  triggers:await-invoice-paid  # wait for exactly one invoice_paid run (only after FULL payment)
  triggers:status              # run counts across the 4 workflows
  triggers:deactivate          # unregister interest rows + soft-delete cert workflows + dedup cleanup

  evidence                     # print the closeout draft from accumulated results
`);
}

// ── Dispatch ────────────────────────────────────────────────────────────────
(async () => {
  const phase = process.argv[2] ?? "guide";
  switch (phase) {
    case "guide":
      printGuide();
      return;
    case "env":
      phaseEnv();
      return;
    case "realm":
      await phaseRealm();
      return;
    case "options":
      await phaseOptions();
      return;
    case "prepare":
      await phasePrepare();
      return;
    case "actions":
      phaseActions();
      return;
    case "security":
      await phaseSecurity();
      return;
    case "run": {
      // Everything that can be certified without waiting on a real webhook.
      if (!phaseEnv()) throw new Error("Phase 0 failed — fix env before continuing.");
      console.log("");
      await phaseRealm();
      console.log("");
      await phaseOptions();
      console.log("");
      await phasePrepare();
      console.log("");
      await phaseSecurity();
      console.log("");
      phaseActions();
      console.log("\n=== automated phases done — now run the guided trigger phases (see `guide`) ===");
      return;
    }
    case "triggers:activate":
      await phaseTriggersActivate();
      return;
    case "triggers:drive-created":
      await phaseTriggersDriveCreated();
      return;
    case "triggers:await-customer":
      await awaitTrigger("customer_created");
      return;
    case "triggers:await-invoice":
      await awaitTrigger("invoice_created");
      return;
    case "triggers:await-payment":
      await awaitTrigger("payment_received");
      return;
    case "triggers:await-invoice-paid":
      await awaitTrigger("invoice_paid");
      return;
    case "triggers:status":
      await phaseTriggersStatus();
      return;
    case "triggers:deactivate":
      await phaseTriggersDeactivate();
      return;
    case "evidence":
      phaseEvidence();
      return;
    default:
      throw new Error(`unknown phase "${phase}" — run \`npx tsx scripts/trash/quickbooks-live-cert.ts guide\``);
  }
})()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("FATAL", (err as Error).message);
    process.exit(1);
  });
