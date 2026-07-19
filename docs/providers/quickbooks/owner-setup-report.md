# QuickBooks Online Owner Setup Report

## Status
- Code status: **SANDBOX LIVE-COMPLETE** (QUICKBOOKS-1) — Phase 13 sandbox
  certification PASSED 2026-07-13 (all option sources, all 7 actions, all 4
  triggers, invoice_paid derivation, and webhook security/routing verified live
  against the connected sandbox company). Production leg remains owner-gated
  (Intuit App Assessment → production keys). See "Phase 13 SANDBOX LIVE
  CERTIFICATION — PASSED 2026-07-13" below.
- Commit: see git log (local only, `v2-main`)
- Push status: Nothing pushed.
- Smoke status: unit + registration + fixture suites green (mocked provider
  boundary); ALL live smoke BLOCKED_ENV until this setup is done. Trigger
  live certification additionally blocked (compact Intuit payloads force
  post-fetch enrichment → needs a live connected realm — see the trigger
  seed notes).
- Remaining owner action: everything below (Intuit developer app, webhook
  config, Vercel env vars, sandbox company, smoke env pins), then Phase 13
  sandbox-first live certification.

### Phase 13 live-certification attempt — 2026-07-13
A Phase 13 live-certification pass was attempted from the local coding
environment. Result: **BLOCKED (owner-interactive / env-gated)** — no live
run was performed. Findings:
- Mocked boundary re-verified green: 13 QuickBooks unit/route/resolver/
  lifecycle/webhook suites, **113 tests passing**; `npx tsc --noEmit` exit 0;
  `npm run lint:structure` OK. Code is certification-ready.
- The live smoke harness is gated OFF here. `.env.local` carries
  `QUICKBOOKS_CLIENT_ID` / `QUICKBOOKS_CLIENT_SECRET` only; the sandbox live
  pins are **absent**: `QUICKBOOKS_API_BASE` (sandbox flag),
  `QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN`, `SMOKE_QUICKBOOKS_CONNECTED`,
  `SMOKE_QUICKBOOKS_CUSTOMER_ID` / `_ITEM_ID` / `_INVOICE_ID` / `_SEND_TO`.
  Without them the QuickBooks action fixtures self-SKIP and stay
  `BLOCKED_ENV` in the certification seed (`scripts/chainreact/smoke/
  certificationSeed/other.ts`).
- Triggers cannot be certified from a shell at all: there is no QuickBooks
  trigger-smoke test, and the 4 triggers require **real Intuit webhook
  deliveries** to the deployed `/api/webhooks/quickbooks` endpoint, driven by
  sandbox-UI Customer/Invoice/Payment actions. This is inherently
  owner-interactive.
- No code bugs found; no code changed. The live acceptance bar
  (invoice_paid zero-balance-with-positive-total gate, invoice-identity dedup
  collapsing Payment Create+Update, per-realm credential isolation,
  fail-closed HMAC-SHA256 signature verify, count-only no-leak logging) is
  **code-verified and unit-tested**, live-pending.
- Disposition: remains **code-complete, live certification owner-gated**. The
  path to `live-complete` is the owner-runnable harness
  (`scripts/trash/quickbooks-live-cert.ts`, added 2026-07-13) — see
  "Owner-runnable Phase 13 sandbox certification" below. Correction: the
  `SMOKE_QUICKBOOKS_*` object ids named above are NOT owner inputs — the
  runner auto-discovers/creates the customer, item, and invoice. Marcus only
  supplies `QUICKBOOKS_API_BASE` + `QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN` (and
  optional `SMOKE_QUICKBOOKS_SEND_TO` for send_invoice).

### Phase 13 SANDBOX LIVE CERTIFICATION — PASSED 2026-07-13
Executed end-to-end with the owner-runnable harness against the connected
sandbox company **"Sandbox Company US bc85"** (realmId `9341457412489636`,
country US). Env: `QUICKBOOKS_API_BASE=sandbox`, verifier token set,
`SMOKE_QUICKBOOKS_SEND_TO` = owner mailbox. All sanitized (ids/DocNumbers/counts
only; no tokens/PII printed).

