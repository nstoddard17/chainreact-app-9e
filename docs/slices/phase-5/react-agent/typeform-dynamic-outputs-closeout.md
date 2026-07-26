# REACT-AGENT-TYPEFORM-DYNAMIC-OUTPUTS-1 — stable answer paths (foundation layer)

**Status:** Foundation layer complete locally, gates run, **not pushed**. The builder/agent
integration layers are **NOT built** — see §"What is not done".
**Branch:** `react-agent-multistep-data-mapping-1`, continuing from `a70a957d8`.
**Migration:** none required (see §8).

---

## 1. Plain-language result

Typeform answers now have a **stable address**.

Before: a submission's answers were reachable only as `answers[0]`, `answers[1]`, … and the array
carries **only answered questions**. If a respondent skipped a question, every later index shifted, so
a mapping made at design time pointed at a different question on the next submission. There was no
path meaning "the email answer" — which is why the React Agent could not map Typeform data anywhere,
and why the previous batch could only stop it from *pretending* to.

Now each question also arrives under a durable key derived from its Typeform `ref` (the author-set,
immutable reference the provider guarantees across edits):

```
{{trigger.answersByRef.email}}
{{trigger.answersByRef.first_name}}
```

`answers[]` is unchanged and still emitted, so existing workflows keep working.

## 2. The key-derivation contract

The design constraint that shaped everything: the **authoritative** runtime path tokenizer
([`workflow-engine/variables/resolveValue.ts`](../../../../workflow-engine/variables/resolveValue.ts))
accepts `[…]` for **numeric indices only** — a bracketed string key throws `Invalid array index` — and
`.` always splits a segment. So the map key cannot be the raw Typeform ref (author-defined, may contain
dots/spaces/anything). It must be an **encoded, dot-path-safe derivative**, which is the existing
convention rather than a new bracketed-string syntax the resolver cannot parse.

[`integrations/_shared/typeform/answerKeys.ts`](../../../../integrations/_shared/typeform/answerKeys.ts):

- **`toAnswerKey(field)` is a pure function of ONE field** — its `ref` and `id`, never the surrounding
  set. This is the property that makes design time and runtime agree: the resolver sees **all**
  questions, the webhook carries only the **answered** ones. Any key derived from set-relative
  information (position, or "disambiguate against siblings") would differ between the two.
- A ref that is already path-safe is used **verbatim** (`email` → `email`), so the common case reads
  naturally in the picker and in `{{…}}`.
- A ref needing encoding gets unsafe runs collapsed to `_` plus a short **FNV-1a hash of the original**,
  so two different refs that sanitize identically still produce different keys.
- No durable identity (no ref and no id) → **`null`**, and the question is skipped. It is never given a
  positional key, because that would recreate exactly the fragility this removes.
- Deterministic: no clock, no RNG — the webhook normalizer's purity test depends on it.

## 3. Design-time ↔ runtime path match

One function, both sides:

| Side | Component | Uses |
|---|---|---|
| Design time | `typeform:form_questions` resolver → `describeQuestion` | `toAnswerKeyInfo` |
| Runtime | `normalize.ts` → `buildAnswersByRef` | `toAnswerKey` |

A test asserts the two produce the **same key for the same question**, including for a ref
(`work.email`) that must be encoded. There is no second implementation to drift.

## 4–6. What was built

| Piece | File |
|---|---|
| Stable key derivation + `buildAnswersByRef` | [`answerKeys.ts`](../../../../integrations/_shared/typeform/answerKeys.ts) |
| Runtime `answersByRef` in the webhook projection (legacy `answers[]` retained) | [`normalize.ts`](../../../../integrations/typeform/triggers/newResponseInForm/normalize.ts) |
| `answersByRef` declared in `payloadShape` (`sensitive: true`) — so the previous batch's output-catalog block now shows it to the agent | [`newResponseInForm.meta.ts`](../../../../integrations/typeform/triggers/newResponseInForm/newResponseInForm.meta.ts) |
| `formGet` — bounded projection of the form definition (one level of group nesting flattened; no theme/settings/logic/workspace data) | [`api/forms.ts`](../../../../integrations/_shared/typeform/api/forms.ts) |
| `typeform:form_questions` resolver — mirrors the HubSpot `*_properties` shape; typed `MISSING_DEPENDENCY` when no form is chosen; reuses the shared Typeform error mapping for disconnect/scope/404 | [`options/formQuestions.ts`](../../../../integrations/typeform/options/formQuestions.ts) |
| Registered in the resolver registry | [`services/options/_registry.ts`](../../../../services/options/_registry.ts) |

