# OneNote Provider Audit + V2-Native Port Plan — Slice 3.ONENOTE-1

**Status:** Audit + planning slice. Doc-only. **No runtime, resolvers, metadata, triggers, or COVERED_PROVIDERS changes ship in this commit.**
**Branch:** `v2-provider-port-local` (local-only; do not push).
**Predecessor:** Slice 3.GDOCS-5 closed the Google Docs arc. OneNote is the next provider in the "Phase 2 to my standards" queue per [`./missing-providers-status.md`](./missing-providers-status.md) line 87.
**V1 reference path:** `c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e`.

Every claim below was verified by reading live files. Where V2 lacks a OneNote surface, V1 paths are cited so the runtime port slice can mirror them deterministically.

---

## 1. Headline finding — OneNote has NO V2 runtime

A grep across `integrations/`, `services/`, `contracts/` for `microsoft-onenote` or `onenote` returns **zero matches**. The only mention of OneNote anywhere in V2 source is this audit doc.

V2 directory state:
```
integrations/_shared/microsoft/   ← shared Graph helpers (Slice 7)
integrations/microsoft-excel/
integrations/microsoft-onedrive/
integrations/microsoft-outlook/
integrations/microsoft-outlook-calendar/
integrations/microsoft-teams/
```

**No `integrations/microsoft-onenote/`** exists. This is a green-field port — not a metadata layer on top of an existing runtime. The slice sequence must run runtime-first (ONENOTE-2), then resolvers (ONENOTE-3), then metas + COVERED flip (ONENOTE-4), then triggers (ONENOTE-N if justified). Same shape as the Discord and Google Docs arcs.