- **OAuth / realm:** active integration row resolved; `realmId` persisted as
  providerAccountId; `accountMetadata` = { companyName "Sandbox Company US
  bc85", country US, realmId }; refresh path exercised (a read succeeded via
  `refreshAndRetry`).
- **Option sources (5/5 PASS, live, bounded, names-only):** customers 29,
  items 18, terms 5, tax_codes 2, invoices 31.
- **Actions (7/7 PASS through the real workflow engine, testMode=false):**
  reads `find_customer` / `get_customer` / `get_invoice` / `list_invoices`;
  writes `create_customer` / `create_invoice` / `send_invoice` — each verified
  by an independent read-back (marker confirmed on the persisted record), and
  `send_invoice` confirmed `EmailStatus=EmailSent` to the owner mailbox
  (never a customer address).
- **Triggers (4/4 PASS via REAL Intuit portal webhook → https://chainreact.app
  → dispatch → terminal `succeeded`):** each exactly one realm-matched run with
  a realm-scoped, timestamp-free dedup eventId:
  - `customer_created` — `customer_created:9341457412489636:<customerId>`
  - `invoice_created` — `invoice_created:9341457412489636:<invoiceId>`
  - `payment_received` — `payment_received:9341457412489636:<paymentId>`
    (2 distinct payments in the paid-in-two-parts flow → 2 runs, each fired once
    on its own payment id — correct, not a double-fire)
  - `invoice_paid` — `invoice_paid:9341457412489636:<invoiceId>`
