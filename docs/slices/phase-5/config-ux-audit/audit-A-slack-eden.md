# Builder Config UX Audit — Group A: slack (41 nodes) + eden (36 nodes)

Ground truth verified against `integrations/slack/actions/**`, `integrations/slack/triggers/**`, `integrations/eden/actions/**`, `integrations/eden/options/*`, `services/options/_registry.ts`. Inventory `staticOptionCount` confirmed all `select` fields really have options (they do — no empty dropdowns).

## Systemic patterns

1. **Existing resolver not wired into a string-array (1 field, HIGH).** `slack:invite_users_to_channel.users` demands raw U-prefixed ids while the registered `slack:users` resolver already exists and the gmail `labelIds` field proves the `string-array + optionsSource + allowManualEntry` per-chip pattern works. The field's own description admits it ("A future `slack:users` resolver slice will replace this…") — that future is now.
2. **Eden free-text fields that ask for provider-defined enum values (6 fields, MEDIUM).** `list_scheduled_posts.status`, `list_captures.status`, `search_items.type`, `create_sticky_note.color`, `list_highlights.orderBy`, `following_overview.platform`. All are `z.string().optional()` server-side; the runtime accepts anything, but a normal user cannot guess valid values. `following_overview.platform` is worst-in-class because sibling actions (`resolve_creator`, `research_creator`) already ship a 7-option platform `select` — inconsistent within the same provider.
3. **Pagination/windowing plumbing in the normal path (~15 fields, MEDIUM-LOW).** eden `cursor` (×4), `offset` (×2); slack `oldest`/`latest` (×6). All are loop-composition / power-user knobs that clutter the setup path. Uniform fix: `advanced: true` (metadata-only, no runtime change).
4. **Slack raw-timestamp free-text (`ts`/`threadTs`) — 13 fields, acceptable class, wordy copy (LOW-MEDIUM).** These are genuinely upstream-data-mapping (wire `{{…ts}}`); a picker is impossible. But several descriptions leak implementation ("The caller is responsible for extracting `ts` … at resolve time", "`<seconds>.<microseconds>` exactly as Slack returns"). Standardize one outcome-first sentence: "Paste or wire the `ts` output of an earlier Slack message step to reply in that thread."
5. **Implementation jargon in descriptions (≈8 fields, MEDIUM copy).** "delivered as Slack's initial_comment — no separate chat.postMessage round-trip", "those hydrate as editable text", "handler-side", "handler default is true", "at the handler boundary". Normal users don't know what a handler is.
6. **Strong consistent good patterns (no action needed):** slack `channel` combobox (`slack:channels`) on 20 actions/triggers with identical copy; eden `workspaceId` optional-default combobox on ~24 actions; eden schedule-guard fields already `advanced: true`; eden `media` object-list with proper `itemFields` (url/mimeType/alt); Q11 explicit booleans (`isPrivate`, `sendInviteNotification`, `includeTranscript`) correctly required with no silent default.
7. **visibleWhen candidates (new infra).** eden `youtubeTitle` and `segments` appear on 4 posting actions but only matter for specific platforms — candidates for `visibleWhen: platforms valueIn [...]`, with the caveat that empty `platforms` falls back to the schedule's platforms (so hide only when `platforms` is non-empty and excludes the target; if valueIn can't express that, leave visible).

---

## slack — actions

### slack:download_file (action) — Download File
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| fileId | text REQ, F-id | Succeeds for the primary flow (wired from file_uploaded trigger); desc explains 3 sources. Browsing a recent file by hand is impossible | wires trigger payload | upstream-data-mapping | Optional NEW resolver `slack:files` (files.list, `files:read` scope already granted) → combobox allowManualEntry [new-resolver] | — | — | value stays raw F-id | none |

### slack:upload_file (action) — Upload File
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| channel, file, title | picker / file / text | OK — clear outcome copy, file field explains staging | — | provider-resource-selection / upstream-data-mapping / core-user-decision | keep | — | title falls back to filename (documented) | — | none |
| initialComment | textarea | "delivered as Slack's initial_comment — no separate chat.postMessage round-trip" = implementation leak | — | core-user-decision | New desc: "Optional message shown with the file in the channel." | — | — | key unchanged | none |
| threadTs | text, "caller is responsible for extracting ts at resolve time" | Most implementation-heavy threadTs copy in the provider | thread targeting | upstream-data-mapping | New desc: "Optional. Wire the `ts` output of an earlier Slack message step to share the file as a reply in that thread." | — | — | raw ts string unchanged | none |

