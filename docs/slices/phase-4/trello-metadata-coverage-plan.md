# Trello — Builder Metadata Coverage Plan (TRELLO-META-1)

**Slice:** 4.TRELLO-META-1 (this plan) → TRELLO-META-2 (resolvers + list helpers) → TRELLO-META-3 (metas + triggers + COVERED flip)
**Type:** Doc-only audit + plan. **No runtime/metadata/test files modified by this slice.**
**Date:** 2026-05-25
**Branch:** `v2-provider-docs-1`
**Parent tracker:** [`provider-metadata-launch-gap-tracker.md`](./provider-metadata-launch-gap-tracker.md)
**Sibling precedents:** [`airtable-metadata-coverage-plan.md`](./airtable-metadata-coverage-plan.md) (resolver-first, opaque ids, combined metas+triggers+flip) + [`builder-options-multi-parent-dependencies.md`](./builder-options-multi-parent-dependencies.md).
**Standard:** V2-native COPY / ADAPT / REPLACE / DEFER / REJECT — never raw V1 handler-count parity, never blind V1 copy.

Trello is the **4th** of the 6 pending-metadata providers (after Shopify, Excel, Airtable). **Current state (code-verified):** **8 runtime actions + 6 webhook triggers** registered and real; **0 ActionMeta, 0 TriggerMeta, 0 options resolvers**; absent from the discovery registry; `/api/providers` reports `hasMetadata:false` → Trello renders as **"coming soon"**.

**Three facts drive the slice plan:**

1. **All resource ids are opaque** (`boardId`/`listId`/`cardId`/`labelId`/`memberId` are 24-hex Trello ids) → Trello is **resolvers-first** (like Excel/Airtable). A board → list/card/member/label cascade is required for a usable builder.
2. **The existing `api/` helpers are mutation-only.** `boardsCreate` / `listsCreate` / `cardsCreate|Update|AddComment|AddLabel` exist; there are **no list/get endpoints**. Every resolver needs a **new read helper** (`GET /1/members/me/boards`, `/1/boards/{id}/lists|cards|members|labels`).
3. **Most card-targeted actions carry no board field.** `create_card.listId`, `update_card.cardId`, etc. need a board context for their pickers, but the `.strict()` schemas don't include `boardId`. The V2-native fix is the **UI-scope parent field** pattern (Monday `boardId` / OneNote `notebookId` / Dropbox `folderPath`): add an optional, handler-ignored `boardId` to those strict schemas so every list/card/member/label picker is **single-dep on `boardId`** (no multi-parent needed — contrast Airtable).

---

## 1. Current Trello runtime inventory

**Manifest** ([`integrations/trello/manifest.ts`](../../../integrations/trello/manifest.ts)): id `trello`, displayName "Trello". **Token-ingest auth** (`authFlow: "token_ingest"`, `oauthFlows: ["client_authorization"]`, `tokenScope: "user"`, `apiVersion: "1"`, `refreshable: false`). Scopes: `read`, `write`, `account` (coarse — `read` already covers every resolver). Capabilities `oauth/webhookTrigger/actions: true`, `pollingTrigger: false`. `healthCheckIntervalMs: 4h`.

**API helpers** ([`integrations/trello/api/`](../../../integrations/trello/api/)): `_request` (shared `trelloRequest` — key+token URL-param auth; 401/404 mapping), `boards` (`boardsCreate` only), `lists` (`listsCreate` only), `cards` (`cardsCreate`/`cardsUpdate`/`cardsAddComment`/`cardsAddLabel`), `webhooks` (trigger lifecycle). Shared: `_shared/trello/api/{_base,errors}`, `_shared/trello/webhooks/signature`. **All `api/` helpers are mutation-only — no read/list helpers exist** (the resolver gap, §3).

### 1.1 Registered action handlers (8 — all writes; NO reads)

Source of truth: [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts) lines 693–700. `*` = required at the schema layer. "Picker" = field wanting an options resolver. **`+boardId`** = needs a UI-scope board field added (§3).

