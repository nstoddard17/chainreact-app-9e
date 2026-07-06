# Asana + Typeform Catalog Audit

**Date:** 2026-07-06
**Type:** Provider catalog/scope audit (docs-only, no code changed)
**Providers:** `asana`, `typeform`
**Status of both providers:** live-complete, launch-ready as shipped
**Verdict (both):** shipped slice is acceptable; follow-up recommended after launch

This audit compares the full official-API capability catalog for each provider against
what actually shipped in ChainReactV2, and records the recommended follow-up slices.
No follow-up actions/triggers are implemented. Follow-ups are after-launch / product-scope
work unless Marcus explicitly approves earlier.

A framing fact drives every scope recommendation below: **Asana's app is registered under
the granular-scope model (8 discrete scopes), not the legacy `default` full-access model.**
Any follow-up touching a new resource family requires adding a granular scope in the Asana
console *and re-consenting existing users*. Typeform is likewise least-privilege (4 scopes).
So "does this need a new scope" is a real gating question for both, flagged per row.

---

## Part 1 — Asana

### Current shipped (confirmed against repo)

- **Actions:** `create_task`, `update_task`, `complete_task`, `add_comment_to_task`, `get_task`
- **Triggers:** `new_task_in_project`, `task_updated_in_project` (project-scoped webhooks;
  `X-Hook-Secret` handshake + `X-Hook-Signature` HMAC-SHA256 verification)
- **Option sources:** `workspaces`, `projects`, `users`, `tasks`
- **Scopes:** `tasks:read`, `tasks:write`, `stories:write`, `projects:read`, `users:read`,
  `workspaces:read`, `webhooks:write`, `webhooks:delete`
- **Live-cert:** LIVE-verified 2026-07-04 (commit `64795582a`). Double-fire dedup bug found
  (task+added delivered once per parent: project + section), fixed to task-scoped dedup key,
  deploy-gated retest confirmed exactly one run per trigger.
- **Sections deliberately deferred** at ship for scope ambiguity.

### Candidate triggers

