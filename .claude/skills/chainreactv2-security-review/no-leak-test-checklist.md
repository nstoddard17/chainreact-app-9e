# No-leak test checklist

A sensitive slice isn't done until tests prove the leaks are closed. Tests live under
`tests/unit` or `tests/integration` (Jest). Assert on the **absence** of sensitive values,
not just on happy-path success.

## Credential / identity non-leak
- [ ] Response/tool-result/log for a **co-member** viewing someone's personal provider
      contains NO: access/refresh token, account email, account label, scope strings,
      non-zero `scopeCount`, or owner user id. (`ownerControlled: true`, `accountLabel:
      null`, `scopeCount: 0`.)
- [ ] Co-member personal providers are **not enumerated** (absent, not redacted-present).
- [ ] AI surfaces (`services/ai/tools/...`) never include an owner id or raw credential
      detail; `credentialOwnerUserId`-style internal ids never reach a prompt or persisted
      message.

## Existence / authorization
- [ ] A **non-member** hitting the resource gets **404 / generic no-leak**, not a 403 that
      confirms existence.
- [ ] A forged client-supplied owner/account id does NOT grant access — server re-resolves
      ownership and rejects.
- [ ] Authenticated **direct** (supabase-js) read/write of a service-role-only table is
      blocked by RLS/GRANT (test hits the real policy, not a mocked client where possible).

## Secrets
- [ ] Raw secret returned only on the create call; subsequent reads return prefix/last-4
      only.
- [ ] Stored value is a hash/encrypted blob; a test confirms the raw secret is not
      persisted in plaintext.

## Error mapping
- [ ] Sensitive failures map to typed generic errors (e.g. `NOT_WORKFLOW_OWNER`,
      `OWNER_MUST_CONNECT`), not raw provider/DB messages.

## Public endpoints
- [ ] Endpoint rejects session/cookie auth and ignores active-account state.
- [ ] Signature verification + dedup covered.
- [ ] Note (or test) that durable rate limiting is required before the flag flips ON.
