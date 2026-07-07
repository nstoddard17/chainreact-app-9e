# QuickBooks Online Owner Setup Report

## Status
- Code status: **code-complete owner setup required** (QUICKBOOKS-1)
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
`SMOKE_QUICKBOOKS_CONNECTED=1` · `SMOKE_QUICKBOOKS_CUSTOMER_ID` ·
`SMOKE_QUICKBOOKS_CUSTOMER_NAME` · `SMOKE_QUICKBOOKS_ITEM_ID` ·
`SMOKE_QUICKBOOKS_INVOICE_ID` · `SMOKE_QUICKBOOKS_SEND_TO` (an
owner-controlled mailbox — the ONLY address send_invoice smoke ever emails).
Pin ids from the sandbox company (Sales → Customers / Products & services).

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
| customer_created | app-level webhook | interest-row activate / no-op deactivate | realmId (stamped at activation) | ✅ | Phase-13 live only (see seed note) |
| invoice_created | app-level webhook | same | same | ✅ | Phase-13 live only |
| payment_received | app-level webhook | same | same | ✅ | Phase-13 live only |
| invoice_paid | app-level webhook (DERIVED from Payment Create/Update + verified zero balance) | same | same | ✅ incl. partial-payment no-fire + Create/Update dedup | Phase-13 live only |

## Manual verification checklist for Marcus
- [ ] Create the Intuit developer app (Accounting scope only); grab Development keys.
- [ ] Create a sandbox company (portal → Sandbox → Add).
- [ ] Add redirect URIs (Development: localhost + preview; Production later).
- [ ] Configure the Development webhook endpoint + Customer/Invoice/Payment entities; copy the verifier token.
- [ ] Add env vars (Dev keys + sandbox `QUICKBOOKS_API_BASE` + verifier token) to the environment under test; redeploy/restart.
- [ ] Connect QuickBooks from the Apps page (owner/admin — account-class provider); confirm the integration row shows the company name and the realmId persisted.
- [ ] Pin SMOKE_QUICKBOOKS_* env values from the sandbox company.
- [ ] Run `npm run chainreact -- smoke actions` live for quickbooks (reads first, then the gated write batch).
- [ ] Live-certify triggers: create a customer / invoice / payment in the sandbox UI; confirm exactly-one runs, partial-payment no-fire, Create+Update single invoice_paid fire.
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