### slack:send_channel_message (action) — Send Channel Message
No findings — fields OK as-is: channel picker + plain-language message body (mrkdwn hints are user-useful); threadTs is standard upstream-mapping with reasonable copy.

### slack:send_direct_message (action) — Send Direct Message
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| userId | combobox `slack:users` | Picker works, but desc leads with "Slack user id (U-prefixed). Wire from…" as if there were no picker | wiring `{{trigger.user}}` | provider-resource-selection | New desc: "Who receives the DM. Pick a person, or wire a user from an earlier step (e.g. `{{trigger.user}}`)." | — | — | id value unchanged | none |
| text, threadTs | textarea / text | OK | — | core / upstream-mapping | keep | — | — | — | none |

### slack:update_message (action) — Update Message
No findings — fields OK as-is: channel picker; `ts` is legit upstream mapping with wiring guidance; "no edit history" warning is a good honest note.

### slack:delete_message (action) — Delete Message
No findings — fields OK as-is (channel picker + wired `ts`). Destructive but scoped; nothing to simplify.

### slack:get_messages (action) — Get Messages
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| channel, limit | picker / number | OK | — | provider-resource-selection / safe-default | keep | — | Slack default 100 documented | — | none |
| oldest, latest | text raw Slack ts | Time-window filters in raw `<seconds>.<microseconds>` — power-user only | history windowing | advanced-user-control | — | `advanced: true` on both | — | raw ts format unchanged | none |

### slack:get_thread_messages (action) — Get Thread Messages
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| channel, threadTs, limit | OK | threadTs is the node's core input, correctly explained | — | provider-resource-selection / upstream-data-mapping / safe-default | keep | — | — | — | none |
| oldest, latest | text raw Slack ts | same as get_messages | windowing | advanced-user-control | — | `advanced: true` | — | unchanged | none |

### slack:schedule_message (action) — Schedule Message
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| channel, text, threadTs | OK | — | — | picker / core / upstream-mapping | keep | — | — | — | none |
| postAt | datetime-utc REQ; desc: "…those hydrate as editable text. Naive datetimes … rejected at execute time." | Widget is right; the description narrates parser internals (hydration, offsets, Unix-seconds) | pasting Unix seconds / offset ISO | core-user-decision | New desc: "When Slack should post the message (UTC). Advanced: a pasted ISO time with explicit offset or Unix seconds also works." | — | none (Q11 — time is high-risk; keep required, no default) | `parsePostAt` accepted formats unchanged | none |

### slack:cancel_scheduled_message (action) — Cancel Scheduled Message
No findings — fields OK as-is: channel picker; `scheduledMessageId` correctly documented as wired from Schedule Message's output (upstream-data-mapping — a picker via chat.scheduledMessages.list is possible but the wire-from-upstream flow is the real use).

### slack:add_reaction (action) — Add Reaction
No findings — fields OK as-is: channel picker + wired ts; `reaction` accepts bare or colon-wrapped names with normalization (forgiving input). An emoji picker would be polish only (LOW, listed in change list).

### slack:remove_reaction (action) — Remove Reaction
No findings — same shape as Add Reaction; OK.

### slack:pin_message (action) — Pin Message
No findings — channel picker + wired ts; OK.

### slack:unpin_message (action) — Unpin Message
No findings — same as Pin Message; OK.

### slack:list_scheduled_messages (action) — List Scheduled Messages
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| channel, limit | optional picker / number | OK — "leave blank to list workspace-wide" is good | — | provider-resource-selection / safe-default | keep | — | — | — | none |
| oldest, latest | text raw Slack ts filtering `post_at` | Power-user window filters | windowing | advanced-user-control | — | `advanced: true` | — | unchanged | none |