| Candidate trigger | Asana source/event/API | User value | Feasibility | Risk | Ship now? |
|---|---|---|---|---|---|
| New task in project | Project webhook, filter `task/added` | High | Shipped | Low | Shipped |
| Task updated in project | Project webhook, `task/changed` | High | Shipped (intentionally chatty) | Low | Shipped |
| Task completed | Filter `task/changed, fields:["completed"]` + post-fetch bool | High | Buildable, no new scope | Low | Follow-up (after launch) |
| Comment/story added to task | Filter `story/added, resource_subtype:comment_added` + post-fetch text | High | Needs **stories:read** (only stories:write held) | Low | Follow-up (after launch) |
| Task assigned | Filter `fields:["assignee"]`; `change.new_value` = new assignee gid | Med-High | Buildable, no new scope | Low | Follow-up (after launch) |
| Due date changed | Filter `fields:["due_on","due_at"]` + post-fetch | Medium | Buildable, no new scope | Low | Later |
| Task moved to section | Filter `fields:["memberships"]`; diff added/removed | Medium | Needs sections resolved + diff | Med (can't filter to one section) | Later |
| Custom field changed | Filter `fields:["custom_fields"]` + diff + post-fetch | Medium | Premium + custom_fields:read | Med | Do not add yet |
| Project created | Workspace/team webhook (filters mandatory), `project/added` | Low-Med | Buildable, no new scope | Low-Med (fan-out volume) | Later |
| Project updated | Project webhook `project/changed` | Low | Buildable | Low | Later |
| Attachment added | Filter `attachment/added` | Low-Med | attachments:read for detail | Low | Later |
| Task due soon / overdue | No webhook; poll search (Premium) or per-project list | Med-High | Needs polling infra (not built) + Premium | Med | Do not add yet |

**Compact-event note:** Asana events carry gid + a `change` object only. completed/due/assignee/
section triggers need one post-fetch to read the actual new value. Section-move and custom-field
triggers additionally require diffing `added_value`/`removed_value` — you cannot filter to a
single section or custom-field id at the webhook layer.

### Candidate actions

| Candidate action | Asana endpoint/API | User value | Feasibility | Risk | Ship now? |
|---|---|---|---|---|---|
| Create task | `POST /tasks` | High | Shipped | Low | Shipped |
| Update task | `PUT /tasks/{gid}` | High | Shipped | Low | Shipped |
| Complete task | `PUT /tasks/{gid} {completed:true}` | High | Shipped | Low | Shipped |
| Get task | `GET /tasks/{gid}` | High | Shipped | Low | Shipped |
| Add comment to task | `POST /tasks/{gid}/stories` | High | Shipped | Low | Shipped |
| Create subtask | `POST /tasks/{parent}/subtasks` | High | No new scope (tasks:write held) | Low | Follow-up (after launch) |
| List/get tasks in project | `GET /projects/{gid}/tasks` | High | No new scope, free-plan safe | Low | Follow-up (after launch) |
| Assign task | `PUT /tasks/{gid} {assignee}` | Med | Already covered by update_task | — | Not needed (redundant) |
| Set due date | `PUT /tasks/{gid} {due_on}` | Med | Already covered by update_task | — | Not needed (redundant) |
| Add task to section | `POST /sections/{gid}/addTask` | Med-High | Needs sections option source (scope ambiguity) | Med | Follow-up, pending scope verification |
| Add/remove task from project | `POST /tasks/{gid}/addProject` / `removeProject` | Med | No new scope | Low | Later |
| Search tasks | `GET /workspaces/{gid}/tasks/search` | Med | Premium-only (402 free), 60/min, no offset paging | Med | Do not add yet |
| Set custom fields | `PUT /tasks/{gid} {custom_fields}` | Med | Premium + custom_fields:read/write + enum-gid nuance | Med | Do not add yet |
| Create project | `POST /projects` | Low-Med | Needs projects:write (new scope) | Low-Med | Later |
| List sections | `GET /projects/{gid}/sections` | Med (option source) | Scope ambiguity — deferred | Med | Follow-up, pending verification |
| Create section | `POST /projects/{gid}/sections` | Low | New scope likely | Low | Later |
| List custom fields | `GET /projects/{gid}/custom_field_settings` | Med | Premium + custom_fields:read | Low | With custom-fields work |
| Add tag to task | `POST /tasks/{gid}/addTag` | Low | Needs tags:read/write | Low | Later |
| Upload attachment | `POST /attachments` (multipart, 100MB) | Med | Needs attachments:write + multipart | Med | Later |
| Create project status update | `POST /status_updates` | Low | New scope | Low | Later |
| Delete task | `DELETE /tasks/{gid}` | Low | Destructive/irreversible | High | Do not add (destructive) |

### Candidate option sources

| Option source | Needed by | API support | Notes |
|---|---|---|---|
| workspaces | cascade root | `GET /workspaces` | Shipped |
| projects | project pickers | `GET /projects?workspace=` | Shipped; docs warn timeout on large domains |
| users | assignee pickers | `GET /users?workspace=` | Shipped; labels are names only (no email/PII) |
| tasks | task pickers | `GET /projects/{gid}/tasks` | Shipped |
| sections | add-to-section action, section-move trigger | `GET /projects/{gid}/sections` | Deferred — scope ambiguity. Verify projects:read coverage first |
| custom fields | set-CF action, CF trigger | `GET /projects/{gid}/custom_field_settings` | Premium + custom_fields:read |
| custom field options (enum) | enum CF values (gids not text) | from CF settings payload | With CF work |
| tags | add-tag action | `GET /workspaces/{gid}/tags` | Needs tags:read |
| teams | project-create scoping | `GET /workspaces/{gid}/teams` | Needs teams:read |
| project templates | template-based create | `GET .../project_templates` | Needs project_templates:read; low value |
| portfolios / goals | — | `GET /portfolios`, `/goals` | Enterprise/Advanced tier — no clear value yet, skip |

### Gap analysis

- **Right first slice?** Yes. Task create/update/complete/get + comment + the two core project
  webhook triggers is the coherent 80% of Asana automation and it is live-certified.
- **Missing useful items:** `task_completed`, `comment_added_to_task`, `task_assigned` triggers;
  `create_subtask`, `list tasks in project` actions; the sections family.
- **Must-have before launch?** None. Every gap is additive, not a coverage/correctness hole.
- **Scopes enough?** Yes for shipped. Follow-ups: subtask/list-tasks and completed/assigned/due
  triggers need no new scope. `comment_added` needs `stories:read`. Custom fields need
  `custom_fields:read/write` (+Premium). `create_project` needs `projects:write`. Attachments
  need `attachments:write`. Granular model → batch scope additions into one re-consent.
- **Destructive/risky additions?** `delete_task` (irreversible — do not add). Search (Premium
  402, tight limits). Custom fields (Premium + gid nuance).
- **Live-certifiable safely?** Yes — reuse the shipped handshake/signature/drain harness.
- **Cleanup requirements?** New triggers reuse the existing 404-proven webhook DELETE lifecycle.
  Read/write actions have no resources to clean up.
- **Rename/expand current?** `update_task` already subsumes "assign task" and "set due date" — do
  not ship those separately. Later: expand `update_task` to clear fields to empty (today empty
  string = "not provided"); `add_comment_to_task` to support `html_text`.
- **Beyond project/task scope yet?** No. Defer portfolios/goals/status-updates indefinitely.

### Recommended Asana follow-up slice

**Add before launch:** none required.

**Add later:**
- Triggers: `task_completed` (fields:["completed"] + post-fetch; no new scope);
  `comment_added_to_task` (story/added filter; +stories:read); `task_assigned`
  (fields:["assignee"]; no new scope); `due_date_changed` (fields:["due_on"]; no new scope)
- Actions: `create_subtask` (no new scope); `list_tasks_in_project` (no new scope);
  `add_task_to_section` (pending sections scope verification)
- Option sources: `sections` (verify projects:read covers `GET /projects/{gid}/sections` FIRST;
  then unblocks add-to-section action + section-move trigger)
- Tests: handler + activation/receive/normalize unit suites mirroring the shipped pattern;
  dedup-key regression tests
- Live smoke: reuse the existing webhook handshake/drain harness; certify exactly-once fire

**Do not add:** `delete_task` (destructive); `search_tasks` (Premium 402, 60/min, no offset
paging); `set_custom_fields` + CF trigger (Premium + new scopes + enum-gid/diff complexity);
`task_due_soon` (no webhook; needs polling infra); portfolios/goals/project-status (enterprise-
tier); standalone assign/set-due actions (already covered by update_task).

**Reasoning:** The shipped slice is a complete, coherent task-automation surface. Follow-ups are
additive value, not launch gaps. Granular-scope model means batch scope additions into a single
re-consent. Sections is the highest-leverage next unlock but is genuinely blocked on a scope
question that must be answered before building — do not guess.

**Asana verdict:** `shipped slice is acceptable, but follow-up recommended after launch`

---

## Part 2 — Typeform

### Current shipped (confirmed against repo)

- **Actions:** none (deliberate — the `form_response` webhook payload is self-contained:
  answers, hidden fields, `definition`, `calculated.score`)
- **Triggers:** `new_response_in_form` (per-form webhook; V2-minted secret; `Typeform-Signature`
  base64 HMAC-SHA256 with `sha256=` prefix; token-scoped dedup; PUT/DELETE lifecycle)
- **Option sources:** `forms`
- **Scopes:** `accounts:read`, `forms:read`, `webhooks:write`, `offline`
- **Live-cert:** LIVE-COMPLETE 2026-07-04 (commits `84921bc35`, `c649c776f`). `event_types`
  proven optional (omit → standard `form_response`); rotation persisted live; exactly-one run.
- **Known:** draft forms appear in picker but cannot receive responses; one harmless leftover
  test response; EU data center (`api.eu.typeform.com`) unsupported.

### Candidate triggers

| Candidate trigger | Typeform source/event/API | User value | Feasibility | Risk | Ship now? |
|---|---|---|---|---|---|
| New full response | Webhook `form_response` event | High | Shipped | Low | Shipped |
| Partial response submitted | `form_response_partial` on same webhook | Low-Med | Plan-gated; no partial-only subscription; fires partials + full, multiple per respondent | Med-High (duplicate/confusing) | Do not add |
| Form created/updated | No webhook event for form lifecycle | Low | Not webhook-supported; would need polling | Low | Do not add |
| Payment/score-enriched response | Inside `form_response` payload | — | Already delivered by shipped trigger | — | Covered |
| Polling-based response trigger | `GET /forms/{id}/responses` on schedule | Low | Webhook already covers this better; 2 rps | Med | Do not add (webhook-first) |

**Partial-response detail:** Typeform supports `form_response_partial` only as an *additional*
`event_type` on the same webhook — there is no partial-only subscription. Enabling it fires one
delivery per Partial Submit Point crossed **plus** the final `form_response`, so a single
respondent can fire 2+ times. It is plan-gated (higher tiers). If ever built it must be a
**separate trigger** with explicit `event_type` + `token` dedup, never an option toggle on the
existing trigger. The shipped receive helper already quiet-acks `form_response_partial` as
`ignored_event`.

### Candidate actions

| Candidate action | Typeform endpoint/API | User value | Feasibility | Risk | Ship now? |
|---|---|---|---|---|---|
| List responses | `GET /forms/{id}/responses` | Med (backfill / digest) | Needs **responses:read** (new scope) | Low | Follow-up (after launch) |
| Get single response | Same endpoint w/ `included_response_ids` (no dedicated GET-one) | Med | responses:read | Low | Follow-up (after launch) |
| Delete response | `DELETE /forms/{id}/responses` | Low | Destructive/irreversible, async (200≠done), responses:write | High | Do not add |
| Get form | `GET /forms/{id}` | Low-Med | forms:read already held | Low | Later (low value) |
| List forms | `GET /forms` | Low (already an option source) | Held scope | Low | Not needed as action |
| Create form | `POST /forms` | Low | High surface, forms:write | Med | Do not add yet |
| Update form | `PUT /forms/{id}` | Low | forms:write | Med | Do not add yet |
| Publish form | No publish action; no draft/published status field | — | Not supported by API | — | Not buildable |
| Create/update webhook | `PUT /forms/{id}/webhooks/{tag}` | None (internal lifecycle) | Already used internally | — | Do not expose |
| List/get webhooks | `GET /forms/{id}/webhooks` | Low (diagnostics) | Needs webhooks:read (not held) | Low | Do not add |
| Themes / images | Themes/Images API | None for automation | — | Low | Do not add |
| Response export/reporting | Built on list responses | Low | Same as list | Low | Later |

### Candidate option sources

| Option source | Needed by | API support | Notes |
|---|---|---|---|
| forms | trigger formId + any form-scoped action | `GET /forms` (forms:read) | Shipped; server-side search pass-through; lists draft forms |
| fields/questions | response-field mapping UX | webhook `definition` / `GET /forms/{id}` | Not needed while payload self-contained |
| response tokens | get/delete response pickers | `GET /forms/{id}/responses` | Only if read/delete actions ship (responses:read) |
| response query filters | list-responses filtering | list endpoint params (since/until/query/response_type) | With list-responses action |
| workspaces | forms picker refinement for many-form accounts | `GET /workspaces` (workspaces:read — new scope) | Optional; `GET /forms` already takes workspace_id |
| themes/images | future Create API | Themes/Images API | Not useful — skip |

### Gap analysis

- **Right first slice?** Yes. A signature-verified, self-contained webhook trigger is the ~95%
  Typeform automation use case. Live-certified.
- **Zero actions acceptable after full review?** Yes. The `form_response` payload is self-
  contained, so no read action is needed to interpret a submission. The only defensible gap is
  on-demand/backfill response reads — a value-add, not a coverage hole.
- **Must-have before launch?** None functional. The one launch-worthy item is UX polish, not an
  action/trigger (draft-form clarity).
- **Scopes enough?** Yes for the shipped trigger. list/get responses need `responses:read`;
  delete needs `responses:write`; create/update form need `forms:write`. All new scopes.
- **Destructive/risky?** `DELETE responses` and `DELETE /forms` are irreversible with no restore
  endpoint and async semantics — do not ship. Create/update form is high-surface, low value.
- **Live-certifiable safely?** Read actions yes (read-only, no cleanup). Write/delete not worth
  it now.
- **Cleanup requirements?** Read actions: none.
- **Draft forms — hide or label before launch?** The API does **not** expose a reliable
  draft/published flag — only `settings.is_public` (public/private), whose relationship to
  response intake is undocumented. Neither reliable hiding nor accurate labeling is implementable
  from API data. Best feasible: a **static helper hint** on the field ("Draft/unpublished forms
  won't receive responses until published"). Low-effort, non-blocking, optional before-launch
  polish. Do not attempt data-driven filtering — it would be guessing.
- **Partial responses before launch or later?** Later, if ever, and only as a separate plan-gated
  trigger with its own dedup.
- **Read-action family needed to be "complete enough"?** No for launch. Reasonable first
  after-launch follow-up.

### Recommended Typeform follow-up slice

**Add before launch:** none required. Optional non-blocking UX polish: static helper hint on the
forms picker noting draft/unpublished forms can't receive responses (no new scope, no API dep).

**Add later:**
- Actions: `list_responses` + `get_response` (`GET /forms/{id}/responses`; +responses:read) for
  backfill / on-demand / scheduled-digest workflows
- Option sources: response query filters (since/until/response_type/query) alongside
  list_responses; optionally workspaces (`GET /workspaces`; +workspaces:read) if many-form
  accounts need picker refinement
- Tests: handler unit suites + no-leak tests (responses carry PII → mark sensitive)
- Live smoke: read-only cert against a live form with existing responses

**Do not add:** partial-response trigger (plan-gated; no partial-only; duplicate deliveries);
`delete_response` / `delete_form` (destructive, irreversible, async, no restore); `create_form` /
`update_form` (high surface, low value, forms:write); `publish_form` (no such API action; no
draft/published status field); themes/images actions (no automation value); expose webhook
create/list as user actions (internal lifecycle only).

**Reasoning:** The self-contained webhook payload makes the shipped trigger genuinely complete for
the core use case; read actions are additive, not corrective. Every meaningful follow-up needs a
new least-privilege scope (responses:read) → batch into one re-consent. Draft-form UX can only be
a static hint because the API exposes no reliable draft flag — anything else would be fabricated
status.

**Typeform verdict:** `shipped slice is acceptable, but follow-up recommended after launch`

---

## Combined closeout

**Status:** complete · **Code changed:** no · **Push status:** nothing pushed

### Before-launch work
| Provider | Add | Why |
|---|---|---|
| Asana | (none required) | Shipped slice covers launch; all gaps are additive |
| Typeform | Optional: static "draft forms won't receive responses" hint on forms picker | Live-observed confusion; low-effort UX; no API dependency (API has no reliable draft flag) |

### After-launch follow-ups
| Provider | Add | Why |
|---|---|---|
| Asana | task_completed trigger; comment_added_to_task trigger (+stories:read) | Common automation triggers; reuse shipped webhook harness |
| Asana | create_subtask; list_tasks_in_project actions | No new scope; high value |
| Asana | sections option source + add_task_to_section (after scope verification) | Highest-leverage unlock; blocked on projects:read coverage question |
| Typeform | list_responses + get_response actions (+responses:read) | On-demand / backfill / digest workflows |

### Do not build yet
| Provider | Item | Reason |
|---|---|---|
| Asana | delete_task | Destructive/irreversible |
| Asana | search_tasks | Premium-only (402 free), 60/min, no offset paging |
| Asana | set_custom_fields + CF trigger | Premium-gated + new scopes + enum-gid/diff complexity |
| Asana | task_due_soon | No webhook; needs polling infra not built |
| Asana | portfolios/goals/status-updates | Enterprise-tier, low ChainReact value |
| Typeform | partial-response trigger | Plan-gated; no partial-only subscription; duplicate deliveries per respondent |
| Typeform | delete_response / delete_form | Destructive, irreversible, async, no restore |
| Typeform | create/update/publish form | High surface / low value; publish has no API action |

### Scope approval needed from Marcus
- Asana is granular-scoped: comment_added needs `stories:read`; create_project needs
  `projects:write`; custom fields need `custom_fields:read/write`; attachments need
  `attachments:write`. Batch into ONE re-consent when a follow-up slice is approved.
- Asana sections: verify whether `projects:read` covers `GET /projects/{gid}/sections` BEFORE
  building (reason it was deferred at ship).
- Typeform read actions need a new `responses:read` scope (re-consent).
- Approve whether the Typeform draft-form hint ships as pre-launch polish.

### Sources reviewed
- **Asana:** developers.asana.com — webhooks guide, createwebhook, getevents, updatewebhook,
  oauth-scopes, oauth, rate-limits, pagination, searchtasks, custom-fields guide, create/update
  task, addProject, addTaskForSection, createStory, createAttachment, createPortfolio, project
  custom fields.
- **Typeform:** typeform.com/developers — webhooks (+create-or-update, example-payload,
  secure-your-webhooks), responses (retrieve, delete), create (+create-form, retrieve-workspaces),
  get-started (scopes, applications), Help Center webhooks + partial submit points.
- **ChainReactV2 repo:** integrations/asana/** and integrations/typeform/** manifests, actions,
  triggers, options, oauth; docs/providers/asana/owner-setup-report.md;
  docs/slices/phase-5/typeform-provider-closeout.md; live-cert commits 64795582a (Asana),
  84921bc35 / c649c776f (Typeform).
