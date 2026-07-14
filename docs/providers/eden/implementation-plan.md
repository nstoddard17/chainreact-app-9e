# Eden — Implementation Plan

**Date:** 2026-07-13
**Provider ID:** `eden`
**Display name:** Eden
**Credential class:** `personal`
**Auth flow:** Personal Access Token (`eden_pat_…`) paste → reuse token-ingest
**server** contract via a **new paste-UI variant**
**Transport:** new shared **MCP client** over Streamable HTTP to
`https://mcp.eden.so/mcp`
**Status:** **BLOCKED — pending (a) shared-infra sign-off and (b) a live
`eden_pat_` test credential.** Research + audit + plan complete. No source shipped.

> This plan deliberately stops before building code. Two pieces are net-new
> cross-cutting infrastructure that `CLAUDE.md` and the provider skill require to be
> planned + approved before coding, and the whole action catalog depends on a live
> MCP schema capture that requires a credential we don't have. See §Blockers.

---

## Blockers (must clear before implementation)

| # | Blocker | Why it blocks | Owner action |
|---|---|---|---|
| B1 | **New MCP client transport** (major shared infra) | No external MCP client exists in V2; every Eden call needs it | Approve the transport design (below) / green-light building it |
| B2 | **Paste-token auth UI variant** (contract extension) | Eden PAT is paste-only; V2 has only OAuth + fragment token-ingest | Approve adding the paste-UI + (maybe) an `AuthFlow` value |
| B3 | **No live `eden_pat_` credential** | Can't capture `tools/list`/schemas → can't author honest `.strict()` action schemas → can't certify | Create an Eden PAT (steps below) and provide it for the capture/cert environment |

**Why not just build it with guessed schemas?** The task mandates a live catalog
capture *before finalizing the catalog*, Eden says its catalog changes regularly,
and the rules forbid inventing unsupported API behavior / fake completion. Guessed
`.strict()` schemas for ~30 tools would be unverifiable and likely wrong.

## Owner action — create the Eden PAT (for capture + certification)

1. Sign into Eden (`https://eden.so`) on the test account.
2. Go to **Settings → Integrations → API access**.
3. Create a token with **Read & write** scope (so certification can exercise write
   tools). Optionally also create a **Read only** token to certify scope-gating.
4. **Copy the `eden_pat_…` value immediately** — Eden shows it once and stores only
   a hash.
5. Provide it out-of-band for the capture/cert run (a disposable test-account token;
   it will be revoked after certification). Do **not** paste it into any doc/commit.

> No developer portal, client id/secret, redirect URI, OAuth scope registration, or
> Vercel OAuth env var is required for the PAT path. (An MCP endpoint base URL may
> be a non-secret constant/env; no secret env vars needed for connect.)

## Proposed MCP client transport (design sketch — B1)

Location (proposed): `integrations/_shared/mcp/` (shared) + `services/mcp/client/`
if service orchestration is needed. Typed, not ad-hoc JSON-RPC in actions.

