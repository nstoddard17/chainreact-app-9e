# Phase 3 — Async `optionsSource` Plan

**Status:** Plan only. No contract / runtime / renderer / API changes in this slice.
**Branch:** `v2-provider-port-local` (local-only; do not push).
**Master plan:** [`docs/slices/phase-2-plan.md`](../phase-2-plan.md).
**Checkpoint reference:** [`./builder-metadata-coverage-checkpoint.md`](./builder-metadata-coverage-checkpoint.md) §10 ranked this as the next infra unlock.
**Original deferral:** Slice 3.4 — never shipped; called out at `ComboboxField.tsx:27` and `SelectField.tsx:15`.

This plan closes the long-standing gap between the `FieldMeta.optionsSource` contract slot and any actual usage of it. Every provider metadata batch from here on will need provider-backed pickers (Slack channels, Notion DBs, Airtable bases, Google Sheets sheets/ranges, HubSpot lists/pipelines, etc.). Shipping more metas without this infra would mean either (a) all those fields land as raw `text`, or (b) every provider grows its own bespoke picker component. Both are wrong. The plan below picks an architecture that keeps SchemaForm metadata-driven and provider-neutral, then sequences the smallest possible implementation arc.

---

## 1. Current state

### 1.1 Contract — `optionsSource` already exists

`contracts/actionMeta.ts:147`:

```ts
optionsSource: z.string().min(1).max(128).optional(),
```

Constraints enforced today by `FieldMetaSchema.superRefine`:
- `options` (static) and `optionsSource` (dynamic) cannot coexist.
- Both are valid only on `select` or `combobox` field types.

The `OptionItem` shape used today is `FieldOptionSchema` from the same file:

```ts
{ value: z.string().min(1).max(256),
  label: z.string().min(1).max(256),
  description: z.string().max(512).optional() }
```

No `icon`, no `group`, no `disabled`, no `metadata` keys. Plain enough.

### 1.2 Renderers — both decline to handle `optionsSource`

- [`SelectField.tsx:14-22`](../../../features/workflow-builder/config-modal/fields/SelectField.tsx) — comment says "Static options only — `optionsSource` is a field-meta concern handled by the future Slice 3.4 provider-config wrappers." Renders an error alert when `options` is empty / missing.
- [`ComboboxField.tsx:27`](../../../features/workflow-builder/config-modal/fields/ComboboxField.tsx) — same posture; specifically: "No options available. Combobox fields with `optionsSource` require a provider config wrapper (Slice 3.4)."

Neither field calls a hook to load options; neither has loading / error / empty / search states for async data.

### 1.3 No option-loading API exists

`app/api/` scan (verified):
```
app/api/cron/         — scheduled jobs
app/api/integrations  — oauth flows
app/api/native        — native actions/triggers listing
app/api/providers     — discovery (metas)
app/api/webhooks      — provider event ingress
app/api/workflows     — CRUD + run
```

No `app/api/options/...`, no `app/api/picker/...`, no resolver registry, no `lib/api/options.ts`.

### 1.4 `dependsOn` is a contract field with no renderer wiring

`grep dependsOn` in `features/workflow-builder/` returns matches in `contracts/actionMeta.ts` only. `SchemaForm.tsx` and every field renderer accept the raw value through `onChange` without any cascade reset or visibility flip when a parent field changes.

### 1.5 Existing client API + integration access patterns to reuse

- **Typed client convention** at `lib/api/discovery.ts` — `*ApiError` class with `code | status`, `parseError` helper, `pickCode` for status → code mapping. Same shape used by `lib/api/workflows.ts` and `lib/api/integrations.ts`. Plan adopts this pattern for the new options client.
- **Provider integration access on the server** at `repositories/integrations.ts:175` — `getActiveForExecution(provider, userId)`. Plan uses this in resolver implementations.
- **Provider-backed read wrappers** exist for Slack (e.g. `integrations/slack/api/conversationsList.ts` — already paginated with `cursor` + `nextCursor`, scope-aware, returns lightly-typed `Record<string, unknown>[]`). Plan layers a thin "resolver" on top of these wrappers, not a new SDK.
- **Auth** at `app/api/providers/_shared.ts` — `requireUser()`. Plan reuses this for options routes.

