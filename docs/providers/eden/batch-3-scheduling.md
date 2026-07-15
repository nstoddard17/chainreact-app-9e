# Eden — Batch 3: Social Scheduling & Publishing (EDEN-6)

**Date:** 2026-07-14 · **Live catalog re-verified:** `https://mcp.eden.so/mcp` · `eden-canvas`
· protocolVersion `2025-06-18` · **71 tools / 21 prompts / 2 resources / 5 templates — NO DRIFT
vs the pinned [`catalog-audit.md`](./catalog-audit.md).**

Batch 3 ships Eden's **scheduling-write** surface: create drafts, schedule, publish, edit,
reschedule, first-comment automation, and cancel — grounded ONLY in the live tool schemas
captured this session. No triggers (Eden exposes no event API). Media is **public-URL only**
(the base64/multipart upload primitives are deferred — see §Media).

## Live-schema reality check (what actually exists vs the batch brief)

The brief asked for several controls. Grounding against the live `tools/list` schemas:

| Requested capability | Live Eden tool | Verdict |
|---|---|---|
| Create draft | `eden_create_scheduling_draft` | ✅ ships |
| Schedule at explicit time | `eden_schedule_post` | ✅ ships |
| Publish immediately | `eden_publish_post_now` | ✅ ships |
| Edit queued/draft content | `eden_update_scheduled_post` | ✅ ships (`update_scheduled_post`) |
| Reschedule queued post | `eden_update_scheduled_post` (time-only) | ✅ ships (`reschedule_post` — same tool, time-only args, distinct user intent) |
| Cancel scheduled / delete draft | `eden_cancel_scheduled_post` | ✅ ships |
| Read one post (full) | `eden_list_scheduled_posts` (`postId`+`mode:full`) | ✅ ships (`read_scheduled_post`) |
| First comment + delay + like-threshold | `eden_set_first_comment` (`comment`/`delayMinutes`/`afterLikes`) | ✅ ships |
| List schedules / connected accounts / timezone / queue slots / text limits | `eden_list_schedules` (all folded into ONE tool's output) | ✅ enriched `list_schedules` + option sources |
| **X auto-retweet + delay** | *none in the 71-tool catalog* | ❌ **NOT EXPOSED — not shipped, not invented** |
| **Duplicate draft / duplicate queued post** | *no `eden_duplicate_*` tool* | ❌ **NOT EXPOSED — not shipped** |
| **Return failed→draft / retry failed** | *no status-write tool* | ❌ **NOT EXPOSED — not shipped** (`update_scheduled_post` cannot edit a `publishing`/`posted` post; there is no "move back to draft" op) |
| **Schedule into next queue slot** | *no native tool* — composition of `list_schedules` slot + `schedule_post` | ⏸ **deferred within batch** — queue-slot sub-shape is unverifiable until a schedule with slots exists on the cert account; add + certify in the account phase |

Per CLAUDE.md Provider Rule ("Do not invent controls that are absent from the live schemas"),
auto-retweet, duplicate, and return-to-draft are documented as absent and **not shipped**.

## Batch 3 mapping table

| ChainReact action (`eden:*`) | Eden MCP tool | R/W | Platforms | Reversible | Certification plan |
|---|---|---:|---|---:|---|
| `create_scheduling_draft` | `eden_create_scheduling_draft` | write | all 8 (draft) | ✅ (cancel) | Safe — create + cancel, no publish |
| `read_scheduled_post` | `eden_list_scheduled_posts` (`postId`,`mode:full`) | read | — | n/a | Safe — read back a draft |
| `update_scheduled_post` | `eden_update_scheduled_post` | write | all 8 | ✅ (pre-publish) | Safe — edit draft body, cancel |
| `reschedule_post` | `eden_update_scheduled_post` (time-only) | write | inherit | ✅ (pre-publish) | Safe — move future time, cancel |
| `set_first_comment` | `eden_set_first_comment` | write | all on post | ✅ (empty clears) | Safe — set/clear on draft, cancel |
| `cancel_scheduled_post` | `eden_cancel_scheduled_post` | write | — | ⚠ permanent cancel | Safe — the cleanup/safety op |
| `schedule_post` | `eden_schedule_post` | write | all 8 | ✅ only until it fires | Safe path = schedule far-future + cancel; **public fire requires throwaway account** |
| `publish_post_now` | `eden_publish_post_now` | write | text: X/Threads/LinkedIn/Substack | ❌ public, irreversible | **Throwaway account only** — gated on owner |

`list_schedules` (Batch 1) is **enriched** in Batch 3 to surface connected accounts, timezone,
text limits, and queue slots for the option sources (additive output — existing keys unchanged).

## Platform capability matrix (from live schemas)

Platform enum (verbatim from every write tool): `twitter` (X), `threads`, `linkedin`,
`substack`, `instagram`, `tiktok`, `facebook`, `youtube` (Shorts).

| Platform | Text-only | Image | Video | Thread segments | PDF/doc | Title | First comment | Notes (from live tool descriptions) |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|---|
| X (`twitter`) | ✅ | ✅ | ✅ | ✅ | — | — | ✅ | Non-Premium 280/post; Premium long-form ≤25k; server auto-splits |
| Threads | ✅ | ✅ | ✅ | ✅ | — | — | ✅ | 500/post; per-platform thread override supported |
| LinkedIn | ✅ | ✅ | ✅ | — | ✅ (`application/pdf` → `kind:document`) | — | ✅ | Document posts need a hosted PDF asset |
| Substack | ✅ (notes) | ✅ | — | ✅ | — | — | ✅ | "Substack notes"; browser-extension caveats noted below |
| Instagram | ❌ | ✅ | ✅ | — | — | — | ✅ | **Requires hosted media**; no text-only; `trialReel` (single video) deferred |
| TikTok | ❌ | — | ✅ | — | — | — | ✅ | **Requires hosted video/media**; no text-only |
| YouTube | ❌ | ❌ | ✅ (Shorts) | — | — | ✅ **required** (≤100) | ✅ | Shorts only: single vertical video + `perPlatform.youtube.title` |
| Facebook | ✅ | ✅ | ✅ | — | — | — | ✅ | Page/account via schedule's connected account |

Enforcement: the action schemas reject unsupported combinations **before** invoking Eden
(e.g. Instagram/TikTok/YouTube with no media → validation error, never a silent field strip).

## Media handling (public-URL only)

Eden's write tools accept `media: [{ url, mimeType?, alt? }]` where `url` is a **publicly
fetchable** URL. ChainReact models media as a structured `object-list` of `{ url, mimeType?,
alt? }` — **URLs only, never bytes**. This satisfies the file-output contract
([`docs/rules/file-output-contract.md`](../../rules/file-output-contract.md)): no base64, no
serialized bytes in config.

**Deferred (documented, not shipped):** `eden_upload_scheduling_media` (base64, 25 MB cap) and
the multipart primitives (`prepare/sign/complete/abort`). Reason: base64-in-config violates the
file-output contract, and wiring a FileRef→public-URL bridge is unapproved media-upload
infrastructure (CLAUDE.md: "Do not build unapproved media-upload infrastructure merely to make
one Eden action work"). Instagram/TikTok/YouTube require **publicly reachable** media, so the
supported path is: an upstream node emits a public URL → paste/wire it into the media field.

## Idempotency

Every write wrapper accepts Eden's `idempotencyKey`. When the author leaves it blank, the
handler generates a **stable per-execution key** `eden:${runId}:${nodeId}` — stable across safe
retries (same key + same content → Eden returns the SAME post, never a duplicate), unique per
execution node. `create/schedule/publish` are marked non-idempotent at the transport
(`idempotent:false`) so a transient failure surfaces rather than silently double-writing; the
idempotencyKey is what makes an author-driven retry safe. Publication is **never** auto-retried
with a new key.

## Risk / lifecycle classification

| Action | riskLevel | isDestructive | requiresConfirmation | Rationale |
|---|---|:--:|:--:|---|
| `create_scheduling_draft` | medium | no | no | Reversible provider write, not recipient-visible |
| `read_scheduled_post` | low | no | no | Pure read |
| `update_scheduled_post` | medium | no | no | Reversible pre-publish edit |
| `reschedule_post` | medium | no | no | Reversible time change |
| `set_first_comment` | medium | no | no | Reversible pre-publish; recipient-shaping |
| `cancel_scheduled_post` | medium | no | no | Protective (stops a publish); deletes only a throwaway draft |
| `schedule_post` | **high** | no | no | Commits a **public** post to auto-fire — builder warns |
| `publish_post_now` | **high** | no | **yes** | **Immediate public, irreversible** egress — typed confirmation |

The React Agent catalog is fully metadata-driven ([`services/ai/tools/providerCatalog.ts`](../../../services/ai/tools/providerCatalog.ts)):
these `riskLevel`/`requiresConfirmation`/`riskDescription` facts flow into the agent
automatically — a "save as draft" request maps to `create_scheduling_draft` (medium), never to
`publish_post_now` (high + confirmation).

## Substack honesty note

Eden's `list_schedules` description advertises Substack **notes** as a text-first target. Whether
a given workspace can actually publish to Substack depends on the connected account (some Substack
automation historically required a browser extension). Batch 3 ships Substack as an available
platform in the schema, and the live certification matrix records the real, per-account result —
we do not claim Substack is certified on an account where it is not connected.

## Live certification results (2026-07-14)

Certified by driving the REAL shipped wrappers (the same code the handlers call) against
`mcp.eden.so` with a disposable Read & write PAT (`.env.local`, never printed/committed). Gated
suite: `EDEN_LIVE_CERT=1 npx jest tests/integration/eden/live-cert.test.ts -t "SAFE lifecycle"`.

**Key live finding — connection gating.** The cert account currently has **0 posting schedules and
0 connected social accounts**. Eden's behavior splits the write surface by whether an operation
*rebuilds targets / enqueues*:

| Operation | Needs a connected account? | Certified on empty account |
|---|---|---|
| `create_scheduling_draft` | No (draft only) | ✅ PASS |
| `read_scheduled_post` | No | ✅ PASS |
| `set_first_comment` | No | ✅ PASS |
| `reschedule_post` (time-only update; stays a draft) | No | ✅ PASS |
| `cancel_scheduled_post` (+ verify) | No | ✅ PASS |
| `update_scheduled_post` (content edit — rebuilds targets) | **Yes** | ⏸ error-propagation certified; success pending account |
| `schedule_post` (enqueue) | **Yes** | ⏸ error-propagation certified; success pending account |
| `publish_post_now` (immediate publish) | **Yes** | ⏳ pending throwaway account |

**Correctness fix surfaced by cert:** Eden returns app-level `{ ok:false, status:"invalid",
httpStatus:400, message:"No active connection on this schedule for X." }` WITHOUT the MCP transport
throwing. The wrappers now assert `ok` and **throw** (→ `HANDLER_FAILED`) — so a workflow never
believes it queued/edited a post it didn't. Error-propagation is live-certified for the
connection-gated writes (they throw the sanitized provider reason; no content, no token).

**Zero public exposure:** every cert write was a draft or an assertion that an enqueue *fails*;
nothing was ever published. Residual sweep after cert: **0 active EDEN-6 posts** (all cancelled).

## Platform certification matrix

Connected test accounts: **none yet** (owner connecting a disposable throwaway account). Until then
every platform is **implemented, not platform-certified**. Draft/read/first-comment/reschedule/cancel
are platform-agnostic and certified; content-edit/schedule/publish are certified per-platform only
once a throwaway account for that platform is connected.

| Platform | Implemented | Draft | Reschedule | First comment | Cancel | Content edit | Schedule | Publish now | Media | Cleanup |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|---|
| X (twitter) | ✅ | ✅ (via drafts) | ✅ | ✅ | ✅ | ⏸ needs account | ⏸ needs account | ⏳ needs account | ⏳ | drafts cancelled |
| Threads | ✅ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| LinkedIn | ✅ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ (PDF) | — |
| Substack | ✅ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — | see Substack note |
| Instagram | ✅ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ (required) | — |
| TikTok | ✅ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ (required) | — |
| YouTube (Shorts) | ✅ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ (video) | — |
| Facebook | ✅ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |

Legend: ✅ certified · ⏸ error-path certified, success pending account · ⏳ pending a connected
throwaway account for that platform. **No platform is claimed as publish-certified.** The draft
column reflects that draft creation is platform-agnostic (a draft targets any platform without a
connection); per-platform publish is proven only on a connected account.

## Triggers — unchanged

No webhook triggers, no polling triggers. Eden exposes no event API. Scheduling-write work
introduces **no** polling infrastructure. Polling-trigger design remains a separate slice.
