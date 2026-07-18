# ADP Owner Setup Report & Decision Gate

**Provider:** ADP (Automatic Data Processing) — payroll / HR / workforce platform
**Provider ID (proposed):** `adp`
**Status:** **BLOCKED — research complete, nothing implemented.**
**Date:** 2026-07-17
**Companion docs:** [`research.md`](./research.md) · [`infrastructure-plan.md`](./infrastructure-plan.md)

---

## Status summary

| Field | Value |
|---|---|
| Code status | **None shipped.** No manifest, no handlers, no nodes, no auth wiring, no tests. Deliberately **not** stubbed. |
| Why blocked | (1) ADP API access requires paid/approved partnership; (2) ADP needs `client_credentials` + mandatory mTLS client certs — neither exists in V2 and both are cross-cutting infra. |
| Smoke status | Not applicable — no code and no credentials. **No live testing was performed or claimed.** |
| Docs | `research.md`, `infrastructure-plan.md`, this report — committed locally. |
| Push status | **Not pushed.** Docs-only local commit. |
| Remaining before build | ADP partnership/API Central access **and** approval to build shared infra (see decision gate). |

**ADP is NOT marked supported anywhere in the app.** The Apps catalog, manifests, and registries are unchanged.

---

## 1. What was fully implemented and tested

**Nothing was implemented.** This was a research-and-plan pass only, by the owner's instruction, because the provider is blocked. Delivered:

- A grounded research doc separating confirmed facts, assumptions, and access-blocked items.
- A codebase audit (file:line) proving the V2 infrastructure gaps.
- A shared-infrastructure design + sliced estimate.
- This owner action list + decision gate.

No handlers, no placeholder nodes, no generic API-call action, no manifest changes, no claim of live validation.

## 2. Which ADP product editions the integration would support

- **Primary target: ADP Workforce Now** (mid-market/enterprise) — richest API surface.
- **RUN Powered by ADP** (small business) — narrower API exposure; supported later as a runtime-capability-gated follow-on, verified separately.
- **ADP TotalSource** (PEO) — separate exposure; treat as later/optional.
- Access for all is brokered through **ADP API Central / ADP Marketplace**, and available endpoints depend on the **customer's product** and the **use cases enabled in API Central**. The integration cannot assume one surface fits all editions.

## 3. Every ADP-side action YOU must complete (portal / marketplace / certificate / contract)

None of these can be done by ChainReact code — they are ADP-controlled, and most gate everything downstream.