---

## 2. Problem

Concretely, the fields that should NOT remain raw text once they have metas:

| Provider | Field | Example |
| --- | --- | --- |
| slack | channel id (C…/G…/D…) | `slack:send_channel_message.channel` |
| slack | user id | `slack:send_direct_message.userId` |
| slack | scheduled-message id | `slack:cancel_scheduled_message.scheduledMessageId` |
| notion | database id, page id | `notion:query_database.databaseId` |
| notion | workspace user id | `notion:get_user.userId` |
| airtable | base id → table id (`dependsOn`!) → field id | `airtable:create_record.{baseId,tableIdOrName,fieldId}` |
| google-sheets | spreadsheet id → sheet id → range | `google-sheets:append_row.{spreadsheetId,sheetId}` |
| google-drive | folder id, file id | `google-drive:upload_file.parentFolderId` |
| microsoft-onedrive | folder id | `microsoft-onedrive:upload_file.parentItemId` |
| microsoft-outlook | folder id | (future) outlook flag/move folders |
| hubspot | list id, pipeline id, object schema | `hubspot:add_contact_to_list.listId`, `hubspot:create_deal.pipelineId` |
| mailchimp | audience id, segment id | `mailchimp:add_subscriber.audienceId` |
| stripe | customer id, price id, product id | `stripe:create_subscription.{customerId,priceId}` |
| shopify | location id, customer id | `shopify:update_inventory.locationId` |
| microsoft-teams | team id → channel id (`dependsOn`) | `microsoft-teams:send_channel_message.{teamId,channelId}` |

Many of these are also `dependsOn` chains (Airtable: base → table → fieldId; Sheets: spreadsheet → sheet; Teams: team → channel). Shipping pickers without `dependsOn` would force the user to type child IDs by hand even when the parent is selected.

---

## 3. Contract decisions

### 3.1 `optionsSource` key format — provider-scoped registry key

Recommended format: **`"<provider>:<resource>"`** — same shape as ActionMeta keys.

Examples:
- `slack:channels`
- `slack:users`
- `notion:databases`
- `airtable:bases`
- `airtable:tables`         (dependsOn baseId)
- `airtable:fields`         (dependsOn baseId + tableIdOrName)
- `google-sheets:spreadsheets`
- `google-sheets:sheets`    (dependsOn spreadsheetId)
- `hubspot:lists`
- `stripe:customers`

