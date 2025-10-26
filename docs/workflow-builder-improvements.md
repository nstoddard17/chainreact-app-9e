w# Workflow Builder Upgrade Plan

This document tracks the full set of upgrades we want to ship for the workflow builder as we close the parity gap with Kadabra. Each task has a checkbox so we can mark it complete inline and keep the plan truthful over time.

---

## Phase 0 · Foundations & Context

- [x] Capture a living inventory of every node schema (config + outputs) and confirm the metadata is available both server-side and in the builder UI.  
  _Artifact:_ `docs/node-inventory.json` (generated via `npx tsx scripts/list-node-inventory.ts`)
- [x] Document current auto-mapping logic, per-field validation, and AI agent touchpoints so future contributors can orient quickly.  
  _Notes:_  
  - **Auto-mapping:** `components/workflows/configuration/autoMapping.ts` inspects the first upstream node, pulls its `outputSchema`, and emits `{{alias.field}}` tokens for empty config fields. Matching prioritises exact field-name parity before falling back to type heuristics (email, name, subject/title, body/content/message, IDs, and date/time) and finally a single-output fallback. `ConfigurationModal` surfaces these entries in the “Suggested field mappings” banner and safely applies them via `handleApplyAutoMappings`, which only populates blank inputs.  
  - **Validation:** `useFieldValidation` delegates to `FieldVisibilityEngine` so only visible required fields are enforced (supporting modern `visibilityCondition` plus legacy `conditional`, `showWhen`, etc.). On submit, `ConfigurationForm` stamps `__validationState` with `missingRequired`, `allRequiredFields`, timestamps, and `isValid`, persisting it both on the node config and in the workflow store; the modal reads this flag to display the “Configuration needs attention” alert.  
  - **AI agent touchpoints:** The modal tags a node as AI-connected if an upstream edge originates from `ai_agent`/`ai_message` (or `parentAIAgentId` is present). Connected nodes auto-enable `_allFieldsAI`, swap eligible inputs into `AIFieldWrapper`, and write `{{AI_FIELD:<name>}}` placeholders unless a field is explicitly excluded (selectors, IDs, database pickers, etc.). The variable inspector (`VariablePickerSidePanel`) filters AI agent outputs to contextually relevant fields, and all AI-enabled inputs can toggle back to manual mode through the shared wrapper.

## Phase 1 · Auto-Mapping Everywhere

- [x] Extend the “Suggested field mappings” banner + “Fill automatically” action to the provider-specific configuration components (Slack, Airtable, Gmail, etc.) so the UX is consistent regardless of node type.  
  _Implementation:_ Added auto-fill controls in `ConfigurationModal` that reseed `ConfigurationForm`; wrappers around `GenericConfiguration` pick up the updated `initialData`, so all providers render the suggestions instantly.
- [x] Backfill tests (component and integration) that guarantee suggestions apply correctly and the form remount logic remains stable when `initialData` is mutated.  
  _Coverage:_ `test/auto-mapping.test.ts` exercises the helper logic powering suggestion generation and ensures existing values are preserved when we reseed the form.
- [x] Ensure the React agent emits the same suggestions we surface in the UI, and add telemetry to measure adoption / edge cases the assistant misses.  
  _Done:_ Shared the auto-mapping helpers via `lib/workflows/autoMapping.ts` so the React agent and UI rely on the same heuristics, expanded `app/api/ai/stream-workflow/route.ts` to feed enriched output schemas into the config prompt, and now emit per-node telemetry (suggested vs. applied tokens) when auto-building workflows.

## Phase 2 · Variable Inspector & Transparency

- [x] Ship a reusable “Data Inspector” panel that exposes upstream node outputs (names, types, sample values) alongside the configuration form.  
  _Implementation:_ `ConfigurationDataInspector` renders upstream aliases and copy-to-clipboard tokens inside `ConfigurationModal`.
