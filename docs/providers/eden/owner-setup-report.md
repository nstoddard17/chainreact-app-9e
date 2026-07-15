# Eden Owner Setup Report

## Status
- **Code status:** auth + transport + **28 actions LIVE-CERTIFIED** against `mcp.eden.so`
  (Batch 1 = 7, Batch 2 = 21; 2026-07-14). Eden stays `isExperimental: true` (hidden from the default
  Apps catalog) until scheduling writes + polling-trigger design land. Remaining useful tools are
  pinned in [`catalog-audit.md`](./catalog-audit.md) as follow-up certified batches (NOT hidden).
- **Batch 2 (EDEN-5):** content / board / note / saved-content / creator-research / prompt-read
  areas. 21 actions + 2 option sources (`eden:notes`, `eden:prompts`), all live-certified. No
  scheduling writes, no triggers (deliberately deferred). Commits: `531ceb324` (notes),
  `83551b2eb` (boards), `46746f0dd` (content/creator/prompt reads + actions/ subfolder split).
- **Push status:** Nothing pushed. Nothing deployed. No DB migration (none needed).
- **Smoke status:** 53 unit tests (mocked boundary) + a gated live-cert suite
  (`tests/integration/eden/live-cert.test.ts`, `EDEN_LIVE_CERT=1`) that exercises the real wrappers
  end-to-end (create → read → note → list → trash cleanup).
- **Remaining owner action:** none required to use Batch 1. To surface Eden in the Apps catalog,
  flip `isExperimental → false` after enough of the catalog is certified. Future batches (see
  `catalog-audit.md`) need scheduling-write certification against a throwaway connected social account.

> Not "complete": only the 7 Batch-1 actions have passed live certification. The broader useful
> catalog (content reads, creator research, note/board writes, scheduling writes) is specified and
> pinned but not yet implemented/certified.

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

## Actions shipped (Batch 1) — live-certification matrix

All 7 verified against the real Eden MCP server on 2026-07-14 (create→read→note→list→trash cycle,
disposable board trashed as cleanup):

| Action | Tool | Read/Write | Live result | Cleanup |
|---|---|---|---|---|
| List Workspaces | `eden_list_workspaces` | read | ✅ bounded (no email) | n/a |
| List Schedules | `eden_list_schedules` | read | ✅ | n/a |
| List Scheduled Posts | `eden_list_scheduled_posts` | read | ✅ | n/a |
| Create Board | `eden_create_board` | write | ✅ board created | trashed |
| Read Board | `eden_read_board` | read | ✅ summary read back | n/a |
| Create Note | `eden_create_note` | write | ✅ note created on board | (board trashed) |
| Trash Board | `eden_trash_board` | write (reversible) | ✅ cleanup verified | — |

Option sources: `eden:workspaces`, `eden:boards` (boards = `canvas` items — live-cert finding).
The remaining useful catalog is pinned in [`catalog-audit.md`](./catalog-audit.md).
Live evidence: [`live-capture-evidence.md`](./live-capture-evidence.md).

## Actions shipped (Batch 2, EDEN-5) — 21 actions, all live-certified 2026-07-14

Full table (action → Eden tool → read/write) is in [`catalog-audit.md`](./catalog-audit.md) §"SHIPPED — Batch 2".
Certified live via `tests/integration/eden/live-cert.test.ts` (`EDEN_LIVE_CERT=1`, 11 checks) across:

| Area | Actions | Cert method | Cleanup |
|---|---|---|---|
| Notes | read/append/rewrite/rename/sticky/list/search (7) | create→read→append→rewrite→rename→sticky→list→search | board trashed |
| Boards | list/list-items/rename/save-links (4) | create→list→rename→save-links→list-items | board trashed |
| Content | read_content/list_captures/list_highlights (3) | read a public post (+captures/highlights) | none (reads) |
| Creators | list_creator_lists/resolve/research/following (4) | harmless public creator (mkbhd), read-only | none (reads) |
| Prompts | list/get/export (3) | read the account's saved prompt library | none (reads) |

- **Token permission:** Read & write (writes: notes/boards; reads work with read-only too).
- **Creator research** returns `indexingStatus` so a workflow branches instead of blocking; no
  `wait_for_creator_index`, no follow/unfollow, no list/identity mutation.
- **New option sources:** `eden:notes`, `eden:prompts`. Actions reorganized into
  `integrations/eden/actions/<area>/` subfolders (50-file cap).

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
