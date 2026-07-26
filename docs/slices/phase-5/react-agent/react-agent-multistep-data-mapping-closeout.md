# REACT-AGENT-MULTISTEP-DATA-MAPPING-1 — right nodes, no data between them

**Status:** Fixed locally, gates run, **not pushed**.
**Branch:** `react-agent-multistep-data-mapping-1` (cut from `origin/v2-main` @ `b62bf2021`).
**Scope:** agent data-mapping contract + proposed-config safety. No provider contract, runtime
variable semantics, timeout/retry, billing, or provider-selection change.

---

## 1. Plain-language result

The agent picked the right four nodes and then had nothing to connect them with.

Provider/action selection works because the prompt **does** carry the capability catalog — 512
`provider:type` keys — so the model can see that `typeform:new_response_in_form` and
`mailchimp:add_subscriber` exist. Data mapping failed because the prompt carried **only the config
fields (inputs)** of each capability and **never a single output**. The instruction the model was
given read:

> "When the user wants a value taken from an earlier step's output, use the {{...}} variable
> reference to a declared output name."

…and no declared output name was ever shown to it. `buildFieldSchemaLines` rendered `meta.fields`;
nothing anywhere rendered `meta.outputs` or a trigger's `payloadShape`.

So the model faced a required Mailchimp **Email** field, knew nothing upstream produced an email, and
did what a language model does with a required field and no data: it wrote the most plausible thing,
`subscriber@example.com`. Same for Gmail's `to` (`alice@example.com`). The Gmail body was left blank
for the same reason — a summary built from data it could not reference.

**The example values did not leak from metadata.** Those exact strings *are* the `placeholder` values
on `mailchimp:add_subscriber.email` and `gmail:create_draft.to`, but `placeholder` is never sent to
the model (verified: no AI-path file reads `field.placeholder`). The model invented look-alikes
independently — the metadata and the model reached for the same clichés. The fix is the same either
way: such values must never survive into proposed config.

## 2. Typeform output availability

**Question-level outputs are available at RUNTIME ONLY — not before form selection, and not after
it either.**

`typeform:new_response_in_form` declares its payload as
([`newResponseInForm.meta.ts`](../../../../integrations/typeform/triggers/newResponseInForm/newResponseInForm.meta.ts)):

```
changeKind, formId, responseToken, providerEventId, formTitle, submittedAt,
landedAt, answers (array, sensitive), hidden (object, sensitive), score
```

There is **no** `email`, `firstName`, `lastName`, `company`, or `message` output. Per-question data
lives inside `answers[]` as `{fieldId, fieldRef, fieldTitle, fieldType, answerType, value}`, and
`normalize.ts` states explicitly that the array contains **only answered questions**, so positional
alignment is never safe. `{{trigger.answers[0].value}}` is therefore not a correct mapping — it is a
different question on every submission.

Selecting a form does **not** currently change this. ChainReact has:
- `typeform:forms` (a form list resolver) — but **no** form-question/schema resolver;
- `applyDynamicOutputs` ([`core/workflows/dynamicOutputs.ts`](../../../../core/workflows/dynamicOutputs.ts)) —
  but it is **action-only** and driven by a *user-typed* schema field (`ai:analyze_document`), not by a
  provider resource;
- `resolveValueAtPath` — array access by **numeric index only**, no keyed/filtered lookup.

So there is no contract today under which "the email answer" is addressable. Case A in the request
(known schema → named mappings) **is not reachable for Typeform**; it is reachable for every trigger
that declares real named outputs, and those are now mappable for the first time.

## 3. Mapping behavior after this fix

| Change | File |
|---|---|
| **`buildOutputSchemaLines`** — renders each relevant node's declared outputs (`payloadShape` for triggers, `outputs` for actions), one nesting level flattened into dotted paths, with `nullable`/`sensitive` flags | [`promptFieldSchemas.ts`](../../../../services/ai-guidance/promptFieldSchemas.ts) |
| New prompt block **"Data each capability PRODUCES — reference these with `{{stepRef.outputName}}`"** | [`buildGatewayGuidancePrompt.ts`](../../../../services/ai-guidance/gateway/buildGatewayGuidancePrompt.ts) |
| New **`DATA_MAPPING_INSTRUCTIONS`**: reference upstream instead of retyping; one upstream value may feed many steps; never invent sample values; leave the field out + name it in `requiredInputs` when no output provides it; build summary bodies from references; **schema-dependent data → ask for the resource first** | same |
| Threaded `outputSchemaLines` route → capability → client → prompt | route, `workflowGuidanceIntake.ts`, `hermesAgentGatewayClient.ts` |

This is metadata-driven and provider-agnostic: every provider that declares outputs becomes mappable
at once. Nothing is hardcoded for Typeform, Mailchimp, HubSpot, or Gmail.

For the reported prompt specifically, the model can now see that the Typeform trigger produces
`formTitle`, `submittedAt`, `answers`, `hidden`, `score`, that HubSpot's create-contact produces a
contact id, and so on — so cross-step wiring is expressible where the data genuinely exists, and the
schema-dependent rule covers the per-question data that does not.

## 4. Placeholder protection