### slack:list_channels (action) — List Channels
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| kind | select (3 opts), "Defaults to public when omitted (handler-side)" | Options good; "handler-side" is jargon and the default is invisible | — | safe-default | `defaultValue: "public"` + desc "Which channels to include. Public only unless you choose otherwise." | — | defaultValue mirrors existing handler default — no behavior change | value set unchanged | none |
| excludeArchived | boolean, "(handler default is true)" | Default described in prose instead of shown | — | safe-default | `defaultValue: true` + desc "Skip archived channels (recommended)." | — | mirrors handler default | boolean unchanged | none |
| limit | number | OK | — | safe-default | keep | — | — | — | none |

### slack:get_channel_info (action) — Get Channel Info
No findings — single channel picker; OK.

### slack:create_channel (action) — Create Channel
No findings — fields OK as-is: `name` explains Slack's server-side normalization plainly; `isPrivate` is a correct Q11 explicit boolean (visibility-switching — must not be defaulted).

### slack:archive_channel (action) — Archive Channel
No findings — single channel picker; OK.

### slack:unarchive_channel (action) — Unarchive Channel
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| channel | combobox `slack:channels` — but the resolver only lists NON-archived channels | The one action whose target can never appear in its own picker; user must run List Channels and wire an id (desc admits it) | wiring from list output | provider-resource-selection | NEW resolver variant (e.g. `slack:channels_archived` via conversations.list exclude_archived=false) [new-resolver, scopes already granted] | — | — | saved id unchanged | none |

### slack:rename_channel (action) — Rename Channel
No findings — channel picker + plainly-explained name rules; OK.

### slack:join_channel (action) — Join Channel
No findings — single channel picker; OK.

### slack:leave_channel (action) — Leave Channel
No findings — single channel picker; OK.

### slack:invite_users_to_channel (action) — Invite Users to Channel
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| users | string-array REQ, raw U-ids, desc promises a future picker | HIGH: normal user cannot know U-ids; the promised `slack:users` resolver EXISTS and is registered; per-chip pattern proven by gmail `labelIds` | pasting/wiring ids still possible | provider-resource-selection | Add `optionsSource: "slack:users"`, `allowManualEntry: true`; new desc: "Pick the people to invite, or paste / wire user ids from an earlier step." | — | — | chips still save raw U-id strings; schema (CSV or array) untouched | none — additive metadata |
| channel, sendInviteNotification | picker / Q11 boolean | OK (Q11 correct) | — | picker / core-user-decision | keep | — | — | — | none |

### slack:remove_user_from_channel (action) — Remove User from Channel
No findings — channel + user pickers with wiring guidance; OK.

### slack:set_channel_topic (action) — Set Channel Topic
No findings — picker + plain textarea; "empty string clears the topic" is a useful honest note.

### slack:set_channel_purpose (action) — Set Channel Purpose
No findings — same shape as Set Channel Topic; OK.

### slack:get_user_info (action) — Get User Info
No findings — single user picker with wiring guidance; OK.

### slack:list_users (action) — List Users
No findings — single bounded limit field; OK.

### slack:get_file_info (action) — Get File Info
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| fileId | text REQ F-id | Same as download_file — fine when wired, unbrowseable by hand | — | upstream-data-mapping | share the optional `slack:files` resolver if built [new-resolver] | — | — | raw id unchanged | none |
| includeComments | boolean | OK — outcome + limitation explained | — | conditional-option | keep | — | — | — | none |

### slack:post_interactive_blocks (action) — Post Interactive Blocks
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| blocks | json REQ + `advanced: true`, jsonShape array | Correctly the json escape hatch (Block Kit is genuinely raw); BUT a REQUIRED field living in the Advanced tab means the normal path literally cannot finish without opening Advanced — placement tension once the tab ships | Block Kit authoring | unsupported-raw-config | Either drop `advanced: true` (it's the node's core input; the node itself is developer-oriented) or ensure readiness/setup UI deep-links into Advanced for required-advanced fields | keep json + jsonShape | — | JSON array verbatim | none (metadata-only) |
| channel, text, threadTs | OK | notification-fallback copy is genuinely educational | — | picker / core / upstream-mapping | keep | — | — | — | none |

## slack — triggers

### slack:message.channel (trigger) — New Message in Channel
No findings — optional channel picker, plain "when blank fires for every…" copy; OK.

### slack:message.im (trigger) — New Direct Message
No findings — optional sender picker; OK.

### slack:message.group (trigger) — New Message in Private Channel
No findings — optional picker; C/G legacy-id note is honest and brief; OK.

