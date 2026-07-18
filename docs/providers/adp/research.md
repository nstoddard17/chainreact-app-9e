# ADP (Automatic Data Processing) — Provider Research

**Provider ID (proposed):** `adp`
**Display name:** ADP
**Product scope researched:** ADP Workforce Now · RUN Powered by ADP · ADP TotalSource, all reached through **ADP Marketplace / ADP API Central**.
**Status:** **BLOCKED** — see [`owner-report.md`](./owner-report.md) and [`infrastructure-plan.md`](./infrastructure-plan.md).
**Researched:** 2026-07-17
**Author:** ChainReact (Claude), provider-integration skill, research-only pass.

> **Honesty markers used throughout this doc**
> - **[CONFIRMED]** — stated in ADP official/developer sources reviewed on the date above.
> - **[ASSUMPTION]** — reasonable inference from ADP's model or general REST/mTLS practice; must be verified against the ADP partner portal + sandbox once access exists.
> - **[BLOCKED]** — cannot be determined without ADP partner approval, API Central purchase, sandbox/IAT credentials, or a WS certificate.
>
> No ADP endpoint shape in this doc has been exercised against a live or sandbox ADP tenant. Nothing here has been implemented in code. There are **no** ADP handlers, manifest entries, or nodes in the repo.

---

## 0. Why this is a research-only doc (not an implementation)

ChainReact's provider-addition skill mandates a "stop and report before coding" outcome when a provider requires paid/approval-gated API access **or** a new cross-cutting auth/transport pattern. ADP triggers **both**:

1. **Access is gated and paid.** There is no open/self-serve developer tier. A third-party SaaS must be an approved **ADP Marketplace partner** *and/or* the customer must license **ADP API Central**. Credentials are issued per subscribing organization after Sales/Security/Legal review. **[CONFIRMED]**
2. **Auth + transport are unlike anything in V2.** Every ADP API call needs **OAuth 2.0 `client_credentials`** (server-to-server, no user redirect) **and mutual TLS with an X.509 client certificate on every request**. V2 today supports neither (see [`infrastructure-plan.md`](./infrastructure-plan.md) §1 for the codebase audit). **[CONFIRMED]**

Because of (2), even the auth layer cannot be implemented against the current V2 `ProviderOAuth` contract, and because of (1) there is no sandbox in which to verify endpoint shapes. Building typed handlers now would be guessing at wire formats we cannot test — which the skill and the owner explicitly prohibit. Hence: research + plan only.

---

## 1. ADP developer program & products

### 1.1 Access model **[CONFIRMED]**

| Path | What it is | Who it's for |
|---|---|---|
| **ADP Marketplace partner** | Full ISV partnership; you publish an app (a "listing") on ADP Marketplace that ADP's shared clients can subscribe to. Requires Sales/Security/Legal approval. | SaaS vendors integrating with many ADP clients (ChainReact's situation). |
| **ADP API Central** | A product an ADP customer **purchases** to get API credentials for their own tenant, without a full Marketplace listing. | Direct/single-tenant API access. |

- ADP evaluates partner applications for "strategic fit," favoring applicants with "a substantial number of shared clients," a differentiated HCM solution, a SaaS platform integrable via APIs, and digital purchasing. **[CONFIRMED]**
- After applying, ADP reviews the app/org through **Sales, Security, and Legal** before it can go on the Marketplace. **[CONFIRMED]**
- **Fees / revenue share:** ADP Marketplace operates a pricing/rev-share model for listed apps. Exact current figures were **not** confirmed in this pass. **[BLOCKED]** (confirm in the partner pricing guide once you have portal access).

### 1.2 Product editions differ in API surface **[CONFIRMED direction, exact matrix BLOCKED]**

ADP is **not** one API surface. The prompt's caution is correct.

| Edition | Market | API exposure (high level) |
|---|---|---|
| **ADP Workforce Now (WFN)** | Mid-market / enterprise | Richest surface: HR v2, payroll, time, benefits, etc. **[CONFIRMED as the primary target]** |
| **RUN Powered by ADP** | Small business | Materially **narrower** third-party API exposure; much RUN data is not third-party accessible. **[CONFIRMED narrower; exact endpoint list BLOCKED]** |
| **ADP TotalSource** | PEO / co-employment | Separate exposure again. **[ASSUMPTION — verify]** |

- API access is brokered through **API Central**, which "supports multiple ADP products, including Workforce Now and RUN," but **which endpoints/use cases resolve depends on the subscribing customer's product and which use cases are enabled in API Central**. **[CONFIRMED]**
- **Implication for ChainReact:** the same ADP integration cannot assume a WFN endpoint works for a RUN customer. The integration must degrade gracefully per tenant and surface honest "this data isn't available on your ADP product" errors. Certification is effectively per product family. **[CONFIRMED implication]**