| # | Action key | File | Key config fields | Output keys | Risk | Sensitive outputs | Pickers |
|---|---|---|---|---|---|---|---|
| 1 | `create_card` | createCard.ts | listId*, name*, desc?, pos?(top\|bottom\|num), due?, dueComplete?, start?, idMembers?[], idLabels?[] | `{cardId, name, url, shortUrl, idList, idBoard, desc, due, dueComplete, start, closed, idMembers, idLabels, pos}` | create → **medium** | `desc` | **+boardId**; listId→lists; idMembers→members(multi); idLabels→labels(multi) |
| 2 | `update_card` | updateCard.ts | cardId*, name?, desc?, idList?, pos?, due?, dueComplete?, start?, closed? (**≥1 mutable required**) | same shape as create_card | update → **medium** | `desc` | **+boardId**; cardId→cards; idList→lists |
| 3 | `move_card` | moveCard.ts | cardId*, idList*, pos? | `{cardId, name, idList, idBoard, pos, url}` | update → **medium** | — | **+boardId**; cardId→cards; idList→lists |
| 4 | `archive_card` | archiveCard.ts | cardId*, closed(default true) | `{cardId, name, closed, url}` | **medium (reversible — NOT destructive-trio)** | — | **+boardId**; cardId→cards |
| 5 | `add_comment` | addComment.ts | cardId*, text* | `{commentId, text, date, memberCreatorId, memberCreatorUsername, memberCreatorFullName}` | create → **medium** | `text` (forced — SUSPICIOUS_NAMES) | **+boardId**; cardId→cards |
| 6 | `add_label_to_card` | addLabelToCard.ts | cardId*, labelId* | `{cardId, idLabels}` | update → **medium** | — | **+boardId**; cardId→cards; labelId→labels |
| 7 | `create_list` | createList.ts | idBoard*, name*, pos? | `{listId, name, idBoard, pos, closed}` | create → **medium** | — | idBoard→boards (**real field — no UI-scope**) |
| 8 | `create_board` | createBoard.ts | name*, visibility*(private\|workspace\|public), desc?, defaultLists(default false) | `{boardId, name, desc, url, shortUrl, closed, idOrganization, visibility}` | create → **medium** (visibility egress — see §2) | `desc` | none (visibility = static select) |

**Notable:** Trello's V2 runtime surface is **all writes — there are no read/get actions** (V1's `get_cards` was NOT ported). `archive_card` is **reversible** (`closed:false` unarchives), and there are **no delete actions** — so **no action qualifies for the destructive trio** (contrast Airtable `delete_record` / Excel `delete_worksheet`). V1 also had `add_checklist` + `create_checklist_item` — NOT in the V2 runtime, so no checklist resolvers are needed.

### 1.2 Registered triggers (6 — all webhook, per-board)

[`integrations/trello/triggers/`](../../../integrations/trello/triggers/) — 6 dirs, each an `index.ts` registering `registerActivation("trello", <key>, buildTrelloActivate(<key>))` + `registerDeactivation`. All 6 imported at [`integrations/_registry.ts:89-94`](../../../integrations/_registry.ts) → **activations load at module init** (the `trigger-meta-activation-invariant` passes with no `_registry` change + no exemption). Shared lifecycle in [`triggers/_shared/`](../../../integrations/trello/triggers/_shared/) (`activate`/`deactivate`/`normalize`/`notificationUrl`/`receive`).

| Trigger key | Normalized type | Model | Lifecycle | User config | Ship now? |
|---|---|---|---|---|---|
| `new_card` | trello.card.created | webhook (per-board) | `activate` → `POST /1/webhooks` (`idModel=boardId`); per-(workflow,node) webhook; **no expiry/renewal** (permanent endpoint, GitHub/Shopify pattern); `deactivate` deletes | `boardId`* | ✅ yes |
| `card_updated` | trello.card.updated | webhook | same | `boardId`* | ✅ yes |
| `card_moved` | trello.card.moved | webhook | same | `boardId`* | ✅ yes |
| `comment_added` | trello.comment.added | webhook | same | `boardId`* | ✅ yes |
| `member_changed` | trello.member.changed | webhook | same | `boardId`* | ✅ yes |
| `card_archived` | trello.card.archived | webhook | same | `boardId`* | ✅ yes |

