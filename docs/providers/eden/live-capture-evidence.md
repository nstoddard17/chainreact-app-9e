# Eden — Live MCP Capture Evidence (sanitized)

**Captured:** 2026-07-14 against `https://mcp.eden.so/mcp` with an authorized disposable
Read & write `eden_pat_` token. **No token, account email, workspace id, or private content is
stored here** — only protocol structure, schema shapes, and generic provider error strings.

## initialize
- **HTTP:** 200, `content-type: application/json`.
- **Session:** server issues an **`mcp-session-id`** response header (echoed on later requests). ✅ matches the transport's session handling.
- **protocolVersion:** `2025-06-18` (== the transport's advertised default; no downgrade).
- **capabilities:** `{ tools:{listChanged}, prompts:{listChanged}, resources:{listChanged} }`.
- **serverInfo:** `{ name:"eden-canvas", title:"Eden", version:"0.0.1-<hash>", websiteUrl:"https://mcp.eden.so", icons:[256/512 png] }`.
- **instructions:** present (~24 KB of usage guidance).
- Infra headers observed: `x-railway-*`, `x-hikari-trace` (hosting), CORS headers.

## Discovery counts
- `tools/list`: **71 tools**, single page (`nextCursor` absent; cursor pagination supported but unused at this size).
- `resources/list`: **2** resources; `resources/templates/list`: **5** templates (uriTemplate-based).
- `prompts/list`: **21** prompts (each with name/title/description/arguments).

## Transport / response behavior
- Responses are `application/json` (SSE framing supported by the transport but not used here).
- Tool success → `content:[{type:"text", text:"<JSON>"}]` whose JSON is `{ ok:true, ... }`.
- Tool failure → **`isError:true`** result (HTTP 200), two shapes:
  - **Validation/unknown tool:** text = `"MCP error -32602: Tool <x> not found"` / `"… Input validation error: …"`.
  - **Resource errors:** JSON text `{ ok:false, status:"not-found", message:"…", httpStatus:404, tool:"…" }` — `status` is a **string label**, `httpStatus` the numeric code (the transport reads `httpStatus`).

## Pagination & identifiers (for future polling triggers)
- List tools accept `cursor`/`limit`; return `nextCursor` (+ `count`/`totalCount` on some).
- Stable ids are 36-char (UUID) strings for workspaces / items / boards / notes.
- **Timestamps:** `createdAt`/`updatedAt` are **epoch-ms numbers**; scheduling uses `scheduledFor` (epoch) / `scheduledAtIso`.

## Read-tool result shapes (values redacted → types only)
- `list_workspaces` → `{ ok, user:{id,email,…}, workspaces:[{id,name,slug,role,joinedAt}], defaultWorkspaceId }`
  — **the `user`/`email` is dropped by our wrapper; never surfaced.**
- `list_workspace_items` → `{ ok, workspaceId, count, totalCount, nextCursor, items:[{id,title,type,parentId,createdAt(ms),updatedAt(ms),pinned,file{…}}] }`.
- `list_schedules` → `{ ok, workspaceId, schedules:[…] }` · `list_scheduled_posts` → `{ ok, workspaceId, posts:[…], count, mode }`.

## Write-tool result shapes (from create→read→trash cert cycle)
- `create_board` → `{ ok, workspaceId, boardId, title, message }`.
- `read_board` → `{ ok, workspaceId, itemId, title, items:[], stickyNotes:[], textBlocks:[], …, summary:{itemCount,stickyNoteCount,textBlockCount,…}, message }`.
- `create_note` → `{ ok, workspaceId, boardId, itemId, title, message }`.
- `get_note_markdown` → `{ ok, itemId, workspaceId, title, markdown, accessMode }`.
- `trash_board` → `{ ok, boardId, message }`.

## Live-cert findings that changed the code
1. **Boards are workspace items of type `canvas`**, not `board` — `list_workspace_items type:"board"` returns zero even when boards exist. `listBoards` now filters `type:"canvas"` (fixed the empty board picker).
2. **Error contract** uses `status` (string) + `httpStatus` (number) — the transport now reads `httpStatus`.

## Read-only vs read-write
Not scope-detectable from `tools/list` (all tools are listed). A read-only token surfaces a
permission error only when a WRITE tool is called; the transport maps that to `McpPermissionError`
→ `InsufficientScopeError` (reconnect with Read & write). Certification here used a Read & write token.

## Batch-2 findings (EDEN-5, 2026-07-14)
- **Workspace item types:** boards = **`canvas`**, notes = **`markdown`** (the only two top-level
  types on a fresh workspace). `type:"board"`/`type:"note"` filters return nothing.
- **Eventual consistency:** a just-created note/board is reliably readable BY ID and appears under
  its board (`parentId`), but the workspace-wide `list_workspace_items`/`search` index lags a few
  seconds — actions certify by bounded shape, not immediate global membership.
- **`read_card`** (Read Social Post) returns a rich post `{ title, body, publishedAt, durationSeconds,
  hashtags, language, metrics{views,likes,comments,engagementRate,outlierScore}, transcript,
  transcriptStatus, profile }` + an Eden `contentId` (UUID). Bounded wrapper drops nothing sensitive
  (public creator content); no account identity present.
- **`save_posts_to_board`** requires `{ platform, contentId }` where `contentId` is Eden's UUID (from
  `read_card`/creator tools) — NOT the platform-native id and NOT a URL.
- **`resolve_creator`/`analyze_creator`** return public creator profiles + `syncStatus`/`library.status`
  (indexing state). No PII/account fields. `search_social_content` uses a structured `creatorRef`
  scope (no global Discover string) — deferred.
- **Prompts & skills** share one library: `list_prompts` == `list_skills` (both return `prompts`+`skills`
  arrays); `get_prompt`/`get_skill` return the same object; `export_skill` → `{ skillMd, slug }`.

## Cleanup accounting
All disposable data created during capture + certification was **trashed** (reversible in Eden):
every board created by the shape probe, the type probe, and the cert run was removed via
`eden_trash_board` (cleanup asserted). No permanent deletion performed. No residual artifacts expected.
