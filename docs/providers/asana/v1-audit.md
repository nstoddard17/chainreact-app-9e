# Asana V1 audit

Date: 2026-07-04
V1 repo inspected: `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e` (archived reference)

## Verdict

**V1 never shipped an Asana provider.** There is no Asana OAuth config, no node definitions, no action or trigger handlers, no data fetchers, no scopes, no webhook route, and no provider-registry entry. V2's Asana integration is a green-field build using current V2 provider patterns (Monday as the closest structural template: personal refreshable OAuth + per-resource webhook triggers; HubSpot for the REST `_request` shape; Airtable for the per-webhook-secret precedent).

## What was inspected

Full-repo case-insensitive grep for `asana` (16 files), then registry-level verification:

- `lib/workflows/nodes/providers/` - directory listing: NO `asana` folder (31 provider folders exist; asana absent).
- `lib/workflows/nodes/index.ts` - no asana references.
- `lib/integrations/integrationScopes.ts` - no asana scopes.
- V1 provider registry / oauthConfig - no asana entries surfaced by the grep.

## The 16 files that mention "asana" (all cosmetic or orphan)

| File | What it is | Decision |
|---|---|---|
| `lib/integrations/brandNames.ts:52` | `'asana': 'Asana'` display-name map entry | skip (V2 manifest carries displayName) |
| `lib/workflows/builder/providerNames.ts:17` | same display-name map | skip |
| `lib/workflows/cost-calculator.ts:78` | `'asana': 1` task-cost row for a provider that never existed | skip |
| `lib/waitlist/integrations.ts:67` | waitlist marketing entry ("Task management") | skip |
| `lib/workflows/ai-agent/providerDisambiguation.ts` | AI prompt-disambiguation patterns (`/\basana\b/i`, category task) | skip (V2 AI visibility derives from real registries) |
| `lib/workflows/actions/hitl/downstreamVariables.ts:88,95` | orphan variable stubs for `asana_create_task` / `asana_update_task` - node types that were NEVER registered | skip (orphans; registry presence defines what shipped) |
| `src/lib/workflows/builder/agent/planner.ts` | planner keyword references | skip |
| `components/templates/TemplateGallery.tsx`, `TemplatePreviewModal.tsx`, `components/workflows/ai-builder/AIAgentCoralContent.tsx` | UI copy / template gallery mentions | skip |
| `STRATEGY.md`, `learning/**` (4 docs) | roadmap/docs mentions ("Asana coming soon" class) | skip |

## V1 behavior findings (per required checklist)

- V1 OAuth/auth behavior: none for Asana.
- V1 actions found: none registered. The two HITL downstream-variable stubs (`asana_create_task`, `asana_update_task`) reference node types with no node definition, no handler, and no registry entry - classic V1 orphan files; not ported on file presence.
- V1 triggers/webhooks/polling: none.
- V1 option/data fetchers: none.
- V1 scopes: none.
- V1 bugs/duplicates/orphans: only the two orphan stubs above.

## Port decisions

| V1 artifact | Decision | Reason |
|---|---|---|
| (no provider) | n/a | nothing to port |
| `asana_create_task` / `asana_update_task` variable stubs | skip | orphans; V2 defines its own bounded output contracts in `.meta.ts` files |
| Display-name/cost/waitlist rows | skip | cosmetic; V2 equivalents derive from the manifest + discovery registries |

## V2 divergences (vs. what V1's stubs implied)

- Action ids are V2-canonical `asana:create_task` etc. (provider:type), not V1's `asana_create_task` flat strings.
- Outputs are bounded, meta-declared contracts (`taskGid`, `permalinkUrl`, ...) instead of the stubs' ad-hoc `{ id, name, url }` guesses.
- Since nothing shipped in V1, there are no V1 field-name compatibility constraints (unlike Monday's preserved camelCase); V2 chooses clean names (`projectId`, `taskGid`, `dueOn`).
