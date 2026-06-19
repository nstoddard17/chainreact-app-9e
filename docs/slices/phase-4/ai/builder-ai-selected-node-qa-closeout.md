# Builder AI — Selected-Node Q&A Focus Label — Closeout

**Type:** Post-implementation closeout (docs-only). Nothing pushed from this slice.
**Date:** 2026-06-19
**Branch:** `v2-main`
**Builds on:** [`builder-ai-polish-closeout.md`](./builder-ai-polish-closeout.md) (Builder AI polish batch, incl. the read-only Q&A presentation) · [`ai-diag-qa-autoroute-closeout.md`](./ai-diag-qa-autoroute-closeout.md) (one-composer AUTOROUTE).

> **STATUS: LOCAL / UNPUSHED.** Verified this session: `d2dfdc092` is **not** an ancestor of
> `origin/v2-main` (`merge-base --is-ancestor` → LOCAL-ONLY). `origin/v2-main` is `cf0e43b97`. This
> is **UI-only** — no server/route/model-context, billing, env, provider, credit-gate, or migration
> change. It sits on top of the still-unpushed Builder AI polish batch.

---

## 1. Summary

When a diagnostic question is asked while a step is selected, the read-only Q&A answer now shows a
subtle **"Focused on: <safe label>"** line so the answer reads in the context of the step the user
was looking at — without exposing anything unsafe.

## 2. Completed commit chain

- `d2dfdc092` — safe selected-node focus label in Q&A (BUILDER-AI-SELECTED-NODE-QA-1) _(2026-06-19)_ — **local/unpushed**

(Sits on the unpushed Builder AI polish batch: `e984d1dfb` + `e5b959017` + `d20d45567` + `5a641290f`
+ closeout `8f0fcf8d4` — see [`builder-ai-polish-closeout.md`](./builder-ai-polish-closeout.md).)

## 3. Current behavior

- Asking a diagnostic question with a node/step open renders a muted **"Focused on: <label>"** line
  near "You asked" in the `diagnosis_qa` answer.
- The label is derived **client-side** from the currently-visible draft node (`currentDraft.nodes`)
  via the canonical [`getNodeDisplayName(node)`](../../../../core/workflows/nodeDisplayName.ts):
  **custom step display name → action/trigger metadata or title-cased type label → "Trigger"/"Action"
  fallback.** (e.g. `send_channel_message` → "Send Channel Message", or a user's "Notify on-call".)
- If the selected node id is **stale / missing from the draft / otherwise unresolvable**, no label is
  derived and **no focus line renders** — silent fallback to the prior behavior.
- The existing `selectedNodeId` API hint is unchanged: still forwarded to the Q&A route, still
  validated server-side, still **never echoed and never rendered**.

## 4. Security / no-leak guarantees

- **No raw `selectedNodeId` is ever rendered** — only the friendly label from `getNodeDisplayName`,
  which by construction never returns a node id.
- **No config values, secrets, credentials, `{{nodeId.path}}` reference tokens, or diagnosis-DTO
  internals** are rendered — the helper reads only `kind` / `provider` / `type` / `displayName`.
- **No server-side context projection was added** — the Q&A route, request payload, and model
  context are byte-for-byte unchanged; the label is purely a client-side display affordance.
- **Q&A remains read-only** — no Apply / Preview / run controls; still routes through the Q&A
  endpoint (not the planner); credit-denied selected-node Q&A still renders the safe exhausted copy.

## 5. Data / RLS / model notes

- **No tables, RLS, GRANT, migration, or model-output change.** Reuses the existing draft the user
  sees and the existing `getNodeDisplayName` core helper.

## 6. UI behavior

A single subtle muted line ("Focused on: <label>") added to the read-only Q&A bubble when a step is
selected; absent otherwise. **No fake/unsupported controls** — the label reflects real draft
metadata or is omitted; nothing new is clickable.

## 7. Deferred / known limitations

- **No provider-prefix label** (e.g. "Slack — Send message") — used the canonical
  `getNodeDisplayName` output as-is; a provider-friendly prefix would need the provider-label map and
  is deferred.
- **No backend model prompt/schema change** — the model still receives the same allow-listed Q&A
  context; the label is display-only.
- **No richer selected-node explanation** beyond the safe UI label.

## 8. Verification baseline

**Measured during the implementation slice earlier this session (NOT re-run in this docs closeout).**
This closeout re-verified only repo/push state (git): `d2dfdc092` local/unpushed, `origin/v2-main` =
`cf0e43b97`.

- Focused suite `BuilderAiPanel.diagnosisQa.test.tsx` → **21 passed** (6 new selected-node tests:
  safe label renders; custom name preferred; **no line for missing / bogus selection**; **raw node
  ids absent**; config/secrets/`{{` absent; Q&A routes to the Q&A endpoint, not the planner; **no
  Apply/Preview**; credit-denied selected-node Q&A renders the safe `AI_CREDITS_EXHAUSTED_MESSAGE`).
- Consolidated `diagnosisQa + autoRoute + intentClarification + BuilderAiPanel + creditDenial` →
  **114 passed**.
- `npm run typecheck` → **exit 0** · `eslint` (touched files) → **0** · `npm run lint:structure` →
  **OK**.
- **Feature flags:** none added; `ENABLE_AI_CREDIT_ENFORCEMENT` (ON in prod) / `ENABLE_OPENAI_PROVIDER`
  (ON) unchanged. **No unapplied migrations** — this slice touches none.

## 9. Recommended next tracks

- **Ship batch** — when Marcus approves, push the Builder AI polish batch + this commit together
  (UI-only deploy; backend already live in prod).
- **Provider-prefixed labels** ("Slack — Send message") if richer context is wanted later.
- The deferred items from the polish closeout still stand (chat-bubble "View AI usage" CTA,
  `_BuilderAiPanelChat.tsx` split).

## 10. Closeout confirmation

Docs-only. Nothing pushed. Doc: `docs/slices/phase-4/ai/builder-ai-selected-node-qa-closeout.md`.