### slack:message.mpim (trigger) — New Group Direct Message
No findings — dedicated `slack:group_dms` resolver; OK.

### slack:reaction_added (trigger) — Reaction Added
No findings — optional emoji text (bare/colon both accepted) + optional channel picker; OK.

### slack:reaction_removed (trigger) — Reaction Removed
No findings — mirror of Reaction Added; OK.

### slack:channel_created (trigger) — Channel Created
No findings — zero-config trigger; OK.

### slack:member_joined_channel (trigger) — Member Joined Channel
No findings — optional channel picker; OK.

### slack:member_left_channel (trigger) — Member Left Channel
No findings — optional channel picker; OK.

### slack:file_shared (trigger) — File Uploaded
No findings — optional channel picker; OK.

---

## eden — actions

### eden:list_workspaces (action) — List Workspaces
No findings — zero-config; OK.

### eden:list_schedules (action) — List Schedules
No findings — single optional workspace picker with default-workspace fallback; OK.

### eden:list_scheduled_posts (action) — List Scheduled Posts
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| status | text, "e.g. queued, sent" | Provider-defined enum typed blind; user can't discover values beyond the two examples (outputs elsewhere mention draft/scheduled/publishing/posted too) | filtering | conditional-option | Convert text→select with live-verified Eden status values (queued, sent, draft at minimum — verify against Eden before shipping) [needs provider verification] | — | empty = no filter | value stays plain string | low — select emits same strings |
| workspaceId, limit | picker / number | OK | — | picker / safe-default | keep | — | — | — | none |
| (schema note) | `scheduleId` accepted by ListScheduledPostsConfigSchema but not exposed in meta | Missing optional filter — not a UX bug, noted for completeness | — | — | optionally add a Schedule combobox later | — | — | — | none |

### eden:create_board (action) — Create Board
No findings — workspace picker + plain title; OK.

### eden:create_note (action) — Create Note
No findings — workspace→board cascading pickers (dependsOn), optional title/content; exemplary.

### eden:read_board (action) — Read Board
No findings — cascading pickers; OK.

### eden:trash_board (action) — Trash Board
No findings — cascading pickers; destructive intent clear from name+copy; OK.

### eden:list_boards (action) — List Boards
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| cursor | text, "Pagination cursor from a previous call's nextCursor" | Loop-plumbing in the normal path | pagination loops | advanced-user-control | — | `advanced: true` | — | opaque string unchanged | none |
| workspaceId, limit | OK | — | — | picker / safe-default | keep | — | — | — | none |

### eden:list_board_items (action) — List Board Items
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| cursor | text | same pagination plumbing | loops | advanced-user-control | — | `advanced: true` | — | unchanged | none |
| workspaceId, boardId, limit | pickers / number | OK | — | — | keep | — | — | — | none |

### eden:rename_board (action) — Rename Board
No findings — cascading pickers + plain new-name; OK.

### eden:save_links_to_board (action) — Save Links to Board
No findings — cascading pickers + URL string-array with clear placeholder; OK.