Why:
- Mirrors the ActionMeta `key` convention (`provider:type`) → reviewers already know the format.
- Provider prefix makes the resolver fan-out obvious (`slack:*` resolvers live under Slack's provider area).
- Plays cleanly with route shape `GET /api/options/<source>` — the path becomes `slack:channels` URL-encoded.
- Already validated by `FieldMetaSchema`'s existing `z.string().min(1).max(128)`. NO contract change needed.

Rejected alternatives:
- `provider.resource` (dotted) — breaks the dot-as-path-separator convention used elsewhere (`{{node.path.subpath}}`).
- Bare resource names (`channels`) — would force a per-provider context lookup; brittle when two providers expose `channels` (slack vs teams).
- Route paths (`/api/options/slack/channels`) — exposes routing as data; harder to migrate route shapes later.

### 3.2 `OptionItem` shape — extend `FieldOptionSchema` minimally

Today's shape (`{value, label, description?}`) is sufficient for the V1 of every resolver listed in §2. The plan **keeps it untouched** and proposes ONE optional addition only when a real consumer needs it:

- Defer `group?: string` until a real picker needs section headers (e.g. Slack channels grouped by `is_member`).
- Defer `disabled?: boolean` until a real picker needs to surface "archived" / "not-shareable" items as non-pickable.
- Defer `icon?: string` until a real picker needs visual differentiation (e.g. emoji on Slack channels).
- Defer `metadata?: Record<string, unknown>` — would tempt resolvers into stuffing PII/secrets there; reject until proven need.

This matches the discipline that landed `file-array` minimally and grew it slice-by-slice.

### 3.3 What `optionsSource` MUST support in v1

- **Search query**. Mandatory for any resolver that returns >50 items. Slack channels alone often exceeds this. Shape: `?q=<urlencoded string>`.
- **`dependsOn` parent values**. Mandatory for Airtable / Sheets / Teams chains. Shape: `?deps[parentField]=<value>`.
- **Auth/integration required**. Implicit — every non-native source needs an active integration row.
- **Loading / error / empty / disconnected states** surfaced through a discriminated client result type.

### 3.4 What `optionsSource` will defer in v1 (locked-in scope-fence)

- **Pagination.** Slack channel lists with >1000 items are realistic, but only after Slack's broader action coverage lands. v1 resolvers cap at `limit: 200` (single page) and return a `hasMore: boolean` flag so the renderer can show "Showing first 200 — refine with search." Cursor plumbing through the client / hook lands as a follow-up after a real "Slack workspace with 2000 channels" surfaces it.
- **Cache TTL / persistence.** No server-side or browser-side cache layer. Each picker open re-fetches. Acceptable because (a) the picker fetch is debounced + scoped, (b) provider rate limits are friendlier on read endpoints than write, (c) the alternative — TTL-based caching — is its own correctness surface (cache invalidation on integration disconnect, on workflow edit, etc.) that doesn't deserve a v1 design.
- **Multi-select / multi-pick.** `multiple: true` on combobox is already declared unimplemented (Slice 3.7 deferral). Lands when a real multi-pick consumer appears.
- **Server-driven option icons / groupings.** §3.2.

### 3.5 OptionItem error model

Resolvers fail loudly. The route returns a discriminated body:

```ts
// Success
{ ok: true, items: OptionItem[], hasMore: boolean }
// Error
{ ok: false, code: OptionsApiErrorCode, message: string }
```

Where `OptionsApiErrorCode` is a small finite enum:
- `UNAUTHENTICATED` — no user session
- `INTEGRATION_DISCONNECTED` — user is authenticated but the provider integration row is missing / revoked / disabled
- `SOURCE_NOT_FOUND` — unknown `optionsSource` key
- `MISSING_DEPENDENCY` — a required `deps[parentField]` value is missing
- `PROVIDER_ERROR` — upstream provider returned a non-2xx; resolver re-classifies as PROVIDER_ERROR with a sanitized message
- `SERVER_ERROR` — internal failure
- `UNKNOWN`

The renderer maps each code to a distinct UX:
- `UNAUTHENTICATED` → "Please sign in." (rare in practice — the modal closes if auth dies).
- `INTEGRATION_DISCONNECTED` → "Connect your Slack account first." + an action that links to the integrations page.
- `MISSING_DEPENDENCY` → "Select <parent field> first." (rendered as a passive helper text — not an error).
- `PROVIDER_ERROR` → "Couldn't load Slack channels. Try again." + a retry button.
- Others → "Couldn't load options. Try again."

---

## 4. Server / API design

### 4.1 Route shape — `GET /api/options/[source]`

```
GET /api/options/[source]?q=<query>&deps[<parentField>]=<value>...
```

Examples:
```
GET /api/options/slack:channels
GET /api/options/slack:channels?q=eng
GET /api/options/airtable:tables?deps[baseId]=app01ABCDEF
GET /api/options/google-sheets:sheets?deps[spreadsheetId]=1A2B3C&q=Q4
```

Why GET-with-query-params and not POST:
- Read-only.
- Cache-friendly at the HTTP layer (browser dedupes identical GETs in flight).
- Mirrors the existing `/api/providers/[id]/actions` shape.
- Search and deps stay in the URL — no JSON body parsing overhead per debounced keystroke.

The route file lands at `app/api/options/[source]/route.ts`. The `[source]` segment carries the URL-encoded `provider:resource` key (e.g. `slack%3Achannels`).

### 4.2 Server-side responsibilities

1. `requireUser()` — same helper used by the providers routes.
2. Decode `source` and resolve it via the option-source registry (§5).
3. If the resolver declares `requiresIntegration: true` (true for every non-native resolver), look up the user's active integration via `repositories/integrations.getActiveForExecution(provider, userId)`. Missing / revoked → return `INTEGRATION_DISCONNECTED`.
4. Parse `q` (trim, length cap) and `deps[*]` from the query string. Validate required deps against the resolver's declared `requiredDeps`. Missing → return `MISSING_DEPENDENCY` with the missing field name.
5. Invoke the resolver with `{userId, integration, q, deps}`. Resolver returns `{items: OptionItem[], hasMore: boolean}` or throws a typed `OptionsResolverError` with one of the codes above.
6. Map any uncaught error → `SERVER_ERROR` with a sanitized message. No token leakage. No raw provider response bodies in the message.

### 4.3 Stable response shape

```ts
// Success
{
  ok: true;
  source: string;             // echo "slack:channels"
  items: ReadonlyArray<OptionItem>;
  hasMore: boolean;
}
// Error
{
  ok: false;
  source: string;
  code: OptionsApiErrorCode;
  message: string;
  missingDependency?: string; // only when code === "MISSING_DEPENDENCY"
}
```

Echoing `source` in both shapes makes log scraping + client-side cache keys trivial.

---

## 5. Option source registry

### 5.1 Module shape — `services/options/_registry.ts`

```ts
// services/options/_registry.ts (sketch — DO NOT implement in this slice)
import type { ProviderIntegration } from "@/repositories/integrations";

export interface OptionsResolverContext {
  userId: string;
  /** Active integration for the resolver's provider; null only when requiresIntegration === false. */
  integration: ProviderIntegration | null;
  /** Trimmed search query. Empty string when absent. */
  q: string;
  /** Resolved dependsOn values, keyed by field name. */
  deps: Readonly<Record<string, string>>;
}

export interface OptionsResolverResult {
  items: ReadonlyArray<OptionItem>;
  hasMore: boolean;
}

export interface OptionsResolver {
  source: string;                         // "slack:channels"
  provider: string;                       // "slack"
  requiresIntegration: boolean;           // true for every non-native resolver
  requiredDeps?: ReadonlyArray<string>;   // ["baseId"] for airtable:tables
  resolve: (ctx: OptionsResolverContext) => Promise<OptionsResolverResult>;
}

const ALL_RESOLVERS: ReadonlyArray<OptionsResolver> = [
  // slackChannelsResolver,
  // slackUsersResolver,
  // ...
];

// Validate on module load (same discipline as services/discovery/_registry.ts).
const bySource: ReadonlyMap<string, OptionsResolver> = (() => {
  const m = new Map<string, OptionsResolver>();
  for (const r of ALL_RESOLVERS) {
    if (m.has(r.source)) {
      throw new Error(`Duplicate options resolver: ${r.source}`);
    }
    m.set(r.source, r);
  }
  return m;
})();

export function getOptionsResolver(source: string): OptionsResolver | undefined {
  return bySource.get(source);
}
```

### 5.2 Resolver placement — colocated under provider trees

Each resolver lives at `integrations/<provider>/options/<resource>.ts`. Examples:

```
integrations/slack/options/channels.ts            → exports slackChannelsResolver
integrations/slack/options/users.ts               → exports slackUsersResolver
integrations/airtable/options/bases.ts            → exports airtableBasesResolver
integrations/airtable/options/tables.ts           → exports airtableTablesResolver (requiredDeps: ["baseId"])
integrations/google-sheets/options/spreadsheets.ts
integrations/google-sheets/options/sheets.ts
```

Why colocate:
- Mirrors `integrations/<provider>/actions/<name>.{ts,schema.ts,meta.ts}` layout.
- Each resolver imports the existing `integrations/<provider>/api/*` wrappers — no new HTTP code.
- Provider-specific scope / auth concerns stay inside the provider tree.

The central registry `services/options/_registry.ts` imports each resolver explicitly. Same hand-maintained discipline as `services/discovery/_registry.ts`.

### 5.3 Server-only — never imported by client code

`services/options/` MUST NOT be importable from `features/` / `app/(builder)/` / `components/`. Enforced by the existing `tests/structure/client-server-boundary.test.ts` pattern. Resolvers may touch service-role Supabase clients (via `repositories/integrations`) and provider SDKs — neither of those is safe to ship in a browser bundle.

---

## 6. Client hook

### 6.1 Shape — `useOptionsSource(source, opts)`

```ts
// features/workflow-builder/hooks/useOptionsSource.ts (sketch)
export interface UseOptionsSourceArgs {
  source: string | null;                          // null when the field has static options
  deps?: Readonly<Record<string, string>>;        // dependsOn values (already resolved upstream)
  query?: string;                                  // raw author input — hook debounces internally
  /**
   * When false, the hook returns a disabled-state result without
   * fetching. Used when a dependsOn parent is unset OR the integration
   * is known-disconnected upstream.
   */
  enabled?: boolean;
}

export type UseOptionsSourceResult =
  | { status: "idle";        items: readonly []; hasMore: false }
  | { status: "loading";     items: readonly OptionItem[]; hasMore: boolean }   // items = previous page during refetch
  | { status: "ready";       items: readonly OptionItem[]; hasMore: boolean }
  | { status: "empty";       items: readonly []; hasMore: false }
  | { status: "error";       items: readonly []; hasMore: false; code: OptionsApiErrorCode; message: string;
        missingDependency?: string }
  | { status: "disconnected"; items: readonly []; hasMore: false; provider: string };
```

### 6.2 Internal behavior

- Debounce `query` by **250 ms** before re-fetch.
- Abort in-flight fetches on dep change / unmount via `AbortController`.
- Use `lib/api/options.ts` (new typed client; mirror `lib/api/discovery.ts` shape).
- When `enabled === false`, return `{status: "idle", ...}` without touching the network.
- When `deps` includes the resolver's required parent, but the value is empty/missing → caller is responsible for passing `enabled: false` + a helper text. The hook does NOT inspect the resolver's `requiredDeps` (it doesn't know them; resolver lives server-side). The route returns `MISSING_DEPENDENCY` if the caller forgot; the hook surfaces it.
- DOES NOT cache across mounts in v1. Each mount of a picker triggers a fresh fetch. This is fine for v1; caching is a future slice.

### 6.3 What the hook does NOT do

- Does NOT import `services/options/_registry.ts` — server-side only.
- Does NOT decide visibility or disabled-because-of-deps. The renderer is responsible for evaluating `dependsOn` + setting `enabled`.
- Does NOT mutate `configSlice`. The picker calls `onChange` exactly like static-option pickers do.

---

## 7. Renderer changes

### 7.1 `ComboboxField` first (recommended primary async consumer)

Why ComboboxField, not SelectField:
- ComboboxField already ships `CommandInput` (search input). Async loading + search compose naturally.
- SelectField is a Radix Select — its native semantics don't include typeahead / search; adding async fetch to a non-searchable control produces a worse UX for >10 items.
- The contract already validates `optionsSource` on both — meta authors can choose either, but `combobox` is the right answer for any source with >10-ish items.

Changes:
- Branch on `field.optionsSource !== undefined`.
- Call `useOptionsSource({source, deps, query, enabled})`.
- Render the `Command`/`Popover` shell as today, but populate `CommandItem`s from `result.items`.
- Render distinct UX per `result.status`: `loading` (spinner row), `ready` (items), `empty` ("No matches" or "No items yet."), `error` (inline error + retry button), `disconnected` ("Connect <provider>" + link), `idle` ("Select <parent> first" — derived from `dependsOn` parent label).
- The author's typing populates `query` directly. Hook debounces.

### 7.2 `SelectField` — minimal async support, locked-options only

For sources where static-list UX (no search needed) is fine — e.g. small enumerations a provider exposes (`hubspot:pipelines` typically <10 entries) — `SelectField` could also accept `optionsSource`. But:

- v1 ships ComboboxField async support ONLY.
- `SelectField` retains "static options only" behavior.
- A future slice can backport async-mode to SelectField if a real consumer appears with no need for search.

This narrows scope while keeping the contract honest (the contract allows `optionsSource` on both; the renderer for select just refuses to load it in v1 with a clear "use combobox" hint).

### 7.3 `dependsOn` cascade — minimal SchemaForm change

When `field.dependsOn` is set:
- SchemaForm reads `parentValue = values[field.dependsOn]`.
- Passes `deps: { [field.dependsOn]: parentValue }` + `enabled: parentValue !== undefined && parentValue !== ""` to the field renderer (combobox).
- When a parent's value changes, SchemaForm clears the dependent field's value (`configSlice.updateField({nodeId, name: dependentField, value: ""})`) — same UX as Stripe/Outlook cascading-fields pattern documented in the existing CLAUDE.md.

This is the smallest change that makes Airtable / Sheets / Teams chains usable. NO multi-hop dependency graph in v1 — `dependsOn` stays a single-parent string per the existing contract.

### 7.4 Mutual-exclusion check — already enforced

`FieldMetaSchema.superRefine` already rejects metas that declare BOTH `options` and `optionsSource`. No change.

---

## 8. First real consumer — Slack channels

### 8.1 Why Slack channels

1. The Slack `conversationsList` wrapper already exists ([`integrations/slack/api/conversationsList.ts`](../../../integrations/slack/api/conversationsList.ts)) — paginated, cursor-aware, scope-aware. The resolver is a thin transform layer over it.
2. Slack already has 10 trigger metas + 2 file action metas → adding `optionsSource: "slack:channels"` to existing meta fields is a small, reviewable patch (today they're `type: "text"` with a strict-regex placeholder).
3. Channel-id-as-text is the most obviously-bad UX in the shipped builder. Authors copy a channel id from Slack admin tools today. A picker eliminates that workflow.
4. Slack OAuth + integration runtime is mature — no provider-side risk.
5. Search is meaningful even on day one — channel-name typeahead.

### 8.2 Sketch of the resolver

```ts
// integrations/slack/options/channels.ts (sketch — DO NOT implement in this slice)
import { conversationsList } from "../api/conversationsList";
import { decryptToken } from "@/core/encryption/tokens";
import type { OptionsResolver } from "@/services/options/_registry";

export const slackChannelsResolver: OptionsResolver = {
  source: "slack:channels",
  provider: "slack",
  requiresIntegration: true,
  async resolve({ integration, q }) {
    const botToken = decryptToken(integration!.encryptedAccessToken);
    // Slack 2.3 used public + private. Same here.
    const page = await conversationsList({
      botToken,
      types: "public_channel,private_channel",
      excludeArchived: true,
      limit: 200,
    });
    const channels = page.channels.map((c) => ({
      value: String(c.id),
      label: `#${String(c.name)}`,
      ...(typeof c.purpose === "object" && c.purpose && "value" in c.purpose
        ? { description: String((c.purpose as { value?: unknown }).value ?? "") }
        : {}),
    })).filter((opt) => opt.value !== "");
    const filtered = q
      ? channels.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()))
      : channels;
    return { items: filtered, hasMore: page.hasMore };
  },
};
```

Notes:
- v1 search is client-side filter over a single 200-item page. Slack's `conversations.list` doesn't accept a server-side query; this matches Slack's own native picker behavior.
- `hasMore: true` from Slack passes through honestly so the renderer can show "Showing first 200; refine with search."
- No token logging. No raw Slack body fields beyond `id` / `name` / `purpose.value`.

### 8.3 First meta upgrade

A handful of Slack action metas in the broader-action batch will land `channel: { type: "combobox", optionsSource: "slack:channels", ... }` instead of `text`. The first prove-out is `slack:send_channel_message.channel` once Slack broader actions land — but the option-source plumbing ships before that batch.

For Slice 3.33 (first concrete consumer), the minimum target is **one existing Slack meta upgraded**: `slack:upload_file.channel` already exists today and is a perfect first test bed. The integration test would mirror Slice 3.27's existing `slack-upload-file-config.test.tsx`, adding a step where the picker fetches channels and the author picks one.

---

## 9. Testing plan

### 9.1 Contract / structure tests

- No `actionMeta.ts` changes → no new contract tests. Existing `optionsSource`-related tests (mutual-exclusion with `options`, select/combobox-only) continue to pass.

### 9.2 Server resolver registry tests

`tests/unit/services/options/_registry.test.ts`:
- `getOptionsResolver("slack:channels")` resolves to the right resolver object.
- Duplicate-source registration throws at module load.
- Every registered resolver matches the `<provider>:<resource>` key format.

### 9.3 API route tests

`tests/unit/app/api/options/[source]/route.test.ts`:
- 401 when unauthenticated.
- 404 / `SOURCE_NOT_FOUND` for unknown source.
- 200 + `INTEGRATION_DISCONNECTED` (in body, ok:false) when the user has no active integration.
- 200 + `MISSING_DEPENDENCY` when a required `deps[parent]` is absent.
- 200 + items + `hasMore: false` happy path with a fixture resolver.
- 200 + `PROVIDER_ERROR` when the resolver throws.
- Query-string decode: `q`, `deps[*]`, multiple deps.

### 9.4 Client hook tests

`tests/unit/features/workflow-builder/hooks/useOptionsSource.test.tsx`:
- `idle` when `enabled: false`.
- `loading → ready` on success.
- `loading → error` with code passed through.
- `loading → disconnected` mapping.
- Debounce: rapid `query` changes coalesce into one fetch.
- Abort: dep change cancels the in-flight fetch (the prior fetch's result does NOT overwrite the new one).

### 9.5 Renderer tests

`tests/unit/features/workflow-builder/config-modal/fields/ComboboxField.test.tsx` (extend):
- Static-options path still works (existing behavior).
- Async path with mocked `useOptionsSource` returning `ready` items → renders items, click selects.
- `loading` shows spinner row.
- `empty` shows "No matches."
- `error` shows error + retry button; retry triggers a refetch.
- `disconnected` shows the "Connect <provider>" link.
- `dependsOn` parent unset → `enabled: false` → renders "Select <parent> first" helper.

### 9.6 Integration test

`tests/integration/features/workflow-builder/slack-channels-picker.test.tsx`:
- Pre-existing test scenario from Slice 3.27 (`slack:upload_file`), augmented:
  - Pre-existing Slack integration row in store (no real OAuth fetch).
  - The `channel` field renders as ComboboxField (not TextField).
  - Opening the picker calls `/api/options/slack:channels` via the mocked client.
  - Returned items appear; clicking one sets `config.channel` to the channel id.
  - Modal Save + Toolbar Save round-trip preserve the chosen id.

### 9.7 Structure tests

- `tests/structure/client-server-boundary.test.ts` is amended (or already enforces) to fail if `services/options/` is imported from `features/` or `app/(client)/`.

---

## 10. Implementation sequence

Each row is its own slice. Each is small.

| Slice | Scope | Approx size |
| --- | --- | --- |
| **3.29 (this doc)** | Plan locked. | — |
| **3.30 — Options API + registry skeleton.** | Add `services/options/_registry.ts`, `app/api/options/[source]/route.ts`, `lib/api/options.ts` (typed client), `services/options/types.ts` (`OptionItem`, error codes, etc.). Ship with ONE static fixture resolver (`native:examples`) used by API + registry tests. NO provider resolver. NO renderer changes. | ~400 LoC + tests |
| **3.31 — `useOptionsSource` hook + ComboboxField async mode.** | New hook. ComboboxField branches on `optionsSource`. Renderer tests + hook tests. NO new resolver beyond Slice 3.30's fixture. | ~300 LoC + tests |
| **3.32 — Slack channels resolver + `slack:upload_file.channel` meta upgrade.** | Add `integrations/slack/options/channels.ts`; register; flip `channel` field on `slack:upload_file.meta.ts` to `type: "combobox", optionsSource: "slack:channels"`. Update the existing integration test (`slack-upload-file-config.test.tsx`) to drive the picker. | ~250 LoC + tests |
| **3.33 — `dependsOn` cascade in SchemaForm.** | Minimal SchemaForm change: when a parent field changes, clear the dependent field's value. Pass `deps` + `enabled` to ComboboxField. Lands ahead of Airtable / Sheets / Teams to prove the cascade independently of a deep dependency chain. Demo target: a synthetic `native:examples` parent/child pair in the fixture resolver. | ~200 LoC + tests |
| **3.34+** | Broader Slack action batch — leverages `optionsSource: "slack:channels"` + (new) `"slack:users"`. Drops every channel-id `text` field across the new metas. | per-batch |
| **later** | Airtable resolver + `airtable:bases`/`airtable:tables` (depends on 3.33) | per-batch |
| **later** | Google Sheets resolver + spreadsheet/sheet cascade | per-batch |
| **later** | HubSpot / Notion / Stripe / Mailchimp / Microsoft Teams resolvers | per-batch |

The infra arc (3.30 → 3.31 → 3.32 → 3.33) is **four small slices** before the first end-to-end picker ships. Slice 3.34 is when "broader Slack metadata" can start landing cleanly.

---

## 11. Explicit out-of-scope

- Full Slack metadata batch (Slice 3.34+ territory).
- Notion / Airtable / Google Sheets / HubSpot / Stripe option-source resolvers.
- Caching persistence layer (server-side TTL, browser-side stable cache).
- Pagination plumbing through the client / renderer beyond `hasMore: boolean`.
- Multi-select async pickers (`multiple: true` on combobox stays deferred).
- Provider-specific picker components (deliberately rejected — the whole point of `optionsSource` is provider-neutral metadata-driven forms).
- AI suggestions in the picker.
- Permissions / admin UI / per-workspace allowlist.
- Runtime provider action / handler changes.
- Changes to `FileRefSchema`.
- Pushing / PR creation.

---

## 12. Open decisions for Marcus

Recommended defaults are listed; mark any disagreements when you accept the plan.

| Decision | Recommended default | Why |
| --- | --- | --- |
| `optionsSource` key format | `"<provider>:<resource>"` (e.g. `slack:channels`) | Mirrors `ActionMeta.key`; pre-existing contract validator already accepts. |
| API route shape | `GET /api/options/[source]` with `?q=` + `?deps[parent]=` query params | Read-only; cache-friendly; mirrors discovery route. |
| Pagination v1 | None — single page, `hasMore: boolean` flag passes through | Cursor plumbing adds 3 files of indirection; defer until a real overflow surfaces. |
| Search v1 | Yes — debounced 250 ms via `query` in the hook | Required for Slack channels; trivial to wire. |
| First consumer | `slack:upload_file.channel` (already shipped meta, easy to upgrade) | Lowest-risk prove-out; existing integration test extends rather than gets recreated. |
| Async-mode owner | ComboboxField (NOT SelectField) | SelectField has no search affordance; async without search is bad UX. |
| Integration-disconnected gate | Surface as a discriminated `disconnected` hook result + a "Connect" CTA in the picker; do NOT block opening the picker | Picker open is itself a useful "explain what would happen" moment; gating it by integration status would hide the affordance. |
| `dependsOn` cascade | Single-parent only (no multi-hop graph); SchemaForm clears dependent value when parent changes | Matches what's in the contract; multi-hop graphs are speculative scope. |
| OptionItem extension | None in v1 — stay on `{value, label, description?}` | Adding `group` / `icon` / `disabled` / `metadata` is speculative; each can land slice-by-slice once a real consumer needs it. |
| Server-side filter vs client-side filter | Client-side for v1 (filter the single page) | Slack's `conversations.list` has no server-side `q` parameter; pretending one exists is misleading. |
| Cache | None — every picker open re-fetches | TTL caches need invalidation design; v1 is correct-by-construction without one. |
| Test ergonomics | New `tests/unit/services/options/...` + `tests/unit/features/workflow-builder/hooks/useOptionsSource.test.tsx` + extend existing Slack upload-file integration test | Each layer testable in isolation; matches existing tests structure. |
