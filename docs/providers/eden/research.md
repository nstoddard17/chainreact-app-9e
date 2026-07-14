# Eden — Provider Research

**Date researched:** 2026-07-13
**Researcher:** Claude (provider-integration skill)
**Provider ID (proposed):** `eden`
**Display name:** Eden

> Status of this doc: **research complete; live MCP catalog capture BLOCKED** (no
> authorized `eden_pat_` test credential available at research time). Every exact
> per-tool input schema below is marked **TBD-from-live-catalog** and must be
> captured against `https://mcp.eden.so/mcp` before any action schema is finalized.
> See [`implementation-plan.md`](./implementation-plan.md) blockers.

---

## 1. What Eden is

Eden (**https://eden.so**, "landing-control" onboarding surface at
`https://eden.so/landing-control/`) is an AI-powered **content research, boards,
creator-analysis, and social-scheduling** platform for creators/marketers. Core
surfaces:

- **Content research / discovery** — searches millions of viral posts to surface
  high-performing patterns in a niche.
- **Boards & idea management** — saved posts, links, notes, drafts; a Chrome
  extension captures swipes from the web.
- **Creator analysis** — creator profiles, top posts, outlier analysis & baselines,
  watchlists / creator lists.
- **Notes / documents** — markdown notes, strategy briefs.
- **Saved skills / prompts** — reusable prompt library.
- **Social scheduling** — queue/publish to **X, Threads, LinkedIn, Instagram,
  TikTok, Facebook, YouTube Shorts, Substack**, with schedules, queue slots,
  first-comments, and platform-specific post variants.

**Not to be confused with** "Eden AI" (the multi-model AI API aggregator) or any
other product named Eden. This provider is specifically `eden.so`.

## 2. Official automation surface — MCP, not REST

Eden's **officially documented automation interface is a remote Model Context
Protocol (MCP) server**, not a conventional documented REST API. Eden's own
integration docs (Zapier / Make / n8n) use Eden **tools as actions** via MCP;
there is **no public Eden REST API reference** and **no public webhook / event
subscription API**.

- **MCP endpoint:** `https://mcp.eden.so/mcp`
- **Transport:** Streamable HTTP (MCP), JSON-RPC 2.0 message shape
  (`initialize`, `tools/list`, `tools/call`, `resources/list`, `prompts/list`, …).
- **Purpose (per Eden marketing/help):** connects Eden to Claude and ChatGPT and
  to cloud automation platforms (Make/n8n) so an agent can research, create, and
  schedule content.

> **Do NOT reverse-engineer Eden's private web-app endpoints.** The MCP server is
> the only sanctioned automation surface.

## 3. Authentication

Eden documents **two** MCP auth modes:

### 3a. OAuth (interactive MCP clients)
Eden supports OAuth for **interactive** MCP clients (e.g. connecting Claude
Desktop / ChatGPT via "Add to Claude" in Settings → Integrations). This is an
MCP-native OAuth (the client performs the MCP authorization handshake with Eden's
server). Eden does **not** publish a classic developer portal / client-id /
client-secret / redirect-URI / scope catalog for third-party apps to register
against — the OAuth is for MCP clients, not for a registered OAuth app.

### 3b. Personal Access Token (unattended automation) — **selected for V2**
For **cloud / unattended** automation (Make runs in the cloud; so does ChainReact),
Eden documents a **personal access token (PAT)**:

- Created in **Eden → Settings → Integrations → API access**.
- Token **format prefix `eden_pat_`**.
- Shown **once** at creation; Eden stores only a **hash** and cannot show it again.
- Sent as an HTTP **`Authorization: Bearer eden_pat_…`** header to
  `https://mcp.eden.so/mcp`.
- **Two documented permission modes:**
  - **Read only** — read tools only; scheduling/write tools return a permission
    error.
  - **Read & write** — read + write tools (schedule, save, create/append/rewrite
    notes, board mutations, queued-post edits, first comments).
- Revocable from the same Settings card.

**Why PAT (not OAuth) for ChainReact — proposed:** ChainReact runs workflows
**unattended in the cloud**, exactly the case Eden documents PAT for. Eden's OAuth
is an **MCP-client** interactive handshake, and V2 has **no OAuth-app registration
with Eden** (no client id/secret/redirect/scopes to register) and **no external
MCP OAuth client**. A PAT maps cleanly onto V2's existing per-user encrypted
credential model. See the auth-fit analysis in
[`v2-pattern-audit.md`](./v2-pattern-audit.md) §Auth.

> **Do not invent** an Eden client id, client secret, developer portal, redirect
> URI, or OAuth scope model. Eden does not document one for registered apps.

### Sources
- Eden — Connect Eden to Make: https://eden.so/help/eden-mcp/connecting-make/
- Eden — Eden MCP quick start: https://eden.so/help/eden-mcp/quick-start/
- Eden — Schedule and publish posts: https://eden.so/help/scheduling/scheduling-and-publishing/
- Eden — Help center: https://eden.so/help/
- Eden — landing/product: https://eden.so/ , https://eden.so/landing-control/
- Zapier — Eden MCP: https://zapier.com/mcp/eden-ai

## 4. Documented tool catalog (to map to the LIVE catalog)

Public docs do **not** expose every tool's schema, and Eden states its tool
catalog **changes regularly**. The names below are the officially-documented tool
identifiers and the documented capabilities to map onto live tools. **Every input
schema is TBD-from-live-catalog.**

