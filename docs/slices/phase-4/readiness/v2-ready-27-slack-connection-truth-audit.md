# V2-READY-27 — Slack Connection Status Truth Audit

**Type:** Audit + smallest truthfulness fix (code) + deferred-design proposal (docs).
**Date:** 2026-06-14. Branch `v2-main`. Nothing pushed; no `db:push` / migration.
**Trigger:** After V2-READY-26, the builder Slack channel picker correctly shows
"Slack needs to be reconnected before its channels can load," but the Apps page still
shows Slack as green **Connected**, 1 account, normal row, Reconnect available. Which is true?

---

## 1. Root truth

**Most likely: Slack genuinely needs reconnecting, and the Apps page implies a health it
never verified.** The Apps "Connected" badge is a **row-exists** signal, not a health
signal; the builder's reconnect-needed comes from a **live Slack API call failing auth**,
which is strictly stronger evidence. They are not in conflict — the Apps page simply isn't
checking what the builder discovered.

**Honesty caveat:** I could not capture the exact production Slack error code (no production
logs/artifacts for the authenticated manual run, and no creds to reproduce a live call in
this slice). So I cannot 100% exclude a transient/scope cause. The fix below is correct
**regardless of which code Slack returned**, because it makes the classification truthful
from the actual Slack payload rather than guessing from the bare HTTP status.

---

## 2. What "Connected" means today (proven from code)

[`app/apps/page.tsx`](../../../../app/apps/page.tsx) → `integrationsRepo.listActiveByAccount(accountId)`
→ [`repositories/integrations.ts`](../../../../repositories/integrations.ts) `listActiveByAccount`:

```sql
select * from integrations where account_id = $1 and disconnected_at is null
```

So **Connected = "a credential row exists for this account and has not been explicitly
disconnected."** It does **NOT**:
- verify token health,
- call a Slack identity endpoint (`auth.test`) — **no `auth.test` helper exists** in
  `integrations/slack/api/`,
- store a refresh/expiry/health state (Slack issues long-lived bot tokens with no refresh
  token; revocation is only discoverable by making a Slack API call).

**"Connected row exists" ≠ "connection is healthy."** The Apps page currently conflates them.

---

## 3. What the channel picker does (proven from code)

[`integrations/slack/options/channels.ts`](../../../../integrations/slack/options/channels.ts)
calls `conversations.list` (`public_channel,private_channel`, `excludeArchived`, `limit:200`)
and classifies a thrown `SlackApiError` via
[`isSlackAuthError`](../../../../integrations/slack/api/errors.ts):
auth-class → `PROVIDER_REAUTH_REQUIRED` (builder `needs-reconnect` state: reconnect copy +
`/apps` link), else `PROVIDER_ERROR` (generic retry). Note `conversations.list` is
workspace-/token-level — a 401/403 there is an auth/workspace rejection, **not** a
per-channel visibility issue (channel visibility just narrows the returned list, it doesn't
fail the call). So V2-READY-26's `http_401`/`http_403` → reconnect mapping is **appropriate
for this endpoint**, not over-broad.

### The truthfulness gap found (and fixed)
[`integrations/slack/api/_request.ts`](../../../../integrations/slack/api/_request.ts)
checked `!response.ok` **before** reading the body and threw `SlackApiError("http_<status>")`,
**discarding Slack's JSON error envelope on non-2xx.** Slack often returns
`{ ok:false, error:"<code>" }` *alongside* a 401/403/429. Discarding it means a revoked
token (`token_revoked`), a scope gap (`missing_scope`), and an opaque transport failure all
collapsed to the same `http_<status>` — the classifier then had to guess from the status.

---

## 4. Smallest fix implemented (code)

**`_request.ts` now preserves the logical Slack error code on non-2xx when present** (outcome
C). On `!response.ok` it best-effort-parses the body; if it carries a non-empty `error`
string it throws that **truthful logical code**, else it falls back to `http_<status>`
(bodyless / non-JSON, e.g. a 429 with a plain-text "rate limited" body). The helper never
throws and never surfaces the raw body (no team id / token / scope leak).

