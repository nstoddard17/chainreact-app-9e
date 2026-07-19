# REACT-PROVIDER-AMBIGUITY — provider selection is never invented

**Status:** implemented + verified locally across two slices, both local on `v2-main`, not pushed:

- **-1** (`dcdc1cebd`, follows `6607fb687` / REACT-CONFIG-COVERAGE-1) — the guard, the prompt rule,
  the template-alias fix.
- **-2** (this update) — **removed the `sole-connected` rule**. Connection availability is not
  proof of intent, so a single connected provider among several registered ones now asks instead
  of selecting. See [§ REACT-PROVIDER-AMBIGUITY-2](#react-provider-ambiguity-2--connection-is-not-a-choice).

The decision table below is the CURRENT (post-`-2`) rule.

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
| 4 | `sole-registered` | it is the ONLY provider **REGISTERED** for this kind+category — a platform-capability fact (no alternative exists in the catalog), independent of whether it is connected | preview shows the provider on the node card |
| — | otherwise | **AMBIGUOUS** → targeted clarification (stable ids + display names + `isConnected`), NO plan/preview/proposal committed. The guard **never substitutes** one provider for another. | `guidanceText` + `providerClarification` response field |

There is deliberately **no connection-based rule** (removed in `-2`).

Candidates are computed as a **set** from the registry (same kind + category), all outputs sorted
by display label — registry/catalog/connection **ordering can never change the result**.

## Behavior by registered/connected count (generic "email" request)

With **two registered** email providers (Gmail, Microsoft Outlook), the answer is the same
regardless of connections — only the copy changes:

- **Zero connected** → clarification listing supported providers; connecting comes after choosing
  (selection ≠ connection).
- **Exactly one connected** → clarification that *mentions* it: "Which email service should this
  use: Gmail or Microsoft Outlook? Gmail is already connected. I'll keep everything else you've
  told me." Both options stay on offer; `isConnected` is display emphasis only.
- **Both connected** → clarification ("… Gmail and Microsoft Outlook are already connected.").
- **Exactly one REGISTERED** (any connection state) → automatic selection is allowed
  (`sole-registered`) and the preview names the provider.
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

---

## REACT-PROVIDER-AMBIGUITY-2 — connection is not a choice

Follow-up slice. `-1` still let one rule infer a provider from account state: `sole-connected`
("≥2 registered, but only one connected → use it, with a notice"). That is availability, not
intent — a user with only Gmail connected may fully intend to connect Outlook for this workflow.
The rule is now **removed**; nothing about connection state can select a provider.

### What changed

- **`providerSelectionGuard.ts`** — `sole-connected` deleted from `ProviderJustifiedRule` and from
  `evaluateProviderChoice`. The remaining table is: `native` · `explicit` · `canvas` ·
  `sole-registered`. Connection state now only decorates the clarification:
  `ProviderClarificationOption.isConnected` (display emphasis; must never preselect) and the
  question's convenience sentence ("Gmail is already connected.").
- **`findProviderAmbiguity`** — the `notices` channel is gone with the rule it disclosed. Every
  surviving justification is the user's words, their canvas, a native step, or a catalog fact —
  none is an inference needing disclosure. A provider the user didn't choose now yields a
  QUESTION, never a notice.
- **`inferDeterministicMutation.resolveEmailTarget`** — the demoted edit fallback had the SAME
  connected-narrowing rule (`connectedCandidates.length === 1 → use it`). Removed; it now decides
  on named-provider or sole-registered only, and otherwise returns its existing "ask" result.
  `connectedEmailProviders` remains on the input shape but is documented as ignored.
- **Route (defense in depth)** — the fallback's `addNode`/`replaceTrigger` operations now also run
  through `findProviderAmbiguity`, so ONE decision table governs every path that can introduce a
  provider, whatever produced the operations.
- **Prompt** — the credential-availability instruction no longer reads as "prefer what's
  connected" ("A connected provider is AVAILABLE, not SELECTED"), plus a new CONNECTION IS NOT A
  CHOICE rule: *a connected provider is available, not selected; for a new workflow do not choose
  among multiple supported providers unless the user identifies one; ask even when only one of
  those providers is connected.*

### Registered vs connected (the distinction that matters)

| | Automatic selection? |
|---|---|
| Exactly one provider **REGISTERED** for the capability | **Yes** — `sole-registered`; no alternative exists in the catalog, and the preview names it |
| One provider **CONNECTED** among several registered | **No** — clarification required |

### Preserved

Optional-field coverage, sensitive-literal tokenization/rebinding, multi-turn constraint
preservation, existing-node provider preservation, explicit selection, order independence,
unsupported-provider non-substitution, strict patch validation, preview/apply gates, and config
merge preservation are all unchanged and green. Suites whose fixtures relied on silent provider
selection were updated to NAME their provider (they exercise field coverage / pipeline plumbing,
not provider inference): `ai-workflow-guidance-config-coverage`, one `ai-workflow-guidance-route`
fallback case, and one `inferDeterministicMutation` case (which now asserts the question).

### Tests (`-2`)

- `providerSelectionGuard.test.ts` (16 total, +5) — all four connection permutations over two
  registered candidates still ambiguous for BOTH providers; connected-mention copy + `isConnected`
  flags without filtering options; REGISTERED-vs-CONNECTED pinned in one test; sole-registered
  independent of connection; explicit beats connection; order independence now also reverses the
  CONNECTION list.
- `ai-workflow-guidance-provider-ambiguity.test.ts` (16 total, +5) — Gmail-only-connected and
  Outlook-only-connected both clarify while naming the connected provider (the model having
  already committed to that provider); both-connected clarifies; no narrowing notice ever appears
  in `warnings`; explicit-but-unconnected Outlook still honored with Gmail connected; existing
  **Gmail** node edit preserved (symmetric with the Outlook case) while only Outlook is connected;
  category-general **spreadsheet** case (Google Sheets connected, Excel registered) still asks.
- `inferDeterministicMutation.test.ts` (+2, 1 updated) — one-connected now asks; none-connected
  asks; naming the provider still resolves even when the OTHER provider is the connected one.
- `providerAmbiguityIndependence.test.ts` (+1) — the prompt states connection ≠ selection even
  when the context lists the caller's connected accounts.

### Verification (`-2`, 2026-07-19)

`npx tsc --noEmit` clean · `npm run lint -- --max-warnings=0` 0 errors / 18 pre-existing
`max-lines` warnings (none new) · `npm run lint:structure` OK · `npm run lint:migrations` OK (no
migration) · React-agent + builder sweep: 445 suites / 4,790 tests passed with only the 5 known
pre-existing failures · full `npm test` failure set unchanged from the recorded baseline.
Nothing pushed, no deploy, no migration, no `db:push`.