### Confirmed exact tool names (documented)
| Tool | Kind | Notes |
|---|---|---|
| `eden_read_board` | read | Read a board's cards / saved items |
| `eden_get_note_markdown` | read | Read a note/document as markdown |
| `eden_list_prompts` | read | List saved skills / prompts |
| `eden_get_prompt` | read | Read a saved skill / prompt |
| `eden_list_schedules` | read | List schedules, connected accounts, slots |
| `eden_create_scheduling_draft` | write | Create a scheduling draft |
| `eden_schedule_post` | write | Schedule a post |

### Documented capabilities → live tool TBD
**Workspace & content reads:** List Workspaces · List Boards · Read Board
(`eden_read_board`) · Read Board Cards/Saved Items · Read Saved Post Content ·
Read Video/Audio Transcript · Find/List Documents · Read Document/Note
(`eden_get_note_markdown`) · List Creator Lists · Read Creator List · Research
Creator · Get Creator's Top Posts · Get Creator Outlier Analysis & Baselines ·
List Saved Skills/Prompts (`eden_list_prompts`) · Get Saved Skill/Prompt
(`eden_get_prompt`).

**Scheduling reads:** List Schedules (`eden_list_schedules`) · List Connected
Accounts for a Schedule · Read Schedule Time Zone · Read Available Queue Slots ·
List Queued Posts · List Scheduling Drafts · List Sent/Published Posts · Read
Scheduled Post Details (if supported).

**Notes & boards (writes):** Create Note · Append to Note · Rewrite Note · Create
Board · Rename Board · **Trash** Board (reversible only) · Save Link to Board ·
Save Indexed Social Post to Board.

**Scheduling writes:** Create Scheduling Draft (`eden_create_scheduling_draft`) ·
Schedule Post (`eden_schedule_post`) · Publish Immediately · Edit Queued Post ·
Reschedule Queued Post · Cancel Queued Post · Add/Update Auto First Comment.

**Possibly fields (not separate tools) — verify in live schema:** duplicate queued
post · move post back to draft · platform-specific post versions · X/Threads
segments · media attachments · LinkedIn PDF documents · YouTube Shorts
title/description · first-comment timing / like thresholds · X auto-retweet ·
idempotency key · schedule selection · next-available-slot · ISO timestamp /
epoch-ms scheduling.

## 5. Social platforms & platform rules (for the Builder to enforce)

Documented scheduling platforms: **X, Threads, LinkedIn, Instagram, TikTok,
Facebook, YouTube Shorts, Substack.**

| Platform | Documented requirement (verify live) |
|---|---|
| Instagram | Requires **publicly reachable media** (no text-only). |
| TikTok | Requires **publicly reachable media**. |
| YouTube | **Shorts-focused**; requires title + media fields. |
| LinkedIn | Text, image, video **and PDF documents**. |
| X / Threads | Support **structured thread segments**. |
| Facebook | Standard post. |
| Substack | Publishing has **browser-extension availability limits** — must be explained honestly. |
| (all, timed) | Explicit schedule time is **ISO timestamp or epoch-ms**. |
| (all) | **Idempotency key** honored where Eden exposes it. |

Text-only publishing is **not valid for every platform** — Builder must enforce
per-platform media/segment requirements from the live schema.

## 6. Triggers — no public webhook/event API

**No public Eden webhook or event-subscription API has been identified.** Eden's
Zapier/Make/n8n docs use **external** apps as triggers and **Eden tools as
actions** — Eden itself is not documented as an event source.

→ **Do NOT invent webhook triggers.** Native triggers may ship **only** as
**polling** triggers, and only when the live read tools prove they supply: a
stable object/event id, a deterministic created/updated/published/status-transition
timestamp, reliable pagination, a bounded list op, durable dedup info, and clear
handling of deletion/reordering/status regression, at acceptable MCP cost. Polling
candidates to evaluate against live evidence: New Scheduling Draft · New Scheduled
Post · Post Published · Post Failed/Needs-Attention · New Board · New Board Item ·
New Document · Document Updated · New Strategy Brief · New Post From a Tracked
Creator. **If the evidence isn't there, Eden ships with no native triggers** — that
is the complete, honest surface, not an incomplete one.

## 7. Explicitly excluded / unverified capabilities

Do **not** implement or advertise unless the live authenticated catalog proves
support (record evidence + reason in the catalog audit):

- Creating folders/spaces
- **Permanent deletion** (only reversible Trash may ship)
- Following/unfollowing creators
- Creating/modifying creator lists
- Identity creation/mutation
- Eden image generation
- Saved-skill create/rename/delete
- Unrestricted global Discover search
- Arbitrary access to private Eden web endpoints

## 8. Pagination, errors, rate limits, IDs — TBD-from-live-catalog

Not publicly documented. Must be captured live:
- **Error contract:** expected `{ ok: false, status, message }` structured shape
  (per task brief) — confirm exact fields + a read-only-token permission error.
- **Pagination:** cursor/offset model, page bounds.
- **Stable identifiers:** board/card/note/schedule/post ids.
- **Timestamps:** created/updated/published/status-transition fields (needed for
  any polling trigger).
- **Scheduling status values:** draft/queued/scheduled/sent/failed/needs-attention.
- **Rate limits / retry guidance.**

## 9. Known limitations

- Tool catalog is **not fully publicly documented** and **changes regularly** →
  the integration must **pin an explicitly certified tool set** and NOT expose
  arbitrary future tools without metadata/validation/tests/certification.
- No REST API → all calls go through the MCP transport.
- No webhook/event API → no native webhook triggers.
- Substack publishing depends on a browser extension → limited unattended support.