Materially different from Google Docs (GDOCS-1 also green-field) only in two respects: OneNote has **no native webhook surface** (Microsoft Graph deprecated OneNote subscriptions in May 2023 per V1's own header comment at [`lib/workflows/nodes/providers/onenote/index.ts:18`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/onenote/index.ts)), and the V2 `microsoft-excel` polling pattern is a closer analog than the Drive `files.watch` model used for Sheets / Docs / Drive triggers.

**Recommendation up-front:** doc-only this slice; ONENOTE-2 ships actions runtime; ONENOTE-N triggers must use the V2 polling pattern (Excel sibling) — Drive `files.watch` is not available for OneNote content.

---

## 2. V1 OneNote surface

All counts verified against V1 at `c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/**`.

### 2.1 User-facing manifest counts

V1 manifest: [`lib/workflows/nodes/providers/onenote/index.ts`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/onenote/index.ts) (834 lines, all 12 actions + 2 triggers in one file).

| Surface | Count | V1 keys |
| --- | --- | --- |
| **Actions** | **12** | `create_page`, `create_notebook`, `create_section`, `update_page`, `get_page_content`, `list_pages`, `copy_page`, `delete_page`, `list_notebooks`, `list_sections`, `get_notebook_details`, `get_section_details` |
| **Triggers** | **2** | `new_note` (polling), `updated_note` (polling) |

`providerId: "microsoft-onenote"` on every entry. Action types use `microsoft-onenote_action_<name>` convention; trigger types use `microsoft-onenote_trigger_<name>`.

### 2.2 V1 action handler files

[V1 `lib/workflows/actions/microsoft-onenote/`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/microsoft-onenote/) — **already split per-handler**, NOT monolithic (one file per action). 14 files total: 12 handlers + `index.ts` (16 lines) + `utils.ts` (71 lines).

| Handler | LOC |
| --- | --- |
| `copyPage.ts` | 89 |
| `createNotebook.ts` | 126 |
| `createPage.ts` | 105 |
| `createSection.ts` | 59 |
| `deletePage.ts` | 52 |
| `getNotebookDetails.ts` | 65 |
| `getPageContent.ts` | 100 |
| `getPages.ts` | 135 |
| `getSectionDetails.ts` | 61 |
| `listNotebooks.ts` | 74 |
| `listSections.ts` | 72 |
| `updatePage.ts` | 118 |

Each handler returns `{success, output, error?}` and reads the access token via the local `getOneNoteAccessToken(userId)` helper, which falls through three provider name candidates (`microsoft-onenote` → `microsoft_onenote` → `onenote`). Direct `fetch(graph.microsoft.com/v1.0/me/onenote/...)` calls via a thin `makeGraphRequest` wrapper — no `refreshAndRetry`, no centralized error mapping.

**Notable surface gaps that match Microsoft Graph capability gates:**
- No `delete_section` / `delete_notebook` actions (Graph doesn't support).
- No share / permission actions (OneNote doesn't expose a Graph permission API).

### 2.3 V1 trigger architecture

Both triggers are **polling-based**, not webhook-based. V1's manifest carries this comment verbatim (line 18):

> Implementation: Polling-based detection (Microsoft Graph deprecated OneNote webhooks May 2023)

Two poller files exist with overlapping intent:
- [`lib/triggers/pollers/microsoft-onenote.ts`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/pollers/microsoft-onenote.ts) (370 lines, has 5-tier role-based interval map: free 15m, pro 2m, beta-pro 2m, business 1m, enterprise 1m, admin 1m, default 15m).
- [`lib/workflows/triggers/polling/onenote.ts`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/triggers/polling/onenote.ts) (209 lines, simpler implementation).

The duplication is V1 tech debt. V2 picks the simpler model + reuses the existing Excel polling pattern (`integrations/microsoft-excel/triggers/_shared/pollingHandler.ts`).

**Polling shape (mirrors Excel pattern at the snapshot layer):**

- **`new_note`** — snapshot is `{pageIds: Record<string, string>, updatedAt: string}`. Pages added since the last snapshot fire `new_note` events. Snapshot is seeded at activation, NOT first poll (closes V1's "first poll miss" bug — same lesson Excel learned).
- **`updated_note`** — snapshot is `{pageLastModified: Record<string, string>, updatedAt: string}`. Pages whose `lastModifiedDateTime` changed since last snapshot fire `updated_note` events.

Both query `/v1.0/me/onenote/sections/{sectionId}/pages?$top=100&$orderby=createdDateTime desc&$select=id,title,createdDateTime,lastModifiedDateTime,parentSection,links` when `sectionId` is set, OR enumerate every section under `notebookId` and aggregate when `sectionId` is unset.

### 2.4 V1 OAuth + scopes

Two scope sets across the 12 actions + 2 triggers:
- **Read-only paths** (`list_*` actions, `get_*_details` actions, both triggers): `Notes.Read` + `Notes.ReadWrite.All` (V1 lists BOTH — `Notes.Read` is sufficient for reads; `Notes.ReadWrite.All` is the tenant-wide read+write scope and is too broad).
- **Write paths** (`create_*`, `update_page`, `delete_page`, `copy_page`): `Notes.ReadWrite.All`.

V1 uses Microsoft's Azure AD multi-tenant OAuth, same Azure AD app as every other Microsoft V1 provider.

### 2.5 V1 dynamic data resolvers

[V1 `app/api/integrations/onenote/data/handlers/`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/onenote/data/handlers/) — 3 handlers:

| V1 dynamic key | V1 handler | Used by V1 actions/triggers |
| --- | --- | --- |
| `onenote_notebooks` | `notebooks.ts` | Every action + both triggers |
| `onenote_sections` | `sections.ts` | All but `list_notebooks`, `get_notebook_details` (deps `notebookId`) |
| `onenote_pages` | `pages.ts` | `update_page`, `get_page_content`, `copy_page` (deps `sectionId`), `delete_page` |

`copy_page` consumes the section resolver TWICE under different keys (`sourceSectionId` + `targetSectionId`) — V2's resolver contract supports this via the same resolver key with different dependsOn parents.

### 2.6 V1 specialized field type

V1 `create_page` + `update_page` + `get_page_content` carry a `contentType` field with three values: `text/plain`, `text/html`, `application/xhtml+xml`. The handler wraps user content in HTML scaffolding when `contentType === "text/plain"`. V2 has no specialized rich-text field type; the V2 port uses `textarea` with documentation, same as the Discord and Google Docs ports.

V1's `update_page` `updateMode` enum has 4 values: `append`, `prepend`, `replace`, `insert`. The `insert` mode requires a `target` (CSS selector or `data-id`) + `position` (`after` / `before` / `inside`) — preserved via Graph's PATCH-based `target` + `action` operation list. **Not a destructive trio** in V1, but `replace` mode wipes the page body (parallels Google Docs `update_document` `replace` mode).

---

## 3. V2 Microsoft infrastructure (reference for the runtime port)

OneNote rides ENTIRELY on the existing V2 Microsoft infrastructure shipped in Slices 6 (Outlook Mail), 7 (Outlook Calendar), 8 (OneDrive), 15 (Excel), and 16 (Teams).

| Concern | Existing V2 surface | OneNote consumes? |
| --- | --- | --- |
| **OAuth (PKCE + token exchange + refresh)** | [`integrations/_shared/microsoft/oauth.ts`](../../../integrations/_shared/microsoft/oauth.ts) | YES — same Azure AD app, same `/common/oauth2/v2.0/{authorize,token}` endpoints, same env vars (`MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET`). Per-provider redirect URI lives in the new `integrations/microsoft-onenote/oauth.ts`. |
| **Account-id resolution (`/me`)** | [`integrations/_shared/microsoft/api/me.ts`](../../../integrations/_shared/microsoft/api/me.ts) | YES — same `mail` with `userPrincipalName` fallback for consumer accounts. |
| **Graph base URL** | [`integrations/_shared/microsoft/api/_base.ts`](../../../integrations/_shared/microsoft/api/_base.ts) | YES — `graphApiBase()` returns `https://graph.microsoft.com` (or e2e override). |
| **Graph error mapping** | [`integrations/_shared/microsoft/api/errors.ts`](../../../integrations/_shared/microsoft/api/errors.ts) | YES — `NotFoundError`, `surfaceGraphError`. |
| **`Unauthorized401Error` + `refreshAndRetry`** | [`services/oauth/refreshAndRetry.ts`](../../../services/oauth/refreshAndRetry.ts) | YES — wraps every principal Graph call. |
| **Polling-trigger infrastructure** | [`services/triggers/pollingRegistry.ts`](../../../services/triggers/pollingRegistry.ts) + [`services/cron/pollingIntervals.ts`](../../../services/cron/pollingIntervals.ts) + Excel's [`triggers/_shared/pollingHandler.ts`](../../../integrations/microsoft-excel/triggers/_shared/pollingHandler.ts) | YES — Excel's `pollingHandler.ts` is the closest analog; OneNote ships a similar shared handler that owns both triggers' diff/enqueue path. |
| **Webhook subscription infrastructure** | [`integrations/_shared/microsoft/api/subscriptions.ts`](../../../integrations/_shared/microsoft/api/subscriptions.ts) + [`integrations/_shared/microsoft/webhooks/validation.ts`](../../../integrations/_shared/microsoft/webhooks/validation.ts) | NO — Graph deprecated OneNote subscriptions May 2023 (per V1 comment + Microsoft docs). Don't import. |
| **Trigger activation registry** | [`services/triggers/activationRegistry.ts`](../../../services/triggers/activationRegistry.ts) | YES — both triggers register `(provider, eventType)` activation hooks. |
| **Discovery registry (sub-registry pattern)** | [`services/discovery/providers/`](../../../services/discovery/providers/) | YES — `services/discovery/providers/microsoft-onenote.ts` exports `MICROSOFT_ONENOTE_ACTION_METAS` + `MICROSOFT_ONENOTE_TRIGGER_METAS`. |
| **OAuth dispatcher** | [`services/oauth/dispatcher.ts`](../../../services/oauth/dispatcher.ts) | YES — register `microsoft-onenote` alongside the other Microsoft providers. |
| **Options resolver registry** | [`services/options/_registry.ts`](../../../services/options/_registry.ts) | YES — register the new OneNote resolvers (notebooks / sections / pages). |

**Net infrastructure cost for OneNote: zero new shared modules.** Every dependency already exists; the port writes per-provider files only.

### 3.1 V2 sibling provider — Excel polling pattern

[`integrations/microsoft-excel/triggers/_shared/pollingHandler.ts`](../../../integrations/microsoft-excel/triggers/_shared/pollingHandler.ts) is the canonical V2 polling pattern. One shared handler owns 5 Excel polling triggers (`new_row`, `new_table_row`, `updated_row`, `updated_table_row`, `new_worksheet`). Per-trigger files own only the activation hook (snapshot seed) + schema + meta; the shared handler routes by `trigger.eventType`.

OneNote follows the same shape — one shared `pollingHandler` owning `new_note` + `updated_note`, two per-trigger directories (`newNote/` + `updatedNote/`) each with `schema.ts` + `activate.ts` + `index.ts` + `<trigger>.meta.ts`.

---

## 4. V1 → V2 Decision Matrix

For each meaningful behavior:

### 4.1 Actions

| Area | V1 behavior | V2 recommendation | Rationale | Implementation consequence |
| --- | --- | --- | --- | --- |
| **12 actions in V1 manifest** | All 12 surfaced; each gets its own handler file | **COPY all 12** | Per-handler split already correct in V1 (no monolith refactor needed). Surface aligns with workflow author needs — read + write + cleanup. | ONENOTE-2 ports 12 handlers; ONENOTE-4 ships 12 ActionMetas. |
| **Action key naming** | `microsoft-onenote_action_<name>` (e.g. `microsoft-onenote_action_create_page`) | **ADAPT** — V2 convention is `<provider>:<type>` (e.g. `microsoft-onenote:create_page`) | V2's `ActionMeta.key` regex enforces colon-separated `<provider>:<type>`; V1's underscore separator is a different schema. | Map V1's `microsoft-onenote_action_create_page` → V2's `microsoft-onenote:create_page`. |
| **Handler return shape** | `{success: boolean, output: object, error?: string}` | **REPLACE** with V2 `ActionHandler` contract — return `{output: object}`; throw on failure | V2's engine handles success/failure at the dispatcher layer; handlers throw with classified errors (Q3 401 contract via `refreshAndRetry`). | Per-handler rewrite. Same shape as every other V2 provider (Sheets, Docs, Outlook, etc.). |
| **Direct `fetch` + `makeGraphRequest`** | Bare fetch with manual 401 handling per handler | **REPLACE** with `refreshAndRetry` + per-action Graph wrappers under `integrations/microsoft-onenote/api/` | V2's Q3 contract requires `refreshAndRetry` on every principal outbound call. Per-action wrapper files make each call testable in isolation. | One wrapper per Graph endpoint (notebooks list / sections list / pages list / page get / page create / page update / page copy / page delete / notebook create / section create), in `integrations/microsoft-onenote/api/`. |
| **`copy_page` async operation** | V1 calls Graph's `copy` endpoint (which returns an operation id) but doesn't poll the operation — surfaces the operation as success | **DEFER** the operation-poll for ONENOTE-2; document the limitation in the meta description | Polling Graph operations is non-trivial and rarely needed in workflow contexts (authors typically don't chain to the copied page in the same run). Match V1's behavior; the operation completes server-side; the workflow chains via the next polling cycle's `new_note` trigger if it needs the new page id. | `copy_page` returns `{operationLocation, sourcePageId, targetSectionId, success}` rather than the new pageId. Description warns. |
| **Field-name preservation** | camelCase verbatim (`notebookId`, `sectionId`, `pageId`, `sourceSectionId`, `targetSectionId`, `updateMode`, `target`, `position`, `contentType`, `includeIDs`, `preGenerated`, `orderBy`, `top`, `filter`) | **COPY 1:1** | No-normalization rule per the established arcs (Discord, Mailchimp, Google Docs). | Schema field names mirror V1 verbatim. |
| **`update_page.updateMode` enum** | 4 values: `append`, `prepend`, `replace`, `insert` | **COPY** + classify `replace` mode warning in description | Each maps to a Graph PATCH operation. `replace` wipes the body (parallels Google Docs `update_document.replace`); description warns + medium risk classification covers it. | Meta description carries a warning; risk stays medium (recoverable via OneNote version history, like Google Docs). |
| **`update_page.target` + `position`** | `target` is CSS selector / `data-id`; `position` ∈ `after` / `before` / `inside`; required when `updateMode === "insert"` | **COPY** with conditional-visibility note in description (V2 contract doesn't surface conditional visibility yet) | Same pattern as Google Docs `update_document.searchText` (conditional on insert mode); meta declares unconditionally visible + description explains. | `target` + `position` declared as optional; schema's `.superRefine` enforces required-when-insert at runtime. |
| **`contentType` field on create/update/get** | Enum: `text/plain`, `text/html`, `application/xhtml+xml`; defaults to `text/plain` | **COPY** but verify the `text/plain` default still matches workflow-author expectations | Workflow authors usually want HTML for rich formatting; V1 defaulting to plain text felt wrong in user testing per V1 walkthrough docs. **Open product decision D-ON1**: keep `text/plain` default vs flip to `text/html`. | If keeping `text/plain` per V1, document the rationale in meta description. If flipping, change handler + schema + meta together. |
| **V1's `includeIDs` + `preGenerated` on `get_page_content`** | `includeIDs` (default false) — add `data-id` attributes for downstream `update_page` insert mode; `preGenerated` (default true) — fetch the cached HTML | **COPY** | Both are runtime-load-bearing: `includeIDs=true` is required when chaining into `update_page` with `insert` mode. `preGenerated` is a Graph performance hint. | Meta declares both; defaults preserved. |
| **V1's `list_pages.filter` (OData query)** | Raw OData query string, e.g. `createdDateTime ge 2024-01-01` | **DEFER / REJECT** for ONENOTE-2; revisit in ONENOTE-N | OData is footgun-prone for non-Graph experts; V2 has no validation layer for OData strings. Better to ship structured filters (top, orderBy) and add explicit date-range / title-contains fields in a follow-on slice when real consumers ask. | Meta drops `filter`; ships `orderBy` + `top` only. Description tells authors to chain `list_pages` → format_transformer for ad-hoc filtering. |
| **V1's `list_pages.top` numeric bound** | 1..100; default 20 | **COPY** | Graph's `$top` for OneNote pages caps at 100 per page; default 20 matches V1 + reasonable UI page size. | Schema enforces `numeric: {min: 1, max: 100, integer: true}`; default 20. |
| **V1's `orderBy` enums** | 6 values per `list_pages`, `list_notebooks`, `list_sections`: `lastModifiedDateTime desc/asc`, `createdDateTime desc/asc`, `title asc/desc` (or `displayName asc/desc` for notebooks/sections) | **COPY** | These are Graph's supported `$orderby` clauses for the OneNote endpoints. | Meta enums match V1 verbatim. |

### 4.2 Triggers

| Area | V1 behavior | V2 recommendation | Rationale | Implementation consequence |
| --- | --- | --- | --- | --- |
| **Trigger architecture** | Polling (V1 manifest comment: "Microsoft Graph deprecated OneNote webhooks May 2023") | **COPY architecture (polling)** | Microsoft's subscription API does NOT support OneNote resources. Polling is the only V2-native option. Excel sibling provider has the same constraint and uses polling. | Both triggers use V2's `PollingHandler` contract via a shared handler at `integrations/microsoft-onenote/triggers/_shared/pollingHandler.ts` (mirrors Excel). |
| **V1's 5-tier role-based interval map** (free 15m / pro+beta-pro 2m / business+enterprise+admin 1m) | Role-aware polling cadence | **REPLACE** with V2's existing `DEFAULT_INTERVAL_MS` (per `services/cron/pollingIntervals.ts`) | V2 doesn't have role-aware polling — it uses one interval per (provider, eventType). Adding role-aware cadence cross-cuts the polling infrastructure; not justified for ONENOTE-N alone. | Single interval per trigger (recommend 5 minutes — matches Excel + Gmail polling defaults). Tier-based throttling can ship as a cross-cutting follow-up that improves every polling trigger uniformly. |
| **V1's snapshot-at-first-poll bug** | V1 seeded snapshot inside the first poll, dropping the first cycle's events silently | **REPLACE** with seed-at-activation (V2 contract — same as Excel + Gmail) | Closes V1's "first poll miss" bug. V2's `ActivationFn` seeds the snapshot BEFORE the first poll runs. | Per-trigger `activate.ts` fetches the initial page list and stores in `trigger_resources.config`. |
| **Trigger config: `notebookId` required, `sectionId` optional** (`new_note`) | Required notebook, optional section filter | **COPY** | Workflow authors usually scope by notebook; section is an opt-in narrowing. | Schema: `{notebookId: required, sectionId: optional}`. Resolver wiring: notebook combobox → section combobox depending on notebookId. |
| **Trigger config: same shape for `updated_note`** | Required notebook, optional section | **COPY** | Same logic — narrows polling scope. | Same schema shape. |
| **Trigger payload** | Page-row shape: `{id, title, content, contentUrl, webUrl, createdDateTime, lastModifiedDateTime, level, order, notebookId, notebookName, sectionId, sectionName}` | **COPY with sensitive flag review** | Payload is useful; sensitive fields need explicit marking (title, content, webUrl, sectionName, notebookName all are author-typed text). | Per §6 below for the sensitive flag list. |
| **V1 includes `content` (full HTML body) in trigger payload** | Calls `get_page_content` per matching page and embeds the HTML in the payload | **DEFER / REJECT** | Embedding page bodies in every trigger payload is expensive (extra Graph call per match) AND surface PII risk. V2 keeps the trigger payload to metadata fields; workflow authors chain `get_page_content` downstream when they need the body. | Drop `content` from V2 trigger payload. Description tells authors to chain `get_page_content` if they need the HTML body. |

### 4.3 OAuth / scopes

| Area | V1 behavior | V2 recommendation | Rationale | Implementation consequence |
| --- | --- | --- | --- | --- |
| **Scope set** | Mix of `Notes.Read` (per V1 read actions) + `Notes.ReadWrite.All` (per V1 write actions, AND redundantly on V1 read actions) | **ADAPT** — single scope set on the manifest: `["offline_access", "Notes.ReadWrite"]` | `Notes.ReadWrite` covers the user's own notebooks (read + write), is hierarchically inclusive of `Notes.Read`, and is the V2-precedent (Slice 8 OneDrive uses `Files.ReadWrite`, not the `.All` variant — same narrowness principle). The `.All` variant is tenant-wide and is too broad for the V2 v1 surface. | Manifest: `scopes.required: ["offline_access", "Notes.ReadWrite"]`. Slice plan doesn't ship the `.All` variant; if a future cross-tenant action lands, scope split can be revisited then. |
| **Reuse of `_shared/microsoft/oauth.ts`** | N/A — V1 didn't have a shared module | **COPY** the pattern from Outlook / Calendar / OneDrive / Excel / Teams | No new shared work needed; per-provider `oauth.ts` is a thin wrapper. | `integrations/microsoft-onenote/oauth.ts` ≈ 40 lines (per the Slice 8 precedent). |
| **OAuth dispatcher registration** | V1 used a per-provider dispatcher with provider-name fallbacks | **REPLACE** with V2's `services/oauth/dispatcher.ts` registration | Single registration; no name fallback. V1's three-name fallback (`microsoft-onenote` → `microsoft_onenote` → `onenote`) was a tech-debt workaround for V1 inconsistency; V2 uses one canonical provider id. | Provider id `microsoft-onenote` (matches V1's primary key + the V2 sibling naming convention `microsoft-*`). |

### 4.4 Options resolvers

| Area | V1 behavior | V2 recommendation | Rationale | Implementation consequence |
| --- | --- | --- | --- | --- |
| **3 resolvers (`onenote_notebooks`, `onenote_sections`, `onenote_pages`)** | All 3 backed by Graph reads | **COPY** as 3 V2 resolvers | Every consumer surface needs at least one of these. | `microsoft-onenote:notebooks` (no deps), `microsoft-onenote:sections` (deps `notebookId`), `microsoft-onenote:pages` (deps `sectionId`). |
| **`copy_page` double-section pickup** | Same `onenote_sections` resolver consumed under `sourceSectionId` + `targetSectionId` field names with different `dependsOn` parents (`sourceNotebookId` / `targetNotebookId`) | **COPY** | V2 resolver contract supports `(consumer-field-name, parent-field-name)` decoupling — Mailchimp / HubSpot have the same pattern. | Resolver `microsoft-onenote:sections` declared `requiredDeps: ["notebookId"]` — when consumed under `sourceSectionId`/`targetSectionId`, the meta's `dependsOn` is the parent field name and the resolver receives the dep value (the resolver itself only cares about a `notebookId` value, regardless of which UI field carries it). |
| **Resolver dep names** | `notebookId`, `sectionId`, `pageId` (camelCase) | **COPY** | Match runtime schemas verbatim. | Dep names match. |

### 4.5 Runtime handler structure

| Area | V1 behavior | V2 recommendation | Rationale | Implementation consequence |
| --- | --- | --- | --- | --- |
| **Per-handler files** | Already split per-handler in V1 | **COPY** the split | V2 convention is per-handler files; V1 already conforms. | 12 handler files under `integrations/microsoft-onenote/actions/`; 12 schema files (`<action>.schema.ts`); shared Graph wrappers under `integrations/microsoft-onenote/api/`. |
| **Test mode** | V1 handlers have inline `if (context.testMode) { return mock }` blocks | **REPLACE** with V2's engine-level test-mode interception | V2's engine intercepts external-action handlers in test mode at the dispatcher layer (per CLAUDE.md "testMode safety audit"); handlers don't need their own test-mode branches. | Handlers drop the inline mock blocks. |

### 4.6 Output shapes

| Area | V1 behavior | V2 recommendation | Rationale | Implementation consequence |
| --- | --- | --- | --- | --- |
| **Per-action output schema** | V1 manifest declares each action's `outputSchema` inline (~10-15 fields each) | **COPY** with sensitive-flag application (see §6) | Output field names are stable + load-bearing for downstream variable picker wiring. | ActionMeta `outputs[]` per action mirrors V1 names; `sensitive: true` applied per §6. |
| **`copy_page` returns `success` boolean + new page id** | V1 surfaces `success` boolean + the operation's intermediate state | **ADAPT** per the operation-poll deferral above | Without operation polling, `success` reflects "Graph accepted the operation," not "the page is copied." | Output: `{operationLocation, sourcePageId, targetSectionId, success}` — `success` documents Graph's accept-not-complete semantic. |

### 4.7 Metadata / risk / sensitive outputs

See §5 + §6 below.

### 4.8 External constraints

| Constraint | Source | Implication |
| --- | --- | --- |
| Microsoft Graph deprecated OneNote webhook subscriptions in **May 2023** | V1 manifest comment + Microsoft Graph docs | Polling is the only V2-native trigger architecture. Drive `files.watch` (Sheets / Docs / Drive) doesn't apply. |
| Graph `delete_notebook` / `delete_section` not supported | V1 manifest comment line 812 | V2 ships `delete_page` only. No section / notebook deletion actions; no destructive-trio classification for non-page deletes (they don't exist). |
| Graph OneNote pages support `text/html`, `text/plain`, `application/xhtml+xml` only | OneNote Graph docs | `contentType` enum capped at these three values. |
| Graph `$top` for OneNote pages caps at 100 per page | OneNote Graph docs | `list_pages.top` numeric bound 1..100. |
| Graph OneNote does NOT expose page-level permission API | OneNote Graph docs | No share-page action ships. Sharing is at the notebook level via OneDrive's `permissions.create` (out of scope — workflow authors compose via OneDrive). |

---

## 5. Proposed V2 surface

### 5.1 Actions (12 — full V1 manifest port)

Same scope as V1. Risk classifications:

| Action | Risk | `isDestructive` | `requiresConfirmation` | Rationale |
| --- | --- | --- | --- | --- |
| `microsoft-onenote:create_page` | **medium** | false | false | Creates a new external resource per call; re-runs duplicate. Not destructive. |
| `microsoft-onenote:create_notebook` | **medium** | false | false | New external resource. |
| `microsoft-onenote:create_section` | **medium** | false | false | New external resource scoped to a notebook. |
| `microsoft-onenote:update_page` | **medium** | false | false | Mutates existing page. `replace` mode wipes body — description warns; recoverable via OneNote version history (parallels Google Docs `update_document`'s D-GD4 decision). |
| `microsoft-onenote:get_page_content` | **low** | false | false | Pure read. Content marked sensitive. |
| `microsoft-onenote:list_pages` | **low** | false | false | Pure read of page metadata. |
| `microsoft-onenote:copy_page` | **medium** | false | false | Creates a copy in the target section; original unchanged. Async operation — description warns that the response reflects "accepted," not "complete." |
| `microsoft-onenote:delete_page` | **HIGH** + `isDestructive: true` + `requiresConfirmation: true` | true | true | **Irreversible.** OneNote retains no per-page undelete (notebook-level recycle bin exists but workflow authors can't programmatically restore). The destructive trio surfaces the typed-confirmation modal. |
| `microsoft-onenote:list_notebooks` | **low** | false | false | Pure read. |
| `microsoft-onenote:list_sections` | **low** | false | false | Pure read scoped to a notebook. |
| `microsoft-onenote:get_notebook_details` | **low** | false | false | Pure read of one notebook. |
| `microsoft-onenote:get_section_details` | **low** | false | false | Pure read of one section. |

### 5.2 Triggers (2 — polling)

Both ship in ONENOTE-N (after actions land). Activation: `"polling"`.

| Trigger | Risk | Notes |
| --- | --- | --- |
| `microsoft-onenote:new_note` | **low** | Observational. Activation seeds page-list snapshot for `notebookId` (and `sectionId` when set). |
| `microsoft-onenote:updated_note` | **low** | Observational. Activation seeds `pageId → lastModifiedDateTime` snapshot. |

### 5.3 Required OptionsSource resolvers (3 — ship in ONENOTE-3, ahead of metas)

| Resolver key | `requiredDeps` | Endpoint | Notes |
| --- | --- | --- | --- |
| `microsoft-onenote:notebooks` | (none) | `GET /v1.0/me/onenote/notebooks?$orderby=displayName` | Account-scoped picker. Page-cap 200 like Google Docs / Drive resolvers. |
| `microsoft-onenote:sections` | `["notebookId"]` | `GET /v1.0/me/onenote/notebooks/{notebookId}/sections?$orderby=displayName` | Page-cap 200; consumed under both `sectionId` and `sourceSectionId` / `targetSectionId` field names. |
| `microsoft-onenote:pages` | `["sectionId"]` | `GET /v1.0/me/onenote/sections/{sectionId}/pages?$top=100&$orderby=lastModifiedDateTime desc` | Page-cap 100 (Graph caps at 100 for OneNote pages); consumed under both `pageId` and `sourcePageId` field names. |

### 5.4 Field-name preservation warnings

All 12 actions + 2 triggers use camelCase identifiers verbatim per V1. Any drift fails the meta-coverage structural test. Specific warnings:

- **`notebookId` everywhere** — NOT `notebook_id` or `notebookID`.
- **`pageId` for single-page actions** — `copy_page` uses `sourcePageId` + (no `targetPageId` — Graph generates one). NOT `pageID` or `page_id`.
- **`sectionId` for sections** — `copy_page` uses `sourceSectionId` + `targetSectionId` + `sourceNotebookId` + `targetNotebookId` (4 fields total for the copy cascade).
- **`updateMode` values** are `append` / `prepend` / `replace` / `insert` — preserved verbatim per V1's `update_page` handler dispatch table.
- **`contentType` values** are `text/plain` / `text/html` / `application/xhtml+xml` — Graph's accepted mime types.
- **`includeIDs` (camelCase, not `includeIds`)** — V1 uses this exact casing; preserve.
- **`top` (not `limit` or `maxResults`)** — matches Graph's `$top` OData parameter; V1 preserves.
- **`orderBy` (not `order_by` or `sort`)** — matches Graph's `$orderby`.

---

## 6. Sensitive output proposal

Per V2's `tests/structure/sensitive-output-coverage.test.ts` suspicious-name set + GDOCS-1/DISCORD-1 precedent:

### 6.1 Action outputs

| Action | Sensitive | Non-sensitive |
| --- | --- | --- |
| `create_page` | `title`, `webUrl`, `contentUrl` | `id`, `createdDateTime`, `lastModifiedDateTime`, `level`, `order` |
| `create_notebook` | `displayName` (notebook name) | `id`, `createdDateTime`, `lastModifiedDateTime`, `isDefault`, `isShared`, `sectionsUrl`, `sectionGroupsUrl` |
| `create_section` | `displayName` | `id`, `createdDateTime`, `lastModifiedDateTime`, `pagesUrl`, `isDefault` |
| `update_page` | `title`, `webUrl`, `contentUrl` | `id`, `lastModifiedDateTime`, `success` |
| `get_page_content` | `title`, `content` (full HTML body — in the structural suspicious-name set), `webUrl`, `contentUrl` | `id`, `createdDateTime`, `lastModifiedDateTime`, `level` |
| `list_pages` | `pages[]` (whole array — per-row `title` + `webUrl`; bulk PII collection — matches `messages` / `users` suspicious-name pattern) | `count` |
| `copy_page` | `title` (echoed source title), `webUrl` (when surfaced) | `operationLocation`, `sourcePageId`, `targetSectionId`, `success` |
| `delete_page` | — (no PII in delete response) | `success`, `deletedPageId`, `deletedAt` |
| `list_notebooks` | `notebooks[]` (per-row `displayName`) | `count` |
| `list_sections` | `sections[]` (per-row `displayName`) | `count` |
| `get_notebook_details` | `displayName` | `id`, `createdDateTime`, `lastModifiedDateTime`, `isDefault`, `isShared`, `sectionsUrl`, `sectionGroupsUrl`, `links` |
| `get_section_details` | `displayName` | `id`, `createdDateTime`, `lastModifiedDateTime`, `isDefault`, `pagesUrl`, `links` |

### 6.2 Trigger payloads

| Trigger | Sensitive | Non-sensitive |
| --- | --- | --- |
| `new_note` | `title`, `webUrl`, `contentUrl`, `notebookName`, `sectionName` | `id`, `createdDateTime`, `lastModifiedDateTime`, `level`, `order`, `notebookId`, `sectionId` |
| `updated_note` | Same as `new_note` | Same as `new_note` + `updatedAt` |

### 6.3 Defense-in-depth — no secret-shaped names

The Microsoft Graph access token MUST NEVER appear as an output field, sensitive or not. The secret-name regression guard at `tests/structure/sensitive-output-coverage.test.ts:251` enforces `clientSecret` / `client_secret` / `secret` / `token` / `apiKey` / `accessToken` / `refreshToken` / `webhookSecret` are absent from every meta. V1 doesn't surface tokens; V2 port must preserve that.

---

## 7. Slice sequence

| Slice | Scope | Estimated commits | Coverage gain |
| --- | --- | --- | --- |
| **ONENOTE-1** (this slice) | Audit + plan doc only. | 1 (this commit). | None — doc-only. |
| **ONENOTE-2** (runtime port — actions) | 12 V1 actions → 12 V2 handler files + 12 Zod schemas + per-action Graph wrappers under `integrations/microsoft-onenote/api/`. New `integrations/microsoft-onenote/manifest.ts` + `oauth.ts` + dispatcher registration. Handler registry entries. **NO triggers, NO metas, NO resolvers.** | 1 commit. | +12 action handlers in execution registry. OneNote NOT yet in `COVERED_PROVIDERS`. |
| **ONENOTE-3** (resolvers) | 3 options resolvers (`microsoft-onenote:notebooks` / `:sections` / `:pages`) + tests. | 1 commit. | 3 resolvers; no provider-coverage flip. |
| **ONENOTE-4** (action metas + COVERED flip) | 12 ActionMeta files + `services/discovery/providers/microsoft-onenote.ts` sub-registry + provider-route tests + discovery registry test. Flip OneNote into `COVERED_PROVIDERS` with the trigger-staging comment. | 1 commit. | 12 actions covered; provider in COVERED. Trigger coverage gap acknowledged in the COVERED comment. |
| **ONENOTE-5** (triggers) | 2 polling triggers (`new_note` / `updated_note`): per-trigger `schema.ts` + `activate.ts` + `index.ts` + meta + shared polling handler at `triggers/_shared/pollingHandler.ts` (Excel pattern). Update sub-registry to include trigger metas. Flip manifest `pollingTrigger: true`. | 1 commit. | 2 triggers; manifest polling capability flipped. |

**Recommendation for the next implementation slice:** `ONENOTE-2` (runtime port — actions only).

---

## 8. What to copy vs not copy

### 8.1 Copy as-is
- **All 12 V1 action types + their field names** (camelCase preserved).
- **`update_page.updateMode` enum** (4 values: append / prepend / replace / insert).
- **`contentType` enum** (3 values).
- **`includeIDs` + `preGenerated` defaults on `get_page_content`** (load-bearing for chaining into `update_page`).
- **`orderBy` enums on `list_*` actions** (Graph's `$orderby` clauses).
- **`top` numeric bounds on `list_pages`** (1..100; default 20).
- **3 V1 dynamic resolver keys' semantic** (notebooks / sections / pages) — adapted to V2's `<provider>:<resource>` key convention.
- **Polling-based trigger architecture** (Graph deprecation of OneNote webhooks).

### 8.2 Do NOT copy
- **V1 provider-name fallback in `getOneNoteAccessToken`** (`microsoft-onenote` → `microsoft_onenote` → `onenote` triple-lookup). V2 uses one canonical provider id; OAuth dispatcher returns the right token directly.
- **V1's `Notes.ReadWrite.All` scope** on read actions. V2 uses `Notes.ReadWrite` (less broad).
- **Bare `fetch` + manual 401 handling** in handlers. V2 routes through `refreshAndRetry`.
- **`{success, output, error?}` handler return shape.** V2 uses `{output}` + throws.
- **Inline `if (context.testMode) { return mock }` in handlers.** V2 engine intercepts test-mode at dispatcher layer.
- **V1's 5-tier role-based polling interval map.** V2 uses one interval per trigger; tier-based cadence is a cross-cutting follow-up that improves every polling trigger uniformly.
- **V1's first-poll-snapshot-seed pattern.** V2 seeds at activation (closes "first poll miss" bug).
- **V1's `content` field on the trigger payload.** V2 keeps the trigger payload to metadata; workflow authors chain `get_page_content` for the body.
- **V1's raw OData `filter` field on `list_pages`.** V2 drops it; future structured filters (date-range / title-contains) ship when real consumers ask.
- **V1's duplicate polling files** (`lib/triggers/pollers/microsoft-onenote.ts` AND `lib/workflows/triggers/polling/onenote.ts`). V2 ships one shared handler under `integrations/microsoft-onenote/triggers/_shared/pollingHandler.ts` (Excel pattern).

---

## 9. Open product decisions before implementation

Three decisions to make before / during ONENOTE-2:

### D-ON1 — `create_page.contentType` default

V1 defaults to `text/plain`. Workflow authors usually want HTML for rich formatting (multi-paragraph, headings, lists). Two options:

1. **Keep `text/plain` default per V1.** Conservative — no behavior change.
2. **Flip to `text/html` default.** Matches author intent.

**Recommended: option 2 (flip to `text/html`).** Two reasons: (a) most workflow content is templated and benefits from HTML formatting; (b) the V1 enhancement-summary doc at `learning/docs/onenote-enhancement-summary.md` already documents the `text/plain` default as a recurring user pain point. **Open product decision — confirm before ONENOTE-2.**

### D-ON2 — `copy_page` operation polling

V1 fires Graph's `POST /me/onenote/pages/{id}/copyToSection` and returns immediately without polling the operation. Three options:

1. **Match V1 — return `{operationLocation, success}`.** Cheapest; description warns of "accept, not complete" semantic.
2. **Poll the operation up to N seconds.** Surfaces a "copy complete" boolean + the new pageId. Adds latency + complexity.
3. **Defer the operation poll to ONENOTE-N.** Ship V1-shape now; add option-2 behind a feature flag later if user demand surfaces.

**Recommended: option 1 (match V1)** for ONENOTE-2. Workflow authors typically chain via the next polling cycle's `new_note` trigger if they need the new page id. Option 2 is a future polish slice.

### D-ON3 — Polling cadence

V1's 5-tier role-aware map vs V2's one-interval-per-trigger pattern.

1. **One interval per trigger (matches V2 precedent).** Recommend 5 minutes — matches Excel + Gmail polling defaults.
2. **Per-user role-aware cadence.** Cross-cutting infrastructure change touching `services/cron/pollingIntervals.ts`. Not justified for ONENOTE alone.

**Recommended: option 1 (one interval).** Tier-based cadence ships later as a cross-cutting follow-up if business / enterprise / admin tier customers actually request faster OneNote polling.

---

## 10. Acceptance for this slice

This slice is doc-only. Acceptance criteria:

- This file (`docs/slices/phase-3/onenote-metadata-plan.md`) committed.
- No other source / test / config files modified.
- Gates green: `tsc --noEmit`, `npm run lint`, `npm run lint:structure`, `npm run lint:migrations`. No new jest assertions; structural tests untouched.
- Dirty parallel-work files (`app/page.tsx`, `docs/rules/database-security.md`, `features/workflows/WorkflowsList.tsx`, `PACKAGES.md`, `scripts/list-users.mjs`, `scripts/reset-user-password.mjs`) remain unstaged.

---

## 11. Recommended next slice

**`ONENOTE-2` — OneNote Runtime Port (Actions Only).** Per §7 + §8.

Ports the 12 V1-manifest-declared action handlers + per-action Zod schemas + shared Graph wrappers (under `integrations/microsoft-onenote/api/`) + `manifest.ts` (`scopes: ["offline_access", "Notes.ReadWrite"]`; `capabilities.actions: true`, others false) + `oauth.ts` (thin wrapper around `_shared/microsoft/oauth.ts`) + OAuth dispatcher registration. Does NOT touch metas, resolvers, triggers, or `COVERED_PROVIDERS`. Expected scope: ~30 files; ~1 commit.