Effect on classification (via the unchanged V2-READY-26 `isSlackAuthError`):
- `invalid_auth` / `token_revoked` / `account_inactive` (logical, any transport) → **reconnect**.
- `missing_scope` → **reconnect** (in V2, re-running OAuth re-grants the manifest scope set,
  so reconnect IS the correct remediation; no separate scope-guidance state is added — that
  would need a new option-error code + combobox arm + UI, out of scope here).
- bodyless `http_401` / `http_403` → **reconnect** (conservative auth fallback, unchanged).
- `ratelimited` / `http_429` / `http_5xx` / `internal_error` → **generic retry** (unchanged).

**Backward-compatible:** every existing Slack wrapper non-2xx test mocks a *plain-text* body
(`"unauthorized"`, `"forbidden"`, `"server error"`, `"rate limited"`), which `JSON.parse`
rejects → falls back to `http_<status>` exactly as before. No regression to the
production-verified reconnect behavior in any sub-case (HTTP-200 logical, non-2xx logical,
non-2xx bodyless all still resolve to reconnect for a revoked token).

**Files:** `integrations/slack/api/_request.ts`, `tests/unit/integrations/slack/api/_request.test.ts` (new).

---

## 5. Apps-page truthfulness — DEFERRED (needs design + approval)

Making the Apps page itself say "Reconnect needed" (instead of an unqualified "Connected")
**cannot be done truthfully at render time without new infrastructure**, because health is
only knowable by either (a) a per-load live Slack `auth.test` call for every connection
(latency + rate-limit cost on every Apps load), or (b) a persisted health/needs-reconnect
signal written when a runtime/option-source call hits a provider auth failure. Both are the
"broad connection-health system" this slice is told not to build without approval.

### Proposed design (for Marcus to approve — NOT built here)
Smallest persistent option, mirroring the V1 health model at minimal scope:
1. **Migration:** add `integrations.needs_reconnect_at timestamptz null` (single nullable
   column; no state machine). Include explicit `GRANT`s per the post-Oct-2026 Data-API rule.
2. **Write path:** when an option-source (and later, runtime execution) classifies a provider
   **auth** failure (`isSlackAuthError` true / `PROVIDER_REAUTH_REQUIRED`), set
   `needs_reconnect_at = now()` for that integration row (service-role, idempotent). Clear it
   to `null` on successful reconnect (OAuth callback recovery) and on any successful
   authenticated provider call.
3. **Read path:** `listActiveByAccount` already returns the row; surface a derived
   `needsReconnect` boolean to `resolveAppCatalog` → Apps card shows a safe "Reconnect needed"
   chip next to "Connected" (copy only; the Reconnect button already exists). No identifiers
   exposed.
4. **No-leak:** the column stores only a timestamp; the UI shows only a boolean + safe copy.

This stays a single field + two write sites + one read projection — **not** a state machine,
cron, or notification system. Recommend as the next readiness slice **if approved**; it needs
a migration, so it is explicitly out of scope here.

Alternative (no migration): an in-session, client-only banner after a failed option-source
call — rejected, because it can't survive navigation to `/apps` (the exact cross-page gap
Marcus observed) and would be misleading by omission elsewhere.

---

## 6. No-leak confirmation
- `_request.ts` extracts only the logical `error` string; the raw body, team id, token, and
  scopes are never placed on the thrown error or logged.
- The resolver's user-facing messages are unchanged (sanitized; no raw Slack code/token).
- The proposed health column stores only a timestamp; UI surfaces only a boolean + safe copy.

---

## 7. Verification
- `tests/unit/integrations/slack/api/_request.test.ts` (new) — non-2xx logical-code
  preservation + fallback + no-leak; `errors.test.ts` + `channels.test.ts` (classifier +
  resolver) green; full Slack suite green; `useOptionsSource` + `ComboboxField`
  needs-reconnect rendering unchanged and green.
- typecheck / lint / lint:structure / build — green (recorded in the slice report).

## Cross-references
- V2-READY-26 (`363e38fbc`) — transport-auth classification (`http_401`/`http_403` → reconnect).
- V2-READY-7 connection-health/reconnect audit: [`v2-ready-7-connection-health-reconnect-audit.md`](./v2-ready-7-connection-health-reconnect-audit.md).
- Consolidated status: [`v2-readiness-consolidated-status.md`](./v2-readiness-consolidated-status.md).