New pure guard [`core/workflows/fabricatedSampleValues.ts`](../../../../core/workflows/fabricatedSampleValues.ts),
applied inside the existing metadata-driven sanitizer on **both** the plan path and the edit path.

The rule: **an identity-shaped literal the user never wrote is always wrong.** Either it belongs to
upstream data (so it must be a `{{...}}` reference) or it is a real decision only the user can make
(so it must be asked). There is no third case where the model inventing an email address is correct.

- Detects **email / phone / reserved-sample-domain** shapes only — the identity classes that cause
  real harm (a saved workflow mailing a stranger on every run).
- **The user always wins.** A literal that appears in the user's own words is kept — including on
  `example.com`, because people genuinely test with it. This is what separates "email invoices to
  billing@acme.com" from "the model made up alice@example.com". A first version of this guard
  overrode the user on reserved domains and immediately broke the REACT-CONFIG-COVERAGE-1 suite
  (`vendor@example.com` is a *user-supplied* literal in those tests) — the guard was corrected, not
  the tests.
- Never judges prose. Subject lines, body templates and option values pass untouched; only identity
  tokens inside a string are inspected.
- A caught value is **removed and the field becomes a targeted `requiredInputs` entry**, so the step
  visibly still needs setup instead of looking complete. The rail says something true —
  *"I didn't have real data for 'email', so I left it empty rather than filling in an example value."*
- Opt-in by parameter: callers that cannot prove what the user wrote pass no corpus and behave
  exactly as before.

## 5. Staged configuration

For schema-dependent data the agent is now instructed to ask first and is prevented from faking:

> SCHEMA-DEPENDENT DATA: some triggers only describe their data as a generic list/object because the
> individual questions depend on WHICH form/board/sheet the user picks. When the user's request needs
> those per-item values and the resource is not chosen yet, do NOT guess field names and do NOT
> invent values. Ask the user to pick that resource FIRST, explain that you will map its fields once
> it is selected, and list the affected downstream fields in `requiredInputs`.

Combined with the fabricated-value guard, the outcome for the reported prompt is: correct four-node
proposal · a request to pick the Typeform form · downstream identity fields listed as needing input
rather than pre-filled with fiction.

## 6. Proposal validation

Strengthened at the point where model output becomes proposed config: an invented identity value is
now a **validation failure for that field**, not silent data. `SanitizedNodeConfig` gained
`fabricatedFields`, `sanitizePlanStepConfigs` gained a `fabricated` list, and
`prepareProposedOperations` reports the same on the edit path.

## 7. Tests and gates — every command actually run

| Command | Result |
|---|---|
| `npx tsc --noEmit` | **clean** |
| `npm run lint` | **0 errors** (27 pre-existing warnings) |
| `npm run lint:structure` | **1 pre-existing violation** — `docs/slices/phase-5` = 51 files; unchanged by this batch |
| `npm run lint:migrations` | **pass** — no migration |
| `npm test -- tests/unit/services/ai-guidance/multistepDataMapping.test.ts` | **21 passed** |
| `npm test -- tests/unit/services/ai-guidance tests/unit/services/ai/reactAgent tests/unit/app/api/accounts tests/unit/app/api/ai tests/unit/core/workflows tests/unit/features/workflows tests/structure` | **1937 passed / 6 failed**, then 1 fixed (see below) |
| `npm test -- tests/structure/no-tracked-import-of-untracked-file.test.ts` (after `git add`) | **pass** |
| Clean-tree baseline of the 5 remaining structure failures (`git stash` → run → `git stash pop`) | **all 5 fail on a clean tree — pre-existing, unrelated** (`no-literal-slack-token-fixtures`, `client-server-boundary`, `field-sensitivity-coverage`, `resource-field-discovery-coverage`, `sensitive-output-coverage`) |

`npm test` (the full suite) was **not** run for this batch — Marcus asked for targeted runs.

Two existing suites regressed during development and were fixed by correcting the **guard**, not the
tests: `ai-workflow-guidance-config-coverage` and `ai-workflow-guidance-provider-ambiguity` (both
green).

## 8. What is NOT fixed — read before the retest

**Typeform per-question mapping still cannot happen**, because the data does not exist as a contract.
Delivering Case A for Typeform is its own arc, roughly:

1. a `typeform:form_questions` option/schema resolver (provider API);
2. a **dynamic TRIGGER outputs** contract — today `applyDynamicOutputs` is action-only and
   user-schema-driven, not provider-resource-driven;
3. a stable keyed answer map in `normalize.ts` (e.g. `answersByRef`) so a reference survives across
   submissions — positional `answers[0]` never can;
4. builder variable-picker integration for the synthesized tree;
5. preview enrichment after the form is chosen (re-running mapping over an existing proposal without
   disturbing user-entered setup choices).

Items 3 and 5 also mean the request's "selecting the form triggers mapping enrichment" behavior
(tests #13/#14) is **not implemented** — there is nothing to enrich from yet. What this batch
guarantees is that the agent no longer *pretends* otherwise.

The requested UI three-way preview split (auto-mapped / needs selection / waiting on schema) is also
not built; `requiredInputs` currently carries both "needs selection" and "waiting on schema" without
distinguishing them visually.
