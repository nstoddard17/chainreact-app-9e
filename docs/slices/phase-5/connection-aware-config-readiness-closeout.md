# Connection-Aware Config Readiness (CONNECTION-AWARE-READINESS-1)

Follow-up to SPREADSHEET-CONFIG-REDESIGN-1 (`2aee428af` code, `ffc48d93a`
closeout). That slice shipped the shared readiness banner on every node
config menu but deferred one honesty gap: the banner could say "Ready to
run" while the provider app was not connected. This slice closes it for
ALL provider-backed actions and triggers, in the shared readiness
infrastructure (not an Excel-only patch).

- Code commit: `8be055f13` (local, v2-main, NOT pushed)
- Docs commit: this file, committed separately after the code commit

## Product rule shipped

A node's banner says "Ready to run" (actions) / "Ready to activate"
(triggers) ONLY when all of:
1. no blocking field validation errors (advanced JSON / router / inline),
2. the required app connection exists and is usable,
3. required setup fields are filled.

Priority when several apply: blocking errors, then connection, then
missing fields, then ready. Saving a draft is unchanged: the Save button
is still gated only by the pre-existing validation blockers, never by a
disconnected app. The banner is about runnability, the footer about
dirty/saved state.

## Where connection status comes from (no new endpoint needed)

Reused end to end from REACT-AGENT-READINESS-1:

- Server brain: `services/diagnostics/integrationConnection.ts`
  (`diagnoseWorkflowConnections`), the existing source of truth for
  "is every provider this graph uses connected and usable" (integration
  rows, `needs_reconnect_at`, scopes, provider enablement, credential
  provenance).
- Session route: `POST /api/workflows/[id]/connection-readiness`
  (auth, member gate with 404 no-leak, sanitized DTO: enums / booleans /
  counts / node ids / manifest display name only; never tokens,
  providerAccountId, connectedByUserId, or raw timestamps).
- Typed client: `lib/api/workflowConnectionReadiness.ts`.
- Builder hook: `features/workflow-builder/hooks/useConnectionReadiness.ts`
  (signal: disabled / loading / error / resolved; per-provider state
  connected / missing / invalid + safe reason code + manifest name).

No repositories, provider APIs, or service-role paths are reachable from
the client; the shell talks only to the existing hook.

## What changed

- `ConfigModalShell` now runs the connection check for the active node
  when its metadata says `requiresIntegration: true` and the provider is
  not `native` (the `ConfigurableMeta` view gained that field). The hook
  gets the live pending graph, so it refetches only when provider usage
  changes, not per keystroke. Native/logic nodes never fetch.
- New pure mapper
  `features/workflow-builder/config-modal/readiness/connectionInput.ts`:
  signal + active provider to
  `not-required | checking | connected | missing | reconnect-required |
  attention | unknown` plus the provider display name. Loading maps to
  `checking`; error / disabled / missing-entry map to `unknown`; invalid
  entries with re-authorizable reasons (needs_reconnect, token_expired,
  missing_scopes, disconnected) map to `reconnect-required`, anything
  else (e.g. provider disabled) to `attention`. Nothing is ever guessed
  as connected.