Responsibilities (from the task's transport requirements):
- Streamable HTTP + `Authorization: Bearer <decrypted eden_pat_>`.
- MCP `initialize` handshake; capability + serverInfo capture.
- `tools/list` discovery + cached, **pinned/certified** tool allow-list.
- Typed `tools/call` invocation; parse MCP **structured content / result**; bounded
  outputs (no raw spread; FileRef for any file-like output).
- Eden error contract `{ ok: false, status, message }` → typed errors the engine can
  classify (permission / auth-expired / not-found / rate-limit / transient).
- Timeouts; **retry only safe/idempotent** ops; **never** auto-retry non-idempotent
  writes unless the same **idempotency key** is preserved and behavior is certified.
- Auth-expiration → reconnect guidance (non-refreshable PAT).
- **Schema-drift detection** — compare live tool input schema vs the pinned/certified
  schema; refuse/flag on drift rather than silently passing new args.
- **Sanitized logging** — never log the token, args, or private content.

Reuses: `core/encryption/tokens.ts` (decrypt PAT at call time), the
`refreshAndRetry`-style seam for credential resolution (personal → creator).

## Auth plan (B2)

- **Connect UI:** a **paste form** ("Paste your Eden personal access token") instead
  of a redirect/fragment page. Server side reuses the token-ingest contract:
  `dispatcher.handleTokenIngest`-equivalent → `verifyAndIngestToken` → `encryptToken`
  → `upsertActive`. Likely add `authFlow: "token_paste"` to `AuthFlowSchema` (honest
  manifest) — a scoped contract change to design with the security-review skill.
- **Verify probe:** MCP `initialize` + one cheap read tool; success proves the token
  and returns durable account info. Record detected permission mode (read-only vs
  read-write) for Builder connection-readiness.
- `refreshable: false`; `tokenScope: "user"`; `accountIdField` = stable Eden
  workspace/user id (TBD-from-live-catalog).
- Security: no token in logs/errors/responses/query params; encrypt before persist;
  revoke path hits Eden's token revocation if exposed, else instructs manual revoke.

## Action catalog (map to live tools; schemas TBD-from-live-catalog)

Ship as **pinned, certified** typed actions (one Eden tool per action; params that
belong to one tool are **fields**, not duplicate actions). Grouped:

**Reads** — List Workspaces · List Boards · Read Board (`eden_read_board`) · Read
Board Cards/Saved Items · Read Saved Post Content · Read Transcript · Find/List
Documents · Read Note (`eden_get_note_markdown`) · List Creator Lists · Read Creator
List · Research Creator · Creator Top Posts · Creator Outlier Analysis/Baselines ·
List Prompts (`eden_list_prompts`) · Get Prompt (`eden_get_prompt`) · List Schedules
(`eden_list_schedules`) · List Connected Accounts · Read Schedule Time Zone · Read
Queue Slots · List Queued Posts · List Drafts · List Sent/Published · Read Scheduled
Post Details (if supported).

**Writes** — Create Note · Append to Note · Rewrite Note · Create Board · Rename
Board · Trash Board (reversible) · Save Link to Board · Save Indexed Post to Board ·
Create Scheduling Draft (`eden_create_scheduling_draft`) · Schedule Post
(`eden_schedule_post`) · Publish Immediately · Edit Queued Post · Reschedule Queued
Post · Cancel Queued Post · Add/Update Auto First Comment.

**Structured fields to fold into the right action (verify in live schema):**
platform-specific content tabs, X/Threads thread segments, media URL→FileRef
mapping, LinkedIn PDF, YouTube Shorts title/desc, first-comment timing/like
threshold, X auto-retweet, idempotency key, schedule selection, next-slot, ISO/epoch
scheduling. **No raw JSON editor** for platform content/media/segments/schedule.

**Excluded** (unless live catalog proves support): folder/space creation, permanent
deletion, follow/unfollow, creator-list mutation, identity mutation, image
generation, saved-skill mutation, global Discover search, private web endpoints.
Each exclusion recorded with evidence in the catalog audit.

## Triggers

Default: **no native triggers** (no Eden webhook/event API). Evaluate **polling**
only against live read-tool evidence (stable id + deterministic timestamp +
pagination + bounded list + durable dedup + deletion/reorder/status-regression
handling + acceptable cost). Candidates listed in `research.md` §6. Any shipped
polling trigger gets baseline-first activation, DB-backed dedup, and
checkpoint/replay/restart tests. If evidence is absent → ship zero triggers and say
so honestly.

## Builder & React Agent

Option sources (typed, redacted, owner-pinned personal): workspaces, boards,
schedules, connected accounts/platforms, creator lists, documents (searchable).
Structured editors for thread segments + platform tabs; media URL/FileRef controls;
date/time inputs; first-comment + auto-retweet controls; time-zone/schedule
explanations; explicit read-only vs read-write readiness. React Agent sees the full
pinned catalog + required inputs + connection readiness; never sees tokens/opaque
ids; must avoid unsupported platform/content combos (enforced by per-platform
schema rules).

## Tests (planned, at every layer)

MCP init/discovery/schema-validation · read-only vs read-write permission ·
credential encryption/redaction · account ownership/membership boundaries · each
action success/missing-input/invalid-input/structured-error/401-revoked/429/timeout ·
idempotent write · schedule+timezone mapping · platform media validation ·
thread-segment mapping · pagination · empty results · trigger
checkpoint/dedup/replay/restart (if any) · Builder metadata + option sources ·
React Agent catalog visibility · **no secret/private-content leakage** in logs/API/
history. Mock **only** the external MCP boundary; business/state through real
internal services + repositories.

## Proposed slice sequence (once B1/B2 approved + B3 credential in hand)

1. **Infra:** MCP client transport (B1) + paste-token auth variant (B2) +
   `credentialSharing` entry (`personal`) + manifest (capabilities honestly false) +
   Apps catalog metadata. Tests for transport + auth verify/redaction.
2. **Live capture:** connect with the PAT; capture `initialize`, `tools/list`, every
   input schema, `resources/list`, `prompts/list`, error/permission/pagination
   behavior; store **sanitized** evidence under `docs/providers/eden/`. Pin the
   certified tool set.
3. **Read actions** + option sources + Builder metadata + tests + smoke.
4. **Write actions** (notes, boards, scheduling) + platform field rules + idempotency
   + tests + smoke.
5. **Triggers** — only if live evidence supports polling; else document "none".
6. **Owner setup report** + **Phase 13 live certification** (every shipped
   action/trigger against the real Eden boundary; cleanup + credential rotation).

## Owner setup requirements (summary)

- Eden PAT (Read & write; optional Read-only) — steps above. **The only owner
  prerequisite** for connect.
- No developer portal / redirect URI / OAuth scopes / secret Vercel env vars for the
  PAT connect path. (A non-secret `EDEN_MCP_URL` constant/env may be added.)
- Live certification requires the PAT + a disposable Eden test account with at least
  one connected social account to safely certify scheduling.

## Known risks

- Eden catalog drift (mitigated by pinning + drift detection).
- Substack unattended-publish limits (browser extension) — document honestly.
- Instagram/TikTok require public media; YouTube Shorts title/media — Builder
  enforces from live schema.
- Non-refreshable PAT → clear reconnect UX on auth expiry.
