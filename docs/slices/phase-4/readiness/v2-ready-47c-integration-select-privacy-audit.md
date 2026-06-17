# V2-READY-47C — Integration SELECT-side Metadata Privacy Audit

**Type:** Security audit + app-layer no-leak test. **No migration written/applied.**
**Date:** 2026-06-16
**Branch:** `v2-main` (local/unpushed)
**Governing skill:** `chainreactv2-security-review`
**Arc:** [`v2-ready-47-apps-permission-model-audit.md`](./v2-ready-47-apps-permission-model-audit.md)
(audit) → V2-READY-47B (`dd2fac832`, revoked direct authenticated WRITES) → **47C (this — read side).**

> **STATUS UPDATE (2026-06-16):** the §3 Option A fix is **DONE** — V2-READY-47D
> shipped migration `20260628000000_revoke_authenticated_integration_select.sql`
> (`REVOKE SELECT ON public.integrations FROM authenticated`), moved the sole
> authenticated read (`listActiveByAccount`) to service-role, and added an explicit
> account-membership gate at the Apps page. Applied to the V2 dev DB; gated RLS proof
> shows a member's direct `select('*')` (incl. co-member personal token/scope/
> provider-account-id/metadata columns) now fails `42501`, while the Apps DTO +
> service-role paths are intact. After 47B+47D, `authenticated` has **zero** direct
> DML/SELECT on `integrations`. Local/unpushed.

---

## Executive summary (go / no-go)

Every CLIENT-FACING read of `integrations` already returns a **narrow, allow-listed DTO** —
encrypted tokens, refresh data, `access_token_expires_at`, `scopes`, `provider_account_id`,
`account_metadata`, and `connected_by_user_id` **never cross the wire** on any route, server
component, AI surface, or server action. The app/API layer has **no privacy gap**, and that
contract is pinned by unit tests (strengthened here with an explicit co-member case).

**One residual gap, DB layer only (same class as 47B's write gap):** `integrations` keeps
`authenticated` **SELECT** with account-member-only RLS, so a member can `supabase.from(
'integrations').select('*')` **directly via PostgREST/supabase-js** and read ALL columns —
incl. encrypted token blobs, `scopes`, `provider_account_id`, `account_metadata` — of a
**co-member's personal** rows, bypassing the DTO. The app never does this (its one authenticated
read projects to the safe DTO), but a member with their own JWT can.

**Fixing the direct-SELECT exposure requires a migration → STOP-AND-REPORT** per the slice's
own stop conditions. Recommendation below; awaiting Marcus's approval (would ship as 47D). The
app-layer no-leak tests requested by this slice were added (no migration needed).

---

## 1. Current SELECT behavior map (verified)

Read paths classified by **what crosses to the client × through what × via which client**.
(`repositories/integrations.ts` read fns audited individually.)