All 6 bind to a board via one webhook; `trigger_resources.config.eventType` filters inbound Trello action types ([`normalize.ts` `classifyTrelloAction`](../../../integrations/trello/triggers/_shared/normalize.ts)). One Trello payload shape covers all 6; workflows branch on `actionType`/`classifiedType`. **All 6 ship TriggerMeta** — no blockers.

---

## 2. Builder metadata requirements (ActionMeta per action)

Pattern: co-located `<action>.meta.ts` mirroring each `.schema.ts`. **Field names camelCase**, verbatim to the runtime schemas: `listId`, `cardId`, `idList`, `idBoard`, `labelId`, `idMembers`, `idLabels`, `name`, `desc`, `pos`, `due`, `dueComplete`, `start`, `closed`, `text`, `visibility`, `defaultLists` — plus the new UI-scope `boardId` (§3).

**Common defaults:** `requiresIntegration: true`; `category: "data"` (Trello is a kanban/data tool — same call as Airtable/Excel; alternative "other" is less discoverable); sequential `displayOrder` (10..80); `producesFileRef:false`, `consumesFileRef:false` for all (no FileRef surface). _(Reminder: every `: ActionMeta` literal must set `producesFileRef`/`consumesFileRef`/`isDestructive`/`requiresConfirmation` explicitly — Zod `.default()` applies only at `.parse()`, per the AIRTABLE-META-3 learning.)_

