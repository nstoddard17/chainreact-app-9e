# V2-READY-47E — Integrations Access Closeout + Regression Guard

**Type:** Closeout + regression guard. **No migration, no runtime change.**
**Date:** 2026-06-16
**Branch:** `v2-main` (local/unpushed)
**Governing skill:** `chainreactv2-security-review`
**Arc (all local/unpushed):**
[`v2-ready-47-apps-permission-model-audit.md`](./v2-ready-47-apps-permission-model-audit.md) (audit) →
**47B** `dd2fac832` (revoke authenticated WRITES) →
[`v2-ready-47c-integration-select-privacy-audit.md`](./v2-ready-47c-integration-select-privacy-audit.md) (read audit) →
**47D** `2fce6dae2` (revoke authenticated SELECT + gated service-role read) →
**47E** (this — guard + closeout).

---

## 1. Final integrations access model (the invariant)

> **`public.integrations` is SERVICE-ROLE-ONLY at the Data API.** The `authenticated`
> role has **zero** direct table privileges; `service_role` is the only reader/writer;
> every client-visible byte goes through an explicit server-side membership gate + an
> allow-listed DTO. There is **no** direct PostgREST/supabase-js access to credential rows.

**Exact grants (net across the migration corpus):**

| Role | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `authenticated` | ✗ | ✗ | ✗ | ✗ |
| `service_role` | ✓ | ✓ | ✓ | ✓ |
| `anon` | ✗ | ✗ | ✗ | ✗ |

Net history: `20260619000000` GRANT all-4 → `20260627000000` (47B) REVOKE INSERT/UPDATE/DELETE
→ `20260628000000` (47D) REVOKE SELECT ⇒ **authenticated holds nothing.**

> **Deploy note (honesty):** the 47B + 47D migrations are applied to the **V2 dev DB only**
> (`qcepijemjlkssfkvzlio`) — **not pushed, not in prod**. A production deploy must apply
> `20260627000000` + `20260628000000`.

---

## 2. How access is enforced (defense-in-depth layers)

1. **GRANT (table privilege):** `authenticated` cannot touch the table at all — a direct
   `select('*')` / write is denied with SQLSTATE `42501` **before** RLS is even evaluated.
2. **RLS (unchanged):** account-membership policies remain (belt for `service_role`-bypass
   reasoning + future roles), but are now unreachable for `authenticated` (no privilege). The
   personal/account credential model is **NOT** re-encoded in SQL — it stays in
   [`core/integrations/credentialSharing.ts`](../../../core/integrations/credentialSharing.ts).
3. **Server repositories (the only DB path):** all reads/writes go through
   [`repositories/integrations.ts`](../../../repositories/integrations.ts) via
   `getServiceRoleClient(...)` — the lone authenticated read (`listActiveByAccount`) moved to
   service-role in 47D.
4. **Membership gate (caller side):** the Apps page
   ([`app/apps/page.tsx`](../../../app/apps/page.tsx)) reads integrations only when
   `getRole(ownerAccount, user) !== null`. Other `listActiveByAccount` callers pass an account
   already membership-verified upstream (activate route / RLS-readable workflow / the caller's
   own personal account).
5. **Allow-listed DTOs:** every client-facing surface projects to a narrow shape — Apps
   ([`app/apps/_shared.ts`](../../../app/apps/_shared.ts)), AI
   ([`services/ai/tools/integrations.ts`](../../../services/ai/tools/integrations.ts)
   `toOwnerControlledView`, `workflowContext.ts`), options
   ([`services/options/credentialPolicy.ts`](../../../services/options/credentialPolicy.ts)).
   Tokens, refresh data, `access_token_expires_at`, `scopes`, `provider_account_id`,
   `account_metadata`, and `connected_by_user_id` **never** cross the wire.

---

## 3. Runtime proof (existing gated DB tests — sufficient, nothing added in 47E)

[`tests/integration/security/integrations-rls.test.ts`](../../../tests/integration/security/integrations-rls.test.ts)
(opt-in `ALLOW_DB_INTEGRATION_TESTS`, run against the dev DB in 47B/47D — **14/14 green**) proves:
- a member's **and** a non-member's direct authenticated `SELECT` → `42501`;
- joining the account does **not** grant a direct read;
- a member cannot read a **co-member's personal** sensitive columns directly → `42501`;
- direct authenticated `INSERT/UPDATE/DELETE` → `42501`;
- `service_role` read + full write cycle intact;
- `*_encrypted` columns are opaque at rest yet round-trip-decrypt.

47E re-ran the **unit/structure** suites (below); the gated DB suite is unchanged since 47D and
was not re-run in 47E (no DB-affecting change landed).

---

## 4. Regression guard (new in 47E)

[`tests/structure/no-authenticated-integration-grants.test.ts`](../../../tests/structure/no-authenticated-integration-grants.test.ts)
— a non-gated structure test that **replays every GRANT/REVOKE** on `public.integrations` for
`authenticated` across the whole migration corpus (chronological) and asserts the **net**
privilege set is empty. Net-replay (not per-statement flagging) lets the historical
`20260619000000` GRANT (later fully revoked) pass while a **future re-GRANT** unmatched by a
REVOKE fails loudly, naming the offending migration. Narrow by construction: only
`public.integrations` × `authenticated` (ignores other tables, `service_role`, RLS, comments;
expands `ALL`). Verified: the guard FAILS on a synthetic re-grant and PASSES once removed.

---

## 5. CONN-SHARE (deferred) — must NOT re-open broad grants

Connection sharing stays deferred (flag `ENABLE_CONNECTION_SHARING` default OFF;
`integration_sharing_scope` column is schema-only/inert). When it lands it must keep this
invariant: sharing decisions are computed **server-side** from the row + provider class + scope
and surfaced as DTO booleans — it must **not** widen `authenticated`'s table grants or expose raw
credential columns. The regression guard (§4) will fail any sharing migration that re-grants
direct authenticated access.

---

## 6. Verification baseline (what 47E actually ran)

- `npm run typecheck` — clean (newly run).
- `npm run lint` — 0 errors (newly run; pre-existing warnings only).
- `npm run lint:migrations` — OK (newly run).
- New guard `tests/structure/no-authenticated-integration-grants.test.ts` — **5/5 pass** (newly run),
  + teeth check (fails on synthetic re-grant, passes after removal).
- Gated DB proof — **inherited from 47D** (14/14), not re-run here.

---

## 7. What did NOT change

No migration, no `db:push`, no RLS policy, no GRANT (47E is guard + docs only). No runtime
behavior change. No AI/MCP/billing behavior change. No new providers. CONN-SHARE untouched
(still deferred, flag OFF). `created_by_user_id`/`connected_by_user_id` semantics, the 22B
creator-pin, 22D-2 option redaction, and `toOwnerControlledView` untouched. Nothing pushed.

---

## 8. Arc status: CLOSED

Integrations Data-API access is locked to service-role-only, enforced at the GRANT layer,
fronted by membership-gated server repositories + allow-listed DTOs, proven by gated DB tests,
and protected against regression by a net-effective-grant structure guard. Remaining (separate)
follow-ups, unrelated to this invariant: ~~the ingest/callback defense-in-depth role re-check
(noted in the 47 audit)~~ **— DONE in V2-READY-48** (dispatcher re-checks owner/admin at OAuth
completion for account-shared providers in `handleCallback` + `handleTokenIngest`); and, if/when
built, CONN-SHARE under the constraints in §5.
