# Dual Builder — CS-7 Exposure Readiness Checklist

**Slice:** 5.DUAL-BUILDER-1 CS-7. **Feature flag:** `ENABLE_DOCUMENT_BUILDER`
(server env, default **OFF**, `billingFeatureFlags.ts` pattern; no `NEXT_PUBLIC_*`).
**Posture after CS-7:** the feature remains **default OFF**. Nothing here enables
any rollout stage automatically.

The governing rules are unchanged: **two editors, one workflow — not two workflow
types**; **AI is optional, manual building is complete, and nothing applies without
explicit user approval.**

## Rollout stages (none enabled automatically)

1. **Owner / internal local test** — flag set locally only (`.env.local`, gitignored).
2. **Selected development accounts** — enable the server env for specific dev orgs.
3. **Small opt-in beta** — opt-in cohort; watch the CS-7 telemetry.
4. **Broader opt-in.**
5. **Default-surface consideration** — only after telemetry + user feedback.

Existing users default to **Visual**; Document stays opt-in via the Visual/Document
toggle. No workflow-level "builder type" exists; workflows remain builder-neutral.

## Readiness checklist

| Area | Requirement | Status @ CS-7 |
|---|---|---|
| **Flag behaviour** | Flag OFF renders exactly today's builder; no toggle; zero Document DOM/behaviour; no Document telemetry. | ✅ verified — `documentBuilderEnabled` gates mount + toggle + telemetry enable; CS-1 flag-off snapshot test + telemetry flag-gate test. |
| **Save / reload parity** | A workflow edited in Document saves through the one `PATCH` → `saveDraftDefinition` and reloads identically in both surfaces. | ✅ shared store + single save funnel (CS-2 round-trip + persistence suites). |
| **Execution parity** | Same definition ⇒ identical engine behaviour regardless of authoring surface. | ✅ engine is surface-blind; CS-2/CS-5 execution-parity suites. |
| **Branch entitlement** | Free users hit the same BRANCH-ENT-1 gate (locked branch menu + server 403). | ✅ Document reuses `lockedActionKeys` + the same write-path gates; branch entitlement suite. |
| **AI preview safety** | Preview is a non-mutating ghost; Apply is explicit; additive-only; checkpoint + change history. | ✅ CS-6 ghost/apply parity; CS-7 preview apply/reject telemetry is categorical only. |
| **Composer seeding** | One conversation/composer; rapid Ask React requests reliably supersede the unsent seed; manual edits never clobbered by unrelated renders; never auto-sends. | ✅ CS-7 keyed/versioned `composerSeed` (`composerSeed.ts`); hook + panel tests. |
| **Router bulk edit** | Exact one-to-one rename preserves wiring; ambiguous/bulk edits stay conservative + warn; no unrelated lane reattachment; no schema/route-id change. | ✅ CS-7 `classifyRouteLabelEdit` + `updateNodeConfig` relabel; classifier + wiring tests; editor caution note. |
| **Accessibility** | Keyboard-operable, focus return, Escape priority, real buttons, menu semantics, non-modal Guided Stop, status not colour-only. | ✅ see `dual-builder-cs7-keyboard-a11y-model.md`; guided-stop focus + insert-menu keyboard tests. ⚠️ full axe sweep deferred (no new dep). |
| **Reduced motion** | `prefers-reduced-motion` disables morph/scale; preserves origin + focus + state. | ✅ `motion-reduce:` guards throughout; correctness independent of animation. |
| **Responsive** | Usable at wide/laptop/narrow widths; no horizontal page overflow from nested branches; map may become a sheet; lanes vertically stacked. | ⚠️ document body constrained (`max-w-[760px]`), lanes stack vertically, map is already a right-sheet; narrow-width + mobile full-width editor polish is **partial** — see limitations. |
| **Complex-graph fallback** | Tier B/C regions render read-only complex cards with Visual handoff; rest stays editable; projection never throws. | ✅ CS-1 tier classifier + per-region degradation; projection totality tests. |
| **Performance** | Projection total/deterministic on large fixtures; no exponential nested-branch behaviour; view switch responsive. | ✅ pure projection, memoised on store refs; CS-1 projection fixtures. ⚠️ no dedicated large-fixture perf budget test added (recommended). |
| **Analytics safety** | Bounded categorical/count only; no workflow content/PII; flag OFF emits none; failures never block editing; no new vendor/route/table. | ✅ CS-7 telemetry seam + sanitizer; content-safety + gate + no-throw tests. |
| **Rollback** | Unset `ENABLE_DOCUMENT_BUILDER`. A workflow edited in Document stays a normal workflow. | ✅ flag gates mount only; no schema/engine/save-path change in CS-7. |

## Telemetry — recommended safe event spec

CS-7 ships a dependency-free **emit seam** (`document/documentTelemetry.ts`) with a
**no-op default sink**. It invents no vendor/client/route/table. At exposure time
the owner registers a sink (`setDocumentBuilderTelemetrySink`) that forwards to the
chosen product-analytics infrastructure. Until then every emit is a safe no-op.

**Events emitted** (categorical/count props only — the sanitizer drops anything
else): `document_builder_view_opened`, `builder_view_switched` `{to}`,
`document_empty_react_started`, `document_manual_start`,
`document_guided_stop_completed`, `document_finish_setup_started` `{count}`,
`document_finish_setup_completed`, `document_map_opened`, `document_insert_used`
`{kind}`, `document_agent_preview_applied`, `document_agent_preview_rejected`,
`document_visual_handoff`, `document_complex_region_seen` `{tier}`.

**Never sent:** workflow names, prompts, field values, provider payloads, config
values, route labels, section titles, node ids, secrets, PII, connection identities,
account labels. The sanitizer allow-lists a fixed key set and accepts only short
lowercase tokens / small integer buckets / booleans (free text with spaces/case/
punctuation is dropped), capped at 8 keys.

## Rollback

Unset `ENABLE_DOCUMENT_BUILDER` (server env). No migration to reverse, no schema
change, no engine change. Any workflow touched in the Document remains a perfectly
ordinary workflow — that is the point.

## Go / no-go

See the CS-7 Owner Report for the evidence-based recommendation. Summary: **GO for
Stage 1 (owner/internal local) and a Stage 3 small opt-in beta** once the two
partial items below are closed or explicitly accepted as beta-scope.

## Known limitations before broader exposure

- **Responsive / mobile** polish is partial: the Document is readable and lanes
  stack vertically without page overflow, but the dedicated narrow-width sheeting
  of the Guided Stop and a mobile full-width safe editor are foundational, not
  finished. Recommend closing before Stage 4.
- **Automated a11y (axe) sweep** and a **large-fixture performance budget test**
  are recommended additions (both were held back from CS-7 to avoid a new
  dependency / brittle machine-timing gate without approval).
- **Visual fidelity** to the mocks is materially improved in vocabulary/spacing but
  is an ongoing pass, not a pixel match.
