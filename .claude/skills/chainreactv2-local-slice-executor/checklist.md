# Slice pre-commit checklist

Run through this before committing a ChainReactV2 implementation slice.

## Before coding
- [ ] Read the real current code in the call path — not assumed.
- [ ] Searched for an existing service/repo/contract/route/helper to extend instead of
      adding a new one.
- [ ] Scope is small/medium with a clear boundary; not a broad rewrite.
- [ ] If touching credentials / OAuth / membership / RLS / service-role / public routes
      → switched to **chainreactv2-security-review**.

## Account model
- [ ] Account-owned resources (workflows, integrations, runs, billing, folders, API keys)
      scoped by `account_id`, not user.
- [ ] User-facing labels use Team / Business (not "Organization").
- [ ] No per-seat billing logic added; no Pro-required-for-members logic added.
- [ ] Member-cap logic (if touched) routes through `services/accounts/memberLimits.ts`.

## Integrity
- [ ] No fake UI / no control the backend can't honor.
- [ ] No invented backend behavior, data shapes, or statuses.
- [ ] Personal-provider credentials never silently cross members.
- [ ] Risky/public behavior is behind an `ENABLE_*` flag defaulting OFF.

## Verification (record exactly what ran)
- [ ] `npm run typecheck`
- [ ] `npm run lint` (+ `lint:structure` if files added/moved)
- [ ] `npm run lint:migrations` if `supabase/migrations/` touched
- [ ] `npm test` focused suite; tests added/updated for new behavior
- [ ] Did NOT claim any command passed that wasn't actually run.

## Commit
- [ ] One local commit, clear `type(scope): summary (SLICE-MARKER)` message.
- [ ] Nothing pushed.
- [ ] Report includes commit hash, files, behavior, tests, unchanged boundaries,
      caveats, push status.