- `computeConfigReadiness` accepts the optional `connection` input,
  prepends a connection checklist row for definitive states ("Slack is
  connected" / "Connect Slack" / "Reconnect Slack"), applies the
  priority above, and emits headline copy:
  - missing: "Connect Microsoft Excel to run this step" (triggers:
    "... to activate this trigger")
  - reconnect-required: "Reconnect Microsoft Excel to run this step"
  - attention: "Connection needs attention"
  - checking: "Checking connection…" (never Ready while in flight)
  - unknown: "Couldn't check the app connection" (never Ready on error)
  It also emits an optional CTA (`Connect <Provider>` /
  `Reconnect <Provider>`, href `/apps`).
- `NodeConfigReadinessBanner` renders the CTA as a link. The Apps page
  is the canonical connect/reconnect surface; the OAuth callback already
  redirects back to `/apps`.

## Account scoping and credential rules

The client never chooses an account. The route resolves the WORKFLOW's
account server-side, gates on membership (404 no-leak), and the brain
re-derives authorization from the saved record, including the personal
vs account credential walls (22B/22D). A connection belonging to another
account cannot satisfy readiness: a non-OK access verdict surfaces to the
client as an error signal, which renders "Couldn't check the app
connection" and never "Ready to run". Server-side scoping is pinned by
the pre-existing tests
`tests/unit/app/api/workflows/connection-readiness-route.test.ts` and
`tests/unit/services/diagnostics/integrationConnection.test.ts`; the
client half (non-OK access never ready) is pinned in this slice's shell
suite. The DTO carries no owner identity, so no team member's private
personal connection is exposed; the banner shows only provider-level
status and the manifest display name.

Workflows without an id (local-only builder) skip the fetch and render
the honest `unknown` state for provider-backed nodes rather than
silently dropping the requirement.

## Behavior summary

| Node | Connection | Fields | Banner |
|---|---|---|---|
| Native | n/a | missing | "N things left to fill in" (no connection row, no fetch) |
| Native | n/a | valid | "Ready to run" |
| Provider | checking | any | "Checking connection…" |
| Provider | missing | any | "Connect X to run this step" + Connect CTA |
| Provider | unusable | any | "Reconnect X to run this step" / "Connection needs attention" + Reconnect CTA |
| Provider | unknown/error | any | "Couldn't check the app connection" |
| Provider | connected | missing | "One thing left to fill in" (connected row checked) |
| Provider | connected | valid | "Ready to run" / "Ready to activate" |
| Any | any | invalid | "Fix one field before saving" (outranks everything) |

## Files changed (commit 8be055f13)

- `features/workflow-builder/config-modal/readiness/connectionInput.ts` (new)
- `features/workflow-builder/config-modal/readiness/computeConfigReadiness.ts`
- `features/workflow-builder/config-modal/NodeConfigReadinessBanner.tsx`
- `features/workflow-builder/config-modal/ConfigModalShell.tsx`
- Tests:
  - `tests/unit/features/workflow-builder/config-modal/readiness/connectionInput.test.ts` (new, 7)
  - `tests/unit/features/workflow-builder/config-modal/readiness/computeConfigReadiness.test.ts` (+8 connection cases)
  - `tests/unit/features/workflow-builder/config-modal/connection-aware-readiness.test.tsx` (new, 8: missing / reconnect / connected+missing-fields / connected+valid / in-flight / failed / non-OK access / no-internals sweep)
  - `tests/unit/features/workflow-builder/config-modal/NodeConfigReadinessBanner.test.tsx` (+1: native nodes make no connection call and show no connect copy)
  - `tests/integration/features/workflow-builder/microsoft-excel-add-row-config.test.tsx` (connected mock + connected checklist row assertion)

## Verification (commands actually run, ChainReactV2)

- `npm run typecheck` (tsc --noEmit): PASSED after this slice's changes.
- `npx eslint <all files changed by this slice>`: CLEAN.
- `npm run lint` (whole repo): 6 errors + 13 warnings. ALL 6 errors are
  in the parallel session's in-flight QuickBooks test files
  (`tests/unit/integrations/quickbooks/*`, `RequestInit` no-undef); the
  13 max-lines warnings are the same inherited set as the previous
  slice. None are in this slice's files.
- `npm run lint:structure`: FAILS on `repositories` at 51 files. That
  51st file is the parallel session's in-flight work; this slice adds
  no file to `repositories/` (its new files live under
  `config-modal/readiness/`, 3 files).
- Focused jest: readiness + connection + banner + Excel integration +
  ConfigModalShell: 6 suites, 93/93 passed. Regression sweep
  (spreadsheet field + serialize, JsonField, KeyValueListField,
  ObjectListField, MultiOptionsField, SchemaForm, config-copy-guard,
  google-sheets append, HubSpot webhook trigger, provider-action
  config): all passed (87 tests in the final combined run).

## Inherited / parallel failures

- `tests/unit/app/api/workflows/connection-readiness-route.test.ts`
  PASSED earlier in this session, then began failing to LOAD mid-slice
  with `Cannot find module './supabase/serviceRoleClient' from
  'repositories/integrationsRefresh/index.ts'`. That module is the
  parallel session's in-progress `repositories/` refactor (created
  while this slice was running); the failure reproduces with this
  slice's changes absent since it is a module-resolution error in a
  path this slice never touches.
- QuickBooks lint errors and the `repositories` leaf-count violation:
  same parallel session, untouched per constraints.

## Push status

Nothing pushed. Local commits only (`8be055f13` + this docs commit).
Previous commits `2aee428af` / `ffc48d93a` / `0cb7c101c` / `60529e050`
untouched. The parallel session's staged QuickBooks files were left
staged and uncommitted by using pathspec-limited commits.