| Read path | Client mechanism | Fields that reach the client | Sensitive metadata exposed? |
|---|---|---|---|
| **Apps page** `app/apps/page.tsx` → `listActiveByAccount` → `resolveAppCatalog` ([`_shared.ts`](../../../app/apps/_shared.ts)) | authenticated SSR client + RLS, **then DTO** | per row: `id`, `displayName`, `connectedAt`, booleans (`canDisconnect`/`canReconnect`/`canShare`/`canUnshare`/`needsReconnect`/`sharingStatus`) | **No** — DTO omits tokens/scopes/`providerAccountId`/`accountMetadata`/`connectedByUserId`/raw timestamps |
| **Provider/account picker** | (no separate endpoint — the Apps catalog IS the picker; builder selection uses the options route) | n/a | n/a |
| **Workflow-builder options** `app/api/options/[source]` → `decideOptionsCredential` | service-role read INSIDE the service; row never serialized | option items only; non-creator personal ⇒ `NOT_WORKFLOW_OWNER` / `OWNER_MUST_CONNECT` with **no fetch** | **No** |
| **AI connected-integrations** [`services/ai/tools/integrations.ts`](../../../services/ai/tools/integrations.ts) `toOwnerControlledView` | service-role read; DTO | `provider`, `connected`, `accountLabel`, `accountScope`, `scopeCount`; **non-owner ⇒ `accountLabel:null`, `scopeCount:0`, `ownerControlled:true`** | **No** (co-member personal never enumerated) |
| **AI workflow availability** `services/ai/tools/workflowContext.ts` | service-role read; DTO | `provider`, `sharing`, `connected`, `ownerControlled`, `ownerMustConnect` (booleans/enums) | **No** |
| **Reconnect-needed** | part of Apps DTO | `needsReconnect` boolean only (raw `needs_reconnect_at` stripped) | **No** |
| **Disconnect + workflow-impact** routes | service-role read in service; row never returned | `{disconnected,…}` / `{affectedWorkflowCount, workflows:[{id,name}]}` | **No** |
| **Offboarding (member leave)** `softDisconnectPersonalForMember` | service-role; selects `id, provider`; never returns rows | `{disconnectedCount, disconnectedProviders}` | **No** |
| **Credential-requests inbox** | reads `workflow_node_credentials`, not `integrations` | provider type + labels | **No** |
| **Engine / OAuth / refresh / triggers / health-cron** (`getActiveForExecution`, `upsertActive`, `updateTokens`, `listActiveByProviderServiceRole`, `getByIdForAccountServiceRole`, …) | **service-role, server-internal only** — never returned to an HTTP client | n/a | **No** (never client-facing) |
| **Direct PostgREST** `supabase.from('integrations').select(...)` (member's own JWT) | authenticated client + RLS (account-member) | **ALL columns of every row in the account** — incl. `access_token_encrypted`, `refresh_token_encrypted`, `scopes`, `provider_account_id`, `account_metadata` | **YES — the gap** |

**Confirmations (audit):**
- Encrypted token columns are **never** in any DTO (unit-tested deeply, see §4).
- The only authenticated-client read is `listActiveByAccount` (`.select("*")` server-side, then projected). All other reads of token/scope/metadata columns are **service-role, server-internal**.
- Non-creator team members get **no** co-member personal credential detail through any app/API route (options ⇒ `NOT_WORKFLOW_OWNER` with no fetch; AI ⇒ redacted/not-enumerated; Apps ⇒ label + disabled controls only).

---

## 2. Is there an actual privacy gap?

- **App / API / AI / server-action layer:** **NO.** Allow-listed DTOs everywhere; co-member
  personal sensitive metadata never reaches a client. Pinned by tests.
- **DB layer (direct PostgREST SELECT):** **YES.** RLS gates the account boundary but not the
  personal/creator scope, and `authenticated` has table-wide column SELECT. A member can read a
  co-member's personal credential's encrypted token blobs + `scopes` + `provider_account_id` +
  `account_metadata` directly. Tokens are AES-256 at rest (not directly usable), but exposing the
  blob + scopes + provider account id + profile metadata of someone else's personal credential is
  more than the product needs and violates the 47C rule ("members should not see tokens, refresh
  data, encrypted blobs, provider account internals, or unnecessary identity/profile metadata").

---

## 3. Recommended fix (REQUIRES MIGRATION + sign-off — NOT done here)

**Option A — preferred (cleanest end-state; consistent with 47B; no column-grant footgun):**
```sql
-- 47D migration (NOT written/applied here):
REVOKE SELECT ON public.integrations FROM authenticated;
```
Then route the **single** authenticated integration read through service-role + the existing DTO,
with an explicit membership gate at the caller:
- `repositories/integrations.ts:listActiveByAccount` → `getServiceRoleClient(...)` instead of the
  SSR client (it already only feeds `resolveAppCatalog`'s safe DTO).
- The Apps page (`app/apps/page.tsx`) already resolves the caller's **active account by
  membership** before the read; assert that membership explicitly so the now-RLS-bypassing read
  cannot be pointed at a non-member account. After 47B + 47D, `authenticated` has **zero** direct
  DML/SELECT on `integrations` — every access goes through a server gate + DTO.

**Option B — alternative (less code, but a column footgun):**
```sql
REVOKE SELECT (access_token_encrypted, refresh_token_encrypted, access_token_expires_at,
               scopes, provider_account_id, account_metadata)
  ON public.integrations FROM authenticated;
```
Keeps RLS-gated authenticated SELECT for the safe columns; change `listActiveByAccount` from
`.select("*")` to the explicit safe column list. Downside: any future sensitive column is readable
by default until someone remembers to REVOKE it.

Both **preserve** the must-not-break behaviors: the Apps page still lists account-shared AND
co-member personal connections (service-role/safe-column read returns them; DTO logic unchanged);
the creator's reconnect/manage is unchanged (derived server-side); `NOT_WORKFLOW_OWNER` /
`OWNER_MUST_CONNECT` options UX is unchanged (options already uses service-role). Neither
re-encodes the personal/account model in SQL (the rule against that holds — the map stays in
[`core/integrations/credentialSharing.ts`](../../../core/integrations/credentialSharing.ts)).
Neither touches CONN-SHARE (deferred).

**Recommendation:** Option A. **Tests to land with 47D:** extend the gated
[`integrations-rls.test.ts`](../../../tests/integration/security/integrations-rls.test.ts) to assert
a member's direct `select('*')` is denied / returns no sensitive columns for a co-member personal
row, while the service-role read + Apps DTO still work.

---

## 4. Tests added in this slice (app layer — no migration)

- [`tests/unit/app/apps/_shared.test.ts`](../../../tests/unit/app/apps/_shared.test.ts): added an
  explicit **co-member personal credential** case — a non-creator member viewing a teammate's
  Gmail row gets the label + disabled controls (`canDisconnect`/`canReconnect`/`canShare`/
  `canUnshare` all `false`) and **no** `provider_account_id` / `scopes` / `account_metadata` /
  connector id. Complements the existing deep no-leak assertions (tokens/`providerAccountId`/
  `accountMetadata`/`scopes`/`connectedByUserId` never emitted). 33/33 pass.

**Existing coverage confirmed (no change needed):** AI `integrations.test.ts` ("NEVER leaks token
material or account metadata" + owner-redaction), `workflowContext*.test.ts`, and
`options-route.test.ts` (`NOT_WORKFLOW_OWNER` / no-fetch).

---

## 5. Threat note

- **Sensitive:** OAuth token blobs, `scopes`, `provider_account_id` (email/workspace/sub id),
  `account_metadata` (profile/avatar/PII), connector identity.
- **Closed (app layer):** every client-facing read is an allow-listed DTO; co-member personal
  detail is redacted/not-enumerated; encrypted columns never serialized.
- **OPEN (DB layer):** direct authenticated PostgREST SELECT exposes the above for co-member
  personal rows. Closing it needs the 47D migration (Option A/B).
- **Not exploitable for token theft today** (AES-256 at rest; key server-side only) — this is
  metadata-privacy + defense-in-depth, not an active token-exfil path.

---

## 6. Stop-and-report triggers hit

- **"Fixing SELECT exposure requires changing RLS/GRANTs."** ✅ (REVOKE SELECT or column-level REVOKE)
- **"A migration is needed."** ✅
- **"A route depends on broad direct `integrations` SELECT that cannot be safely DTO-redacted."**
  ✅-ish: the Apps read uses the authenticated client today; Option A moves it to service-role +
  membership gate (a code change shipped WITH the migration), so it must not land piecemeal.
- Not in conflict with deferred CONN-SHARE; does not require co-members to see personal metadata.

---

## 7. What did NOT change

App-layer behavior unchanged; one unit test added (safe behavior, passes today). No migration, no
RLS/GRANT change, no schema change, no service/route/DTO logic change, no AI/MCP/billing behavior
change. CONN-SHARE untouched. `created_by_user_id`/`connected_by_user_id` semantics, the 22B
creator-pin, 22D-2 option redaction, and `toOwnerControlledView` all untouched. Nothing pushed.

---

## 8. Recommended next step

Put the **Option A** change (migration `REVOKE SELECT ON public.integrations FROM authenticated`
+ `listActiveByAccount` → service-role with an Apps-page membership gate + the gated direct-SELECT
no-leak test) to Marcus as **47D**. On approval it lands as a one-migration + small-read-path slice
(`db:push` to dev after the RLS/GRANT review), completing the integrations defense-in-depth: after
47B (writes) + 47D (reads), `authenticated` has no direct DML/SELECT on `integrations` — all access
flows through server gates + safe DTOs.