- **invoice_paid derivation (PROVEN LIVE):** a **partial** payment ($0.50 of
  $1.00) fired `payment_received` but **did NOT** fire `invoice_paid` (balance
  still > 0). The **full** payment (remaining $0.50 → balance $0) fired
  `invoice_paid` **exactly once**; the two payments + Payment Create/Update did
  **not** double-fire it (dedup key is the invoice's durable identity). Zero
  balance with a positive total verified before dispatch.
- **Webhook security / routing (PASS):** GET service-info 200; a bad
  `intuit-signature` → **401**; a **validly-signed UNKNOWN-realm** delivery →
  200 quiet ack, `droppedNoIntegration=1`, `dispatched=0` (realm-scoped
  credential resolution — no cross-company fan-out). Missing-verifier → 503 is
  unit-covered only (cannot unset the deployed env).
- **Cleanup:** interest rows unregistered (0 left), cert workflows soft-deleted,
  dedup rows removed. Marked `crsmoke-` sandbox artifacts LEFT by design (no
  delete/void action shipped; sandbox company is disposable): customers 58 & 61,
  invoices 145 & 150 (#1043) + the two recorded payments.
- **Two runner/harness bugs found + fixed during the run** (product code
  unchanged): (1) the harness built the smoke customer DisplayName from a
  `:`-bearing ISO timestamp, which QBO rejects (error 2040) — sanitized;
  (2) the write-smoke harness had no QuickBooks read-back seam, so writes could
  not verify-certify — added `tests/smoke-actions/writeHarnessDeps/quickbooks.ts`.
- **Remaining owner action:** the PRODUCTION leg only — complete the Intuit App
  Assessment Questionnaire → unlock production keys → add production
  redirect/webhook/env → redeploy → re-run this harness against a LIVE company
  (deploy-gated retest). Sandbox certification itself is COMPLETE.

## Provider developer portal setup

### App/basic settings (developer.intuit.com)
- App name: ChainReact (or ChainReact Dev for a separate dev app)
- App type / platform: **QuickBooks Online and Payments** — select ONLY the
  Accounting scope when asked (do NOT enable Payments)
- Website URL: `https://chainreact.app`
- Privacy policy URL / EULA URL: required for PRODUCTION keys (App details
  checklist) — use the live chainreact.app policy pages
- Support email: chainreactapp@gmail.com
- Logo/icon: required for production app details; any square PNG works for
  private use
- Notes: every Intuit app has TWO key sets — **Development keys** (work only
  against sandbox companies) and **Production keys** (only against live
  companies). OAuth endpoints are identical; the client id picks the
  environment. Production keys are LOCKED behind the App Assessment
  Questionnaire (Production → Keys & credentials → Compliance) — a
  security/compliance questionnaire, mandatory since 2022. Publishing to the
  QuickBooks App Store is a separate, heavier review and is NOT needed for
  our own production use.

### Redirect URIs (per environment, exact-match)
- Local: `http://localhost:3000/api/integrations/oauth/quickbooks/callback`
  (allowed under Development only)
- Preview/Vercel: `https://<preview-host>/api/integrations/oauth/quickbooks/callback`
  (HTTPS required; add per preview host you actually use)
- Production: `https://chainreact.app/api/integrations/oauth/quickbooks/callback`
- Exact callback path: `/api/integrations/oauth/quickbooks/callback`
- Note: Intuit appends `realmId` (the company id) to the callback redirect —
  V2 persists it as the integration's providerAccountId; a callback without
  it fails the connect by design.

### Webhook URLs (app-level — THIS IS CONFIGURED IN THE INTUIT PORTAL, not by V2)
QuickBooks webhooks are APP-LEVEL: one endpoint URL + entity checklist per
app per environment, set in the portal's **Webhooks** section. ChainReact
trigger activation only stores internal interest rows — it never creates
provider webhooks, so nothing works until you configure this:

- Development section (sandbox events):
  `https://<tunnel-or-preview-host>/api/webhooks/quickbooks`
  (HTTPS required — for local testing use a tunnel and set
  `NEXT_PUBLIC_APP_URL` to the tunnel origin, or point it at the deployed
  preview; the Asana "drive activation locally against the deployed route"
  pattern applies)
- Production section:
  `https://chainreact.app/api/webhooks/quickbooks`
- **Entities to check** (exactly these three for QUICKBOOKS-1):
  - **Customer** (Create is what we consume; extra operations are ignored server-side)
  - **Invoice** (Create consumed; Update/Delete/Void ignored this slice)
  - **Payment** (Create + Update consumed — Update feeds the invoice_paid derivation)
- Signature secret location: after saving the endpoint the portal shows the
  **Verifier Token** (separate token per environment). Copy it into
  `QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN`. V2 verifies the `intuit-signature`
  header (base64 HMAC-SHA256 over the raw body) with it; a missing env →
  the route answers 503 and accepts nothing.
- Verification/challenge notes: Intuit has NO handshake/challenge — use the
  portal's test-delivery facility after deploy; the route's GET returns
  service info only.

### OAuth scopes
| Scope | Required? | Used by | Why |
|---|---:|---|---|
| `com.intuit.quickbooks.accounting` | Yes | everything (customers, invoices, payments, items, terms, tax codes, company info) | The single all-or-nothing Accounting API scope — Intuit has no narrower read-only or per-entity scopes |

Do NOT add `com.intuit.quickbooks.payment` (card-processing product, not the
accounting Payment entity) or OpenID scopes (identity comes from CompanyInfo).

### Provider-specific settings
- Token rotation: refresh tokens live on a rolling 100-day window and the
  VALUE rotates roughly daily — V2 persists the returned token on every
  refresh automatically; nothing to configure.
- PKCE: not supported/documented by Intuit — V2 does not send it.
- Webhook signing: verifier token per environment (above).
- Event subscriptions: the entity checklist above.
- Marketplace/review steps: App Assessment Questionnaire for production keys
  only; App Store listing NOT required.
- Test-user requirements: none — sandbox companies come with demo data.
- Rate-limit notes: 500 req/min per realm per app; V2 enriches sequentially
  and stays far under it.
- **`intuit_tid` capture (troubleshooting / assessment answer): YES.** V2 reads
  Intuit's `intuit_tid` response header (the transaction/correlation id Intuit
  support asks for) from **every** QuickBooks/Intuit API response — the shared
  Accounting-API client (`_shared/quickbooks/api/_request.ts`), the connect-time
  CompanyInfo read, and the OAuth token-exchange/refresh calls. On a failed call
  it is written to a sanitized `quickbooks.api.error` troubleshooting log
  (`{ event, method, path, status, intuitTid }`) and carried on the QB error
  classes' `intuitTid` metadata field. It is an opaque, non-sensitive id: it is
  NEVER logged alongside the access token / Authorization header / webhook
  verifier token / raw provider body, and it is NEVER surfaced into workflow
  outputs or user-facing UI. This lets us quote Intuit the exact correlation id
  for any failing request during an assessment or support escalation.

## Vercel environment variables

| Env var | Required? | Local? | Preview? | Production? | Where used | Notes |
|---|---:|---:|---:|---:|---|---|
| `QUICKBOOKS_CLIENT_ID` | Yes | Dev keys | Dev keys | **Production keys** | `integrations/quickbooks/oauth.ts` | Development vs Production keys are different values |
| `QUICKBOOKS_CLIENT_SECRET` | Yes | Dev keys | Dev keys | **Production keys** | `integrations/quickbooks/oauth.ts` | Never logged; Basic-auth token exchange |
| `QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN` | Yes (for triggers) | tunnel/dev token | Dev token | **Production token** | `integrations/quickbooks/webhooks/receive.ts` | Per-environment portal value; missing → webhook route 503s |
| `QUICKBOOKS_API_BASE` | Only with Dev keys | `https://sandbox-quickbooks.api.intuit.com` | same | **unset** (defaults to `https://quickbooks.api.intuit.com`) | `integrations/quickbooks/oauth.ts` + `_shared/quickbooks/api/_request.ts` | THIS is the sandbox/production flag — set it wherever Development keys are used |
| `QUICKBOOKS_AUTHORIZE_BASE` / `QUICKBOOKS_TOKEN_BASE` | No | e2e mocks only | no | no | oauth.ts | Defaults are correct for BOTH sandbox and production |

Redeploy after env changes.

### Smoke/live-certification env (gitignored `.env.local` on the smoke setup)
Owner provides ONLY the two Intuit values (`QUICKBOOKS_API_BASE` = sandbox
base + `QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN`) plus the optional
`SMOKE_QUICKBOOKS_SEND_TO` (an owner-controlled mailbox — the ONLY address
send_invoice smoke ever emails; absent → send_invoice is skipped
blocked-for-safety). **The object ids — `SMOKE_QUICKBOOKS_CUSTOMER_ID` /
`_CUSTOMER_NAME` / `_ITEM_ID` / `_INVOICE_ID` — are AUTO-DISCOVERED/CREATED by
the runner and are NOT owner-provided** (they remain accepted only as optional
debug overrides). The runner sets `SMOKE_QUICKBOOKS_CONNECTED` and the object
ids itself when it invokes the action harness. See "Owner-runnable Phase 13
sandbox certification" below.

## Supabase / database setup
- Migrations added: none (trigger_resources / webhook_event_dedup /
  integrations already carry everything).
- db:push run: n/a.
- RLS/policy notes: no new tables; the one new repository read
  (`getAnyActiveByProviderAccountServiceRole`) is service-role webhook
  enrichment, matching the documented service-role webhook boundary.
- Storage bucket notes: none. Cron notes: none (Intuit webhooks don't
  expire — no renewal).

## Actions shipped
| Action | Handler | Schema | Metadata | Options | Unit tests | Smoke |
|---|---|---|---|---|---|---|
| create_customer | ✅ | ✅ strict | ✅ (recipient-annotated email) | — | ✅ | write fixture (artifact left) |
| find_customer | ✅ | ✅ strict | ✅ found:false | — | ✅ | read fixture |
| get_customer | ✅ | ✅ strict | ✅ found:false | quickbooks:customers | ✅ | read fixture |
| create_invoice | ✅ draft-only | ✅ strict | ✅ (recipient-annotated billing email) | customers, terms, (items/tax_codes for id discovery) | ✅ | write fixture (artifact left) |
| send_invoice | ✅ explicit send | ✅ strict | ✅ "emails customer" labeled, sendTo recipient-annotated | quickbooks:invoices | ✅ | write fixture (env-pinned safe destination) |
| get_invoice | ✅ | ✅ strict | ✅ found:false | quickbooks:invoices | ✅ | read fixture |
| list_invoices | ✅ | ✅ strict | ✅ bounded page | quickbooks:customers | ✅ | read fixture |

## Triggers shipped
| Trigger | Webhook/Polling | Lifecycle | Config | Unit tests | Smoke |
|---|---|---|---|---|---|
| customer_created | app-level webhook | interest-row activate / no-op deactivate | realmId (stamped at activation) | ✅ | **live-certified 2026-07-13** (exactly-one, realm-matched) |
| invoice_created | app-level webhook | same | same | ✅ | **live-certified 2026-07-13** |
| payment_received | app-level webhook | same | same | ✅ | **live-certified 2026-07-13** (fires once per distinct payment) |
| invoice_paid | app-level webhook (DERIVED from Payment Create/Update + verified zero balance) | same | same | ✅ incl. partial-payment no-fire + Create/Update dedup | **live-certified 2026-07-13** (partial no-fire + full single-fire + no double-fire, all proven live) |

## Manual verification checklist for Marcus
- [ ] Create the Intuit developer app (Accounting scope only); grab Development keys.
- [ ] Create a sandbox company (portal → Sandbox → Add).
- [ ] Add redirect URIs (Development: localhost + preview; Production later).
- [ ] Configure the Development webhook endpoint + Customer/Invoice/Payment entities; copy the verifier token.
- [ ] Add env vars (Dev keys + sandbox `QUICKBOOKS_API_BASE` + verifier token) to the environment under test; redeploy/restart.
- [ ] Connect QuickBooks from the Apps page (owner/admin — account-class provider); confirm the integration row shows the company name and the realmId persisted.
- [ ] Run the owner-runnable harness (see "Owner-runnable Phase 13 sandbox certification" below) — it AUTO-discovers the item and AUTO-creates the smoke customer + invoice, then certifies option sources + the 7 actions through the real engine, then guides the 4 triggers. No object-id pins to set.
- [ ] Live-certify triggers via the harness's guided `triggers:*` phases (create a customer / invoice / payment in the sandbox UI); confirm exactly-one runs, partial-payment no-fire, Create+Update single invoice_paid fire.
- [ ] For production later: complete the App Assessment Questionnaire, unlock Production keys, add production redirect/webhook/envs, redeploy, re-certify.

## Live certification checklist (Phase 13, sandbox first)
1. Environment alignment gate: deployed commit contains QUICKBOOKS-1;
   `NEXT_PUBLIC_APP_URL` matches; portal redirect + webhook point at the
   SAME environment; env vars set in that scope.
2. OAuth connect → row created (realmId = providerAccountId, company display
   name), refresh works (wait >60 min or force), account-class gating holds
   (member cannot connect).
3. Option sources: customers / items / terms / tax_codes / invoices load
   with names-only labels.
4. Actions: the 4 reads then the 3 writes through the real engine
   (testMode=false), with read-backs + cleanup accounting (create_* leave
   marked sandbox artifacts — no delete actions exist by design).
5. Triggers: each of the 4 through the REAL portal webhook; verify
   signature rejection (bad verifier), dedup on Intuit redelivery,
   paused-workflow drop, cross-realm no-fire if a second sandbox company is
   available; save sanitized observed event shapes into research.md.
6. Disposition: void/delete test artifacts manually in the sandbox UI (or
   leave — sandbox companies are disposable); record what remains.

## Known blockers / limitations
- No Intuit app/credentials exist yet — everything live is owner-gated.
- Trigger direct-seed smoke is impossible pre-owner-setup by design
  (compact payloads → enrichment needs a live realm-matched integration).
- `list_invoices` has no open/paid server-side filter (Balance
  filterability in the query language unverified) — branch on the projected
  `balance`/`paid` downstream.
- create_invoice line rows take a pasted/mapped item id (object-list
  sub-fields can't bind option sources); `quickbooks:items` exists for id
  discovery.
- Invoice paid-then-unpaid-then-paid-again cycles can re-fire invoice_paid
  after the dedup TTL (documented in research.md — semantically correct).
- Multicurrency: V2 never sets CurrencyRef (QBO derives it from the
  customer).

## Owner-runnable Phase 13 sandbox certification

The guided runner is `scripts/trash/quickbooks-live-cert.ts`. Run it from an
environment that HAS the connected QuickBooks sandbox realm (dev-DB access)
plus the two Intuit env values below. It reuses real V2 internals only
(option resolvers, typed API wrappers, the trigger lifecycle, the deployed
webhook route, and the canonical action-smoke live harness) and mocks
nothing. It NEVER marks QuickBooks live-complete — it prints an evidence
draft for a human to judge.

### Required env
Marcus provides ONLY these two:
```text
QUICKBOOKS_API_BASE=https://sandbox-quickbooks.api.intuit.com
QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN=<Intuit portal Webhooks-section verifier token>
```
Optional:
```text
SMOKE_QUICKBOOKS_SEND_TO=<safe test email>   # OPTIONAL — required ONLY to
                                             # certify send_invoice. Absent →
                                             # send_invoice is SKIPPED
                                             # (blocked-for-safety); every
                                             # other action still runs.
```
The dev-DB access already in `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `SMOKE_LIVE_ACCOUNT_ID`, `SMOKE_LIVE_USER_ID`) plus
`QUICKBOOKS_CLIENT_ID` / `QUICKBOOKS_CLIENT_SECRET` are also needed to reach
the connected realm.

**Customer, item, and invoice ids are AUTO-DISCOVERED / AUTO-CREATED by the
runner — never owner-provided.** `SMOKE_QUICKBOOKS_CUSTOMER_ID` / `_ITEM_ID` /
`_INVOICE_ID` / `_CUSTOMER_NAME` are accepted only as optional debug
overrides. **If no usable sandbox item exists**, the runner stops and tells
you to create one Product/Service item in the sandbox company (Sales →
Products and services → New → Service) — that is the only object you might
have to create by hand, and only if the sandbox is empty of items.

### Command
```bash
# Automated, no-wait phases in one line: env → realm → options → prepare → security → actions
npx tsx scripts/trash/quickbooks-live-cert.ts run

# Then the guided trigger phases (run around REAL sandbox changes):
npx tsx scripts/trash/quickbooks-live-cert.ts triggers:activate
npx tsx scripts/trash/quickbooks-live-cert.ts triggers:drive-created   # API-creates a customer + $1 invoice
npx tsx scripts/trash/quickbooks-live-cert.ts triggers:await-customer
npx tsx scripts/trash/quickbooks-live-cert.ts triggers:await-invoice
#   → in the QuickBooks sandbox UI: Receive payment (PARTIAL first)
npx tsx scripts/trash/quickbooks-live-cert.ts triggers:await-payment
#   → in the sandbox UI: pay the REMAINING balance in full
npx tsx scripts/trash/quickbooks-live-cert.ts triggers:await-invoice-paid
npx tsx scripts/trash/quickbooks-live-cert.ts triggers:status
npx tsx scripts/trash/quickbooks-live-cert.ts triggers:deactivate
npx tsx scripts/trash/quickbooks-live-cert.ts evidence   # closeout draft
# `... guide` prints the whole runbook.
```

### What the command verifies
- **Phase 0 env / Phase 1 realm:** required env present; sandbox base flagged;
  active integration row with persisted `realmId`; one harmless read via
  `refreshAndRetry` (exercises the refresh-on-401 path). No tokens printed.
- **Phase 2 options:** all 5 resolvers (`customers` / `items` / `terms` /
  `tax_codes` / `invoices`) resolve live, bounded, names-only labels.
- **Phase 2.5 prepare:** auto-selects an invoice-able item; auto-creates a
  marked `crsmoke-` customer (email = `SMOKE_QUICKBOOKS_SEND_TO` if provided)
  and a $1 draft invoice; both proven by independent read-back.
- **Phase 3 actions:** the 7 actions through the SAME manual run-now engine
  path as the app (`testMode=false`), reusing the shipped fixtures, with the
  auto-prepared ids fed in. `send_invoice` runs to the safe mailbox when
  `SMOKE_QUICKBOOKS_SEND_TO` is set, otherwise SKIPs.
- **Phase 5 security:** GET service-info 200; bad `intuit-signature` → 401;
  validly-signed UNKNOWN-realm delivery → 200 quiet ack, `droppedNoIntegration≥1`,
  `dispatched=0` (proves realm-scoped credential resolution / no cross-company
  fan-out). Missing-verifier → 503 is unit-covered only (can't unset prod env).
- **Phase 4 triggers:** each of the 4 through the REAL portal webhook —
  exactly-one run, realm-matched (`providerAccountId`), realm-scoped +
  timestamp-free dedup eventId, terminal `succeeded`; `invoice_paid` fires
  once only after the FULL payment and never on the partial (Payment
  Create+Update collapse via invoice-identity dedup).

### Manual QuickBooks UI steps, if any
Only the payment steps (QuickBooks ships no API payment-create wrapper in
QUICKBOOKS-1): in the sandbox company, **Receive payment** against the driven
invoice — a PARTIAL amount first (assert `invoice_paid` does NOT fire via
`triggers:await-invoice-paid` timing out or `triggers:status`), then pay the
REMAINING balance in full (assert exactly one `invoice_paid`). Everything else
(customer + invoice creation) the runner does over the API.

### Expected PASS criteria
Every phase prints `PASS`; the action harness table shows no FAIL (an env
SKIP — e.g. `send_invoice` without `SMOKE_QUICKBOOKS_SEND_TO` — is not a
fail); all 4 triggers show exactly one realm-matched terminal-`succeeded`
run; `invoice_paid` count is exactly 1 and only after the full payment.

### Read-only self-verification — 2026-07-13
The runner's non-destructive phases were executed against the live connected
sandbox to prove the harness functions (NOT a certification — no artifacts
created, no writes, no engine runs):
- **Phase 1 realm PASS** — active integration row resolved; `realmId`
  9341457412489636 persisted as providerAccountId; company "Sandbox Company US
  bc85" (country US) in `accountMetadata`; one harmless `customerList` read
  succeeded via `refreshAndRetry` (refresh path wired).
- **Phase 2 options PASS** — all 5 resolvers returned live, bounded,
  names-only data: customers 29, items 18, terms 5, tax codes 2, invoices 31.
  (18 items → `prepare` will auto-select one; the "create a sandbox item"
  blocker does not apply to this company.)

The write phases (`prepare` → `actions` → `security` → `triggers:*`) were left
for Marcus to run deliberately — they create marked sandbox artifacts, run the
engine (task-budget spend), and the trigger phases need real sandbox payment
actions. Everything up to that point is proven live.

### Troubleshooting
- "Blocked because this environment cannot access the connected QuickBooks
  integration/realm" → run it where the connected realm's dev DB is reachable
  (not a bare coding shell); the runner then auto-discovers/creates its data.
- "No usable sandbox item found" → create one Product/Service item in the
  sandbox company, then re-run `prepare`.
- `QUICKBOOKS_API_BASE` not the sandbox base → calls hit production; set it to
  `https://sandbox-quickbooks.api.intuit.com` for sandbox cert.
- Trigger `await-*` times out → confirm the Intuit portal Development webhook
  points at `${NEXT_PUBLIC_APP_URL}/api/webhooks/quickbooks` with
  Customer/Invoice/Payment entities and the verifier token matches.
