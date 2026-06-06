# Migration RLS + GRANT security checklist

For any new/changed `supabase/migrations/` file touching a sensitive table. Mirrors what
`npm run lint:migrations` (`scripts/check-migration-rls.mjs`) enforces — run it too.

## Every new `public.<table>`
- [ ] `ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;`
- [ ] Explicit Data API GRANTs (required: new projects May 30 2026, existing Oct 30 2026):
  ```sql
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO service_role;
  -- public-read ONLY if truly public: GRANT SELECT ON public.<table> TO anon;
  ```
- [ ] RLS gates rows; GRANT only lets the role touch the table. Both present.

## Policy design
- [ ] SELECT policy is **membership-gated** (`EXISTS (SELECT 1 FROM account_memberships
      … WHERE user_id = auth.uid())`), and freeze-aware where applicable
      (`accounts.deletion_status = 'active'`).
- [ ] INSERT/UPDATE/DELETE policies are **omitted (deny-by-default)** for sensitive tables
      so writes only happen via **service-role / RPC**. If a direct authenticated write is
      truly needed, the policy must re-check ownership, not just authentication.
- [ ] Non-members cannot SELECT rows that would reveal a resource exists.
- [ ] No provider personal-vs-account classification re-encoded in SQL (use the central
      classifier in code).

## Secrets columns
- [ ] No raw token/secret column. Store hash (`hashInviteToken`-style) or encrypted value.
- [ ] Any one-time-reveal value is generated server-side and never re-selectable in raw
      form.

## After writing
- [ ] `npm run lint:migrations` passes.
- [ ] Migration applied locally via `npm run db:push` only if Marcus wants it applied;
      otherwise note it as **unapplied** in the report.
- [ ] Existing migrations not modified after the fact — new migration for changes.