**Risk classification — all 8 are `medium`; none destructive:**
- **medium** — every action mutates external Trello state recoverably (create card/list/board, update/move card, comment, label). `archive_card` is **reversible** (unarchive via `closed:false`) → medium, **not** the destructive trio. No `delete_*` actions exist.
- **No `low`** — there are no read actions in the surface.
- **`create_board.visibility`** is a REQUIRED explicit enum (the schema already removed V1's hidden `"private"` default — Q11). A `public` board is mild data egress, but it's a user-chosen required value and the board is recoverable (closeable). Kept **medium**. _**Open decision for Marcus** (mirrors the Excel delete-confirmation sign-off): elevate `create_board` to require confirmation when visibility=public? Recommendation: keep medium (explicit required field already forces the choice)._

**Field-type mapping** (every type from [`contracts/actionMeta.ts`](../../../contracts/actionMeta.ts) `FieldTypeSchema`):
- `boardId` (UI-scope, §3) → **combobox + `optionsSource:"trello:boards"`**. Required on the card-targeted actions (the picker can't cascade without it). `create_list.idBoard` → same resolver, no dep, real field.
- `listId` (create_card) / `idList` (move_card, update_card) → **combobox + `optionsSource:"trello:lists"`, `dependsOn:"boardId"`**.
- `cardId` (update/move/archive/comment/label) → **combobox + `optionsSource:"trello:cards"`, `dependsOn:"boardId"`** (bounded + q-filtered — a board's cards can be many; §3). cardId stays pickable but commonly flows from an upstream trigger.
- `labelId` (add_label_to_card) → **combobox + `optionsSource:"trello:labels"`, `dependsOn:"boardId"`**.
- `idMembers` / `idLabels` (create_card, `string[]`) → **combobox + `multiple:true` + `optionsSource:"trello:members"`/`"trello:labels"`, `dependsOn:"boardId"`** (optional). _Renders as a deferred multi-select until Slice 3.7 (same caveat as Airtable `list_records.fields`); optional, so blank is fine. `string-array` is the functional fallback if preferred._
- `name` / `text` / `desc` → **text** (`name`/`text`) / **textarea** (`desc` — Markdown). `text` (add_comment) is required.
- `pos` → **text** (accepts `"top"`/`"bottom"`/numeric string — a `select` would lose the numeric option; document the 3 forms in help text). Alternatively a future custom renderer; text for v1.
- `due` / `start` → **text** (ISO-8601; no datetime FieldType exists — placeholder shows the format).
- `dueComplete` / `closed` / `defaultLists` → **boolean**. `archive_card.closed` UI default `true` (matches the action name — not a Q11 hidden default).
- `visibility` (create_board) → **select** with static options `private` / `workspace` / `public`, required, **no defaultValue** (Q11).

**Sensitive outputs:** free-form user content marked sensitive — `create_card.desc`, `update_card.desc`, `create_board.desc`, `add_comment.text` (also forced — `text` ∈ SUSPICIOUS_NAMES). Card titles (`name`), ids, urls, list/board ids, positions, member ids/usernames/display names are **not** marked (short identifying labels / board-public identities — consistent with the Airtable "ids/names not over-marked" + Slack user-id precedent). `url`/`shortUrl` are shareable Trello links but not signed/secret → not marked. No secret-shaped output names exist.

**Task cost:** per the central policy ([`lib/workflows/cost-calculator.ts`](../../../lib/workflows/cost-calculator.ts) — `provider_action = 1`), each Trello action bills **1 task on success**. All 8 are writes; no read carve-out applies. No per-meta override.

---

## 3. Options resolver audit

Trello **needs resolvers** (all ids opaque). Dependency chain: **board → list / card / member / label**. Every picker is **single-dep on `boardId`** thanks to the UI-scope field — so **BUILDER-OPTIONS-1 multi-parent is NOT required** for Trello (it's available if a future `cards` narrowing wants `[boardId, listId]`).

| Resolver | Serves | Endpoint / **new helper** | requiredDeps | Ship in arc? | Hand-type fallback? |
|---|---|---|---|---|---|
| `trello:boards` | `create_list.idBoard` + the UI-scope `boardId` on the 6 card-targeted actions + all 6 triggers | **MISSING** — new `boardsList` (`GET /1/members/me/boards?fields=id,name,closed`) | none | **REQUIRED (META-2)** | No — opaque 24-hex id |
| `trello:lists` | create_card.listId, move_card.idList, update_card.idList | **MISSING** — new `listsList` (`GET /1/boards/{id}/lists?fields=id,name,closed`) | `["boardId"]` | **REQUIRED (META-2)** | No |
| `trello:cards` | update/move/archive/comment/add_label cardId | **MISSING** — new `cardsList` (`GET /1/boards/{id}/cards?fields=id,name&filter=open`) | `["boardId"]` | **RECOMMENDED (META-2)** — bounded page + q filter (a board can have many cards) | cardId often flows from a trigger; typeable as fallback |
| `trello:members` | create_card.idMembers (multi) | **MISSING** — new `membersList` (`GET /1/boards/{id}/members?fields=id,fullName,username`) | `["boardId"]` | **RECOMMENDED (META-2)** | Optional field; typeable |
| `trello:labels` | create_card.idLabels (multi) + add_label_to_card.labelId | **MISSING** — new `labelsList` (`GET /1/boards/{id}/labels?fields=id,name,color`) | `["boardId"]` | **RECOMMENDED (META-2)** | No (labelId not name-resolvable per schema) |
| `trello:checklists` / `:check_items` | — | — | — | **REJECT** — no runtime action consumes them (V1's checklist actions not ported) | n/a |

**The UI-scope `boardId` schema change (META-3, required):** add `boardId: z.string().optional()` to the 6 card-targeted `.strict()` schemas (`createCard`, `updateCard`, `moveCard`, `archiveCard`, `addComment`, `addLabelToCard`). Handler-ignored; `.strict()` still rejects genuinely-unknown fields. This is the **established Monday `boardId` / OneNote `notebookId` / Dropbox `folderPath` UI-scope pattern** ([`dropbox/actions/downloadFile.schema.ts`](../../../integrations/dropbox/actions/downloadFile.schema.ts): _"NOT used by the handler. Present so the persisted Builder config validates… Mirrors the OneNote notebookId / Monday boardId UI-scope pattern."_). It's additive + behavior-preserving (the only schema touch this arc; the task's "tiny unavoidable schema fix" clause covers it). `create_list.idBoard` (real field) + `create_board` (no board context) are exempt.

**Resolver mechanics** (per [`services/options/types.ts`](../../../services/options/types.ts); mirror the Airtable/Excel templates): each `OptionsResolver { source, provider:"trello", requiresIntegration:true, requiredDeps?, resolve(ctx) }`; `resolve` decrypts the token (Trello uses key+token URL-param auth, not `refreshAndRetry` — non-refreshable; mirror the Slack-style `decryptToken(ctx.integration.accessTokenEncrypted)` + direct wrapper call), reads `ctx.deps.boardId` + optional `ctx.q` (client-side name filter), returns `{items:[{value,label,description?}], hasMore}`. **value = the opaque id**; label = name (boards/lists/cards/labels) or fullName→username (members). Classify auth failures → `INTEGRATION_DISCONNECTED`; NotFound (board gone) → empty items; other → `PROVIDER_ERROR` (static message — never leak token/raw body/card content). _Auth note to confirm in META-2: Trello is non-refreshable, so resolvers call `trelloRequest` directly with the decrypted token rather than via `refreshAndRetry` — verify against how the action handlers + the trigger `activate` decrypt (`decryptToken(integration.accessTokenEncrypted)`)._

**Recommendation:** build all **5 resolvers + 5 new read helpers** in META-2 (`boards`/`lists` required; `cards`/`members`/`labels` strongly recommended — cheap, same transport, and avoid forcing opaque-id typing). Reject checklists. All read-only against the existing `read` scope → **no scope change, no reconnect**. Paging: Trello list endpoints are unpaginated for these resources (a board's lists/labels/members are small; cards bounded via `filter=open` + single page) → `hasMore:false` (cards may set `hasMore` if a cap is hit).

---

## 4. Trigger metadata audit

All 6 triggers are runtime-real, webhook (per-board), activation-registered + loaded → **all 6 ship TriggerMeta in this arc.** No blockers; no renewal (Trello webhooks don't expire).

Per-trigger TriggerMeta (`activation: "webhook"`, `category: "data"`, `requiresIntegration: true`):
- **Fields:** `boardId` (combobox → `trello:boards`, required) — the only runtime config (`activate` reads `node.config.boardId`). No event-type selector (each trigger IS one event type). No list filter (receive filters by eventType only). Single field, no dep.
- **payloadShape** (one shape for all 6; from [`normalize.ts`](../../../integrations/trello/triggers/_shared/normalize.ts)): `actionId`, `actionType`, `classifiedType`, `boardId`, `boardName`, `cardId`, `cardName`, `cardUrl`, `cardDesc`(**sensitive**), `listId`, `listName`, `fromListId`, `fromListName`, `toListId`, `toListName`, `changedFields`(array), `oldValues`(object, **sensitive** — prior card field values), `closed`, `commentText`(**sensitive**), `memberId`, `memberName`, `memberAction`, `memberCreatorId`, `memberCreatorUsername`, `memberCreatorFullName`, `date`, `body`(object, **sensitive** — also forced: `body` ∈ SUSPICIOUS_NAMES; the raw webhook payload). Ids / names / list labels / dates not sensitive.
- **Activation invariant:** satisfied — `registerActivation("trello", <key>, …)` loaded via `integrations/_registry.ts`. No `SHARED_INFRA_EXEMPT_KEYS` entry (real per-board webhook, not Slack-style shared URL).
- Trigger coverage is **not** enforced by `discovery-meta-coverage` (precedent: all Phase-4 providers) — `trigger-meta-activation-invariant` is the gate, and it passes for all 6.

---

## 5. V2-native decisions (COPY / ADAPT / REPLACE / DEFER / REJECT)

Runtime parity is already settled (Slice 17 shipped 8 actions + 6 triggers; V1's `get_cards`, `add_checklist`, `create_checklist_item`, board/list/card template-expansion, and fractional position resolution were **NOT ported**). Metadata-only decisions:

- **All 8 actions + all 6 triggers → COPY (surface as-is).** Real handlers, authoritative schemas, accepted V2 surface. No runtime behavior change.
- **`boardId` (card-targeted actions) → ADAPT: add a UI-scope optional field to the 6 strict schemas.** Monday/OneNote/Dropbox precedent; the only schema touch; handler-ignored. Enables the single-dep board cascade.
- **list/card/member/label fields → ADAPT to resolver-backed comboboxes** (`dependsOn:"boardId"`). `create_list.idBoard` + every trigger `boardId` → `trello:boards` (no dep).
- **5 read helpers + 5 resolvers → ADD (META-2).** `api/` is mutation-only; read-only helpers against the existing `read` scope.
- **`idMembers`/`idLabels` (multi) → ADAPT via combobox+multiple+resolver** (deferred multi-select render; optional). Airtable precedent.
- **`pos`/`due`/`start` → text** (no select/datetime FieldType fits the union / ISO shape); documented in help text.
- **`archive_card` → COPY as medium (reversible).** NOT destructive-trio — no irreversible/delete action exists in the surface.
- **`create_board.visibility` → select, required, no default** (Q11 already enforced at the schema). Open Marcus decision on public-visibility confirmation (recommend: no).
- **`trello:checklists`/`:check_items` → REJECT (v1):** no runtime consumer. **`trello:cards` member/card pickers → SHIP but bounded** (don't overbuild — q filter + single page).
- **REJECT (runtime, already decided — not re-litigated):** get_cards, checklist actions, board/list/card templates, fractional position resolution.

---

## 6. Implementation slices

| Slice | Scope | Files (implementation slices — NOT this slice) |
|---|---|---|
| **TRELLO-META-1** (this) | Audit + plan (doc-only) | this doc |
| **TRELLO-META-2** | 5 read helpers + 5 resolvers + resolver tests | new `integrations/trello/api/{boardsList? or boards.ts add,listsList,cardsList,membersList,labelsList}` (add read fns to `boards.ts`/`lists.ts`/`cards.ts`; new `members.ts`/`labels.ts`); `integrations/trello/options/{boards,lists,cards,members,labels}.ts` + shared `_shared.ts`; register in `services/options/_registry.ts`; resolver unit tests (mock the Trello boundary) |
| **TRELLO-META-3** | 8 ActionMeta + 6 UI-scope `boardId` schema additions + 6 TriggerMeta + discovery sub-registry + COVERED flip + tests | `integrations/trello/actions/*.meta.ts` (8); add `boardId?` to 6 `.strict()` schemas; `integrations/trello/triggers/**/*.meta.ts` (6); new `services/discovery/providers/trello.ts`; wire into `services/discovery/_registry.ts`; add `"trello"` to `COVERED_PROVIDERS`; tests (§7) |

**Why 3 slices (same shape as Excel/Airtable), not the brief's hypothetical 5:** Trello has no multi-parent need (single-dep board cascade), so META-2 is a clean resolver+helper slice. With resolvers in place, META-3 combines 8 ActionMeta + the 6 small schema additions + 6 TriggerMeta + sub-registry + COVERED flip in one slice (Excel proved actions+triggers+flip with 10+5; Airtable with 11+1; Trello's 8+6 = 14 metas is comparable). The schema additions ride in META-3 because each UI-scope `boardId` must land with the meta that references it.

---

## 7. Tests required

- **Resolver tests (META-2):** `trello:boards` / `lists` / `cards` / `members` / `labels` return mapped `{value,label}` (value=opaque id; member label=fullName→username); `lists`/`cards`/`members`/`labels` `requiredDeps:["boardId"]` short-circuit `MISSING_DEPENDENCY` (no API call); board gone → empty items; auth → `INTEGRATION_DISCONNECTED`; other → `PROVIDER_ERROR`; **no token/raw-body/card-content leakage**; **Trello boundary mocked — no real API calls**. Registry block: 5 keys registered, checklists absent.
- **Schema tests (META-3):** the 6 card-targeted schemas accept + ignore an extra `boardId`; existing action handler tests still pass (boardId ignored at runtime).
- **ActionMeta shape (META-3):** 8 metas parse; `key==="trello:<type>"`; `category:"data"`; outputs mirror handler returns; `desc`/`text` sensitive; `boardId`→trello:boards; list/card/member/label fields carry the right `optionsSource`+`dependsOn:"boardId"`; create_board.visibility static select required; all medium / none destructive.
- **TriggerMeta shape (META-3):** 6 metas parse; `activation:"webhook"`; `boardId`→trello:boards; payload `cardDesc`/`commentText`/`oldValues`/`body` sensitive.
- **Discovery + provider route:** `listActionMetasForProvider("trello")`→8, `listTriggerMetasForProvider("trello")`→6, `listProvidersWithMetadata()` includes trello; `/api/providers`→trello `hasMetadata:true`; `/actions`→8; `/triggers`→6 (new `trello-provider-route.test.ts` + `trello-discovery.test.ts` + `trello-triggers-discovery.test.ts`).
- **Structural invariants:** `discovery-meta-coverage` passes with `trello` in `COVERED_PROVIDERS` (1:1 handler↔meta, all 8); `trigger-meta-activation-invariant` passes for all 6 (no exemption); `sensitive-output-coverage` passes (`text`/`body` covered).
- **Guards:** no secret-shaped output names; no provider API calls in metadata tests; `trello:checklists`/`:check_items` never referenced.

---

## 8. Acceptance criteria

Trello is metadata/builder-complete only when:

- [ ] all 8 runtime actions have `ActionMeta` (1:1 with the handler registry);
- [ ] all 6 webhook triggers have `TriggerMeta` with passing activation invariant;
- [ ] `trello:boards` + `trello:lists` resolvers exist (cards/members/labels shipped or explicitly deferred with rationale); the 5 new read helpers added; `trello:checklists`/`:check_items` rejected;
- [ ] the 6 UI-scope `boardId` schema additions are in place (additive, handler-ignored) and existing handler tests still pass;
- [ ] `/api/providers` reports Trello `hasMetadata:true` (no longer "coming soon"); actions + triggers render with working board→list/card/member/label pickers;
- [ ] `trello` is in `COVERED_PROVIDERS`;
- [ ] `discovery-meta-coverage` + `trigger-meta-activation-invariant` + `sensitive-output-coverage` pass;
- [ ] targeted Trello tests (§7) pass;
- [ ] **no Trello runtime handler behavior changed** (metadata + additive read helpers + handler-ignored UI-scope fields only);
- [ ] the `create_board` public-visibility confirmation decision (§2) is signed off.

On completion, update [`provider-metadata-launch-gap-tracker.md`](./provider-metadata-launch-gap-tracker.md) (Trello → covered; **21/26 covered, 5 pending**).

---

## Appendix — risks / blockers summary

1. **5 new read helpers required** (`api/` is mutation-only). META-2; read-only against the existing `read` scope → no scope change / reconnect.
2. **6 UI-scope `boardId` schema additions** (META-3) — small additive runtime-schema change (Monday/OneNote/Dropbox precedent); handler-ignored; the only runtime touch. Without it the board→list/card/member/label cascade can't gate (the strict schemas would reject a board field).
3. **Multi-select combobox deferred render** — `create_card.idMembers`/`idLabels` render as deferred multi-select until Slice 3.7; both optional, so non-blocking (Airtable `list_records.fields` precedent).
4. **`trello:cards` can be large** — a board's cards. Bounded page + q filter; cardId commonly flows from an upstream trigger. Acceptable; not overbuilt.
5. **No destructive-trio action** — `archive_card` is reversible; no delete actions. Trello has no high/destructive action (differs from Airtable/Excel). Documented.
6. **`create_board.visibility=public`** — explicit required field (no hidden default); mild egress; kept medium. Open Marcus sign-off on confirmation.
7. **All 8 actions are writes** (no reads) — each bills 1 task. Flagged, not changed.
8. **Auth model** — Trello is token-ingest + non-refreshable; resolvers decrypt the stored token and call `trelloRequest` directly (not via `refreshAndRetry`). Confirm the exact resolver auth shape in META-2 against the handler/trigger decrypt pattern.