| # | Action | Where | Blocks |
|---|---|---|---|
| 1 | **Apply to the ADP Marketplace partner program** (or purchase **ADP API Central**). Expect Sales/Security/Legal review and a "shared clients" fit assessment. | https://partners.adp.com/ · https://developers.adp.com | Everything |
| 2 | **Sign partner/API agreement(s)** and confirm **fees / revenue share** in the partner pricing guide. | ADP partner portal | Production listing |
| 3 | **Get IAT/sandbox credentials** (`client_id` + `client_secret`) for a test tenant. | ADP dev portal | Any code verification |
| 4 | **Obtain the WS client certificate + private key** — either submit a CSR (bring-your-own) or have ADP generate it. Record its **validity period + renewal procedure**. | ADP cert management (getting-started ch.5) | All API/token calls |
| 5 | **Decide the target product edition** for v1 (recommend Workforce Now) and confirm which **use cases** are enabled in API Central. | ADP API Central config | Which endpoints work |
| 6 | **Register the webhook endpoint** (ChainReact's ADP receive URL) and **subscribe to events** (e.g. Worker Hire/Terminate). Confirm the `adpx-messageauthentication` HMAC scheme in the sandbox. | ADP event-notification config | Triggers |
| 7 | **Confirm production API + token hosts** and the IAT hosts (`api.adp.com` / `accounts.adp.com` / IAT equivalents). | ADP portal | Env config |
| 8 | **Complete ADP's security certification / app review** before production. | ADP Security review | Production |
| 9 | Provide the above **cert/key/secrets** to be stored (encrypted) once the infra exists. **Never** send them in plaintext channels; provide only into the secure store. | — | Live connect |

### Redirect / webhook / scope quick reference (to be finalized once endpoints exist)
- **Redirect URIs:** **N/A** — `client_credentials` has no browser redirect. Connect is a secure credential-entry form, not an OAuth pop-up.
- **Webhook URL (to register at ADP):** ChainReact ADP receive route — path TBD when the trigger slice is built (pattern: `/api/webhooks/adp`). Local testing needs an HTTPS tunnel.
- **Scopes:** ADP does not use OAuth user-consent scopes the way Google/Microsoft do; access is governed by the **product + enabled use cases + certificate/credentials**. There is no scope list to paste.

## 4. Environment variables you'll eventually set (names only — no values here)

| Env var | Required | Notes |
|---|---|---|
| `ADP_CLIENT_ID` | Yes | Per environment (possibly per tenant). |
| `ADP_CLIENT_SECRET` | Yes | Also the HMAC key for webhook signature verification. Encrypted. |
| `ADP_WS_CERT_PEM` | Yes | WS client certificate. |
| `ADP_WS_KEY_PEM` | Yes | WS private key — **never logged**, encrypted at rest. |
| `ADP_API_BASE_URL` | Yes | `https://api.adp.com` (prod) / IAT host (sandbox). |
| `ADP_TOKEN_URL` | Yes | `https://accounts.adp.com/auth/oauth/v2/token`. |

(Final set depends on the global-vs-per-tenant credential decision in the infra plan.)

## 5. Anything blocked by ADP access, certification, or partnership approval

**Effectively everything is blocked** until items §3.1–§3.4 exist:
- No sandbox ⇒ endpoint request/response shapes are **unverified** (documented as assumptions in `research.md`).
- No cert/credentials ⇒ auth cannot be exercised even if the code existed.
- No partner approval ⇒ no production, no Marketplace listing.
- Certificate validity/renewal policy, exact event payloads, RUN endpoint matrix, rate limits, and fees are all **access-gated unknowns**.

## 6. Actions/triggers intentionally excluded (and why)

| Excluded | Why |
|---|---|
| Generic "call any ADP API" action | Violates V2 rule 2 (no `make_api_call` / method+path+body escape hatch). |
| Placeholder/"coming soon" ADP nodes or manifest entry | Violates manifest-honesty and the owner's explicit instruction; would fake completion. |
| Worker **hire/terminate write** actions (v1) | Deferred: needs product write-entitlement, strong Q11 guards, and legal review; verify per product first. |
| RUN / TotalSource-specific actions (v1) | Deferred: narrower/separate API surfaces requiring their own verification + certification. |
| Any action/trigger with an unverified endpoint shape | Cannot ship guesses; V2 forbids claiming untested behavior. |

---

## 7. OWNER DECISION GATE

ADP is a **high-effort, high-value, access-gated** integration. Building it requires two independent commitments. Please decide:

### Decision A — Pursue ADP access?
- [ ] **Yes** — begin the ADP Marketplace partner application / API Central purchase (owner actions §3.1–§3.4). Until sandbox creds + a WS cert exist, no provider code can be verified.
- [ ] **No / not now** — park ADP. Keep these docs as the dossier for a future revisit. **(Recommended if there's no near-term ADP partnership path — the infra investment below only pays off once access is real.)**

### Decision B — Approve building the shared infra (client_credentials + mTLS + encrypted cert store)?
- [ ] **Yes, build infra now** — start slices S1–S3 (see infra plan §6). Large, cross-cutting, security-reviewed work; only worthwhile if Decision A is "Yes" or another mTLS/client_credentials provider is planned.
- [ ] **Yes, but only after ADP access is confirmed** — sequence infra behind partner approval so we don't build speculative plumbing. **(Recommended.)**
- [ ] **No** — do not build the infra; ADP stays blocked.

### Recommendation
**Do not build anything yet.** Pursue ADP partnership/API Central access first (Decision A). Only once **sandbox credentials + a WS certificate** are in hand should we green-light the shared infra (S1–S3) and then the provider (S4+). Building the mTLS/client_credentials infrastructure before ADP access is confirmed would be speculative work that benefits no shipped provider.

**Nothing here will be built, pushed, or marked supported without your explicit go-ahead on both decisions.**