- [x] Wire the inspector into the auto-mapping engine so users can drag/drop or click to insert tokens into string fields.  
  _Implementation:_ Data inspector uses `VariableDragContext` so “Insert” buttons drop tokens into the currently focused field (with fallback guidance if no field is active).
- [ ] Update AI prompts so the assistant references the same metadata the inspector uses—no divergence between what the human sees and what the assistant sees.  
  _Next:_ Thread the enriched variable payload (`ConfigurationDataInspector` + `VariablePickerSidePanel` output schemas) into the agent prompt builders (`buildPlanningPrompt`, `configPrompt`, etc.) so it can cite concrete field names, sample values, and types while suggesting mappings.

## Phase 3 · Validation & Preflight Confidence

- [ ] Introduce lightweight server-side validation hooks for each node (required fields, value coercion, endpoint sanity checks).  
  _Next:_ Re-use the client helper in `lib/workflows/validation/workflow.ts` on the API layer (e.g., `app/api/workflows/test-workflow-segment/route.ts` or a dedicated `/validate` route) so saved workflows get schema-aware checks before persisting. Pair that with the schema-aware `validateNodeConfig` path in `app/api/ai/workflow-builder/route.ts` to start flagging coercion/format issues (email/url/date) with provider-specific hooks.
- [ ] Add modal-level messaging that blocks “Done” if validation fails, mirroring Kadabra’s “configuration needs attention” flow.  
  _Next:_ Propagate the `__validationState` that `ConfigurationForm` already stamps back into `ConfigurationContainer` so the submit button can be disabled (or swap to a destructive CTA) while `useFieldValidation` reports missing fields; surface the same state in `ConfigurationModal` toast handling to prevent `onSave` from closing when `isValid === false`.
- [ ] When credentials are present, offer an opt-in “Run sample test” execution (and stash the last result so the banner can display it).  
  _Next:_ Leverage the existing test harness (`VariablePickerSidePanel.runWorkflowTest`, `/api/workflows/test-workflow-segment`, and `useWorkflowTestStore`) to fire a scoped execution from the modal, capturing the latest result in the node config so the auto-mapping banner can reference “Last sample run at…”.

## Phase 4 · Lint, Logging, and Technical Debt

- [ ] Systematically remove remaining `console` diagnostics in `app/api/ai/stream-workflow/route.ts` and friends (replace with structured logging or toast hooks).  
  _Next:_ Sweep the streaming route (`app/api/ai/stream-workflow/route.ts`) and helper modules for lingering `console.*` calls, routing them through the shared `logger` (`lib/utils/logger`) or UI toasts where a user message is appropriate. Collapse the verbose trace output into structured levels:  
  • `[Prerequisite Check]` instrumentation → `logger.debug` with `{ requiredApps, connectedIntegrations }`.  
  • `[STREAM] ...` lifecycle notices → `logger.info`; failures like `ERROR:` blocks → `logger.error`; disconnect notices → `logger.warn`.  
  • `[generateNodeConfig] ...` dumps → `logger.debug`/`logger.trace` depending on payload size.  
  • `[POSITION] ...` layout helpers → `logger.debug` gated behind `logger.ifDebug`.
- [ ] Re-enable the strict ESLint rules we relaxed, fixing the legacy violations instead of suppressing them.  
  _Next:_ Audit `.eslintrc.json` plus in-file `eslint-disable` comments to surface suppressed rules, repair the code issues they hide, then delete the overrides so `npm run lint` (Next lint) returns clean.
- [ ] Add CI enforcement so new violations cannot enter the codebase unnoticed.  
  _Next:_ Add a `.github/workflows/lint.yml` (or similar) that installs dependencies and runs `npm run lint` on pull requests to keep the stricter ruleset enforced before merge.

## Phase 5 · Configuration UI Strategy (Decision Made)

**Decision:** default to a schema-driven, shared configuration framework with targeted provider overrides.