## 7. Backward compatibility

**No legacy behavior changed.** `answers[]` is emitted exactly as before, `payloadShape` gained one
entry, and no existing reference was rewritten. Any workflow using `answers[0]` keeps resolving
identically. I did **not** audit production workflow definitions for existing numeric references — no
safe local mechanism to read production data exists, and the runbook forbids it.

## 8. Database changes

**None.** No migration was created or applied. Nothing here persists a schema: the form-question
schema is resolved on demand through the existing resolver boundary, which is also why the caching
requirement is unmet (see below).

## 9. Tests and gates — every command actually run

| Command | Result |
|---|---|
| `npx tsc --noEmit` | **clean** |
| `npm run lint` | **0 errors** (27 pre-existing warnings) |
| `npm run lint:migrations` | **pass** (no migration) |
| `npm run lint:structure` | **1 pre-existing violation** (`docs/slices/phase-5` = 51 files) |
| `npm test -- tests/unit/integrations/typeform/typeformDynamicOutputs.test.ts` | **22 passed** |
| `npm test -- tests/unit/integrations/typeform tests/unit/services/options tests/unit/services/ai-guidance tests/unit/workflow-engine/variables tests/unit/core/workflows tests/structure` | **1482 passed / 5 failed** — the same 5 structure suites that fail on a clean tree (baselined twice this session via `git stash`) |

`npm test` (full suite) was **not** run — targeted only, per the standing instruction.

Requirement coverage: **#1–#5, #7, #9–#16, #49** are covered. **#6** (provider 401/403/429/5xx) is
covered only indirectly — the resolver delegates to the shared `mapTypeformOptionsError`, which has its
own tests; I did not add per-status cases here. **#8** (account/integration boundary) is enforced by
`resolveOptionsSource`'s existing credential policy, not re-tested here.

## What is NOT done — read this before the manual retest

This batch is the **foundation layer only**. The manual acceptance test **will still not pass**,
because nothing yet consumes the new contract:

1. **Dynamic trigger-outputs contract — not built.** `applyDynamicOutputs` remains action-only and
   user-schema-driven. There is no mechanism by which a selected `formId` causes
   `answersByRef.<key>` children to appear in the trigger's output tree. This is the linchpin: until it
   exists, the resolver's questions are not outputs, so **tests #17–#20 are unmet**.
2. **Builder integration — not built.** No field declares `optionsSource: "typeform:form_questions"`,
   the Data Map and variable pickers do not show questions, form-change invalidation does not exist,
   and there is no schema-load error state (**#21–#26 unmet**).
3. **React Agent preview enrichment — not built.** Selecting a form does not re-evaluate an existing
   proposal (**#27–#40 unmet**).
4. **Semantic mapping layer — not built.** No label/type matching for email → email, first name →
   first name, etc. (**#41–#44 unmet**).
5. **Caching — not built.** No account/integration/form-scoped cache with TTL; every resolve is a live
   provider call.
6. **Runtime end-to-end (#45–#48) — not exercised.** No workflow-execution test drives a definition
   containing `{{trigger.answersByRef.…}}` through the engine.

Recommended next slice order, smallest coherent steps first: (1) the dynamic trigger-output contract +
service, (2) builder picker/Data Map, (3) the semantic mapping layer, (4) agent preview enrichment,
(5) caching, (6) the end-to-end execution test.