**Recommended initial target:** **ADP Workforce Now via API Central / Marketplace Data Connector.** Treat RUN and TotalSource as follow-on, capability-gated at runtime. **[RECOMMENDATION]**

---

## 2. Authentication

### 2.1 OAuth 2.0 `client_credentials` **[CONFIRMED]**

- Token endpoint (production): `https://accounts.adp.com/auth/oauth/v2/token` **[CONFIRMED]**
- Grant: `grant_type=client_credentials`. **[CONFIRMED]**
- Client auth: HTTP Basic with `client_id` / `client_secret` (issued per subscribing org). **[CONFIRMED]**
- Result: a short-lived **Bearer access token**, sent as `Authorization: Bearer {token}` on API calls. **[CONFIRMED]**
- Token TTL: typically ~1 hour. **[ASSUMPTION — confirm in sandbox]**
- **No user authorization_code redirect, no refresh token.** You re-mint with `client_credentials` when the token expires. **[CONFIRMED — this is the core mismatch with V2's contract]**

### 2.2 Mutual TLS (mandatory) **[CONFIRMED]**

- **Every** API call (and the token call) must present an **X.509 "Web Services (WS)" client certificate + matching private key** at the TLS layer (mTLS). "All API interactions with ADP APIs leverage mTLS which requires a certificate to be provided with each request." **[CONFIRMED]**
- The WS certificate identifies the client to ADP; the private key proves authenticity. **[CONFIRMED]**
- Certificate provenance: **bring-your-own** (submit a CSR) **or** have **ADP generate** the cert for you. **[CONFIRMED]**
- Certificate lifecycle (validity period, renewal cadence, rotation procedure): **not confirmed** in this pass. Industry norm for such WS certs is a fixed multi-year validity with a managed renewal in the partner portal, but the exact policy is **[BLOCKED]** until portal access. Managed cert **rotation without downtime** must be designed for (see infra plan §3).

### 2.3 Combined auth flow per call **[CONFIRMED shape]**

```
1. (TLS) Open connection to accounts.adp.com presenting WS client cert + key  → mTLS handshake
2. POST /auth/oauth/v2/token  (Basic client_id:client_secret, grant_type=client_credentials)  → access_token
3. (TLS) Open connection to api.adp.com presenting the SAME WS client cert + key
4. GET/POST <resource>  with  Authorization: Bearer {access_token}
5. On 401 → re-mint token (step 2) and retry.  There is no refresh_token.
```

- Production API base host: `https://api.adp.com` **[ASSUMPTION — widely referenced; confirm in portal]**
- Sandbox / integration (IAT) API host: `https://iat-api.adp.com` (and `iat-accounts.adp.com` for tokens) **[ASSUMPTION — ADP uses an "IAT" integration env; confirm exact hosts in portal]**

---

## 3. Event notifications (triggers)

ADP supports **two** event-delivery models for "Data Connector" apps. A Data Connector app "connects to and consumes data without an end-user's involvement." **[CONFIRMED]**

### 3.1 Webhook / push (Event Notification) **[CONFIRMED]**
- You **subscribe** to specific change events (e.g. **Worker Hire**), and ADP **pushes** a signed message to your registered endpoint. **[CONFIRMED]**
- **Signature:** header `adpx-messageauthentication` = **HMAC-SHA256**, where the **secret key is your data-connector client secret** and the **message is your data-connector client ID**. Verify this to prove the message came from ADP. **[CONFIRMED]**
- ADP wraps the raw event with additional metadata (origin/context). **[CONFIRMED]**
- Registering the webhook endpoint + selecting subscribed events is done in the partner/portal configuration. **[ASSUMPTION on mechanics — confirm]**

### 3.2 Event Notification Messages v1 API — pull/polling **[CONFIRMED exists; mechanics ASSUMPTION]**
- ADP also exposes an **Event Notification Messages** API: your app **polls** an ADP-hosted queue for pending event messages, processes them, then **acknowledges/deletes** them. **[CONFIRMED it exists]**
- Exact endpoints (retrieve / confirm / delete), queue semantics, and at-least-once vs exactly-once delivery: **[BLOCKED — verify in sandbox]**.

### 3.3 Trigger implication for ChainReact
- Preferred: **webhook push** with `adpx-messageauthentication` signature verification (matches V2's webhook-trigger + signature-verify pattern). **[RECOMMENDATION]**
- Fallback / for tenants where push isn't provisioned: **polling** the Event Notification Messages API with DB-backed dedup (matches V2's baseline-first polling pattern). **[RECOMMENDATION]**
- Either way, **dedup must be DB-backed on a stable ADP event id**, fail-closed (V2 rule 13). ADP's exact event id field is **[BLOCKED — confirm from a real event payload]**.

---

## 4. API surface — candidate resources **[endpoint groups CONFIRMED at category level; exact paths/shapes BLOCKED]**

These are the resource groups documented for ADP's HR/Payroll REST APIs. **Exact request/response schemas have not been verified against a live tenant and must not be treated as final.**

| Resource group | Example path (indicative) | Use |
|---|---|---|
| **Workers** (read) | `GET /hr/v2/workers`, `GET /hr/v2/workers/{aoid}` | List/read employee records, demographics, employment status. **[CONFIRMED group; path indicative]** |
| **Worker demographics / compensation** | `GET /hr/v2/worker-demographics`, compensation sub-resources | Read profile & pay-rate data. **[CONFIRMED group]** |
| **Worker lifecycle events** | hire / onboard / rehire / promote / transfer / terminate (event-style POSTs) | Drive/observe lifecycle. **[CONFIRMED group; write availability per product BLOCKED]** |
| **Pay Data Input** (payroll) | `POST /payroll/v1/...` pay-data-input | Submit hours/earnings/deductions into a pay cycle. **[CONFIRMED group]** |
| **Pay statements** | `GET /payroll/v1/workers/{aoid}/pay-statements` | Read pay statements / stubs. **[CONFIRMED group; path indicative]** |
| **Time & attendance** | time-cards / schedules | Read/submit time. **[ASSUMPTION — product-dependent]** |
| **Worker photo** | `POST` worker photo | Upload employee photo. **[CONFIRMED group]** |
| **Organization / departments / job titles** | org units, business communication | Reference data for pickers/resolvers. **[ASSUMPTION — verify exact endpoints]** |

- **Pagination:** ADP REST APIs use `$top` / `$skip`-style paging on collection endpoints. **[ASSUMPTION — confirm]**
- **Rate limits:** documented per-endpoint/per-tenant throttles exist; exact numbers **[BLOCKED]**.
- **File/photo behavior:** photo upload is multipart; any file **output** must use V2 `FileRef` (rule 6). **[CONFIRMED V2 rule]**

---

## 5. Proposed action / trigger catalog (subject to sandbox verification)

> This catalog is a **plan**, not a shipped set. Every "ship" item is contingent on (a) V2 infra existing, (b) the endpoint being verified in sandbox, and (c) the endpoint being available for the target product (WFN first).

### 5.1 Actions

| Action | Decision | Business task | Depends on |
|---|---|---|---|
| `get_worker` | **Ship (WFN)** | Look up an employee by id to enrich a workflow. | infra + `GET /hr/v2/workers/{id}` verified |
| `list_workers` | **Ship (WFN)** | Find/select employees (also powers resolvers). | infra + list endpoint + paging/search |
| `submit_pay_data_input` | **Ship (WFN)** | Push hours/earnings/deductions into a pay cycle. | infra + Pay Data Input verified; **high-risk — Q11 required fields** |
| `get_pay_statement` | **Ship (WFN)** | Retrieve a pay statement (FileRef if PDF). | infra + endpoint verified + FileRef |
| `update_worker_business_comm` | **Ship (WFN, cautious)** | Update work email/phone. | infra + write endpoint + product allows write |
| `upload_worker_photo` | **Defer** | Set employee photo. | infra + verified; low automation value |
| Worker hire/terminate (write) | **Defer (named dependency)** | Onboard/offboard. | Requires product-write entitlement + strong Q11 guards + legal review; verify per product |
| Any generic "call ADP API" | **Skip permanently** | — | Violates V2 rule 2 (no `make_api_call`). |
| RUN-only equivalents | **Defer (named dependency)** | Same tasks for RUN tenants. | Requires RUN endpoint verification + separate certification |

### 5.2 Triggers

| Trigger | Decision | Fires when | Depends on |
|---|---|---|---|
| `worker_hired` | **Ship (WFN)** | ADP "Worker Hire" event. | infra + webhook signature verify + event payload verified |
| `worker_terminated` | **Ship (WFN)** | Worker termination event. | infra + event verified |
| `worker_updated` (demographics/comp) | **Ship (WFN)** | Worker change events. | infra + event catalog verified |
| `pay_statement_available` | **Defer (named dependency)** | New pay statement posted. | Confirm such an event exists in ADP's catalog |
| Polling variants of the above | **Ship as fallback** | For tenants without push provisioning. | Event Notification Messages API verified |

---

## 6. Security implications (summary; full treatment in infra plan §5)

- **Two long-lived secrets per tenant** (`client_id`, `client_secret`) **plus a private key + certificate** — a richer, higher-value secret set than any current V2 provider. Must be encrypted at rest; the private key must **never** be logged, returned to a client, exposed to a resolver response, or placed in `account_metadata` plaintext. **[V2 rule + new requirement]**
- **mTLS material handling:** private key lives only server-side, used only to construct the TLS agent; never crosses into workflow variables, AI-visible flags, or option-resolver payloads.
- **Webhook signature:** verify `adpx-messageauthentication` (HMAC-SHA256, key = client secret) before trusting any event — route secrecy is not sufficient (V2 rule).
- **PII gravity:** ADP payloads are highly sensitive (SSNs, pay, addresses). Outputs must be **bounded to a fixed key set** (V2 rule 5) and must not spread raw ADP responses; dedup keys must avoid raw PII (rule 13).
- **Per-tenant credential isolation:** ADP issues credentials per subscribing org — the credential model must bind a ChainReact integration row to exactly one ADP org, with no cross-tenant credential reuse.

---

## 7. Environment variables (anticipated — names only, no values)

| Env var | Purpose | Notes |
|---|---|---|
| `ADP_CLIENT_ID` | Data-connector / API Central client id | Per environment; may become per-tenant if multi-org. **[ASSUMPTION]** |
| `ADP_CLIENT_SECRET` | Client secret | Encrypted; also the HMAC key for webhook verification. |
| `ADP_WS_CERT_PEM` | WS client certificate (PEM) | Or stored encrypted in DB per tenant. |
| `ADP_WS_KEY_PEM` | WS private key (PEM) | **Never logged.** Encrypted at rest. |
| `ADP_API_BASE_URL` | `https://api.adp.com` (prod) / IAT host | Environment-scoped. **[ASSUMPTION]** |
| `ADP_TOKEN_URL` | `https://accounts.adp.com/auth/oauth/v2/token` | Environment-scoped. |
| `ADP_WEBHOOK_SIGNING_NOTE` | (No separate secret — signature key is the client secret.) | Documentation only. |

Final variable set depends on whether ADP creds are **global (one connector app)** or **per-tenant**, which is a design decision in the infra plan.

---

## 8. Confirmed vs assumption vs blocked — quick index

**[CONFIRMED]:** partner-approval gate; API Central is a purchased product; mTLS mandatory on every call; `client_credentials` grant; token endpoint URL; Bearer token usage; webhook events with `adpx-messageauthentication` HMAC-SHA256 signature (key=client secret, msg=client id); Event Notification Messages polling API exists; WFN is the richest surface and RUN is narrower; endpoint **groups** (workers, pay data input, pay statements, worker photo, lifecycle).

**[ASSUMPTION — verify in sandbox/portal]:** exact prod/IAT base hosts; token TTL; pagination params; exact endpoint paths & request/response schemas; TotalSource exposure; org/reference endpoints for resolvers.

**[BLOCKED — needs ADP access]:** partner fees/rev-share; certificate validity period + renewal procedure; exact RUN endpoint matrix; exact event ids/payload shapes; rate-limit numbers; polling-queue semantics; which write operations each product entitles.

---

## 9. Sources reviewed (2026-07-17)

- ADP Developer Resources — Marketplace integration guides: https://developers.adp.com/guides/adp-marketplace-integration-guides
- ADP Marketplace Partner Development Learning Guide: https://developers.adp.com/guides/adp-marketplace-integration-guides/partner-development-learning-guide
- ADP Marketplace ESI — Getting started (Access Token, ch.3): https://marketplace-cdn.adp.com/dev-portal/pdf/ADP_Marketplace_ESI_-_Getting_started_chapter_3
- ADP Marketplace — Manage API Certificate & Partner Credentials (ch.5): https://marketplace-cdn.adp.com/dev-portal/pdf/protected/Marketplace_Integrations_for_Benefit_Carriers_chapter_5
- ADP Event APIs and Event Notification Guide: https://developers.adp.com/articles/general/adp-event-apis-and-event-notification-guide
- ADP Marketplace ESI — Event notifications: https://developers.adp.com/guides/adp-marketplace-integration-guides/event-notifications
- Event Notification Messages v1 API: https://developers.adp.com/articles/api/event-notification-messages-v1-api
- Become a Partner (overview PDF): https://marketplace.adp.com/downloads/becoming-a-partner.pdf
- Introduction to ADP RESTful APIs: https://developers.adp.com/articles/general/introduction-to-adp-restful-apis
- ADP API integration overview (third-party summary): https://www.getknit.dev/blog/adp-api-integration-in-depth
- RUN vs Workforce Now (edition differences): https://www.adp.com/resources/articles-and-insights/articles/c/compare-run-powered-by-adp-vs-adp-workforce-now.aspx