### eden:create_scheduling_draft (action) — Create Scheduling Draft
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| youtubeTitle | text always visible; "Required when posting to YouTube" | Conditional requirement stated in prose; visible to the 7/8 of users not posting Shorts | Shorts titling | conditional-option | `visibleWhen: { field: "platforms", valueIn: ["youtube"] }` IF visibleWhen matching supports multi-select contains; else keep visible (empty platforms falls back to schedule platforms — don't hide wrongly) | — | — | key/value unchanged; required-when-visible semantics per new infra | low — hide-only |
| segments | string-array always visible | Only meaningful for X/Threads; auto-split default already covers normal users | thread control | conditional-option | same visibleWhen approach for ["twitter","threads"], same caveat | — | auto-split is the honest default (documented) | unchanged | low |
| workspaceId, scheduleId, platforms, text, media, timezone | pickers / multi-select w/ 8 labeled options / textarea / object-list(url,mimeType,alt) / timezone | All good — platforms options verified in `_fields.ts`; media is proper structured composition | — | various | keep | — | schedule defaults documented | — | none |
| idempotencyKey | text ADV | Already correctly advanced with honest "leave empty" copy | retry semantics | advanced-user-control | — | keep | auto-generated per-run key | — | none |

### eden:read_note (action) — Read Note
No findings — cascading workspace→note pickers; OK.

### eden:append_to_note (action) — Append to Note
No findings — pickers + Markdown textarea; OK.

### eden:read_scheduled_post (action) — Read Scheduled Post
No findings — `eden:scheduled_posts` picker with paste fallback; OK.

### eden:update_note (action) — Rewrite Note
No findings — "will REPLACE the note's current body" is exactly the right warning emphasis; OK.

### eden:schedule_post (action) — Schedule Post
Same content-field set as Create Scheduling Draft (shared `_fields.ts`) — same two conditional-option findings (youtubeTitle, segments visibleWhen candidates). Additional field:
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| scheduledAtIso | datetime-utc REQ, "Must be in the future" | OK — right widget, plain copy, Q11-correct (no default publish time) | — | core-user-decision | keep | — | none (Q11) | ISO string unchanged | none |

### eden:publish_post_now (action) — Publish Post Now
Same shared content-field set — same two conditional-option findings (youtubeTitle, segments); all other fields OK. `timezone` is near-meaningless for publish-now but harmless (schema accepts it; LOW: could be `advanced: true`).

### eden:rename_note (action) — Rename Note
No findings — pickers + plain new-title; OK.

### eden:create_sticky_note (action) — Create Sticky Note
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| color | text, "e.g. yellow" | Provider palette typed blind — one example, no value list (schema is bare z.string()) | theming | conditional-option | Convert text→select with Eden's real color palette [needs provider verification — do NOT invent values]; until verified, improve desc: "Sticky color as Eden names it (e.g. yellow). Leave empty for the default." | — | empty = Eden default | plain string unchanged | low |
| workspaceId, boardId, content | pickers / textarea | OK | — | — | keep | — | — | — | none |

### eden:update_scheduled_post (action) — Update Scheduled Post
Shared content fields — same youtubeTitle/segments conditional-option findings. Others:
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| postId | combobox `eden:scheduled_posts` | OK | — | provider-resource-selection | keep | — | — | — | none |
| scheduleId | combobox ADV "Schedule guard" | Already correctly advanced; guard semantics explained | mismatch protection | advanced-user-control | — | keep | — | — | none |
| text | textarea optional, "Leave empty to keep the current text" | Good partial-update copy | — | core-user-decision | keep | — | keep-current documented | — | none |

### eden:list_notes (action) — List Notes
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| cursor | text | pagination plumbing | loops | advanced-user-control | — | `advanced: true` | — | unchanged | none |
| workspaceId, limit | OK | — | — | — | keep | — | — | — | none |

### eden:reschedule_post (action) — Reschedule Post
No findings — post picker, datetime-utc "must be in the future", optional timezone, guard already advanced; OK.

### eden:search_items (action) — Search Workspace Items
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| type | text, "e.g. note, canvas" | Provider item-type enum typed blind (schema bare string; meta's own outputs list types note/link/board…) | filtering | conditional-option | Convert text→select with verified Eden item types (note, canvas, board, link — verify the exact set live) [needs provider verification] | — | empty = all types | plain string unchanged | low |
| cursor | text | pagination plumbing | loops | advanced-user-control | — | `advanced: true` | — | unchanged | none |
| workspaceId, query, limit | OK | — | — | — | keep | — | — | — | none |

### eden:set_first_comment (action) — Set First Comment
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| afterLikes / delayMinutes | two numbers, each desc says "Cannot be combined with…" | Mutual exclusion enforced only in prose; user can fill both and fail at run time | comment timing | conditional-option | Keep both visible; add a shared warning line; a future either/or control would be ideal but no current field type expresses it — accept prose + validation | — | empty = post immediately after publish | numbers unchanged | none |
| postId, comment | picker / textarea ("leave empty to remove") | OK | — | — | keep | — | — | — | none |

### eden:cancel_scheduled_post (action) — Cancel Scheduled Post
No findings — post picker + guard already advanced; OK.

### eden:read_content (action) — Read Social Post
No findings — fields OK as-is: URL is the natural user input; `includeTranscript` required boolean with honest "slower" tradeoff (explicit choice is defensible — behavior/latency-switching); optional workspace context. (LOW polish: `includeTranscript` could take `defaultValue: false` as a visible non-silent default; not required.)

### eden:list_captures (action) — List Captures
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| status | text, "Optional capture status to filter by." | Worst enum-blind field in the group — zero example values; user cannot use it at all without provider docs | filtering | conditional-option | Convert text→select with live-verified capture statuses; until verified at least add examples to the desc [needs provider verification] | — | empty = all | string unchanged | low |
| offset | number | pagination plumbing | loops | advanced-user-control | — | `advanced: true` | — | unchanged | none |
| workspaceId, limit | OK | — | — | — | keep | — | — | — | none |

### eden:list_highlights (action) — List Highlights
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| orderBy | text, "Optional ordering (provider-defined)." | "(provider-defined)" tells the user to go read Eden's docs — the definition of implementation leak | sorting | advanced-user-control | — | `advanced: true` + desc "Sort order key as Eden accepts it (leave empty for the default order)." — or select once values are live-verified | — | string unchanged | none |
| offset | number | pagination plumbing | loops | advanced-user-control | — | `advanced: true` | — | unchanged | none |
| limit | number | OK | — | safe-default | keep | — | — | — | none |

### eden:list_prompts (action) — List Saved Prompts & Skills
No findings — single optional workspace picker; OK.

### eden:get_prompt (action) — Read Saved Prompt
No findings — cascading workspace→prompt pickers; OK.

### eden:export_skill (action) — Export Saved Prompt (Markdown)
No findings — same cascading pickers; OK.

### eden:list_creator_lists (action) — List Creator Lists
No findings — single optional workspace picker; OK.

### eden:resolve_creator (action) — Resolve Creator
No findings — fields OK as-is: plain "Handle or name" query, platform select with 7 labeled options (verified in meta), bounded limit.

### eden:research_creator (action) — Research Creator
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| since | text, "Optional ISO date to analyze from.", ph "2026-01-01" | Asks the user to hand-type an ISO date when a `date` field type exists | analysis window | conditional-option | Convert text→`date` field, desc "Only analyze posts published on or after this date." | — | empty = full history | must confirm the date renderer commits a plain `YYYY-MM-DD` string (schema is z.string()) | low — verify commit format first |
| query, platform, topPostLimit, workspaceId | text / select / number / picker | OK | — | — | keep | — | — | — | none |

### eden:following_overview (action) — Following Overview
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| platform | text, "e.g. youtube" | Inconsistent: sibling creator actions ship a labeled platform SELECT; here the same concept is free text | filtering | conditional-option | Convert text→select reusing resolve_creator's exact option list (youtube, twitter, tiktok, instagram, linkedin, threads, substack) | — | empty = all platforms | select emits same lowercase strings the schema already accepts | none |
| workspaceId, limit | OK | — | — | — | keep | — | — | — | none |

---

## Change list

### HIGH
1. `integrations/slack/actions/channels/inviteUsersToChannel.meta.ts` — field `users`: add `optionsSource: "slack:users"`, `allowManualEntry: true`; replace description with: "Pick the people to invite, or paste / wire user ids from an earlier step." (Resolver exists + registered; per-chip string-array pattern proven by gmail `labelIds`. Runtime unchanged — chips save the same U-id strings.)

### MEDIUM
2. `integrations/eden/actions/creators/followingOverview.meta.ts` — field `platform`: convert text→select with resolve_creator's exact 7 options; description: "Only include follows on this platform. Leave empty for all platforms."
3. `integrations/eden/actions/content/listHighlights.meta.ts` — field `orderBy`: `advanced: true`; description: "Sort order key as Eden accepts it. Leave empty for the default order."
4. `integrations/eden/actions/content/listCaptures.meta.ts` — field `status`: convert text→select with live-verified Eden capture statuses [needs provider verification]; interim: add example values to the description.
5. `integrations/eden/actions/scheduling/listScheduledPosts.meta.ts` — field `status`: convert text→select with live-verified statuses (queued, sent, draft, …) [needs provider verification].
6. `integrations/eden/actions/notes/searchItems.meta.ts` — field `type`: convert text→select with live-verified item types (note, canvas, board, link, …) [needs provider verification].
7. `integrations/eden/actions/notes/createStickyNote.meta.ts` — field `color`: convert text→select with Eden's verified palette [needs provider verification]; interim description: "Sticky color as Eden names it (e.g. yellow). Leave empty for the default."
8. `integrations/eden/actions/scheduling/_fields.ts` — fields `youtubeTitle` + `segments`: add `visibleWhen` on `platforms` (`["youtube"]` / `["twitter","threads"]`) IF visibleWhen supports multi-select contains AND only-when-platforms-nonempty; otherwise leave visible (empty platforms defers to schedule platforms — hiding would mislead). Applies to all 4 posting actions via the shared fragment.
9. `integrations/slack/actions/getMessages.meta.ts`, `getThreadMessages.meta.ts`, `listScheduledMessages.meta.ts` — fields `oldest`, `latest` (6 fields): `advanced: true`.
10. `integrations/eden` list actions — pagination plumbing to Advanced: `cursor` in `listBoards`, `listBoardItems` (boards), `listNotes`, `searchItems` (notes); `offset` in `listCaptures`, `listHighlights` (content): `advanced: true` on all 6.
11. `integrations/slack/actions/channels/listChannels.meta.ts` — `kind`: `defaultValue: "public"`, description: "Which channels to include. Public only unless you choose otherwise."; `excludeArchived`: `defaultValue: true`, description: "Skip archived channels (recommended)." (Both mirror existing handler defaults — zero behavior change.)
12. `integrations/slack/actions/scheduleMessage.meta.ts` — field `postAt` description → "When Slack should post the message (UTC). A pasted ISO time with an explicit offset, or Unix seconds, also works." (Q11: stays required, no default.)
13. `integrations/slack/actions/channels/unarchiveChannel.meta.ts` — field `channel`: point at a NEW archived-channels resolver variant (`slack:channels_archived`, conversations.list with exclude_archived=false — scopes already granted) [new-resolver].
14. `integrations/slack/actions/postInteractiveBlocks.meta.ts` — field `blocks`: resolve the required-but-advanced tension when the Advanced tab ships — either remove `advanced: true` (it is the node's core input) or guarantee setup UI deep-links to required advanced fields.
15. `integrations/eden/actions/creators/researchCreator.meta.ts` — field `since`: convert text→`date` (desc: "Only analyze posts published on or after this date.") after confirming the date renderer commits a plain `YYYY-MM-DD` string.

### LOW
16. `integrations/slack/actions/files/uploadFile.meta.ts` — `initialComment` desc → "Optional message shown with the file in the channel."; `threadTs` desc → "Optional. Wire the `ts` output of an earlier Slack message step to share the file as a reply in that thread."
17. `integrations/slack/actions/sendDirectMessage.meta.ts` — `userId` desc → "Who receives the DM. Pick a person, or wire a user from an earlier step (e.g. `{{trigger.user}}`)."
18. Standardize the remaining `threadTs`/`ts` descriptions (sendChannelMessage, updateMessage, deleteMessage, addReaction, removeReaction, pinMessage, unpinMessage, scheduleMessage) to one outcome-first sentence: "Paste or wire the `ts` output of an earlier Slack message step."
19. Optional NEW resolver `slack:files` (files.list, `files:read` granted) → combobox for `downloadFile.fileId` + `getFileInfo.fileId` [new-resolver]; current wired-from-trigger flow already works.
20. `integrations/eden/actions/scheduling/publishPostNow.meta.ts` — `timezone`: `advanced: true` (near-meaningless for publish-now).
21. `integrations/eden/actions/content/readContent.meta.ts` — `includeTranscript`: optional visible `defaultValue: false` (non-silent; keeps the explicit-choice spirit).
22. Emoji picker for slack reaction fields (add/remove actions + both reaction triggers) — polish only; current normalize-both-forms text input is serviceable.

## Counts

- Nodes audited: **77** (slack 41 = 31 actions + 10 triggers; eden 36 actions)
- Fields audited: **210** (slack 86, eden 124)
- Fields OK as-is: **~168** (80%) — the channel/workspace/board/note/post picker infrastructure and Q11 booleans are consistently excellent
- Findings: **HIGH 1** (invite users field ignores its own existing resolver) · **MEDIUM 24 fields across 14 change-list entries** (6 eden enum-blind text fields, 12 pagination/window fields → Advanced, 2 invisible handler defaults, postAt copy, unarchive picker gap, required-advanced blocks tension, since→date) · **LOW ~17 fields** (copy standardization, optional pickers, polish)