- Most nodes share ~80% structure (text inputs, dropdowns, credential selectors). We will continue investing in the declarative “field renderer” so schemas control form layout, validation, helper copy, and AI hints.
- Only when a provider needs genuinely bespoke UX (e.g., Gmail message editor, Slack block kit previews) will we maintain hand-crafted components. Those components will still consume the shared schema to stay compatible with auto-mapping, validation, and the React agent.
- Customization per user account (dynamic options, field visibility) remains driven by the schema + runtime metadata (connected integrations, API responses, stored secrets).

Action items to solidify this decision:

- [ ] Audit all provider components and flag where the shared renderer can replace the existing bespoke implementation.  
  _Next:_ Walk the providers in `components/workflows/configuration/providers/` against `GenericConfiguration` usage, noting which still render bespoke forms (Slack, Airtable, etc.) and where we can drop in schema-driven layouts with minimal overrides.
- [ ] For nodes that stay custom, document why (unique UX requirement, compliance, high-touch workflows) and ensure they still export schema metadata for the assistant.  
  _Next:_ When a custom component remains, capture the rationale in `docs/providers/` (or similar) and double-check it surfaces `configSchema` / `outputSchema` so the inspector + agent remain in sync.
- [ ] Update contributing guidelines so new nodes start from the shared renderer unless they meet the “custom component” criteria.  
  _Next:_ Amend `README.md` or `CONTRIBUTING.md` with a checklist that defaults to using the schema renderer, calling out the limited cases where bespoke UI is acceptable.
- [x] Rework the Slack “Send Message” experience so the builder only auto-fills channel/message/attachments, groups optional controls into collapsible sections, and mirrors clarifications in the card UI.  
  _Implementation:_ `components/workflows/CustomNode.tsx` now renders Slack-specific sections (Message Basics, Status Card, Approval Card, Delivery Options) with inline tooltips + expanders; `app/api/ai/stream-workflow/route.ts` filters auto-mapping to the core fields so status/approval blocks stay empty unless explicitly requested.
- [x] Introduce a reusable rich-text formatter pipeline (HTML → Slack mrkdwn) and pipe Slack runtimes through it so email bodies stay readable when forwarded.  
  _Implementation:_ Added `lib/workflows/formatters/richText.ts` (powered by Turndown) and hooked it into `lib/workflows/actions/slack/sendMessage.ts` so message/status/approval bodies are normalized before sending; future nodes can reuse the same helper for other targets.
- [ ] Wire Slack approval callbacks back into the workflow graph (capture Approve/Deny button responses, expose them to downstream IF/approval nodes, and document the pattern).  
  _Next:_ Extend the Slack action webhook listener so button clicks update the workflow store and unlock either a dedicated “Slack approval decision” trigger or metadata a conditional node can read; ship docs + UI messaging before release.

## Build Order & Upcoming Enhancements

- **Lock down AI-built workflows first.** We’ll finish stabilizing clarifications, auto-mapping, and inline editing before enabling approval callbacks or other backend behaviors so we know every generated flow is runnable from the UI alone.
- **Preview + formatting UX.** Add a live “Message Preview” pane inside the Slack configuration modal (fed by sample data/mock payloads) so users can see variable substitutions and formatting before running tests.
- **Transformer node (deferred).** Plan a dedicated “Content Transformer” action that converts HTML ↔ Slack Markdown ↔ plaintext; the React agent will insert it automatically when users describe cross-channel formatting, while still letting power users remove it if they prefer raw content.
- **Inline editing polish.** Node card fields now open the modal focused on that field; a follow-up will add richer hover states, inline hints, and the ability to toggle optional sections directly from the canvas.

---

## Parking Lot / Future Considerations

- Collaborative editing + presence indicators surfaced inside the configuration modal.
- Blueprint/test harness for AI-generated subflows (the “trigger assistant” analogue).
- Share dialog revamp (view-only vs interactive interface) once configuration UX is stable.

We will update this checklist as milestones roll out. Feel free to append notes, owner assignments, or links to PRs directly under each checkbox as work progresses.
