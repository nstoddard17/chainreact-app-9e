# Motive — V2 Existing-Pattern Audit

> Which current V2 providers Motive copies, and where it intentionally
> diverges. Registry presence — not file presence — defines what ships.

## Providers inspected as templates

| Concern | Template provider | Why |
|---|---|---|
| Manifest + account-class OAuth + rotating refresh | **quickbooks** | Most recent net-new account-class OAuth provider; `accountIdField` discriminator, rotating refresh-persist, honest capability flags. |
| Per-connection webhook subscription lifecycle (create-on-activate / delete-on-deactivate) + per-webhook secret + strict-direct `?workflowId=&nodeId=` routing + HMAC verify | **asana**, **calendly** | Motive `POST /v1/company_webhooks` is a per-company subscription with its own secret — exactly Asana/Calendly, NOT QuickBooks' app-level model. |
| Options `_shared.ts` guard + error mapping | **quickbooks / stripe** | Integration guard + provider→`OptionsSourceErrorCode` sanitizer. |
| Bounded projections (never `...raw`) | **quickbooks** `projections.ts` | One narrow projection per entity, shared by actions + trigger normalizers. |
| Typed API `_request` wrapper + error classes | **quickbooks** `_shared/quickbooks/api/_request.ts` + `errors.ts` | Bearer injection, status→typed-error mapping, sanitized correlation logging. |
| Polling baseline-first | **microsoft-onenote** `triggers/newNote` | `activate` seeds snapshot before first poll; throws on seed failure. |

## Auth pattern selected

OAuth 2.0 auth-code, **non-PKCE**, **body-auth** token exchange (QuickBooks is
Basic-auth; Motive docs show body params). **Rotating single-use refresh token
persisted on every refresh** (QuickBooks/Calendly precedent). Company id read
at connect from `GET /v1/users/me` → `providerAccountId` (QuickBooks reads
`realmId` from the callback param instead — Motive's divergence: it comes from
an API read, not the redirect).

## Webhook lifecycle pattern selected (diverges from QuickBooks)

- **Create-on-activate / delete-on-deactivate**, per (workflow, node) — Asana
  shape. Each trigger node owns one `company_webhook`.
- **We supply the 20-char secret at creation** (`crypto.randomBytes(10).hex`) →
  **no mid-creation handshake** (simpler than Asana's `X-Hook-Secret` echo).
  Secret stored `encryptToken`-encrypted in `trigger_resources.config`.
- **Strict-direct routing:** `url = …/api/webhooks/motive?workflowId=&nodeId=`.
  Receive resolves the row, decrypts the secret, verifies `X-KT-Webhook-Signature`
  (HMAC-**SHA1** hex) over the raw bytes, then normalizes.
- **Dispatch:** normalize sets `providerAccountId = companyId` (threaded from the
  row); a P-S2 company filter (`makeMotiveCompanyFilter`, QuickBooks realm-filter
  shape) provides cross-company isolation defense-in-depth.
- **No renewal** — Motive webhooks don't expire on a schedule; no
  `subscription-watch` marker, so the renewal cron skips these rows.

## Option-resolver + picker patterns reused

`quickbooks:customers` (bounded page + local `ctx.q` filter, id value / name
label). Motive resolvers: `motive:vehicles`, `motive:drivers`. Static option
sets (`fuel_type`, `fuel_unit`, `currency`, `odometer_unit`, `jurisdiction`) are
`options: [...]` on the field — a fixed enumerable set, NOT a resolver.

## Setup/Advanced + node-summary patterns reused

`advanced: true` for plumbing (pagination, manual-id overrides, tuning);
top-level `visibleWhen` for conditional fields; visible `defaultValue` for
sensible defaults (`fuel_unit=gal`, `currency=USD`). Summaries are DERIVED from
field metadata (`nodeConfigSummary.ts`) — resource fields carry `optionsSource`
so they render via `labelFor`, not raw ids. No `summary` field authored.

## Apps / Builder / AI visibility

New `AppsCategory` **"Fleet & Telematics"** in `lib/apps/providerCategories.ts`
+ description. Credential class **`account`** in `credentialSharing.ts` (a Motive
connection is the company's fleet — a shared business resource, Stripe/QuickBooks
posture). AI visibility uses the existing safe redacted capability flags only.

## Smoke / live-cert pattern reused

Action smoke fixtures under `tests/fixtures/action-smoke/motive/` registered in
`tests/smoke-actions/fixtures.ts` (QuickBooks block precedent). Live cert = the
Phase 13 pass once Marcus completes owner setup.

## Intentional divergences (recorded)

1. Company id from an API read (`/users/me`) rather than a callback param
   (QuickBooks `realmId`).
2. Self-generated webhook secret + no handshake (vs Asana's echo handshake).
3. HMAC-**SHA1** signature (provider-mandated; every other V2 webhook is SHA256).
4. `import_fuel_purchases_csv` ships against an UNVERIFIED wire contract, flagged
   live-cert-gated — a documented external-API limitation, not a usability
   deferral (the Setup UX is complete).

## New-provider file/registry checklist

Provider tree `integrations/motive/` (manifest, oauth, actions/*, options/*,
triggers/*, `_resolveCompany.ts`), shared `integrations/_shared/motive/`
(api/_request, api/{fuelPurchases,vehicles,drivers,messages,webhooks},
errors, projections, webhooks/signature). Central edits: `integrations/_registry.ts`,
`services/oauth/dispatcher.ts`, `core/integrations/credentialSharing.ts`,
`services/execution/handlers/_handlerInventory.ts`,
`services/discovery/_metaInventory.ts` (+ `providers/motive.ts` barrel),
`services/options/_registry.ts`, `lib/apps/providerCategories.ts`,
`app/api/webhooks/motive/route.ts`, `public/integrations/motive.svg`.
