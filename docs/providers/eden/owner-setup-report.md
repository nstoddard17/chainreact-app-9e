# Eden Owner Setup Report

## Status
- **Code status:** code-complete for **auth + transport infrastructure only**; connect-only. NOT live-certified. No actions/triggers shipped (blocked on live MCP catalog capture).
- **Commits (local, not pushed):**
  - `c407bc1b7` — research + V2 pattern audit + implementation plan (docs)
  - `7b7e0d1a2` — shared MCP client transport (`integrations/_shared/mcp/`) + 23 tests
  - `64b94e597` — `token_paste` auth flow + Eden manifest/registry/Apps wiring + tests
- **Push status:** Nothing pushed. Nothing deployed. No DB migration (none needed).
- **Smoke status:** unit-tested with the Eden MCP boundary mocked. No live smoke (no credential).
- **Remaining owner action:** create an Eden PAT (below) so live catalog capture, action implementation, and certification can proceed. Optionally flip `isExperimental → false` after Phase 13.

## What Eden is
An AI content-research / boards / creator-analysis / social-scheduling platform (`eden.so`).
Its only sanctioned automation surface is a remote **MCP server** — there is no REST API and
no webhook/event API. See [`research.md`](./research.md).

## Authentication
- **Method:** Personal Access Token (`eden_pat_…`), Bearer, sent to the MCP endpoint.
- **Why PAT (not OAuth):** ChainReact runs workflows unattended; Eden documents PAT for exactly
  this. Eden's OAuth is an interactive MCP-client handshake with **no registerable OAuth app**
  (no client id/secret/redirect/scope catalog). See [`v2-pattern-audit.md`](./v2-pattern-audit.md).
- **New auth flow:** `token_paste` — the user pastes the token into a V2-hosted form
  (`/integrations/token-paste/eden`); the server reuses the token-ingest contract to verify +
  encrypt + persist. Verification opens the Eden MCP server and runs `initialize` + a read-only
  tool call to prove the token.
- **Credential class:** `personal` (acts as the connecting human; not team-shared).

## Provider developer portal setup
**None.** Eden has **no developer portal**, no OAuth app registration, no client id/secret,
**no redirect URIs**, and no webhook URLs. The only setup is creating a PAT in the Eden app.

### Eden account steps (the ONLY owner prerequisite to connect)
1. Sign into Eden (`https://eden.so`).
2. Open **Settings → Integrations → API access**.
3. Create a token with **Read & write** scope (needed for scheduling/board/note writes; a
   **Read only** token can only read). Optionally also create a Read-only token to certify
   scope-gating.
4. **Copy the `eden_pat_…` value immediately** — Eden shows it once and stores only a hash.
5. Provide it out-of-band for the capture/certification run (a disposable test-account token,
   revoked after). **Never** paste it into a doc, commit, or env file checked into git.
- **MCP endpoint:** `https://mcp.eden.so/mcp`.
- **Token permission required:** Read & write (for full certification).

## Vercel environment variables

| Env var | Required? | Local? | Preview? | Production? | Where used | Notes |
|---|---:|---:|---:|---:|---|---|
| `EDEN_MCP_URL` | Optional | opt | opt | opt | `integrations/eden/auth.ts` (+ future actions) | Non-secret; defaults to `https://mcp.eden.so/mcp`. Only set to override (e.g. a test endpoint). |
| `NEXT_PUBLIC_APP_URL` | Already required | ✓ | ✓ | ✓ | paste-page URL | Existing var; must point at the environment under test. |
| `TOKEN_ENCRYPTION_KEY` | Already required | ✓ | ✓ | ✓ | token encryption | Existing var. |

**No new secret env vars.** The `eden_pat_` is supplied per-user at connect time, encrypted at
rest — never an env var.

## Supabase / database setup
- **Migrations added:** none. `db:push`: not run (nothing to push).
- Tokens fit the existing `integrations.access_token_encrypted`; state fits `oauth_states`.
- RLS/GRANT: unchanged. This slice adds no tables/policies (RLS/GRANT review: **N/A** — no
  migration).

## Actions shipped
**None yet.** Every action's `.strict()` schema depends on the live MCP `tools/list` capture,
which is blocked until a PAT is supplied. The documented catalog + mapping is in
[`implementation-plan.md`](./implementation-plan.md).

## Triggers shipped
**None.** No Eden webhook/event API exists. Native (polling) triggers ship only if the live read
tools prove stable id + deterministic timestamp + pagination + durable dedup. Otherwise Eden ships
trigger-free (the complete, honest surface). See [`research.md`](./research.md) §6.

## What IS shipped now
- Shared typed **MCP client transport** (`integrations/_shared/mcp/`) — first external MCP client
  in V2; reusable by future MCP providers.
- **`token_paste` auth flow** + Eden manifest (connect-only, capabilities honest), credential
  class, Apps catalog metadata (Social), paste-form connect UI.
- Eden appears in the registry; it is **`isExperimental: true`** so it is hidden from the default
  Apps catalog until certified. To surface it for connect testing, either flip `isExperimental`
  or opt in via the experimental-provider gate.

## Manual verification checklist for Marcus
- [ ] Create an Eden PAT (Read & write) — steps above.
- [ ] Provide the PAT for the live catalog-capture + certification run.
- [ ] (To test connect UI now) temporarily set `edenManifest.isExperimental = false` locally, or
      use the experimental gate, then connect Eden from the Apps page and paste the token.
- [ ] After live capture: implement pinned actions, then run Phase 13 certification.
- [ ] After certification: flip `isExperimental → false` and (optionally) flip `capabilities.actions`.

## Known blockers / limitations
- **B3 — live credential missing:** blocks the mandatory live MCP catalog capture, all action
  `.strict()` schemas, `providerAccountId` source confirmation, and all certification.
- **Transport live details unverified:** exact SSE framing, session-id header, and Eden's
  structured error-contract fields are implemented to the MCP spec but marked LIVE-TODO in
  `integrations/_shared/mcp/client.ts` and `integrations/eden/auth.ts`; confirm during capture.
- **Substack** scheduling depends on a browser extension (limited unattended support) — will be
  surfaced honestly in the scheduling action when built.

## No secrets in this doc
This report contains env var **names** only. No token, key, or secret value appears here.
