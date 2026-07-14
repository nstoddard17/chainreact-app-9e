# Eden — Pinned Catalog Audit

**Date:** 2026-07-14 · **Live catalog captured from** `https://mcp.eden.so/mcp`
**Server:** `eden-canvas` · **protocolVersion** `2025-06-18` · **71 tools / 21 prompts / 2 resources / 5 resource templates**

Eden's live catalog is far larger than its public docs (71 tools vs ~30 documented). Per the
provider rules we **pin an explicitly certified set** and never expose arbitrary future tools
without metadata + validation + tests + certification. Every tool below is categorized
**SHIPPED** (batch 1, live-certified), **DEFER** (useful/supportable — pinned for a later certified
batch), or **EXCLUDE** (with evidence + reason).

## SHIPPED — Batch 1 (7 actions, LIVE-CERTIFIED 2026-07-14)

| Action (`eden:*`) | Tool | Kind | Cert |
|---|---|---|---|
| `list_workspaces` | `eden_list_workspaces` | read | ✅ live |
| `list_schedules` | `eden_list_schedules` | read | ✅ live |
| `list_scheduled_posts` | `eden_list_scheduled_posts` | read | ✅ live |
| `create_board` | `eden_create_board` | write | ✅ live (created + trashed) |
| `read_board` | `eden_read_board` | read | ✅ live |
| `create_note` | `eden_create_note` | write | ✅ live |
| `trash_board` | `eden_trash_board` | write (reversible) | ✅ live (cleanup) |

Option sources shipped: `eden:workspaces`, `eden:boards` (boards = workspace items of type
**`canvas`** — a live-cert finding; `type:"board"` returns nothing).

## DEFER — pinned, useful & supportable, not yet implemented/certified

These are real, safe candidates for follow-up **certified** batches (each still needs
schema/meta/handler/tests + live cert before shipping). Grouped:

**Batch 2 — content reads + safe board/note writes**
`eden_list_workspace_items`, `eden_search_workspace_items`, `eden_get_note_markdown`,
`eden_read_media_card`, `eden_read_card`, `eden_read_social_post`, `eden_update_note`,
`eden_append_to_note`, `eden_rename_note`, `eden_create_sticky_note`, `eden_rename_board`,
`eden_save_links_to_board`, `eden_save_posts_to_board`.

**Batch 3 — creator research + intelligence reads**
`eden_resolve_creator`, `eden_analyze_creator`, `eden_find_creator_in_workspace`,
`eden_get_creator`(via lists), `eden_list_creator_lists`, `eden_analyze_list`,
`eden_following_overview`, `eden_search_social_content` (scoped — requires `scope`),
`eden_search_highlights`, `eden_list_highlights`, `eden_list_captures`, `eden_search_captures`,
`eden_list_chats`, `eden_study_top_carousels`, `eden_list_skills`, `eden_get_skill`,
`eden_export_skill`, `eden_list_prompts`, `eden_get_prompt`, `eden_list_voices`,
`eden_get_my_voice`, `eden_get_voice`, `eden_list_briefs`, `eden_read_brief`,
`eden_read_brief_idea`, `eden_list_brief_definitions`, `eden_get_brief_setup`.

**Batch 4 — scheduling writes (certify WITHOUT public posting where possible)**
`eden_create_scheduling_draft` (safe — draft), `eden_schedule_post`, `eden_publish_post_now`,
`eden_update_scheduled_post`, `eden_set_first_comment`, `eden_cancel_scheduled_post`,
`eden_upload_scheduling_media`. The multipart upload primitives
(`eden_prepare_/sign_/complete_/abort_scheduling_media_upload`) are **infra**, not user actions —
fold into a single "Upload media" action (or URL-based media) rather than 4 separate actions.
> Certification caution: `schedule_post`/`publish_post_now` post to **real connected social
> accounts**. Certify via a draft + cancel, or a throwaway connected account, to avoid public spam.

## EXCLUDE — with evidence + reason (present in the live catalog, deliberately NOT shipped)

| Tool(s) | Reason (maps to the task's excluded-unless-proven list) |
|---|---|
| `eden_create_identity`, `eden_update_identity`, `eden_save_my_identity` | **Identity mutation.** Rewrites the user's core voice/identity — high blast radius, recipient-shaping. Excluded pending a deliberate product decision. |
| `eden_create_skill`, `eden_update_skill`, `eden_delete_skill`, `eden_import_skill` | **Saved-skill create/rename/delete.** Task excludes unless proven; proven but niche + `delete_skill` is a permanent mutation. Excluded (reads `list/get/export_skill` are DEFER). |
| `eden_generate_image`, `eden_generate_carousel`, `eden_get_generated_image` | **Eden image generation.** Credit-consuming, recipient-visible AI output. Excluded pending product/cost decision. |
| `eden_create_brief`, `eden_save_brief_setup`, `eden_generate_brief` | **Strategy-brief generation.** `generate_brief` consumes credits (`confirmAdditionalCredits`). Excluded from writes; brief READS are DEFER. |
| `eden_wait_for_creator_index` | A **blocking wait/poll helper**, not a workflow action. Compose via a ChainReact polling loop instead. |

## Capabilities confirmed ABSENT from the live catalog (honest "not built")
- **Create folders/spaces** — no such tool. Not implemented.
- **Permanent deletion** — only `trash_board` (reversible) + `delete_skill` (excluded). No permanent board/note delete tool.
- **Follow/unfollow creators** — none (`following_overview` is read-only). Not implemented.
- **Create/modify creator lists** — none (only `list`/`analyze`). Not implemented.
- **Unrestricted global Discover search** — `search_social_content` requires an explicit `scope`; no unbounded global search.

## Notes for future batches
- Pagination: cursor-based (`cursor` in / `nextCursor` out); the 71-tool `tools/list` is single-page.
- Timestamps: `createdAt`/`updatedAt` are **epoch-ms numbers**; scheduling uses `scheduledFor` (epoch) / `scheduledAtIso`.
- Errors: `isError:true` result; resource errors carry `{ ok:false, status:"<label>", httpStatus:<code>, message }` (transport maps `httpStatus`).
- Idempotency: scheduling write tools accept `idempotencyKey` — wire it before enabling any write retry.
