# REACT-PROVIDER-AMBIGUITY-1 — provider selection is never invented

**Status:** implemented + verified locally (follows `6607fb687` / REACT-CONFIG-COVERAGE-1).
Local commit on `v2-main`, not pushed.

## The correction

"When I receive an email from vendor@example.com, post it to Slack" previously produced
`gmail:new_email`. "Email" names a **capability category**, not a provider — Gmail and
Microsoft Outlook are simultaneous registered candidates (`gmail:new_email` /
`microsoft-outlook:new_email`, both with an optional `from` filter). React now separates the
requested capability (receive email · filter by sender · post to Slack) from the provider that
implements it, and never invents the latter.

## Why Gmail was selected before (audited, exact causes)

1. **Test fixture** — the REACT-CONFIG-COVERAGE-1 regression mocked the model reply with
   `gmail:new_email`; only Gmail was exposed as a candidate in that fixture.
2. **Nothing would have stopped a real Gmail pick**: (a) no deterministic provider-justification
   guard existed anywhere on the plan/edit path — whatever provider the model chose was
   validated only for *existence*, never for *justification*; (b) the EDIT prompt's op-shape
   few-shot example literally used `"provider":"gmail","type":"send_email"`; (c) the prompt had
   no rule that a generic capability word is not a provider choice; (d) the official-template
   strong-match classifier accepted **alias** providers ("email" → gmail|microsoft-outlook) as
   "requested", so a Gmail-trigger template could be auto-recommended without provider evidence.
3. **Not causes:** no hardcoded generic-email→Gmail mapping existed in deterministic completion
   (`inferDeterministicPreviewPlan` has no email pattern; `inferDeterministicMutationOps` already
   asked Gmail-vs-Outlook when ambiguous); catalog ordering feeds only the model.

## The provider-selection decision table (the documented product rule)

Enforced deterministically, server-side, for every model-chosen trigger/action provider —
create path (plan steps) and edit path (`addNode` / `replaceTrigger`) — in
[`services/ai-guidance/providerSelection/providerSelectionGuard.ts`](../../../services/ai-guidance/providerSelection/providerSelectionGuard.ts):

| # | Rule | Justified when | Visibility |
|---|------|----------------|------------|
| 1 | `native` | platform capability (manual/schedule/logic) | n/a |
| 2 | `explicit` | the user named the provider in ANY turn (shared vocabulary — "outlook", "Microsoft email" → microsoft-outlook; generic words never match) | user's own words |
| 3 | `canvas` | the provider is already on the current draft (existing-node context; editing never silently swaps a provider) | on the canvas |
| 4 | `sole-registered` | it is the ONLY registered provider for this kind+category | preview shows the provider on the node card |
| 5 | `sole-connected` | ≥2 registered, but it is the only CONNECTED candidate — the established connected-narrowing contract (same rule `inferDeterministicMutationOps.resolveEmailTarget` has always used) | explicit warning: "Using your connected X … tell me if you'd rather use a different one" |
| — | otherwise | **AMBIGUOUS** → targeted clarification (stable ids + display names), NO plan/preview/proposal committed. If the sole-connected candidate differs from the model's pick, we still clarify — the guard **never substitutes** one provider for another. | `guidanceText` + `providerClarification` response field |

Candidates are computed as a **set** from the registry (same kind + category), all outputs sorted
by display label — registry/catalog/connection **ordering can never change the result**.

## Behavior by eligible/connected count (generic "email" request)

- **Zero connected** → clarification listing supported providers (never defaults to Gmail);
  connecting comes after choosing (selection ≠ connection).
- **Exactly one connected** → that provider is accepted *only if the model chose it*, with a
  visible narrowing notice; a different model pick still clarifies.
- **Two+ connected (or none named)** → clarification: "Which email service should this use:
  Gmail or Microsoft Outlook? I'll keep everything else you've told me."
- **Unsupported provider named ("Yahoo")** → no silent substitution; the clarification presents
  the supported candidates only.

## Before / after — the reported example (both candidates valid)

Before: committed `gmail:new_email` silently. After: **no trigger is committed**; React asks the
targeted question; the tokenized sender (`[[EMAIL_1]]`, bound locally) and every other constraint
ride the conversation; the user answers "Outlook" and the follow-up turn produces
`microsoft-outlook:new_email` with `from = "vendor@example.com"` plus the Slack step — nothing
re-typed, and the raw address is absent from **every** outbound request across both turns
(route-level test pins `JSON.stringify` of all capability calls).

## Bias removals

- EDIT prompt few-shot now provider-neutral (`"<provider from the catalog>"`), plus an explicit
  PROVIDER RULE (generic word ≠ provider; ask; never default to Gmail or first catalog entry;
  carry every already-given value through the clarification).
- Template strong-match provider evidence is now **explicit-only** — aliases remain weak ranking
  signal but can never auto-recommend a template whose provider the user didn't name (all 67
  existing matcher tests still green; explicit-Gmail requests still strong-match).

## REACT-CONFIG-COVERAGE-1 preserved

The field-coverage parity suite (505 nodes / 1,845 fields), sanitizer, resolver pass, and
sensitive-literal round trip are untouched and green; after clarification the chosen provider's
canonical fields (required AND optional) are populated exactly as before. Three legacy route
tests that encoded the silent-Gmail assumption were updated to name their provider (their purpose
is pipeline plumbing, not provider inference).

## Files changed

- `services/ai-guidance/providerSelection/providerSelectionGuard.ts` (new) — decision table.
- `services/ai-guidance/providerVocabulary.ts` (new) — shared mention vocabulary (extracted from
  `promptFieldSchemas`, which now consumes it — prompt narrowing and the guard can't diverge).
- `app/api/accounts/[id]/ai/workflow-guidance/route.ts` — guard wiring (create + edit),
  `providerClarification` response field, narrowing notices.
- `services/ai-guidance/gateway/buildGatewayGuidancePrompt.ts` — neutral example + provider rule.
- `core/workflows/officialTemplateMatcher.ts` — strong-match `requested` = explicit only.
- `lib/api/ai/guidance.ts` — response type for `providerClarification`.

## Tests added (26)

- `tests/unit/services/ai-guidance/providerSelectionGuard.test.ts` (11) — every decision-table
  row, both-candidates precondition, order independence (reversed candidates → identical verdict
  + label-sorted options), no-substitution, sole-connected notice.
- `tests/unit/app/api/accounts/ai-workflow-guidance-provider-ambiguity.test.ts` (11) — required
  scenarios 1–7 + 12, incl. the two-turn clarification continuation with sender + subject
  preservation and the two-turn no-leak proof.
- `tests/unit/services/ai-guidance/providerAmbiguityIndependence.test.ts` (4) — scenario 9:
  Gmail-template auto-recommendation blocked for generic email (explicit Gmail still strong),
  prompt carries no Gmail few-shot + states the rule.

## Verification (2026-07-19)

`npx tsc --noEmit` clean · `npm run lint -- --max-warnings=0` 0 errors / 18 pre-existing warnings
· `lint:structure` / `lint:migrations` OK · impacted server sweep 189 suites / 2,355 tests green ·
client rail sweep 43 suites / 485 tests green · full `npm test`: failure set **byte-identical**
to the pre-existing baseline verified against clean HEAD (environment/live-DB + known drifts);
25,629 passed. Nothing pushed, no deploy, no migration.
