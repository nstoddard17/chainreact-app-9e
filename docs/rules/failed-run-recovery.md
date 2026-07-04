# Failed-Run Recovery (CR-FAILREASON)

Durable cross-cutting product + security rule. Every failed workflow run MUST show
a clear human reason and, when a classification exists, exactly ONE primary next
action. Completed across two slices:

- **CR-FAILREASON-1** (commit `668005efa`): the shared classification taxonomy +
  no-leak persistence.
- **CR-FAILREASON-2** (commit `cacb40a71`): one primary CTA / guidance rendered
  from the persisted action on every failed-run surface.

## The action taxonomy (source of truth)

The classified action is one of five values, defined ONCE and kept in lockstep
across the humanizer, the wire contract, the repository type, and the AI-repair /
diagnosis mirrors:

`reconnect` | `open_node` | `retry_later` | `upgrade_plan` | `contact_support`

| Concern | Location |
|---|---|
| Classifier / humanizer (the ONLY place failures become a reason + action) | [`core/errors/humanizeActionError.ts`](../../core/errors/humanizeActionError.ts) |
| Persistence (sole producer of `error_classification`) | [`services/execution/runPersistence.ts`](../../services/execution/runPersistence.ts) (`classifyForPersistence`) |
| Wire contract (validated on read) | [`contracts/workflow.ts`](../../contracts/workflow.ts) (`HumanizedErrorSchema`) |
| Repository type | [`repositories/workflowRuns.ts`](../../repositories/workflowRuns.ts) (`WorkflowRunErrorClassification`) |
| CTA presentation mapping (action to label + href) | [`core/errors/failedRunCta.ts`](../../core/errors/failedRunCta.ts) |

## Eight durable rules

1. **A failed run shows a clear human reason and one primary next action.** When a
   classification exists, render exactly ONE primary CTA / guidance from its
   `action`. Never five competing actions.
2. **Classification is owned by the shared humanizer, not the UI.** The reason +
   action come from `humanizeActionError`. UI surfaces NEVER parse raw error
   strings to decide a reason or a CTA.
3. **`workflow_runs.error_classification.action` is the CTA source of truth.** The
   CTA is derived from the persisted action via `failedRunCta`, so every surface
   shows the same next action for the same failure.
4. **Unknown / unsafe / unclassified failures default to `contact_support`** with
   safe, fixed copy. Uncertain ⇒ Contact support; never a misleading
   reconnect/fix/retry.
5. **No-leak, persisted AND rendered.** Failed-run summaries and CTA labels/hrefs
   MUST NOT contain raw provider messages or bodies, tokens, OAuth secrets,
   credential ids, provider account ids, webhook payloads, signed URLs, private
   member identities, step output, or stack traces. The generic humanizer branch
   does not echo the raw thrown message; CTA hrefs are static internal routes
   carrying at most the workflow id.
6. **Retry and support are guidance-only until real routes/APIs exist.**
   `retry_later` and `contact_support` render as guidance text, not links: there
   is no retry API and no support route to point at. Do NOT invent fake
   destinations. (The builder Runs-tab detail may reuse its EXISTING safe
   "Run again" test re-run / "Open failed step" affordances; those are real, not
   invented.)
7. **No parallel humanizers and no surface-specific action mappings.** Do not add
   a second classifier or a per-surface action-to-CTA map. Extend the shared
   helpers instead.
8. **Future provider error work extends the shared classifier with safe typed
   codes**, normalized at a boundary (for example the engine handler-error catch
   maps `Unauthorized401Error` / `IntegrationActionRequiredError` /
   `InsufficientScopeError` to typed codes by error name). Do NOT parse raw
   provider text in the UI.

## Current CTA destinations (real routes only)

| Action | Destination | Notes |
|---|---|---|
| `reconnect` | `/apps` | The Apps / reconnect surface. |
| `upgrade_plan` | `/account` | The billing / plan surface. There is no `/subscription` route. |
| `open_node` | `/workflows/{id}` | "Fix workflow setup" fallback. The builder Runs-tab detail instead opens the actual failed node when it is still on the canvas. |
| `retry_later` | none (guidance text) | No retry API. |
| `contact_support` | none (guidance text) | No support route. |
| missing / unrecognized action | no CTA | No misleading affordance; the reason still renders. |

## Surfaces that render the CTA

- Runs page row: [`features/runs/RunRow.tsx`](../../features/runs/RunRow.tsx).
- Builder latest-run drawer: [`features/workflow-builder/panels/RunResultsPanel.tsx`](../../features/workflow-builder/panels/RunResultsPanel.tsx).
- Builder Runs-tab detail: [`features/workflow-builder/canvas/RunDetail.tsx`](../../features/workflow-builder/canvas/RunDetail.tsx) (adds only the link-out CTAs its existing "Open failed step" / "Run again" buttons do not already serve).

Notification fan-out uses the same action via
[`services/notifications/buildWorkflowFailurePayload.ts`](../../services/notifications/buildWorkflowFailurePayload.ts); its generic body guard mirrors the same no-leak posture.

## Tests that lock this in

- `tests/unit/core/errors/humanizeActionError.test.ts` (per-action class + no-leak).
- `tests/unit/services/execution/runPersistence.test.ts` (persisted no-leak; humanizer agreement).
- `tests/unit/contracts/workflow-error-classification.test.ts` (taxonomy parse + back-compat).
- `tests/unit/core/errors/failedRunCta.test.ts` (CTA mapping + no-leak).
- `tests/unit/features/runs/RunRow.test.tsx` + `.../panels/RunResultsPanel.test.tsx` (one CTA per action; missing action renders none; no-leak).
