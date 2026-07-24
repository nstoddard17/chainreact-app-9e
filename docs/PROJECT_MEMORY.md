# ChainReactV2 — Project Memory

> Compact curated project state. This is not the source of truth.
> Repo docs, commits, and code win. Link to authoritative docs/commits instead of
> copying long content. No secrets, env values, tokens, credentials, production data,
> or private customer/user data.
>
> Last curated: 2026-07-24 @ DOC-BUILDER-PRODUCTION-RELEASE-1 (Document Builder RELEASED GLOBALLY to prod — no beta/allowlist/staged rollout; `ENABLE_DOCUMENT_BUILDER=true` set in Vercel Production (non-sensitive; stored value verified exactly `true`), `.env.example` stays default-OFF; release commit `e55f30b50` DOC-FINAL-ACCEPTANCE-1 pushed WITH 2 Marcus-authored Fleetio commits (remote head `d2e0ab10d`); activated via redeploy `chainreact-iqarz99wk` Ready + aliased `chainreact.app`; prod HTTP + runtime-log health GREEN, no 5xx; rollback = unset/change the flag + redeploy → Visual mode, deletes no data. GAPS: `smoke:prod` public has 9 PRE-EXISTING stale-copy failures (asserts heading exact `"Sign in"` but page renders "Sign in to your account") — NOT a regression, pages serve correctly; authenticated prod Document-Builder smoke UNVERIFIED (no smoke creds; interactive auth browser unavailable)). Prior: 2026-07-24 @ TRUCK-BRIDGE-1 CS-6 (Motive↔Fleetio vehicle-linking arc CLOSED + LAUNCHED — `ENABLE_RESOURCE_LINKS_UI` now defaults ON; flagship workflow proven through the REAL engine; `ENABLE_VEHICLE_VIN_BULK_CONFIRM` deliberately still OFF pending live Fleetio VIN evidence; LOCAL/UNPUSHED). Prior: 2026-07-23 @ CS-6E (MCP catalog Tier 1 BUILT + LIVE — Linear + Eden PUBLISHED `isExperimental: false`, LOCAL/UNPUSHED; 3 Eden social-publish writes deferred/hidden; provider-addition skill gained an MCP-backed catalog path; "MCP stays external" wording reconciled → the React Agent plans against typed metadata + never calls MCP, MCP actions execute via engine handlers). Prior: 2026-07-17 @ 85cf7a59c (Motive provider added — CODE-COMPLETE LOCAL, owner setup + Phase 13 live certification pending; NOT shipped/prod-certified; HEAD 31 commits ahead of origin/v2-main, unpushed). Prior: 2026-07-04 @ e7f950ddb (Asana arc complete + live-certified + deployed; push state corrected 43b1a370f → 64795582a). Prior: 2026-07-13 @ b01341a72 [NOTE: prior stamp date appears future-dated relative to 2026-07-04 — left as recorded] (DURABLE-QUEUE-1: durable run queue recorded — supersedes the interim after() keep-alive; live e2e smoke pending). Prior: 2026-06-26 (Connected-Apps recovery status reverified shipped + health-model decision recorded; arc closed, local/unpushed) (+ CONNECTED-APPS RECOVERY UX (CS-APPS-RECOVERY-1/2/3): per-row reconnect + real disconnect already existed; CS-1 e7ba8bc33 marks the SPECIFIC integration row needs_reconnect at the execution seam (durable-auth only, one-shot notify, never masks the run failure); CS-2 e9bd83c36 collapsed-card reconnect discoverability (direct vs Review, UI-only); no migration / no flag; 36+3 suites green, tsc 0; live revoke smoke = manual-QA pending; closeout in docs/slices/phase-4/workflows/. + ACTION-SMOKE WRITE CERT (SMOKE-WRITE-33): 298 registered / 119 LIVE_PASS / 0 stale / 0 fail / 0 sandbox / 0 unsafe, every LIVE_PASS fixtured; write-COMPLETE airtable 11/11, google-drive 7/7, google-sheets 12/12, microsoft-onedrive 7/7 (copy_item certified via a new completeAsync async monitor-poll primitive, LIVE_PASS_CLEANED, live 0 leaks; production action unchanged); detail → docs/runbooks/action-smoke-cli.md. + BUILDER-AGENT-RAIL arc COMPLETE (LOCAL/UNPUSHED, 9 commits 0f78c3576..adfa63c9c, HEAD adfa63c9c): the React Agent rail "Check workflow" path is now fully DETERMINISTIC / LOCAL / ZERO-CREDIT / NO-LLM, superseding the prefill-through-chat version described in the next entry. Behavior: clicking the rail "Check workflow" pill (still directly ABOVE the chat input) renders an INSTANT local review built only from builder state (collectBuilderValidationIssues + draft graph + required-field metadata) with sections Status / Current workflow / Setup issues / Suggestions / Next step; it NEVER calls requestWorkflowGuidance / Hermes / OpenAI / any LLM, costs no AI credits or tasks, never renders raw/fenced/plan JSON, and never says ready/valid while validation has blockers. Pure helpers: core/workflows/checkWorkflowReview.ts (compose review + JSON/overclaim guards + de-identified agent goalText) and core/workflows/canvasPreviewEligibility.ts (isPlanMeaningfulCanvasPreview: suppress "Show on canvas" when an AI plan only restates the current graph shape; additive/different still shows it). Inline "Fix setup issues" controls for EXISTING draft nodes: new features/workflow-builder/panels/BuilderNodeSetupCard.tsx + extracted shared controls builderSetupFieldControls.tsx render text/textarea/number/boolean/static-select + async single-select (Slack channel) via the EXISTING useOptionsSource resolver (never Hermes); "Update step" merges sanitized values into the existing node via graphSlice.updateNodeConfig (marks draft dirty), and configSlice.applyExternalConfig syncs an OPEN config panel so the visible field is not stale; Enter submits / Shift+Enter newline; focus or dropdown-select calls configSlice.revealNode to open + highlight the matching field in the real config panel (navigation only). Secret/connection fields never render inline (safe "Open <step> to finish setup."). Optional "Ask React for deeper suggestions, Uses AI" is the ONLY check-related path that calls the governed requestWorkflowGuidance, and only on explicit click. Validation drawer/header pill behavior unchanged; no save/activate/run/test/apply-preview/create-node beyond existing explicit paths; no new endpoint; no secrets/tokens/credential-ids/raw-provider-data exposed; no workflow values sent to Hermes from the deterministic path (setupTargets carry field KEY names only). Refactor (no behavior change): extracted features/workflows/SingleShotGuidancePanel.tsx + guidancePanelShared.ts and features/workflow-builder/hooks/useAgentRailWiring.tsx, clearing both prior max-lines warnings (eslint 0 warnings on all 15 arc source files). VERIFY at HEAD: tsc clean, lint:structure clean, eslint(arc files) clean, 128 suites / 1789 targeted tests green (core/workflows + features/workflows + features/workflow-builder + hermes-guidance + builder-ai-rail-no-old-endpoint). Broader `jest tests/unit tests/structure` run = 1637 suites / 19308 pass with 20 suites / 29 tests FAILING that are PRE-EXISTING and UNRELATED to this arc (Microsoft/Google provider field-`sensitivity` annotations + discovery + MCP option-source + accounts/activeAccount; none of the arc files are implicated). NOT pushed; awaiting Marcus approval. NOTE: pushing v2-main pushes ALL 66 local-ahead commits (this 9-commit arc + ~57 prior unpushed arcs), not just this arc. + BUILDER-AGENT-RAIL-CHECK-WORKFLOW (SUPERSEDED by the arc above; LOCAL/UNPUSHED): restored a compact "Check workflow" pill in the React Agent rail directly ABOVE the chat input (Marcus wanted it back, in the rail — NOT the builder header, and NOT the old floating validation callout). PRODUCT MODEL (two separate surfaces): header validation pill = deterministic setup blockers/activation issues (opens validation drawer, gates Activate); agent rail "Check workflow" pill = AI/React-Agent workflow review (suggested action); chat box = freeform. No prior dedicated review action existed → reuse the existing chat path (rule 4). IMPL: WorkflowGuidancePanel (conversational) renders the pill (agent-check-workflow) in the composer block directly above the textarea; clicking PREFILLS a review prompt ("Review my current workflow and suggest improvements or fixes.") into the composer + focuses it (composerRef on the shadcn Textarea which forwards ref); user sends through the EXISTING governed requestWorkflowGuidance path — NO new endpoint, NO auto-send, NO auto-edit (applying a suggestion stays explicit Apply-preview). Does NOT open the validation drawer, does NOT change Activate disabled/enabled, does NOT reintroduce lifecycle-blocked-hint or any absolute setup-issue UI. Validation drawer/pill unchanged. Tests: BuilderGuidanceRail (pill present + ABOVE the input via compareDocumentPosition + not in transcript; click prefills review prompt, mockRequest NOT called) + WorkflowBuilder integration (actionOnlyWorkflow + guidanceEnabled+accountId: Activate disabled by deterministic validation before+after, click pill prefills + no builder-right-drawer). tsc/eslint(touched)/lint:structure clean; 232 focused green (BuilderGuidanceRail/WorkflowGuidancePanel/WorkflowBuilder/LifecycleActions/BuilderRightDrawer/workflowGuidanceUiSafety/builder-apply-preview/builder-ai-rail-no-old-endpoint). Updated docs/slices/phase-5/hermes-agent-guided-preview-setup-plan.md ("Phase 11 status"). + BUILDER-VALIDATION-DRAWER-CLOSE-AND-CALLOUT-CLEANUP (LOCAL/UNPUSHED): the right validation/issues panel felt un-closeable because a floating "N setup issues to fix before activate" callout (lifecycle-blocked-hint, an absolute right-0 top-full z-10 overlay under the header) hung over the drawer's top-right where the close × lives — two competing issue UIs. FINDINGS: BuilderRightDrawer ALREADY has an accessible close × ("Close drawer") + Esc (tested), and the header ALREADY has a clean always-visible HeaderValidationPill (builder-header-validation-pill, "N issues" → opens the panel). So the callout was redundant + obstructive. FIX (UI-only): removed the lifecycle-blocked-hint floating callout + its lifecycle-review-issues "Review" link from LifecycleActions, plus the now-unused onReviewIssues prop + goLiveAction local + the onReviewIssues={validation?.onOpen} wiring in BuilderHeader. Single issue entry = header pill; disabled go-live button keeps its hover title reason. Validation panel open via pill → BuilderRightDrawer (Validation) with issue list; close via × or Esc; user never trapped. UNCHANGED: activation still BLOCKED while validation errors exist (disabled button + data-blocked-by-validation + tooltip); issue count + text still render; NO save/run/activation(beyond close UX)/React-Agent/preview/apply behavior change; NO route/schema/model change; NO legacy endpoint/token leak. Tests: rewrote the LifecycleActions blocked-go-live describe (now asserts NO floating hint/Review, go-live still disabled+title+data-blocked-by-validation, non-go-live not blocked, not blocked when 0 issues); new WorkflowBuilder integration test (open validation via pill → drawer+issue list → close × hides it → no lifecycle-blocked-hint before/after). tsc/eslint(touched)/lint:structure clean; 239 focused green (LifecycleActions/WorkflowBuilder/BuilderRightDrawer/BuilderHeader/ValidationSummary/builder-apply-preview/workflowGuidanceUiSafety/builder-ai-rail-no-old-endpoint). Updated docs/slices/phase-5/hermes-agent-guided-preview-setup-plan.md ("Phase 10 status"). + HERMES-AGENT-REMOVE-ADDED-FROM-PREVIEW-BADGE (LOCAL/UNPUSHED): removed the noisy on-card "ADDED FROM PREVIEW" badge from accepted draft nodes (overlapped node action buttons, added no clarity) — after Apply, accepted nodes look like normal draft nodes (selection outline is enough). Removed the WHOLE badge-only chain: AddedFromPreviewBadge component + render in WorkflowNodeCard; addedFromPreview field + appliedNodeIds ctx option + its setter in canvas/adapters.ts; appliedNodeIds prop/destructure/threading/memo-dep in WorkflowCanvas; appliedNodeIdSet useMemo + canvas prop in WorkflowBuilder. KEPT (not badge-related): WorkflowBuilder appliedNodeIds STATE → drives the post-apply builder-apply-config-hints notice + firstIncompleteAppliedNodeId auto-open; the holographic overlay per-node "Preview" badge (preview-node-badge) + global "Suggested" banner before Apply; the config-hints notice. NO route/schema/model/prompt change, NO preview/apply behavior change beyond the visual badge, NO save/activate/run, NO legacy endpoint/token leak. Tests: replaced the builder-apply-preview "marks ... Added from preview badge" test with one asserting accepted nodes render (workflow-node-view present) but NO added-from-preview-badge / "added from preview" text, config-hints still render, nothing saved. tsc/eslint(touched)/lint:structure clean; 247 focused green (canvas node-card/WorkflowCanvas×3/adapters + builder-apply-preview + BuilderPreviewOverlay + appliedConfigHints + workflowGuidanceUiSafety + builder-ai-rail-no-old-endpoint) + 49 WorkflowBuilder green. Updated docs/slices/phase-5/hermes-agent-guided-preview-setup-plan.md ("Phase 9 status"). + HERMES-AGENT-RAIL-CHAT-LAYOUT-POLISH (LOCAL/UNPUSHED): layout-only — the guided-setup card was a SIBLING below WorkflowGuidancePanel in BuilderGuidanceRail, rendering beneath the pinned composer (felt like a separate panel after the chat input). FIX: WorkflowGuidancePanel (conversational) gained optional transcriptFooter?: ReactNode rendered at the END of the scrollable messages area (after the latest assistant turn + its preview section), as an opaque node (panel owns no preview-config logic); BuilderGuidanceRail now passes BuilderPreviewSetupCard as that transcriptFooter (not a sibling) so the setup card lives INSIDE the transcript and scrolls with chat while the composer (textarea+Send+Enter hint) stays the pinned bottom-most element; rail wrapper dropped its redundant outer overflow-y-auto (panel's message area is the single scroll region). Lightweight auto-scroll-to-bottom keyed on messages.length + a boolean hasFooter (not node identity → no per-render jank). BuilderPreviewSetupCard restyled from full-width border-t bar → compact rounded inline card (var(--builder-panel-2)). NO route/schema/prompt/model/apply/save/activate/run change, NO preview/apply behavior change, NO draft/configSlice mutation before Apply, NO Hermes call for setup edits, NO legacy endpoint, NO token leak (panel stays presentational; rail still only renders the panel). Tests: new BuilderGuidanceRail test asserts the setup card is within workflow-guidance-messages (transcript) and the composer submit is NOT in the transcript (pinned region). tsc/eslint(touched)/lint:structure clean; 162 focused green (BuilderGuidanceRail/WorkflowGuidancePanel/BuilderPreviewSetupCard/builder-apply-preview/builder-preview-overlay/workflowGuidanceUiSafety/builder-ai-rail-no-old-endpoint). Updated docs/slices/phase-5/hermes-agent-guided-preview-setup-plan.md ("Phase 8 status"). + HERMES-AGENT-PREVIEW-CANVAS-STATE-AND-FIT (LOCAL/UNPUSHED): fixed the preview-on-empty-workflow clutter — the holographic nodes rendered but the "Choose a trigger to start" empty-state card stayed visible underneath and the viewport wasn't framed. (1) WorkflowCanvas gained a previewToken prop (null=no preview; fresh number per show): empty-state card now renders only when isEmpty && !previewActive → hidden during preview, RETURNS on Discard if graph still empty; normal empty-draft unchanged. (2) New hook features/workflow-builder/hooks/useFitViewOnPreview.ts (in WorkflowCanvasInner, inside ReactFlowProvider) calls React Flow fitView once each time previewToken changes to non-null (re-fits on a superseding preview; resets on Discard); navigation-only, no graph/draft mutation. WorkflowBuilder owns previewShowCount (bumped in handleShowPreview) and passes previewToken = previewOverlay ? previewShowCount : null. Canvas stays visual-only (no inputs/selects/textareas on holographic nodes; rail setup card unchanged). NOTE: the holographic overlay is a SEPARATE screen-centered DOM layer (not positioned RF nodes), so it's already centered; fitView frames the REAL underlying graph (meaningful for additive previews over an existing graph, safe no-op when empty). True RF-viewport diff-fitting belongs to the future visual-diff model. DOCUMENTED (not implemented — no destructive patch model yet) the future visual-diff rules: added=holographic shimmer, existing-unaffected=solid, would-update=amber/blue outline+badge, would-remove=red dashed ghost+"Will remove", proposed edges=dashed; additive stays the only safe semantics (preview never removes/hides existing nodes; Apply never destructive). NO save/activate/run, NO draft/configSlice mutation before Apply, NO Hermes/model call for viewport/preview, NO legacy endpoint, NO token leak. Tests: new useFitViewOnPreview.test.tsx (fit once null→num, no re-fit same token, re-fit new token, no fit while null, reset after discard) + 2 builder-apply-preview integration tests (empty-state hidden during preview + restored on Discard with no mutation/save; empty-state stays in normal empty mode). tsc/eslint(touched)/lint:structure clean; 143 focused green (useFitViewOnPreview/builder-apply-preview/builder-preview-overlay/BuilderPreviewOverlay/BuilderPreviewSetupCard/workflowGuidanceUiSafety/builder-ai-rail-no-old-endpoint) + 79 WorkflowBuilder/WorkflowCanvas(×3) green (no regression to existing empty-state). Updated docs/slices/phase-5/hermes-agent-guided-preview-setup-plan.md ("Phase 7 status" + visual-diff rules table). + HERMES-AGENT-DETERMINISTIC-SHAPE-FALLBACK (LOCAL/UNPUSHED): follow-up to the Phase-5 prompt tuning, which was INSUFFICIENT on its own — the live model still returned only plain-text questions ("which channel? generic or specific?") for the manual-Slack-reminder request, no preview/setup card. Added a NARROW, deterministic, catalog-validated fallback (NOT a planner): services/ai-guidance/fallback/inferDeterministicPreview.ts → inferDeterministicPreviewPlan(goalText). Pattern 1 (only one shipped): manual run → Slack channel message — fires only when goal has a manual-run signal (/\bmanual(ly)?\b/) AND a Slack signal AND a send-ish verb; declines the explicit DM/direct-message shape; everything else → null. NEVER invents ids: native:manual.run + slack:send_channel_message confirmed via the REAL discovery registry (getTriggerMeta/getActionMeta), requiredInputs read from the action's real meta.fields (required only → ["channel","text"]), whole plan run through validateWorkflowPlan; any miss → null (fail closed). Model-free + free (no Hermes/model/network). WIRED in app/api/accounts/[id]/ai/workflow-guidance/route.ts ONLY when result.ok && !result.workflowPlan (workflowPlan = result.workflowPlan ?? inferDeterministicPreviewPlan(goalText)); Hermes' own validated plan always wins; route then planToDraftPreview's it → Show on canvas + rail setup card (Slack channel async dropdown + message textarea) light up; Apply seeds picked values via existing path. NO create/save/activate/run, NO auto-apply, NO DB write, NO Hermes call for fallback, selected setup values never sent to Hermes, NO legacy endpoint, NO token/gateway leak (route static no-forbidden-surface lock still passes). Existing route tests with non-matching goals still get previewDraft:null (fallback is narrow). Tests: new inferDeterministicPreview.test.ts (happy live-prompt plan + validateWorkflowPlan ok + requiredInputs read from real metadata + other phrasings; null for ambiguous/empty/DM/missing-trigger-meta/missing-action-meta via delegating registry mock) + new route test (Hermes text-only + obvious shape → injected validated fallback plan + preview with slack node missingInputs channel/text). tsc/eslint(touched)/lint:structure clean; 230 green across inferDeterministicPreview/ai-workflow-guidance-route/buildGatewayGuidancePrompt/WorkflowGuidancePanel/BuilderGuidanceRail/BuilderPreviewSetupCard/BuilderPreviewOverlay/builder-apply-preview/previewSetupFields/planToBuilderPatch/workflowGuidanceUiSafety/builder-ai-rail-no-old-endpoint. Updated docs/slices/phase-5/hermes-agent-guided-preview-setup-plan.md ("Phase 6 status"). NOTE: live re-smoke (human-driven) still pending — verify the real manual-Slack request now yields preview-before-questions; scope is Pattern 1 only (email/other shapes deferred — don't overbuild). + HERMES-AGENT-PREFER-PARTIAL-PREVIEW-WITH-SETUP (LOCAL/UNPUSHED): prompt-only bugfix from a LIVE smoke (Marcus ran it). For "when I run this manually, send a Slack message to a channel reminding the team to review new leads," React returned plain-text questions ("which channel? generic or specific?") and NO preview/setup card, even though the SHAPE was clear (Manual Run → Slack Send Channel Message). ROOT CAUSE: prompt told the model to omit the plan when detail is missing; it treated missing CONFIG (channel/message) as "not enough detail." The contract already supports partial previews (plan steps carry requiredInputs → planToDraftPreview maps to per-node missingInputs → rail setup card collects them), so this was PROMPT-ONLY. FIX in services/ai-guidance/gateway/buildGatewayGuidancePrompt.ts RESPONSE_FORMAT_INSTRUCTIONS: separate SHAPE (which trigger/actions/order) from CONFIG VALUES (channel/recipient/message text/dates); when the shape is clear RETURN the plan and list unknown field keys in requiredInputs (values omitted) — ChainReact collects them via its guided setup form; do NOT ask for channel/recipient/message text before returning the plan; ask clarifying questions FIRST only for genuine SHAPE ambiguity ("missing config values alone never make the shape ambiguous"); kept the fenced ```json contract + catalog-only provider:type rule + "nothing created/saved/run" disclaimer. NO contract/schema change, NO deterministic fallback added (no goal→plan mapping subsystem exists post-planner-removal — overbuild; recommended as next slice IF live model still asks questions-only). validateWorkflowPlan + preview validation still gate every plan (fail closed); selected setup values never sent to Hermes; no auto-create/save/activate/run; no legacy endpoint/token leak. Tests: 2 new prompt-builder assertions (return-plan-for-clear-shape-with-missing-config + ask-only-on-shape-ambiguity) + 1 new builder-apply-preview integration test (partial Slack plan → holographic nodes + setup card with async channel dropdown + message textarea, nothing deferred, options via resolver not Hermes, guidance called once). tsc/eslint(touched)/lint:structure clean; 211 green across buildGatewayGuidancePrompt/WorkflowGuidancePanel/BuilderGuidanceRail/BuilderPreviewSetupCard/builder-apply-preview/previewSetupFields/planToBuilderPatch/workflowGuidanceUiSafety/builder-ai-rail-no-old-endpoint/useOptionsSource. Updated docs/slices/phase-5/hermes-agent-guided-preview-setup-plan.md ("Phase 5 status"). NOTE: live re-smoke after the prompt change is human-driven (not yet performed) — the model behavior is probabilistic, so verify the real Slack reminder now yields a preview-before-questions. + HERMES-AGENT-GUIDED-PREVIEW-SETUP-ASYNC-OPTIONS-AND-DASHBOARD-CLEANUP (LOCAL/UNPUSHED): two changes. (1) DASHBOARD CLEANUP — app/workflows/page.tsx no longer mounts WorkflowGuidancePanel (dropped the isHermesAgentEnabled import); /workflows is the list/metrics/filters/folders+trash/Create surface only, NOT an AI composer. The single AI build surface is the builder left React Agent rail (BuilderGuidanceRail). WorkflowGuidancePanel NOT deleted (the rail still renders it, conversational mode). New workflowGuidanceUiSafety scan asserts the dashboard page references neither WorkflowGuidancePanel nor isHermesAgentEnabled while the rail still does. (2) ASYNC OPTIONS IN THE RAIL — provider fields like Slack channel are now pickable in the rail setup card BEFORE Apply, loaded through the EXISTING authenticated resolver (no Hermes/model call). previewSetupFields adds a `select-async` type: toPreviewSetupField now SUPPORTS select/combobox + optionsSource (single-select only; multiple still deferred), carrying optionsSource + normalized dependsOn; recipient-class async (Slack channel) allowed, secret/connection still excluded, non-async dependsOn cascades still deferred. BuilderPreviewSetupCard renders select-async via a new PreviewAsyncSelectControl that calls useOptionsSource → fetchOptionsSource → GET /api/options/[source] (SAME hook/route as normal builder config — authed, account-scoped, credential-sharing-policy aware); card is threaded the builder workflowId for provenance, NO nodeId (no accepted node pre-Apply → workflow-context credential policy: account-shared providers visible to members, personal creator-pinned), NO token/secret/credential-id in the client request. States: loading/ready/empty/error+retry (raw provider detail never shown)/owner-gated/owner-must-connect/dependsOn-unresolved ("Choose X first", no fetch); a filled dependsOn parent is passed to the resolver as deps. Selecting updates previewConfig ONLY (no dirty/save/graph mutation/Hermes); Apply seeds via previewConfig→planToBuilderPatch→sanitizeSeedConfig (select-async keeps non-empty string = provider RESOURCE id, not a token; unknown/secret keys dropped). Canvas holographic nodes unchanged (visual-only, "Needs setup · N" badge). Auto-open-first-incomplete unchanged. NO Hermes/model call for option load/selection, NO selected value sent to Hermes/prompt/audit, NO legacy endpoint, NO auto-save/activate/run/auto-apply, NO DB write, NO token/gateway leak (BuilderPreviewSetupCard stays in the workflowGuidanceUiSafety presentational scan — loads options via the resolver hook, not fetch literal/store). Updated docs/slices/phase-5/hermes-agent-guided-preview-setup-plan.md ("Phase 4 status — IMPLEMENTED"). tsc/eslint(touched)/lint:structure clean; 243 green across BuilderPreviewSetupCard(incl. async load/loading/empty/error/select/deps-defer/deps-pass)/BuilderGuidanceRail/BuilderPreviewOverlay/builder-apply-preview(incl. async Slack-channel end-to-end seed)/builder-preview-overlay/previewSetupFields(incl. select-async + sanitize)/planToBuilderPatch/appliedConfigHints/workflowGuidanceUiSafety/WorkflowGuidancePanel/WorkflowsDashboard/useOptionsSource/builder-ai-rail-no-old-endpoint. Pre-existing UNRELATED failure confirmed via stash (analytics resolveActiveAccount drift in tests/unit/services/accounts/activeAccount.test.ts — fails with my page change reverted; not touched). + HERMES-AGENT-GUIDED-PREVIEW-SETUP-RAIL-UX (LOCAL/UNPUSHED): re-homed the guided preview setup CONTROLS out of the (now visual-only) holographic canvas nodes and INTO the React chat rail, tied to the latest shown preview. NEW features/workflow-builder/panels/BuilderPreviewSetupCard.tsx — presentational "Finish these details before applying:" card: renders supported local controls (text/textarea/number/boolean/static-select) for each preview node's missing fields (testid preview-setup-${previewId}-${name}), a compact "Choose after Apply: …" line for deferred fields (async optionsSource / unresolved dependsOn), and an "Apply to draft" button (builder-preview-setup-apply) wired to the existing explicit Apply. BuilderGuidanceRail renders the card pinned below the chat when previewForSetup is set (= previewOverlay?.preview, owned by WorkflowBuilder); the rail still delegates ALL request logic to WorkflowGuidancePanel (no new network path). WorkflowBuilder re-added handlePreviewConfigChange + threads previewConfig+setupFieldsByType+handleApplyPreview to the rail; previewConfig stays ephemeral (previewId→field→value), never configSlice/draft/DB, never dirty, cleared on new-preview/Discard/switch, seeded into new draft nodes ONLY on explicit Apply (planToBuilderPatch + sanitizeSeedConfig). Canvas holographic nodes unchanged (visual-only, "Needs setup · N" badge, no inputs). RECIPIENT-FIELD RULE (new): previewSetupFields.toPreviewSetupField now ALLOWS recipient-class fields rendered as a supported LOCAL control (e.g. typed "to") — they're deterministic user input, seeded on Apply, NEVER sent to Hermes/model/prompt/audit (previewConfig is never part of any guidance request; the change handler only updates local state). secret/connection still excluded; recipient+async (Slack channel = combobox+optionsSource) stays deferred. Async optionsSource resolver dropdowns NOT added this slice (deferred state shown; next candidate). NO Hermes/model call for setup edits, NO auto-save/activate/run/auto-apply, NO legacy endpoint, NO DB write, NO token/gateway leak (BuilderPreviewSetupCard added to workflowGuidanceUiSafety presentational scan). Updated docs/slices/phase-5/hermes-agent-guided-preview-setup-plan.md ("Phase 3 status — IMPLEMENTED"). tsc/eslint(touched)/lint:structure clean; 187 green across WorkflowGuidancePanel/BuilderGuidanceRail/BuilderPreviewSetupCard/BuilderPreviewOverlay/builder-apply-preview/builder-preview-overlay/previewSetupFields/planToBuilderPatch/appliedConfigHints/workflowGuidanceUiSafety/builder-ai-rail-no-old-endpoint. + HERMES-AGENT-HOLOGRAPHIC-PREVIEW-NODE-UX (LOCAL/UNPUSHED): product-direction correction to the canvas preview — the holographic preview nodes are now VISUAL-ONLY cards that MIRROR the real node card (WorkflowNodeCard) with a proposed/shimmer treatment, NOT forms. REMOVED the Phase-1 on-canvas "Set up these steps" section + all native inputs/selects/textareas from BuilderPreviewOverlay (setup controls re-home to the React chat rail in a follow-up slice). Each proposed step now renders: 3px status rail + provider avatar (icon via providerIcons map, deterministic initials fallback) + kind chip + humanized title (send_message→"Send Message") + provider:type mono capability subtitle + provider label (providerLabels map); holographic = glassy translucent color-mix surface + backdrop-blur + builder-preview-node-ghost animate-pulse + dashed accent glow border + subtle per-node "Preview" badge (preview-node-badge) alongside the global "Suggested" badge. A still-incomplete node shows only a SHORT "Needs setup · N" badge (preview-node-needs-setup) = field COUNT, never a field-name list (removed the canvas "Still needs: …" text). Reuse-vs-mirror: the real card is a React-Flow node (needs Handle + useBuilderNodeActions context) so it's MIRRORED (same layout/classes/tokens), not imported. Overlay stays PRESENTATIONAL — no store/fetch/model (still locked by workflowGuidanceUiSafety). PreviewConfig + planToBuilderPatch SEEDING plumbing PRESERVED for the rail re-home: WorkflowBuilder.previewConfig ephemeral state + clear lifecycle + Apply-time sanitizeSeedConfig seeding all kept; with no canvas control today Apply seeds EMPTY config (original additive behavior). Removed now-unused handlePreviewConfigChange; pass providerLabels/providerIcons to overlay. Apply stays explicit/local-draft-only; auto-open-first-incomplete after Apply unchanged. "Being updated": additive-only patches → added nodes holographic, existing nodes the insert lands between stay SOLID; update-existing highlight deferred until update-semantics exist. NOTE: the ORIGINAL ask (HERMES-AGENT-GUIDED-PREVIEW-SETUP-2 = async optionsSource dropdowns on canvas) was REDIRECTED by Marcus after I flagged that the marquee Slack channel field is sensitivity:"recipient" (excluded by the hard constraints); async dropdowns + recipient-class treatment defer to the rail re-home (recipient = apply-safety/AI-auto-write guard, distinct from cross-member privacy). NO Hermes/model call, NO auto-save/activate/run/auto-apply, NO legacy endpoint, NO DB write, NO token/secret/gateway leak. Updated docs/slices/phase-5/hermes-agent-guided-preview-setup-plan.md ("Phase 2 status — IMPLEMENTED"). tsc/eslint(touched)/lint:structure clean; 134 green across BuilderPreviewOverlay/builder-apply-preview/builder-preview-overlay/previewSetupFields/planToBuilderPatch/workflowGuidanceUiSafety/builder-ai-rail-no-old-endpoint. + HERMES-AGENT-GUIDED-PREVIEW-SETUP-1 (LOCAL/UNPUSHED): guided setup on the holographic preview — fill known fields on the proposed (shimmering) nodes BEFORE Apply, deterministically, with NO Hermes/model call. New core/workflows/previewSetupFields.ts: buildPreviewSetupFields(actionMetas, triggerMetas) → supported local controls only (text/textarea/number/boolean/static-select); EXCLUDES sensitivity(secret/connection/recipient), optionsSource(async — deferred to slice 2), dependsOn, multiple, dynamic-select, unsupported renderer types; + sanitizeSeedConfig (keep only supported keys, type-coerce, drop empty/unknown/secret). Threaded config through the patch: BuilderPatchNode.config? + ResolvedPatchNode.config? + additivePatchPlacement uses d.config + graphSlice.applyAdditivePatch carries pn.config (defaults to {} → back-compat). planToBuilderPatch(plan, { previewConfig, setupFieldsByType }) seeds each node's config keyed by preview-step-${i+1} (index over ALL steps incl. logic, so alignment survives skipped logic steps), sanitized. UI: BuilderPreviewOverlay renders a "Set up these steps" section on the ghost nodes (native text/textarea/number/boolean/select controls, testid preview-setup-${previewId}-${name}); unsupported/async missing fields show "Needs setup after Apply" (no fake control). WorkflowBuilder owns ephemeral previewConfig (previewId→field→value): PREVIEW-ONLY — never configSlice/draft/DB, never dirty; cleared on new preview (handleShowPreview), Discard, and workflow switch/unmount; seeded into new nodes ONLY on explicit Apply. setupFieldsByType built server-side in app/workflows/[id]/page.tsx from the discovery registry. PLACEMENT chose the holographic overlay (an allowed design option), NOT the literal chat rail — Apply + ghost nodes + appliable preview all live in WorkflowBuilder/overlay, avoiding cross-component state + previewId collisions. Auto-open still fires for remaining missing fields, skipped when guided setup completes all required. NO Hermes/model call for controls, NO auto-save/activate/run/auto-apply, NO legacy endpoint, NO token/secret/gateway leak. Added eslint per-file max-lines exception for WorkflowBuilder.tsx (cap 460, orchestrator — split is its own refactor; mirrors engine.ts precedent); graphSlice.ts max-lines warning is pre-existing (untouched). tsc/eslint(touched)/lint:structure clean; 240 green across core/planToBuilderPatch/overlay/placement/appliedConfigHints/WorkflowBuilder/panel/rail/uiSafety/structure-lock + hermes-guidance integration (incl. 3 guided integration tests: preview-only-until-Apply+seed, async-deferred+auto-open, discard-clears). Design doc updated to "Phase 1 IMPLEMENTED" (docs/slices/phase-5/hermes-agent-guided-preview-setup-plan.md). + HERMES-AGENT-RAIL-PRODUCT-LABEL-AND-GUIDED-PREVIEW-DESIGN (LOCAL/UNPUSHED): PRODUCT-LABEL cleanup (durable decision) — the chat assistant speaker is now "React:" (was "Hermes:"), the composer a11y label is "Message React" (was "Message Hermes"), and the rail header status is "connected" (was "connected · Hermes"); panel title stays "React Agent". Hermes is INTERNAL infra and must never appear in user-facing chat content/status (architecture/gateway names stay in code/comments only). Tiny UI-string change only — no route/schema/prompt/recentTurns/apply/save/activate/run change; tsc/eslint/lint:structure clean; panel + rail + WorkflowBuilder + workflowGuidanceUiSafety + structure lock green (166), incl. a new test asserting "React:" present + no "Hermes" in the transcript. Plus a DESIGN-ONLY audit doc docs/slices/phase-5/hermes-agent-guided-preview-setup-plan.md for guided setup on the holographic preview: reuse SchemaForm + FieldMeta (contracts/actionMeta) + GET /api/options/[source] (authed, account-scoped) to render native controls for a preview node's required/missing fields BEFORE Apply, writing to an EPHEMERAL preview-config overlay (never configSlice/draft/dirty/save), then seed config on Apply via planToBuilderPatch; PRINCIPLE: never call Hermes to collect config (Hermes=plan/shape only); recommended first slice HERMES-AGENT-GUIDED-PREVIEW-SETUP-1 = rail "Set up these steps" section, text/number fields first (defer async optionsSource dropdowns to slice 2). Mental model: holographic/shimmer=proposed → solid=accepted draft → Save → Activate. + HERMES-AGENT-BUILDER-RAIL-CHAT-AVAILABLE (LOCAL/UNPUSHED): bugfix — builder left rail showed "React Agent connected · Hermes" header but body "AI guidance is currently unavailable" with NO chat input. ROOT CAUSE: the gateway is configured + healthy (CHAINREACT_AI_GATEWAY_URL/_TOKEN set) but the rollout flag HERMES_AGENT_ENABLED was NOT set, so isHermesAgentEnabled()=false → page passes guidanceEnabled=false → rail correctly hid; meanwhile BuilderLeftAgentRail HARDCODED "connected · Hermes" → misleading contradiction. FIX: (1) set HERMES_AGENT_ENABLED=true in .env.local (gitignored, local-only — gateway already wired) so the chat is actually available locally; (2) BuilderLeftAgentRail header now takes a `connected` prop and shows "connected · Hermes" (green) only when available else "not connected" (muted), with data-testid=builder-left-agent-rail-status + data-connected; WorkflowBuilder passes connected={guidanceEnabled===true && !!accountId} — the SAME rule the body uses, so header+body can never contradict; (3) BuilderGuidanceRail unavailable note gains a safe data-reason ("guidance-disabled" | "no-account") for dev observability (no secrets). NO route/recentTurns/apply change, NO legacy endpoint, NO auto-save/activate/run, NO token/secret/gateway-URL in client. Regression tests: rail gating asserts chat composer present when enabled + data-reason on each unavailable cause; WorkflowBuilder asserts chat composer + header data-connected=true when enabled+accountId, and header data-connected=false + reason guidance-disabled when off (the screenshot state can no longer happen). tsc/eslint/lint:structure clean; rail + WorkflowBuilder + panel + workflowGuidanceUiSafety + structure lock (159) and route + hermes-guidance integration (52) green. Live browser smoke NOT performed by me — flag now on, so the user's running dev shows the chat after refresh. + HERMES-AGENT-AUTO-OPEN-FIRST-INCOMPLETE-AFTER-APPLY (LOCAL/UNPUSHED): UX-only — after an explicit "Apply preview", auto-select/open the config rail for the FIRST newly-added node that METADATA confirms is still incomplete (a missing required field), so the user can finish config immediately. New pure helper firstIncompleteAppliedNodeId(hints) in appliedConfigHints.ts (reuses the SAME requiredFieldsByType/missingRequiredFields signal as the post-apply hints + canvas "Needs setup" chip — NOT Hermes prose; a no-metadata node is NOT auto-opened since incompleteness can't be confirmed; null when none). Wired ONLY in WorkflowBuilder.handleApplyPreview success branch: reads post-apply pendingNodes fresh → openNode({nodeId, initialValues: node.config}) which sets activeNodeId → the existing inspector-drawer effect opens it (navigation only — openNode never saves/activates/runs/mutates the graph). Preserves placement rules, "Added from preview" badge, and the hint notice; chat history untouched. NO auto-save/activate/run/auto-apply/create, NO Hermes route or recentTurns change, NO token/secret leak. tsc/eslint/lint:structure clean; appliedConfigHints unit + builder-apply-preview integration (incomplete-opens / first-of-many / none-complete-no-open / show-then-discard-no-open) + BuilderPreviewOverlay + rail chat + panel + WorkflowBuilder(46) + structure locks green (139 in one run, +26); pre-existing unrelated variable-picker/run-detail/structure-drift failures untouched. + HERMES-AGENT-BUILDER-RAIL-CHAT-MODE (LOCAL/UNPUSHED): turned the builder Hermes rail from a single-shot guidance form into a SESSION-SCOPED conversational rail over the SAME governed path (NO new route, NO legacy planner/thread revival, NO durable memory, NO DB write). Added conversational mode to the SHARED WorkflowGuidancePanel gated by a `conversational` prop (dashboard stays single-shot, byte-identical) + BuilderGuidanceRail passes it — chose panel-hosted chat over rail-hosted to reuse the existing helper/preview/show-on-canvas pipeline AND keep the prior structure locks stable (rail still just renders the panel, no direct requestWorkflowGuidance). Threaded an OPTIONAL bounded/sanitized `recentTurns` end-to-end: helper → route zod schema (role allow-list user/assistant, per-turn text ≤1000, ≤8 turns kept-most-recent, unknown per-turn fields STRIPPED not 400, omitted on first turn → single-shot byte-identical) → capability → gateway client → buildGatewayGuidancePrompt ("Recent conversation" section, secret shapes redacted + truncated per turn). Plain text only — never config/secrets/tokens/credential-ids/provider-account-ids/raw workflow JSON; audit row unchanged (no conversation stored). Chat UX: message list (user/Hermes/error) + bottom input; follow-up appends; only the LATEST assistant turn's preview is actionable (new preview supersedes prior pending); Show on canvas / Apply / Discard unchanged + explicit + local-draft-only (overlay owns apply/discard; chat history kept on discard); no auto-save/activate/run/auto-apply; provider-neutral. New contract GuidanceConversationTurn + bounds in contracts/aiGuidance.ts. tsc/eslint/lint:structure clean; panel 16 + rail 7 + route + prompt + reactAgent/ai-guidance + apply/run-results + structure locks green (319 in one run); pre-existing unrelated structure/variable-picker/run-detail failures unchanged. + CHAINREACT-AI-SURFACE-STRUCTURE-LOCKS (tests/structure/docs only, LOCAL/UNPUSHED): fixed the stale workflowGuidanceUiSafety test (deleted BuilderGuidanceEntry → now asserts the live BuilderGuidanceRail→WorkflowGuidancePanel→requestWorkflowGuidance→/api/accounts/[id]/ai/workflow-guidance path with a comment-stripped no-leak scan); strengthened tests/structure/builder-ai-rail-no-old-endpoint.test.ts with a Phase-3 removed-set block (services/ai/planner+diagnostics + chat-only repair fns absent, dead AiPlan* pruned, recordAiPlanOutcome gone, apply/repair recorders kept) + a consolidated "ChainReact AI surface — locked" block (keep-set present, removed-set absent, client/builder rule-4 no-leak = no CHAINREACT_AI_GATEWAY_TOKEN/OpenAI/Nous/onrender/hermes-agent/hermesAgentGatewayClient, rail + RunResultsRepairBlock import checks); docs-only topology "Locked AI surface" section + stale BuilderGuidanceEntry-wiring fix; NO product/route/behaviour change; tsc/eslint/lint:structure clean, 87 lock tests green; pre-existing unrelated variable-picker + run-detail/runs supabase-mock failures unchanged. + HERMES-AGENT-RETIRE-LEGACY-PLAN-CHAT Phase 3 (route-less services) @ 41bf8ae6b: deleted services/ai/planner + services/ai/diagnostics (whole dirs) + chat-only services/ai/repair fns (planWorkflowRepair/previewWorkflowRepair/applyRepairPatch/assessRepairApplyReadiness/deterministicRepairPreview) + tests (61 deletions); DELETED the DEAD plan recorder recordAiPlanOutcome + its plan-only helpers from recordAiRouteEvents (no caller after Phase 2) rather than relocating planner types — coupling dissolved; pruned dead AiPlan*/AiModelMeta/AiRequiredUserInput/CurrentGraphSnapshot from lib/api/ai/plan.ts; CORRECTED Phase-2 keep-set notes — repairStrategies is LIVE (relative ./repairStrategies import by suggestWorkflowRepair) AND repairPatchRef is LIVE REACT-AGENT-CS-7B governance, both KEPT; recordAiApplyOutcome/recordAiRepairOutcome + governed routes + services/ai-guidance kept; tsc/eslint/lint:structure clean, 210 tests green; no behaviour/migration. + HERMES-AGENT-RETIRE-LEGACY-PLAN-CHAT Phase 2 (routes + client helpers): deleted the UI-orphaned chat-only ROUTES /api/workflows/[id]/ai/{plan,complete,thread,diagnose*,repair/plan,repair/preview,repair/apply,repair/apply-readiness} (11 files) + 9 route tests + dead CLIENT helpers (lib/api/ai/thread.ts + diagnostics.ts whole files, planWorkflow+completePlan from plan.ts, barrel cleanup, ai.test.ts trimmed to applyWorkflowPatch); KEPT /ai/apply+applyWorkflowPatch, governed /api/accounts/[id]/ai/{workflow-guidance,workflow-repair}, BuilderGuidanceRail, RunResultsRepairBlock+requestAccountWorkflowRepair, AiPreview/AiApply*/AiRepair* types, deterministic suggester/validators, services/ai-guidance/*, scope guards, Hermes gateway; DEFERRED to Phase 3 the server services (services/ai/planner+diagnostics+chat-only repair fns+capability runners) — UI-orphaned but not browser-reachable + entangled with the live events recorder (imports @/services/ai/planner) + live suggestWorkflowRepair; tsc/lint/eslint clean, 46 structure + 666 reactAgent/ai-guidance/lib-api/workflows-routes green (only pre-existing run-detail/runs supabase-mock + variable-picker failures); no behaviour/migration; next=Phase 3 services deletion. + HERMES-AGENT-RETIRE-LEGACY-PLAN-CHAT Phase 1 (UI subtree): deleted the unmounted legacy builder chat UI — 97 files (37 source + 60 tests): BuilderAiPanel + 14 _BuilderAiPanel* + chat hooks (useBuilderAi/useBuilderAiActions/useBuilderDiagnosisActions/useChatFill/_builderAgentPersistence) + 17 chat-only ai/* helpers + ~49 UI tests; grep-confirmed zero JSX mounts + only RunResultsRepairBlock imports ai/* (AiBulletList/AiRequiredInputList, self-contained, KEPT via slimmed ai/index.ts); KEPT BuilderGuidanceRail + governed /api/accounts/[id]/ai/workflow-repair + applyWorkflowPatch//ai/apply + deterministic repair services/validators/types; DEFERRED to Phase 2 the now-orphaned chat-only routes (/ai/plan,complete,thread,diagnose*,repair/plan,repair/preview,repair/apply*) + client helpers (planWorkflow/completePlan/etc.) + chat-only services (all still compile, dead); tsc/lint/eslint clean, 1644 builder + 73 focused + 177 reactAgent/ai-guidance green (only pre-existing variable-picker failure); no behaviour/migration change; next=Phase 2 route/helper/service deletion. + HERMES-AGENT-RETIRE-LEGACY-REPAIR-ROUTE: deleted the dead legacy run-repair route `app/api/workflows/[id]/runs/[runId]/ai/repair/route.ts` + client fn `requestWorkflowRepair` (only consumers were their own tests after the rehome); also removed `ai-repair-route.test.ts` + the `requestWorkflowRepair` describe in ai.test.ts; PRESERVED the deterministic suggester/validators/preview/apply, the governed account route `/api/accounts/[id]/ai/workflow-repair`, explicit `applyWorkflowPatch`/`/ai/apply`, RunResultsRepairBlock, and the `AiRepair*` types in runRepair.ts (now TYPES-ONLY, still used by the governed client + UI); structural scan locks the retirement; no behaviour/model/migration change; tsc/lint/eslint clean, 83 focused green; pre-existing unrelated run-detail/runs route mock failures (identical on clean tree); next=retire chat-only legacy AI routes once BuilderAiPanel subtree is rehomed/dropped. + HERMES-AGENT-REHOME-RUN-RESULTS-REPAIR: governance-only rehome of the builder run-results repair Ask — audit showed it's DETERMINISTIC (suggestWorkflowRepairForAI makes NO model call), so Marcus chose to keep it deterministic (not route a destructive-capable repair-apply through an LLM); NEW governed route POST /api/accounts/[id]/ai/workflow-repair (requireUserWithAccount + strict {workflowId,runId} + workflow-belongs-to-account no-leak-404 + run ownership + recordAiRepairOutcome audit) delegates to the same suggester + returns the identical value-free result; NO model/Hermes/gateway/token, AI-credit + HERMES_AGENT_ENABLED gates intentionally omitted (no model spend); NEW client requestAccountWorkflowRepair, RunResultsRepairBlock asks via it (accountId threaded; absent → unavailable note); APPLY unchanged on deterministic applyWorkflowPatch with explicit confirm, no auto-apply/save/activate/run; legacy /runs/[runId]/ai/repair kept (backend-tested, no live UI consumer); structural scan locks it; tsc/lint/eslint clean, 70 focused + 240 hermes/rail/reactAgent/ai-guidance green; next=retire legacy repair route or add OPTIONAL gated LLM prose layer that never produces the patch. + HERMES-AGENT-LEGACY-AI-ROUTE-AUDIT: audited the deprecated /api/workflows/[id]/ai/plan path — no user-facing consumer left (only the unmounted BuilderAiPanel chat), KEPT + marked deprecated in route + lib/api/ai/plan.ts (backend-tested, rehome candidate); CORRECTED prior slice — RunResultsRepairBlock is STILL MOUNTED (run-results drawer) and uses /ai/repair + /ai/apply, so those routes + lib/api/ai apply/repair + features/workflow-builder/ai/* helpers are LIVE (do NOT delete); only chat-driven diagnose/repair/chat-fill is dead-in-prod; REMOVED the superseded floating BuilderGuidanceEntry.tsx + test (dead, zero consumers); KEPT the BuilderAiPanel chat subtree + ~35 tests deprecated for rehoming; structural scan now asserts legacy plan path is not user-mounted (no composition root renders <BuilderAiPanel>, floating-entry file gone); no route/behaviour change, docs+comments+one deletion only; tsc/lint/eslint clean, 86 focused + 941 panels/route/reactAgent/ai-guidance green; next=retire /ai/plan + BuilderAiPanel once chat UX rehomed on Hermes. + HERMES-AGENT-REPLACE-BUILDER-AI-PLAN: the visible builder LEFT CHAT RAIL now uses the Hermes account guidance route (POST /api/accounts/[id]/ai/workflow-guidance) instead of the deprecated plan endpoint (POST /api/workflows/[id]/ai/plan / planWorkflow, 503); new BuilderGuidanceRail renders WorkflowGuidancePanel verbatim in the rail (reuses helper + Show-on-canvas→preview→Apply-preview path), floating BuilderGuidanceEntry pill no longer mounted → ONE builder AI entry; "connected · claude"→"connected · Hermes"; gated on isHermesAgentEnabled()+accountId else safe unavailable note; OLD BuilderAiPanel/useBuilderAi/planWorkflow/route NOT deleted (other tests/consumers) — only the visible rail disconnected (structural scan proves it); diagnose/repair/chat-fill no longer surfaced in builder (code+tests kept); no auto-save/activate/run/separate-workflow, no OpenAI/Nous/Render/private-Hermes browser calls, no gateway-token exposure; tsc/lint/eslint clean, 91 focused + 557 panels/integration + 177 reactAgent/ai-guidance green; next=retire /ai/plan route or re-home diagnose/repair on Hermes. + BUILDER-HEADER-ACTION-BAR-POLISH: visual-only builder header cleanup — primary actions normalized to h-8/rounded-md, HeaderRight grouped into utility|workspace|run|lifecycle zones with hairline dividers, validation pill is now an inline h-8 status-dot control (text/data/aria unchanged → ^N issue(s)$ contract held), secondary status lines (blocked-hint/private-cred/error) lifted to absolute top-full panels so they stop pushing buttons off-baseline, meta strip truncates ID + collapses first, disabled undo/redo/history cluster hides below xl; ZERO behavior/route/persistence/AI change; test-locked copy kept verbatim so no consolidation of pill+hint; tsc/lint/eslint clean, 632 unit + 64 integration green. + HERMES-AGENT-APPLY-CONFIG-HINTS: after explicit Apply, newly-added nodes surface required-field hints (LABELS only, from the same metadata `requiredFieldsByType`/`missingRequiredFields` rule as the "Needs setup" chip — NOT Hermes prose); new pure appliedConfigHints.ts + BuilderApplyNotice.tsx + "Added from preview" badge on cards; hints/badge recompute from live draft + clear on dismiss/switch/new-preview; unknown-metadata→generic "Review this step's required fields"; copy→"before saving or activating"; NO values/secrets/tokens/account-ids, no apply-then-save/auto-save/activate/run/delete/replace-trigger/config-overwrite/credential-insert, no OpenAI/Nous/direct-Hermes; reuse not parallel validator; next=live builder verification / optional apply-then-review. + HERMES-AGENT-APPLY-INSERT-BETWEEN: selected node with exactly one outgoing UNLABELED edge A→B → split into A→new…→B (placement inserted_between); only that one edge removed, all other edges/nodes/config untouched, labeled/branch + multi-outgoing never split (fall back to append); placement logic extracted to pure additivePatchPlacement.ts; notices per placement incl. "could not safely apply"; one-edge-split only, no multi-branch rewrite/delete/auto-save; next=HERMES-AGENT-APPLY-CONFIG-HINTS. + HERMES-AGENT-APPLY-IN-PLACE: applyAdditivePatch appends the action chain after a safe anchor (selected/active node → else sole tail) with one new edge instead of always a side chain; blank→origin, ambiguous multi-tail/no-anchor/trigger-first→side chain w/ safe notice; edges ADD-ONLY (no remove/rewrite/split), existing config/positions untouched; additive only, no edge-splitting/mid-chain-insert yet, no save/activate/run; next=HERMES-AGENT-APPLY-INSERT-BETWEEN. + HERMES-AGENT-CREDENTIAL-AVAILABILITY-CONTEXT: live sanitized provider availability into the scope guard — services/integrations/guidanceCredentialAvailability reads listActiveByAccount → provider KEYS+registry display names (account-class→shared, current user's own personal→own, other member's private excluded); no token/secret/id/owner/row-displayName; degrades empty; route feeds contextInputs; prompt "only suggest available connections"; no migration/workflow/apply/UI change; placed outside ai-guidance for the no-repos boundary; next=HERMES-AGENT-APPLY-IN-PLACE. + HERMES-AGENT-MEMORY-SCOPE-GUARD: deterministic buildSafeGuidanceContext gates request-scoped AI context (user/account/workflow/global scopes) — account-shared + own-connection availability OK, foreign member's private connection → generic notice, all other-member private data/identity/secrets excluded; NO durable AI memory store (request-scoped); prompt scope instruction; policy+enforcement+tests only, no new memory system/Honcho/migration/workflow change; next=HERMES-AGENT-APPLY-IN-PLACE. + HERMES-AGENT-APPLY-PREVIEW-PATCH: FIRST mutation path — explicit "Apply preview" converts validated WorkflowPlan → deterministic additive BuilderPreviewPatch (planToBuilderPatch) → graphSlice.applyAdditivePatch appends nodes(empty config)/edges to LOCAL draft, dirty via normal mechanism; additive only, skips proposed trigger if one exists, side-chain placement for existing graphs; NO delete/replace/replace-trigger/auto-save/activate/run/separate-workflow; panel passes {plan,preview} up; next=HERMES-AGENT-APPLY-IN-PLACE. + HERMES-AGENT-BUILDER-PREVIEW-OVERLAY: render DraftPreview as a separate ephemeral ghost layer over the builder canvas (shimmered/dashed Suggested nodes+edges, "Preview only…" notice, Discard); WorkflowBuilder useState only — never merges into real graph/draftDefinition, no dirty/autosave/save, Discard clears state w/ no rollback; panel "Show on canvas" builder-only via onPreviewToCanvas; NO apply/create/run; next=HERMES-AGENT-PLAN-APPLY. + HERMES-AGENT-DRAFT-PREVIEW: validated WorkflowPlan → ephemeral non-applied DraftPreview (distinct type from WorkflowDefinition; preview-only ids; labels only; notApplied everywhere; missing keys→warnings); deterministic planToDraftPreview, derived at route only from validated plan; UI renders preview-only "Draft preview" ("Preview only — your workflow has not changed.") superseding text plan; NO apply/create/run, ephemeral/in-memory, no draftDefinition/persistence/builder-store mutation; next=HERMES-AGENT-PLAN-APPLY. + HERMES-AGENT-PLAN-EXTRACTION: advisory validated plan only — deterministic extractPlanFromText pulls a fenced ```json WorkflowPlan from guidance text, normalizer gates it via validateWorkflowPlan (valid→surface+strip block, invalid→null+safe warning, prose→null); prompt asks for optional plan from catalog keys + no created/changed claims; UI renders review-only "Suggested plan" (no apply/create/run); notApplied:true; no mutation/persistence/preview-graph; next=HERMES-AGENT-DRAFT-PREVIEW. + HERMES-AGENT-GUIDANCE-UI-BUILDER: second "Build with me" entry inside the workflow builder (collapsed floating pill) reusing WorkflowGuidancePanel verbatim + passing in-context workflowId+accountId; server-gated on isHermesAgentEnabled()+accountId; route/helper already supported workflowId; advisory only, no mutation/direct-gateway. + HERMES-AGENT-GUIDANCE-UI: first user-facing "Build with me" advisory panel on workflows dashboard, server-gated on HERMES_AGENT_ENABLED, calls only the route via client helper, renders guidanceText; no mutation/no direct gateway. + HERMES-AGENT-CAPABILITY-ROUTE: gated POST /api/accounts/[id]/ai/workflow-guidance — auth+membership+freeze+optional-workflow-ownership+aiCreditGate(workflow_guidance)+persistent audit recorder; billing gap CLOSED; no ai_cost_events/no migration; advisory response only. + HERMES-AGENT-CAPABILITY: advisory React Agent capability workflow_guidance_intake (read_only, audited, gated, server-only via runAuthorizedCapability). + HERMES-AGENT-RESPONSE-CONTRACT: strict Zod gateway envelope schema + normalizeGatewayResponse → advisory NormalizedGatewayGuidance, fail-closed, workflowPlan null unless validateWorkflowPlan passes; live smoke healthy end-to-end. + HERMES-AGENT-PROD-CLIENT: server-only Render gateway client shipped, gated/inert; Render prod infra live, sandbox skipped; gateway now VERIFIED healthy after Render-side fixes. + HERMES-AGENT PIVOT: stripped direct Nous hosted-model integration — adapter/config/flag/prompt-builder/fallback/live-smoke/setup-runbook removed; generic guidance contracts + sanitizer + plan validator + skill-event boundary retained; new direction = internal Hermes Agent with OpenAI underneath, spike + sandbox runbook added. action-smoke live-verification arc + readiness/registry fixes; pruned superseded React Agent CS sub-entries — governance rollup retained. origin/v2-main = 33fad13b4; several LOCAL/UNPUSHED commits ahead, incl. SMOKE-CERT-1 + analytics WIP)

## Current status

- **LIVE in production** at `https://chainreact.app`, deploying from `v2-main` →
  [`docs/slices/phase-4/v2-go-live-status.md`](./slices/phase-4/v2-go-live-status.md).
  Vercel log review still manual. **Smoke caveat:** `npm run smoke:prod` public project
  currently shows 9 failures — ALL one pre-existing stale assertion (heading exact `"Sign in"`
  vs the page's "Sign in to your account"), NOT a regression; pages serve correctly. Needs a
  smoke-copy fix → see Open risks.
- **Document Builder RELEASED GLOBALLY (2026-07-24, prod).** No beta/allowlist/staged rollout.
  `ENABLE_DOCUMENT_BUILDER=true` in Vercel Production; `.env.example` default-OFF. Release
  commit `e55f30b50` (DOC-FINAL-ACCEPTANCE-1) → [`dual-builder-final-acceptance.md`](./slices/phase-5/dual-builder-final-acceptance.md).
  Flag is a pure server-resolved render gate: disabling it + redeploy returns users to Visual
  mode and deletes no workflow/presentation data. Authenticated in-prod behavior UNVERIFIED by
  the release (no smoke creds) → see Open risks.
- **Push state:** `origin/v2-main` is at `d2e0ab10d` — **deployed to prod 2026-07-24**
  (Marcus-approved push of `e55f30b50` DOC-FINAL + 2 Fleetio commits `8ccc6c3e4` / `d2e0ab10d`,
  incl. "publish Fleetio to the prod Apps catalog"). Local HEAD is ahead again (unrelated
  concurrent docs commits). **Push posture unchanged:** local work stays push-gated (commit
  locally, don't push by default); Marcus's explicit per-batch approval of a verified batch
  authorizes a `v2-main` push **which deploys to prod** (no staging env yet). Per-batch; does
  not carry over.
- **Open threads:**
  - **Durable run queue SHIPPED (Slice 1, LOCAL/UNPUSHED).** Execution dispatch moved off the
    interim `after()` keep-alive onto a durable `workflow_runs` `queued→running→terminal` model +
    every-minute `/api/cron/process-run-queue` safety-net processor (DURABLE-QUEUE-1, `b01341a72`).
    Live provider e2e manual-run smoke pending → see Durable decisions + Open risks.
  - **AI diagnosis + explanation (local-only, flags OFF).** Deterministic "Check workflow"
    (AI-DIAG-1) stays 0-credit/ungated/no-model; its telemetry now bills the workflow-owning
    account (AI-DIAG-2-pre). **"Explain with AI" SHIPPED** (AI-DIAG-2): explicit-click only; the
    route re-derives the safe DTO server-side and sends only an allow-listed projection to OpenAI
    fast, gated **before** the model call (`workflow_explanation`=1, workflow-owning account),
    explanation-only UI. **LIVE in prod + credit enforcement ON** (2026-06-19): `ENABLE_AI_CREDIT_ENFORCEMENT=true`
    (Production), OpenAI ON; Q&A + Explain deduct AI credits (see "Recently completed arcs"). **Next:**
    credit-exhaustion product messaging → AI usage in billing UI → later Hermes →
    [`ai-diag-2-llm-explanation-plan.md` §0](./slices/phase-4/ai-diag-2-llm-explanation-plan.md) ·
    [`ai-credits-enforcement-3b-plan.md` §0](./slices/phase-4/ai-credits-enforcement-3b-plan.md).

## Durable decisions

- [2026-07-24] **Document Builder is a GLOBAL production feature, gated only by `ENABLE_DOCUMENT_BUILDER`.**
  Released with no beta/allowlist/percentage/preview-only rollout (Marcus's explicit call). The flag is
  server-resolved, true ONLY on the literal string `"true"`, default OFF; it is a pure render gate —
  never touches persisted workflow or Document presentation (`presentation.sections`) data — so toggling
  it is a safe, data-preserving rollback. Prod enablement lives in the Vercel Production env only;
  `.env.example` stays default-OFF. → [`dual-builder-final-acceptance.md`](./slices/phase-5/dual-builder-final-acceptance.md)
- [2026-07-23] **MCP catalog Tier 1 is BUILT + LIVE — Linear + Eden PUBLISHED** (`isExperimental: false`,
  CS-6E; LOCAL/UNPUSHED). Linear is the first MCP-catalog app (official `mcp.linear.app` server,
  compiled into ordinary V2 artifacts via `scripts/mcp-import` + `core/mcpCompile`), live-certified:
  live OAuth, no drift on 52 tools, live read+write evidence, bounded structured outputs (save_issue
  returns NO `identifier` → uses `url`), real Team/Project/State/Assignee/Labels resolvers, Rule-17
  config-UX (priority dropdown, due-date picker, icon, no MCP terminology). Cycle stays text (cert
  team has no cycles — shape unproven, not invented). Eden published at a certified **33-action**
  surface; 3 social-publish writes (schedule_post/publish_post_now/update_scheduled_post) are
  DEFERRED/hidden (unregistered) pending live success capture. The provider-addition skill gained an
  **MCP-backed catalog provider path**. Customer Custom MCP (Tier 2) is a separate future feature, not
  started. → [`mcp-integration-layer-architecture-plan.md`](./slices/phase-5/mcp-integration-layer-architecture-plan.md),
  [`live-capture-evidence.md`](./providers/linear/live-capture-evidence.md), [`eden/deferred-actions.md`](./providers/eden/deferred-actions.md)
- [2026-07-17] **Motive provider is code-complete LOCAL only — not shipped, not prod-certified.**
  Owner (Motive dev-app + Vercel env) setup and Phase 13 live certification are prerequisites to
  any push. If Motive's live bulk-CSV import contract differs from the built spec, fix with a
  forward commit — never silently rely on the `MOTIVE_FUEL_IMPORT_PATH` override. → docs/providers/motive/owner-setup-report.md, `85cf7a59c`
- [2026-07-03] **MVP launch status reconciled (docs-only).** Owner decisions locked:
  React Agent ships **visible**; **Hermes + the deterministic "Check workflow" checker
  are expected launch features** (enabling Hermes in prod is env config, not code — the
  `HERMES_AGENT_ENABLED` OFF default is only a safe default); **staging is an accepted
  production-first risk, intentionally deferred** (plan exists, not an active task);
  live-provider validation is owned by a **separate chat**. Fixed locally: webhook dedup
  now **fails closed** before enqueue (`19c00455f`); platform billing **code-ready pending
  Marcus dashboard verification** (`141fd5789`). V2 billing uses a reserve/reconcile
  model on `account_billing` + AI credits (not packs/overage/auto-buy crons). Detail →
  [`docs/slices/phase-5/mvp-launch-status-reconciliation.md`](./slices/phase-5/mvp-launch-status-reconciliation.md).
- [2026-06-29] **Failed runs show a clear reason + one primary next action
  (CR-FAILREASON).** Rule: [`docs/rules/failed-run-recovery.md`](./rules/failed-run-recovery.md).
  Classification is owned by the shared humanizer
  (`core/errors/humanizeActionError.ts`), persisted to
  `workflow_runs.error_classification`, and is the CTA source of truth (mapped by
  `core/errors/failedRunCta.ts`) on Runs page / builder latest-run drawer /
  builder Runs-tab detail. Five actions: reconnect→/apps, upgrade_plan→/account,
  open_node→builder/failed step, retry_later + contact_support = guidance only
  (no retry API / support route invented), missing action = no CTA. Unknown/unsafe
  ⇒ contact_support with safe copy; no raw provider text/tokens/ids ever persisted
  or rendered. Do NOT build parallel humanizers or per-surface action maps; future
  provider errors extend the shared classifier with safe typed codes, never UI
  string parsing. Shipped: CR-FAILREASON-1 (`668005efa`) + CR-FAILREASON-2 (`cacb40a71`).
- [2026-06-26] **Analytics is a user/business-value surface, not an ops console.**
  NOT building the customer-facing "Workflow Health" / observability metrics slice
  (`runs_by_status`, `p95_duration`, `failures_by_workflow`, reconnect/disconnected
  counts) and NOT standing up a separate customer observability dashboard. Reasons:
  duplicates existing Analytics metrics, or already visible on Apps (reconnect) /
  Runs / builder run results, or operator-only. App health belongs on Apps, run
  failures on Runs / builder. Platform observability (queue depth, cron failures,
  dedup outages, OAuth refresh spikes, billing reconciliation drift, provider-wide
  failure rates) stays internal/deferred until V2 has a real platform-owner authz
  tier AND durable event ledgers (roadmap 8a/8b → external logs/Grafana, not
  customer Analytics). Feasible ≠ worth building; the prior technical feasibility
  audit is superseded. Do not re-propose unless Marcus reopens it. Docs-only; no
  code/migration/flag/behavior change. Decision:
  [analytics-observability-product-decision.md](./slices/phase-4/analytics/analytics-observability-product-decision.md).
- [2026-06-21] **Internal billing entitlement is ACCOUNT-level, never user-level.**
  `account_billing.billing_mode` (`standard` default | `internal_free`) explicitly marks
  internal/test/employee/demo accounts. `internal_free` → the execution billing gate skips
  task deduction (allowed/non-billable, never quota-refused) and checkout/portal short-circuit
  before any Stripe call (no faked subscription/customer). Freeze still beats the bypass; test
  mode still skips first. Set only via the service-role helpers in `repositories/accountBilling`
  + `services/billing/internalBillingEntitlement` (audited reason names the actor) and the
  `scripts/mark-account-internal.mjs` seed script — **no client/HTTP toggle, no UI**, no client
  write policy. Set only by a ChainReact **platform operator / internal admin** (out-of-band),
  NOT a customer/team account `owner`/`admin` role. Neither a platform operator nor any customer
  account role globally bypasses billing; a non-internal account is always billed regardless of
  who runs its workflows. Internal runs are still recorded in
  `task_usage_events` (observability) but never touch `account_billing` counters, so the
  reconciliation invariants (ledger sums equal counters) hold. Migration `20260707000000_account_billing_internal_entitlement.sql`
  (forward-only, applied to dev); Slice `BILLING-INTERNAL-ENTITLEMENT-1`.
- [2026-07-13] **Durable run execution = a `queued` state on `workflow_runs`, not a new table**
  (DURABLE-QUEUE-1; supersedes the 2026-06-11 interim `after()`/`waitUntil` keep-alive). Lifecycle
  `queued → running → succeeded/failed`. `enqueueRun(...)` stays the boundary and **no longer runs
  the engine inline** — it persists a durable `queued` row and returns. run-now best-effort drains
  via `after(processQueuedRun(runId))`; `/api/cron/process-run-queue` (every minute) is the
  safety-net processor. Claim is **single-winner** via a status-guarded UPDATE on `status='queued'`
  (no double execution; loser refuses as `DUPLICATE_DISPATCH`); crash-before-claim stays `queued`
  for the cron, crash-after-claim is swept by the stale-`running` sweep. Webhook/polling/scheduled
  runs are durable too. No handler/builder/AI/billing/resolver change. Commit `b01341a72`
  (LOCAL/UNPUSHED); migration `20260713000000_workflow_runs_durable_queue.sql` (queued enum + index)
  applied to V2 DB → [`docs/rules/workflow-lifecycle.md`](./rules/workflow-lifecycle.md).
- [2026-06-10] CLAUDE.md is the operating constitution; durable repo rules live in
  [`docs/rules/`](./rules/), provider/contract detail in [`docs/slices/`](./slices/) →
  curation commits `c2bbedbff..4cd929c7f`.
- [2026-06-12] **Team-visible ≠ team-runnable.** A workflow using ≥1 private/member-connected
  credential runs under the **creator's** OAuth identity (22B pin), so only the creator may
  run/edit it; owner/admin manage/audit/disable/delete/duplicate/transfer/request-share but do
  **not** run-as-creator by default. Shared/account-only + native-only workflows stay runnable/
  editable by any member. Non-creators see safe copy + Duplicate. Server (`6a02131ed`) + builder
  UI (`42fe1ce29`); **no migration, no flag**; Disconnect untouched →
  [`workflow-run-edit-permission-closeout.md`](./slices/phase-4/workflow-run-edit-permission-closeout.md).
- [2026-06-12] **AI credits = a separate billing dimension from workflow tasks.** Meter AI
  usage in AI credits (own pool, own limits), gate tiers on it. Deterministic checks
  (`services/diagnostics/*`) free; AI explanation cheap; repair planning costs more; deep
  multi-step agent loops premium. **Cheap model routing by default**, escalate to strong/premium
  only on validation-failure/low-confidence/higher-tier. Track AI cost from day one. Future hosted
  Hermes-style runtime sits behind an **agent-runtime adapter** (OpenAI underneath); ChainReact
  services stay source of truth. **MCP invariant (reconciled CS-6E):** the in-app React Agent
  **plans against typed provider metadata and never calls MCP tools directly**; MCP-backed
  *workflow actions* execute through the engine's typed handler registry (like native actions).
  This does NOT forbid the MCP catalog architecture (now built + live — see Durable decisions). As-built
  (`AI-CREDITS-3b`, flag-OFF): recording ledger + credit **policy/limits/gating now SHIPPED** — AI
  usage bills the **workflow-owning account** (personal→personal, team/business→shared pool), gated
  before the paid planner; deterministic diagnosis stays 0-credit/ungated →
  [`ai-credits-enforcement-3b-plan.md` §0](./slices/phase-4/ai-credits-enforcement-3b-plan.md) +
  [`ai-credits-and-agent-runtime-plan.md`](./slices/phase-4/ai-credits-and-agent-runtime-plan.md).
- [2026-06-10] File output (P-S3) is a durable cross-cutting rule →
  [`docs/rules/file-output-contract.md`](./rules/file-output-contract.md).
- [2026-06-12] **Push/deploy posture.** Local work is push-gated by default (commit locally,
  don't push). When Marcus **explicitly approves a verified batch**, pushing to `v2-main` is
  allowed and **deploys to production** — intended at this stage. The earlier "do not deploy to
  prod" caution is retired. A proper dev/staging env will be added later, before broad user
  rollout + taking payments → CLAUDE.md push-posture banner.
- [2026-06-09] V2 promoted live in production. "Don't push the working branch by default" does
  not mean "V2 isn't live" — both are true at once → CLAUDE.md banner @`4cd929c7f`.
- [2026-06-15] **Active-revision model is the real product behavior (LOCAL/UNPUSHED, no flag).**
  Draft edits aren't live; active workflows run the immutable active revision; test/preview runs
  the draft; Publish snapshots the draft → new revision + repoints `active_revision_id`; trigger
  resources are always registered from the same definition that's snapshotted; `workflow_runs.revision_id`
  records the executed revision (NULL for draft/test/legacy/fallback, never exposed by an API).
  Arc 41A–41J; flag `ENABLE_ACTIVE_REVISION_EXECUTION` **removed** (41H). Migration
  `20260626000000_workflow_runs_revision_id.sql` applied to **dev DB only** — **not pushed, not in
  prod**; deploy must apply it →
  [`active-revision-model-closeout.md`](./slices/phase-4/readiness/active-revision-model-closeout.md).
- [2026-06-16] **Sensitive-table Data API grant audit COMPLETE — four tables service-role-only (LOCAL/UNPUSHED).**
  `authenticated` can no longer directly read/write `integrations` (47B/47D, `20260627`/`20260628`),
  `trigger_resources` (50, `20260629`), `workflow_files` (52, `20260630`), or `workflow_runs` (51,
  `20260701`) where locked down; OAuth callback role re-check done (48). Every client read flows through a
  **service-role repository + explicit membership gate + allow-listed DTO**; `workflow_runs` detail strips
  raw `trigger_event`/`fatal_error`/raw step output, exposing SEC-7-redacted output ONLY to the test-run
  author. RLS unchanged; the personal/account model stays in `core/integrations/credentialSharing.ts`,
  **never re-encoded in SQL**. Regression guard `tests/structure/no-authenticated-integration-grants.test.ts`
  locks all four tables; gated RLS DB tests prove member direct SELECT → `42501`. **Migrations dev-DB-applied
  only, not pushed/prod — deploy must apply them. CONN-SHARE must not re-open broad grants** →
  [`v2-ready-49-sensitive-table-grant-audit.md`](./slices/phase-4/readiness/v2-ready-49-sensitive-table-grant-audit.md)
  + 47E/50/51/52 closeouts (`0cac51058`/`2c99a71bd`/`1f34cd7ba`/`88cf2d483`).
- [2026-06-26] **Connected-app health is intentionally a single `integrations.needs_reconnect_at` timestamp, NOT an expired/revoked/unhealthy enum.** It folds Slack `invalid_auth` / `token_revoked` / `http_401` into one "needs reconnect" signal (approved design; migration `20260624000000` states "NOT a health state machine"). Do NOT invent distinct Expired / Revoked / Provider-unhealthy status labels without real backend state. Reconnect stays per-account/per-row through the existing account-scoped OAuth flow with a hard callback identity-match guard (`services/integrations/reconnect.ts`; a wrong-account refresh maps to `reconnect_account_mismatch`), so a refresh can never land on a different row and no duplicate integration is created →
  [connected-apps-recovery-ux-closeout.md](./slices/phase-4/workflows/connected-apps-recovery-ux-closeout.md).

## Open risks & follow-ups

- [Claude] **Public `smoke:prod` assertions RESTORED** (DOC-BUILDER-PRODUCTION-CLOSEOUT-1). The 9
  failures were TWO stale-heading drifts (not one): sign-in `"Sign in"`→`"Sign in to your account"`
  (7 tests) and forgot-password `"Reset your password"`→`"Forgot your password?"` (2 tests). Both
  fixed to the real rendered headings (verified via prod HTML). NOTE: a green in-browser RUN was not
  obtained this session — Playwright stalled at Chromium launch on the loaded machine (env flakiness,
  not the fix); spec parses (`--list` = 12 tests) and assertions match prod ground truth. Marcus/CI
  should run `npm run smoke:prod` on a quiet machine to confirm green → `tests/smoke/public.smoke.spec.ts`.
- [Marcus] **Authenticated production Document Builder behavior is UNVERIFIED.** No `smoke:prod`
  credentials are configured (auth-setup self-skips) and no interactive authenticated browser is
  available. Also `builder.smoke.spec.ts` covers the **Visual** builder only — it does NOT toggle or
  assert Document mode — so closing this needs BOTH creds AND a Document-mode spec (or a manual
  authenticated pass on a disposable workflow). Operator setup (account state, rotation) →
  [`tests/smoke/README.md`](../tests/smoke/README.md).
- [Claude] **`docs/PROJECT_MEMORY.md` is ~1050 lines — far over the ~150-line budget.** The
  "Recently completed arcs" section and the stamp chain have grown unbounded. A dedicated curation
  pass should prune completed arcs to ~6 and trim the stamp chain (git history retains the rest).
- [Marcus] **Fleetio VIN population is UNVERIFIED — bulk VIN confirm stays OFF.** The dev Supabase
  project has **zero** connected Fleetio integrations, so `GET /vehicles` has never been observed
  and the premise behind "Confirm all exact VIN matches" (VIN present + correct on both sides) is
  untested. `ENABLE_VEHICLE_VIN_BULK_CONFIRM` therefore defaults OFF; individual VIN-tier
  confirmation is unaffected. To lift: connect a real Fleetio account, confirm `vin` is populated,
  record it in the plan doc, then set the env var →
  [`truck-bridge-vehicle-mapping-plan.md`](./slices/phase-5/truck-bridge-vehicle-mapping-plan.md) §11g + Q1.
- [Marcus] **Multi-Fleetio-account discriminator deferred (TRUCK-BRIDGE Q7).** `account_resource_links`
  identifies a target as "Fleetio vehicle 42 for this ChainReact account", NOT "…in Fleetio account
  7211". Acceptable only while one provider account per ChainReact account is unsupported
  end-to-end; the `*_provider_account_id` columns must land in the SAME slice that lifts that limit
  (documented in the `20260729000000` migration header and asserted by test).
- [Claude] **Pre-existing red, unrelated to any recent arc:**
  `tests/unit/services/execution/staleWorkflowRunSweep.test.ts` asserts `EXECUTION_INTERRUPTED`
  carries no CTA action, but the humanizer returns `retry_later`. The test (`f2d27e48a`) predates
  the humanizer change (`668005efa`); the assertion is stale, not the code.
- [Claude] **Durable run queue (DURABLE-QUEUE-1) live e2e smoke pending.** Slice-1 durable
  execution foundation is complete + unit-verified (tsc/lint/structure/migration-lint clean;
  queue/engine/processor/route suites green), but live provider end-to-end manual-run finalization
  (enqueue → cron/inline claim → terminal) is **not yet smoked** against real credentials — run
  once creds are available → commit `b01341a72`.
- [n/a] Slack-side message landing is **not externally verified** — that smoke step is
  intentionally gated (no Slack API read creds in the harness) →
  [`v2-go-live-status.md`](./slices/phase-4/v2-go-live-status.md).
- [Marcus] Provider builder-metadata launch gap **CLOSED 26/26** (2026-05-25) — enforced by
  `COVERED_PROVIDERS` / `tests/structure/discovery-meta-coverage.test.ts`; residual backlog
  non-launch-blocking →
  [`provider-metadata-launch-gap-tracker.md`](./slices/phase-4/provider-metadata-launch-gap-tracker.md) §8–§9.
- [Claude] New providers are selected by product value, official API support, V2
  architecture fit, and live-certification readiness.
- [Claude] Connected-app recovery **core UX is shipped** (`4.APPS-RECONNECT` / `V2-READY-28` /
  `CS-APPS-RECOVERY-1/2/3`; reverified 2026-06-26, 87/87 focused apps tests green). One polish
  item remains: AppCard reassurance copy ("Reconnect this app to keep workflows running." and
  "Reconnect only refreshes this account's connection."), currently absent. Deferred behind the
  in-flight `CS-APPS-RECOVERY-REVIEW-SCROLL` edit to `features/apps/AppCard.tsx`; do NOT edit that
  file until that lands. Disconnect already shipped (`4.APPS-DISCONNECT`); do not re-open it →
  [connected-apps-recovery-ux-closeout.md](./slices/phase-4/workflows/connected-apps-recovery-ux-closeout.md).

## Recently completed arcs

- **TRUCK-BRIDGE-1 — MOTIVE↔FLEETIO VEHICLE LINKING — ARC CLOSED, FEATURE LAUNCHED (LOCAL/UNPUSHED, CS-1…CS-6)** —
  closes the FLEETIO-4 gap ("a user must still establish the Fleetio vehicle id themselves", which
  meant one workflow per truck). Neither provider returns the other's id, so ChainReact stores the
  correspondence: `account_resource_links` (`20260729000000`) + `account_resource_link_dismissals`
  (`20260731000000`), both applied to the DEV project and database-validated (15/15 and 12/12).
  **`ENABLE_RESOURCE_LINKS_UI` now defaults ON** (only the literal `"false"` disables it; the kill
  switch closes the surface but never the runtime lookup).
  Shipped: a pure evidence-tier matcher (`core/resourceLinks/matchSignals.ts` — VIN/plate/number/
  name, no scores, blank never matches blank, ambiguity flagged never auto-resolved); a pure
  stale-link health core where a provider OUTAGE reads as `*_unknown`, never `*_missing`;
  `fleetio:find_linked_vehicle` (4th Fleetio action, `requiresIntegration: false`, so it runs in
  TEST MODE and survives a disconnected Fleetio); `/apps/vehicle-links` (Linked · Suggested ·
  Unlinked, manual pairing with no typed ids and no JSON, dismiss, remove/re-link);
  `UNMAPPED_VEHICLE` as a first-class run-failure code with a `link_vehicles` CTA →
  `/apps/vehicle-links`, stripped at the serving layer when the feature is off.
  Permissions: owner/admin mutate, members view + use links, non-members 403 — never
  created_by/confirmed_by. Personal accounts are first-class (no membership needed, no
  `account.type` filter anywhere). The flagship
  (`motive:new_fuel_purchase → get_fuel_purchase → find_linked_vehicle → create_meter_entry`)
  is proven through the REAL engine with only the DB + provider HTTP mocked: one write, approved
  body only, the Fleetio id (never the Motive one), A and B resolving the same Motive id to
  different Fleetio vehicles, archived/missing stopping before the write, and no failed write ever
  replayed. **Deliberately still OFF: `ENABLE_VEHICLE_VIN_BULK_CONFIRM`** — the dev DB has zero
  connected Fleetio integrations, so VIN population on `GET /vehicles` is UNVERIFIED and bulk
  confirm's safety premise is untested (individual VIN confirmation is unaffected). Full arc
  detail + evidence: [`truck-bridge-vehicle-mapping-plan.md`](./slices/phase-5/truck-bridge-vehicle-mapping-plan.md) §11b–§11g.
  **Post-arc (2026-07-24, owner flip):** Fleetio manifest `isExperimental: false` → PUBLISHED to
  the production Apps catalog (native `credential_paste` provider — no OAuth client, **no env var**;
  each user pastes their own API key + Account-Token). A "← Back to Apps" link was added to
  `/apps/vehicle-links`. Publish ≠ live certification: connecting a real account + confirming VIN
  population (to lift the bulk-confirm flag) is still open (§11h + Q1).

- **MOTIVE PROVIDER ARC — CODE-COMPLETE LOCAL, OWNER SETUP + PHASE 13 PENDING (LOCAL/UNPUSHED, `85cf7a59c`, 104 files)** —
  fifth net-new V2 provider (gomotive.com / fleet telematics, formerly KeepTruckin). **NOT shipped,
  NOT production-certified.** Account credential class; non-PKCE body-auth OAuth with single-use
  rotating refresh; companyId (read from `/v1/users/me`) = providerAccountId + webhook scope.
  Shipped code: 10 actions (fuel create/list/get/update/delete + bulk CSV import, send_message,
  create/update vehicle, update driver), 7 per-company webhook triggers (HMAC-SHA1
  `X-KT-Webhook-Signature`, strict-direct routing, first-seen dedup on new_vehicle/new_driver) +
  1 baseline-first `new_fuel_purchase` polling trigger, 2 resolvers (motive:vehicles/drivers).
  Gates green: tsc 0, 38 unit tests, structure/discovery/option-source/activation pass (2
  remaining structure failures are PRE-EXISTING + Motive-unrelated). Bulk-CSV live wire contract
  is UNVERIFIED (partner-portal-gated) — built against best-available spec, flagged live-cert-gated
  (`MOTIVE_FUEL_IMPORT_PATH` override; correct via a FORWARD commit if live differs, never silent).
  **Phase 13 requires evidence for:** OAuth connect + identity persist; 2 sequential refreshes
  proving single-use rotation; a full individual fuel CRUD cycle; one real bulk CSV import
  (actual endpoint/body + async status polling); every webhook's signature verify + real payload
  mapping; baseline-first polling emitting zero historical events; one end-to-end Motive-trigger→
  downstream-action run. Replace every UNVERIFIED marker with captured evidence after cert.
  `85cf7a59c` stays LOCAL until Marcus explicitly approves the push.
  → docs/providers/motive/ (research.md · v2-pattern-audit.md · implementation-plan.md · owner-setup-report.md)
- **ASANA PROVIDER ARC — COMPLETE + LIVE-CERTIFIED + DEPLOYED (2026-07-04)** — first net-new V2
  provider (Slice 5.ASANA-1, `6494a04ff`) taken all the way through post-owner-setup live
  certification: 5/5 actions live-passed through the real engine, both project-webhook triggers
  passed a FULL provider-boundary live smoke (real `POST /webhooks` handshake against the deployed
  receive route, real events, production dispatch/drain, `DELETE /webhooks` 404-proven), all 4
  option sources live-verified (names-only user labels). Live smoke surfaced + fixed a real bug:
  Asana emits `task+added` once per parent (project + section) for one creation, so the
  timestamp-bearing dedup key double-fired — key is now task-scoped (`64795582a`, pushed +
  deployed; deploy-gated retest passed, exactly one run). Trial lessons folded into the
  provider-builder skill as Phase 13 live certification + env-alignment/Apps-catalog gates
  (`e7f950ddb`, local). → [`docs/providers/asana/owner-setup-report.md`](./providers/asana/owner-setup-report.md)
  (docs closeout `66ba3defa`, local).
- **INTERNAL-FEEDBACK-NAV — internal React Agent Feedback nav link — LOCAL/UNPUSHED (`d8f68f40c`)** — added a caller-only internal-admin status endpoint (`GET /api/internal/admin-status` → only `{ isInternalAdmin }`) plus a fail-closed client hook (`useIsInternalAdmin`, single-flight, default false) so seeded ChainReact internal admins see a "React Agent Feedback" item in the desktop rail and mobile drawer linking to `/admin/react-agent`. Visibility is based only on `internal_admins` membership, not customer account/team/org roles. Page/API gates remain unchanged (typing the URL still 404s for non-admins). Browser-verified against the active project: Marcus sees the link desktop+mobile and it opens the dashboard; non-internal user has no link, status `{false}`, manual visit 404; signed-out redirected with no app nav; status body exactly `{"isInternalAdmin":true}` (leak-scan clean); `internal_admins` still only Marcus. No metrics changes, no admin-management UI, no push/no deploy/no DB changes.
- **INTERNAL-FEEDBACK-2 — internal React Agent metrics dashboard, Phase 2 — LOCAL/UNPUSHED (`807074fc8`)** — added internal-admin-gated `GET /api/internal/react-agent/metrics` plus dashboard wiring for aggregate-only React Agent metrics: total agent changes, governance events, preview funnel, test outcomes, setup issue counts, and governance outcome split with date range filtering. Uses service-role only inside repository aggregation (`repositories/reactAgent/metrics.ts`) and returns counts only; no prompts, summaries, failure reasons, diffs, metadata, account IDs, user IDs, workflow IDs, provider payloads, secrets, or credential details. Browser-verified against the active project: Marcus 200 + real counts (governance 44, 7d-filtered 20; agent changes honest 0), range control refetches, DOM/API leak-scan clean, signed-out 307→sign-in + API 404, non-internal user 404. Metrics deferred: most-common missing field, provider/action failure counts, autobuild completion rate, prompt search, drilldown, export, nav link, admin management UI. No push/no deploy.
- **INTERNAL-FEEDBACK-1 — internal React Agent feedback dashboard, Phase 1 — LOCAL/UNPUSHED (`15c1bcda1`; docs update `d81255a0b`)** — DB-backed ChainReact internal-admin gate (`internal_admins` table, RLS select-own, service-role-managed; distinct from customer account/team/org roles) plus `/admin/react-agent` empty dashboard shell + gated `GET /api/internal/react-agent/overview`. Migration `20260718000000_internal_admins` has been applied on the active ChainReact Supabase project `qcepijemjlkssfkvzlio`, and Marcus was seeded as the only internal admin (`stockhal120@gmail.com`). Access foundation only — metrics remain deferred. No nav link, no push, no deploy. Business partner seed and browser confirmation are optional follow-ups.
- **DURABLE-QUEUE-1 — durable run queue — LOCAL/UNPUSHED (`b01341a72`)** — replaced the interim
  in-process `after()` dispatch with a DB-backed durable queue on `workflow_runs`. `enqueueRun`
  persists a `queued` row (no inline engine run); the processor claims `queued → running`
  single-winner (status-guarded UPDATE); run-now drains via `after(processQueuedRun)`;
  `/api/cron/process-run-queue` (every minute) is the safety net; webhook/polling/scheduled are now
  durable; crash recovery = queued-for-cron (pre-claim) + stale-`running` sweep (post-claim).
  Migration `20260713000000` (queued enum + index) applied to V2 DB. tsc/lint/structure/migration-lint
  clean; queue-repo/engine-claim/processor/cron-route suites green; 1 pre-existing unrelated failure
  (analytics `activeAccount` drift). Deferred Phase 6: resume-from-failed-node, HITL, retry/backoff,
  parallel exec, load testing, `SKIP LOCKED` RPC, pending-run UI display, stale-`queued` alerting.
- **CONNECTED-APPS RECOVERY UX — arc closed — LOCAL/UNPUSHED (2026-06-26)** —
  Audit found per-row Reconnect, real Disconnect (soft-disconnect + workflow cascade + best-effort
  provider revoke), the workflow-impact warning, and account/team credential rules were ALREADY shipped
  (`4.APPS-RECONNECT` / `4.APPS-DISCONNECT` / `V2-READY-28`). Two surgical fixes closed the real gaps:
  **CS-1** (`e7ba8bc33`) — `services/oauth/refreshAndRetry.ts` now best-effort marks the SPECIFIC
  integration row `needs_reconnect_at` + fires the one-shot connector notification on its two DURABLE
  auth-required exits (`refresh_not_supported`, post-refresh retry-401); NOT on transient errors; never
  masks the run failure (closes the "Apps card green-while-broken" hole for background non-refreshable
  failures). **CS-2** (`e9bd83c36`) — collapsed app card surfaces a recovery affordance: one reconnectable
  broken row → direct per-row Reconnect; multiple/mixed → "Review reconnects" (expand); only-blocked/healthy
  → status-pill warning, no dead control. UI-only (no DTO/backend change); pure `deriveCollapsedReconnect`
  helper. No new migration, no feature flag (correctness/discoverability fixes). Verified green this session
  (36+3 suites / 504 tests, full tsc 0, eslint 0, structure OK). Deferred: live revoke smoke = manual-QA
  pending (no safe automated runtime-401 path). Plan + closeout →
  [docs/slices/phase-4/workflows/connected-apps-recovery-ux-closeout.md](./slices/phase-4/workflows/connected-apps-recovery-ux-closeout.md).
- **ACTION-SMOKE WRITE certification — arc boundary, 119 LIVE_PASS — LOCAL/UNPUSHED (2026-06-25)** —
  `npm run chainreact -- smoke actions --cert`: **298 registered / 119 LIVE_PASS / 0 stale / 0 FAIL / 0 BUG /
  0 sandbox / 0 unsafe**; every LIVE_PASS row has a fixture (guarded by `certification.test.ts` /
  `registry-parity.test.ts` / `fixtures-valid.test.ts`). The 26 fixtured-but-not-run rows are expected READS /
  `native:*`, plus the one by-design destructive exception `slack:delete_message` (non-`liveSafe`,
  inventory/handler-only). **Write-COMPLETE providers (every registered action LIVE_PASS):** `airtable` 11/11,
  `google-drive` 7/7, `google-sheets` 12/12, `microsoft-onedrive` 7/7. This arc certified
  `microsoft-onedrive:copy_item` (SMOKE-WRITE-33, `LIVE_PASS_CLEANED`, live-verified 0 leaks) by adding a
  smoke-harness `completeAsync` primitive that polls the async Graph `/copy` monitor URL — trusted Microsoft
  operation hosts ONLY (exact Graph base + `*.svc.ms` observed-live / `*.sharepoint.com` per contract) — to
  capture the copied item's real id for independent verify + cleanup; the PRODUCTION action is UNCHANGED (still
  returns `status:"pending"`, no polling). Remaining uncertified mutations are coverage gaps or policy/capability
  deferrals (NONE harness-hard-blocked), catalogued per-provider →
  [`docs/runbooks/action-smoke-cli.md`](./runbooks/action-smoke-cli.md) (SMOKE-WRITE-33 checkpoint).
- **HERMES-AGENT-RETIRE-LEGACY-PLAN-CHAT (Phase 2, routes + client helpers) — deleted the orphaned chat HTTP surface + dead browser API — LOCAL/UNPUSHED (2026-06-21)** —
  Phase 2 = the UI-orphaned chat-only ROUTES + dead CLIENT helpers (services deferred to Phase 3). Grep-confirmed each
  candidate had no live consumer after Phase 1. **Removed routes (11 + 9 tests):** `/api/workflows/[id]/ai/{plan,complete,
  thread(+messages),diagnose(+explain,qa),repair/plan,repair/preview,repair/apply,repair/apply-readiness}` + route tests.
  **Removed client helpers:** whole files `lib/api/ai/thread.ts` + `lib/api/ai/diagnostics.ts` (fully orphaned), and
  `planWorkflow`+`completePlan`(+request/response types) from `lib/api/ai/plan.ts`; barrel drops thread/diagnostics re-exports;
  `ai.test.ts` trimmed to live `applyWorkflowPatch` tests. **KEPT (live):** `/ai/apply`+`applyWorkflowPatch`; governed
  `/api/accounts/[id]/ai/{workflow-guidance,workflow-repair}`; `BuilderGuidanceRail`/`WorkflowGuidancePanel`/
  `requestWorkflowGuidance`; `RunResultsRepairBlock`/`requestAccountWorkflowRepair`; `AiPreview`/`AiApply*`+`AiRepair*` types;
  deterministic repair suggester/validators; `services/ai-guidance/*`; scope guards; Hermes gateway. **DEFERRED to Phase 3:**
  server services `services/ai/planner` + `services/ai/diagnostics` + chat-only `services/ai/repair` fns (planWorkflowRepair,
  previewWorkflowRepair, applyRepairPatch, assessRepairApplyReadiness, deterministicRepairPreview) + capability runners + tests
  — UI-orphaned but NOT browser-reachable, and entangled with the LIVE events recorder (recordAiRouteEvents imports
  @/services/ai/planner) + live suggestWorkflowRepair (shares services/ai/repair/{repairStrategies,types}); need per-file
  surgery. NOTE: dead `AiPlan*` data types left in plan.ts (inert) pending Phase 3. Structural scan gained Phase-2 guards.
  Verified: tsc clean; 46 structure + lib/api/ai + repair/apply routes + rail + hermes-guidance green; reactAgent/ai-guidance +
  lib/api + workflows-routes 666 passed; lint:structure OK; eslint 0. Pre-existing UNRELATED failures (per slice, not fixed):
  run-detail-route + runs-route (supabase.from mock isolation), variable-picker-file-array. No behaviour/migration change.
  **Next: Phase 3** — delete the chat-only services + capability runners, moving the one type the live events recorder needs
  out of `services/ai/planner` first, then trimming `services/ai/repair` to the live suggester.
- **HERMES-AGENT-RETIRE-LEGACY-PLAN-CHAT (Phase 1, UI subtree) — deleted the unmounted legacy builder chat UI — LOCAL/UNPUSHED (2026-06-21)** —
  Marcus picked a PHASED approach (full sweep was ~80-120 entangled files). Phase 1 = the dead chat UI layer only.
  Grep-confirmed first: `BuilderAiPanel` has ZERO JSX mounts; the only LIVE importer of `features/workflow-builder/ai/*` is
  `RunResultsRepairBlock` (uses self-contained `AiBulletList`+`AiRequiredInputList`); no live code imports any chat-only `ai/*`
  helper. **Removed 97 files (37 source + 60 tests):** `BuilderAiPanel.tsx` + 14 `_BuilderAiPanel*`, chat hooks
  (`useBuilderAi`/`useBuilderAiActions`/`useBuilderDiagnosisActions`/`useChatFill`/`_builderAgentPersistence`), 17 chat-only
  `ai/*` helpers (composeFollowUpPrompt, deterministicCompletion, detectIntentCorrection, classifyComposerIntent,
  canExplainDiagnosis, firstMissingFieldNodeId, setupFindings, attentionFindings, chatFill*, shouldRouteChatFill,
  useChatFillTarget, useRepairFieldTarget, resolveRequiredInputControl, RequiredInputControl,
  RequiredInputOptionsSourceControl) + ~49 UI tests. **Kept (live):** `ai/AiBulletList`+`ai/AiRequiredInputList` (+ slimmed
  `ai/index.ts`), `BuilderGuidanceRail`, governed `/api/accounts/[id]/ai/workflow-repair`, `applyWorkflowPatch`/`/ai/apply`,
  deterministic repair services/validators/types. **Deferred to Phase 2:** now-UI-orphaned chat-only ROUTES
  (`/ai/{plan,complete,thread,diagnose*,repair/plan,repair/preview,repair/apply*}`) + their client helpers (planWorkflow,
  completePlan, thread/diagnose/repair-plan/preview) + chat-only services — all still COMPILE (dead, no UI consumer). Updated
  stale rail comments `BuilderAiPanel`→`BuilderGuidanceRail`; structural scan gained Phase-1 guards. Verified: tsc clean; 1644
  builder unit+integration passed (only pre-existing variable-picker-file-array failed) + 73 focused + 177 reactAgent/ai-guidance
  green; lint:structure OK; eslint 0; secretKeys scanner green. No behaviour change to rail/repair/apply; no migration. **Next:
  Phase 2** — delete the chat-only routes + client helpers + chat-only services + their tests, trimming `lib/api/ai` barrel
  (keep applyWorkflowPatch + AiRepair types + guidance + workflowRepair) and keeping `/ai/apply` + deterministic repair.
- **HERMES-AGENT-RETIRE-LEGACY-REPAIR-ROUTE — deleted the dead legacy run-repair route + client fn — LOCAL/UNPUSHED (2026-06-21)** —
  with no live consumer left after the rehome, removed the dead per-workflow legacy repair entry. Audit confirmed the only
  consumers of `requestWorkflowRepair` + the `…/runs/[runId]/ai/repair` route were their own tests (no UI/prod). **Deleted:**
  route `app/api/workflows/[id]/runs/[runId]/ai/repair/route.ts`; client fn `requestWorkflowRepair` (+ `RequestWorkflowRepairRequest`)
  from `lib/api/ai/runRepair.ts`; route test `ai-repair-route.test.ts`; the `requestWorkflowRepair` describe in
  `tests/unit/lib/api/ai.test.ts`. **Preserved (live):** deterministic `suggestWorkflowRepairForAI` + validators/preview/apply
  contracts; governed account route `POST /api/accounts/[id]/ai/workflow-repair`; explicit apply (`applyWorkflowPatch` →
  `/ai/apply`); `RunResultsRepairBlock`; and the `AiRepair*` CONTRACT TYPES in `runRepair.ts` (now TYPES-ONLY — still used by the
  governed client + UI, so the file stays). Barrel `lib/api/ai.ts` comment updated. Structural scan gained retirement guards
  (legacy route file gone, `requestWorkflowRepair` absent from client code, account route present, UI keeps explicit apply). NO
  behaviour change to the governed route / suggester / apply; no auto-save/activate/run; no model call. Verified: tsc clean; 83
  focused (structure+ai-client+account-route+RunResultsPanel) + reactAgent/ai-guidance/panels green; lint:structure OK; eslint 0.
  Pre-existing UNRELATED failures (confirmed identical on clean tree via stash): run-detail-route + runs-route tests
  (`supabase.from is not a function` mock-isolation). No migrations. **Next:** retire remaining chat-only legacy AI routes
  (`/ai/plan`, `/ai/complete`, `/ai/thread`, `/ai/diagnose*`, `/ai/repair/{plan,preview}`) once the BuilderAiPanel chat subtree
  is rehomed or dropped.
- **HERMES-AGENT-REHOME-RUN-RESULTS-REPAIR — governed account-scoped repair route; UI rehomed; determinism preserved — LOCAL/UNPUSHED (2026-06-21)** —
  moved the builder run-results repair "Ask" onto a governed, account-scoped route. **Audit reframed the slice:** the live
  run-results repair (`RunResultsRepairBlock`→`suggestWorkflowRepairForAI`) makes NO model call — it's fully deterministic
  (rule-based classification → safe WorkflowPatch → deterministic AI-5 preview → value-free result). Marcus chose
  **governance-only rehome** (not an LLM, which would regress a destructive-capable repair-apply flow). NEW route
  `POST /api/accounts/[id]/ai/workflow-repair` (`requireUserWithAccount` + strict {workflowId,runId} + workflow-belongs-to-account
  no-leak-404 + suggester's run→workflow ownership + persistent `recordAiRepairOutcome` audit) delegates to the SAME
  deterministic suggester and returns the identical value-free result. **No model/Hermes/gateway/OpenAI/Nous call** → no
  prompt/run-context sent anywhere, no token; AI-credit + HERMES_AGENT_ENABLED gates intentionally NOT applied (no model spend
  to gate; a future LLM augmentation must add them). NEW client `lib/api/ai/workflowRepair.ts` (`requestAccountWorkflowRepair`);
  `RunResultsRepairBlock` asks through it (accountId threaded WorkflowBuilder→RunResultsPanel→block; absent accountId → safe
  "unavailable" note). **Apply unchanged** — still the existing deterministic `applyWorkflowPatch`/`…/ai/apply` with explicit
  confirmation; no auto-apply/save/activate/run/separate-workflow. Legacy `…/runs/[runId]/ai/repair` KEPT (backend-tested; no
  live UI consumer now). Tests: NEW route test (auth/account/workflow/run ownership, .strict body, NOT_FOUND→404, value-free
  passthrough, scoped audit, sanitized 500); RunResultsPanel.test rehomed to the new helper + unavailable-note + no-auto-apply
  cases; structural scan asserts UI uses governed helper (not legacy ask) + route is model-free + never applies. Verified: tsc
  clean; 70 focused + 240 hermes/rail/ai-client/reactAgent/ai-guidance green; lint:structure OK; eslint 0. No migrations.
  **Next:** retire legacy `…/runs/[runId]/ai/repair` once confirmed unused, or add an OPTIONAL gated LLM repair-guidance prose
  layer (model never produces the actionable patch) on top of the deterministic suggester.
- **HERMES-AGENT-LEGACY-AI-ROUTE-AUDIT — audited the deprecated builder AI plan path; one safe deletion + deprecation markers — LOCAL/UNPUSHED (2026-06-21)** —
  audit of the old `/api/workflows/[id]/ai/plan` path after the rail moved to Hermes. **Findings:** (1) `/ai/plan` +
  `planWorkflow` client have NO user-facing consumer left — only the unmounted `BuilderAiPanel` chat; KEPT (backend-tested +
  rehome candidate), marked DEPRECATED in the route + `lib/api/ai/plan.ts` headers. (2) **Correction to the prior slice:**
  diagnose/repair are NOT fully gone — `RunResultsRepairBlock` is STILL MOUNTED (RunResultsPanel → builder right drawer) and
  calls `requestWorkflowRepair` (`/ai/repair`) + `applyWorkflowPatch` (`/ai/apply`); those routes + `lib/api/ai` apply/repair
  + the shared `features/workflow-builder/ai/*` helpers are LIVE — do NOT delete. Only the CHAT-driven diagnose/repair/
  chat-fill (inside unmounted `BuilderAiPanel`) is dead-in-prod. (3) `BuilderAiPanel` has ZERO production JSX mounts;
  `useBuilderAiActions()` is called only by it. **Removed now (small/safe):** superseded floating `BuilderGuidanceEntry.tsx`
  + its test (dead, zero consumers, replaced by `BuilderGuidanceRail`). **Kept (deprecated/rehome):** the whole BuilderAiPanel
  chat subtree (`useBuilderAi`/`useBuilderAiActions`/`_BuilderAiPanel*`/`useChatFill`/`useBuilderDiagnosisActions`) +
  `/ai/{plan,complete,thread}` + chat-only `/ai/diagnose*` `/ai/repair/{plan,preview}` + ~35 tests; marked deprecated in
  `BuilderAiPanel.tsx`+`useBuilderAi.ts`. **Safety:** structural scan gained "legacy plan path not user-mounted" (no
  composition root renders `<BuilderAiPanel>`, floating-entry file gone, `/ai/plan` route file still present to guard the
  keep-decision). NO route/code behaviour change; docs + deprecation comments + ONE deletion only. Verified: tsc clean; 86
  focused + 941 panels/hooks/route/reactAgent/ai-guidance green; lint:structure OK; eslint 0. No migrations. **Next:** retire
  `/ai/plan` + the BuilderAiPanel subtree once the chat UX is rehomed on Hermes (or decide it's not needed), keeping the live
  run-results repair path intact.
- **HERMES-AGENT-REPLACE-BUILDER-AI-PLAN — builder left chat rail is now the Hermes guidance surface — LOCAL/UNPUSHED (2026-06-21)** —
  the visible builder LEFT RAIL was switched off the deprecated plan endpoint (`POST /api/workflows/[id]/ai/plan` via
  `planWorkflow`, currently 503) onto the verified Hermes account route (`POST /api/accounts/[id]/ai/workflow-guidance`).
  NEW thin `features/workflow-builder/panels/BuilderGuidanceRail.tsx` renders the dashboard `WorkflowGuidancePanel`
  verbatim in the rail (reuses `requestWorkflowGuidance` helper + the same Show-on-canvas → preview → Apply-preview path
  `graphSlice.applyAdditivePatch`); ZERO new network logic. WorkflowBuilder now mounts `<BuilderGuidanceRail>` in the rail
  instead of `<BuilderAiPanel>`, and the separate floating "Build with me" pill (`BuilderGuidanceEntry`) is no longer
  rendered → ONE builder AI entry. Rail header label "connected · claude" → "connected · Hermes" (no provider/model leak).
  Gated on `isHermesAgentEnabled()` + resolved `accountId` (else safe "unavailable" note; no dead box / no disabled-route
  call). **Did NOT delete** old code (`BuilderAiPanel`/`useBuilderAi`/`planWorkflow` + the `/ai/plan` route) — kept for their
  own tests + other consumers; only the visible rail is disconnected. **Consequence:** the old rail's diagnose/repair/
  chat-fill features (also on deprecated AI endpoints) are no longer surfaced in the builder; their code+tests remain.
  **HARD: no auto-save / apply-then-save / activation / run / separate-workflow; no direct OpenAI/Nous/Render/private-Hermes
  browser calls; no `CHAINREACT_AI_GATEWAY_TOKEN` exposure.** Tests: NEW `BuilderGuidanceRail.test` (gating + submit→account
  route + show-on-canvas + safe-error) + structural scan `tests/structure/builder-ai-rail-no-old-endpoint.test.ts` (rail
  source has no `planWorkflow`/`/ai/plan`/token; WorkflowBuilder no longer mounts BuilderAiPanel/floating entry; no "claude"
  label); updated WorkflowBuilder.test rail-mount (testid `builder-ai-panel`→`builder-guidance-rail`), rewrote
  builder-guidance-gating to the rail, dropped the floating-toggle step in apply-preview + preview-overlay integration
  tests; the 35 `BuilderAiPanel.*` unit tests + `BuilderGuidanceEntry.test` still green (component kept). Verified: tsc clean;
  91 focused + 557 builder-panels/hermes-integration + 177 reactAgent/ai-guidance green; lint:structure OK; eslint 0 on
  touched files. No migrations. **Next:** optionally retire the deprecated `/ai/plan` route + old panel once nothing depends
  on them, or re-home diagnose/repair onto the Hermes path.
- **Action-smoke harness — live-verification arc substantially COMPLETE — LOCAL/UNPUSHED (2026-06-20)** —
  CLI + Jest harness (`npm run smoke:actions[:run[:workflow[:live]]]`) drives real V2 internals; per-provider
  live via `SMOKE_PROVIDER`, names-only missing-env summaries, double-gated live mode (read fixtures only — no
  write/destructive runs). **Live-verified reads:** Slack (read+write), Gmail, Google Drive, Microsoft Outlook,
  Airtable, Notion (incl. empty-query "search all"), Google Sheets, Microsoft Teams. **Microsoft Excel still
  BLOCKED** — the connected Microsoft account has no accessible OneDrive/SharePoint drive (`get_workbooks` →
  Graph "Operation not supported"); documented as an account/resource requirement, not a code bug. **Fixes:**
  `e7a0db5f0` — a required field declaring a meta `defaultValue` is no longer a readiness gap (fixes Sheets
  `read_rows` `majorDimension` + the whole required-with-default class for non-builder configs; Notion `search`
  empty query consistently valid; Excel drive requirement documented); `4188b49ee` — refreshed stale
  Gmail(15)/Outlook(11) registry meta-count tests without weakening. Selector ids are discovered into gitignored
  `.env.local` only — no secrets/selectors/account-or-run/workflow-ids/raw provider payloads stored. Nothing
  pushed/deployed/db:pushed → [`docs/runbooks/action-smoke-cli.md`](./runbooks/action-smoke-cli.md).
- **BUILDER-HEADER-ACTION-BAR-POLISH — header/action-bar layout cleanup (visual only) — LOCAL/UNPUSHED (2026-06-21)** —
  pure CSS/layout polish of the builder header; ZERO behavior change (same handlers/testids/validation derivation, no
  route/persistence/AI/backend change). Root causes fixed: action controls had mismatched heights (validation pill h-[26px],
  Templates/Save/Test h-7, Run/Activate ~h-8) and the `lifecycle-blocked-hint` ("N setup issues to fix before activate") sat
  in-flow inside a flex-col, pushing the go-live button off the shared baseline. Changes: (1) all primary actions normalized
  to h-8/rounded-md/text-[12px] (Templates, validation pill, Test, Run Manually, Save, Activate/Pause/Resume/Publish); (2)
  HeaderRight grouped into utility | workspace(Templates·Issues) | run(Test·Run·Save) | lifecycle(Activate) zones with
  hairline `HeaderDivider`s; (3) the validation pill is now an inline h-8 control with a severity status-dot (was a
  rounded-full red badge that floated + over-emphasized errors) — text/data-*/aria UNCHANGED so the `^N issue(s)$` contract
  holds; (4) secondary status lines (lifecycle-blocked-hint, run private-credential copy, lifecycle error) lifted to
  absolute `top-full` panels so they hang BELOW the row instead of shifting buttons — still rendered/visible, same
  testids/role/copy/data-issue-count; (5) center meta strip truncates the (uuid) ID + collapses first (`hidden lg:flex`,
  max-w), and the all-disabled undo/redo/history utility cluster hides below `xl` so essentials never break. Test-locked
  copy kept verbatim: validation pill stays "N issue(s)" (BuilderHeader.test ^1 issue$/^2 issues$) and the blocked-hint
  stays "N setup issue(s) to fix before {verb}" (LifecycleActions.test) — true badge+text consolidation was NOT done because
  those contracts lock both; instead they were made visually coherent + non-competing. Verified: tsc clean; layout+panels
  unit 632 green incl. BuilderHeader 30 / LifecycleActions / HeaderRunControls; 5 header-rendering integration suites 64
  green; lint:structure OK; eslint 0 on touched files. No migrations. Files: layout/BuilderHeader.tsx,
  layout/_BuilderHeaderPills.tsx, layout/HeaderRunControls.tsx, panels/LifecycleActions.tsx. **Caveat:** right zone does not
  wrap (overflows rather than breaking) at extreme narrow widths after the meta strip + utility cluster have collapsed.
- **HERMES-AGENT-APPLY-CONFIG-HINTS — safe required-field hints on newly-applied nodes — LOCAL/UNPUSHED (2026-06-21)** —
  after an explicit Apply preview, the newly-added nodes surface what still needs configuring, REUSING the existing
  metadata-driven validation (no parallel validator). NEW pure `features/workflow-builder/utils/appliedConfigHints.ts`
  (`buildAppliedConfigHints`) maps just-applied node ids → `{label, missingFieldLabels, hasMetadata}` via the SAME
  `requiredFieldsByType` registry + `missingRequiredFields` rule that drive the canvas "Needs setup" chip — NOT from Hermes
  prose / plan.requiredInputs. NEW `canvas/BuilderApplyNotice.tsx` renders the placement headline (copy updated to "review
  required fields before **saving or activating**") + a per-incomplete-node hint list ("Needs configuration: Channel, Message"
  — field LABELS only); unknown-metadata node → generic "Review this step's required fields." Newly-added cards get a
  short-lived "Added from preview" badge (threaded `appliedNodeIds` → WorkflowCanvas → adapters → WorkflowNodeCard). Hints +
  badge recompute from the LIVE pending graph (clear as fields fill / node deleted) and clear on dismiss / workflow switch /
  new preview; shimmer overlay still clears on apply. **HARD: hints are field NAMES only — never values/secrets/OAuth/refresh
  tokens/provider-account-ids/credential-ids; nothing inferred; no apply-then-save/auto-save/activate/run/separate-workflow/
  delete-node/replace-trigger/config-overwrite/credential-insertion; no OpenAI/Nous/direct-private-Hermes; no gateway-token
  browser exposure.** Verified: tsc clean; focused green (appliedConfigHints helper 7, additivePatchPlacement 14, builder
  apply-preview integration 11 incl. metadata-hint/badge/generic-fallback/no-save; overlay+adapters+node-card 39;
  reactAgent+ai-guidance 177; node-card/canvas/graphSlice name-filter 181); lint:structure OK; eslint 0 on touched files. No
  migrations. Docs: topology §14 + table row, this entry. **Next: wire live builder verification, or an optional explicit
  apply-then-review affordance (still no auto-save).**
- **HERMES-AGENT-APPLY-INSERT-BETWEEN — true insert-between (one safe edge split) — LOCAL/UNPUSHED (2026-06-21)** —
  added insertion BETWEEN two existing nodes for explicit Apply preview. Extracted the placement logic into a PURE helper
  `features/workflow-builder/utils/additivePatchPlacement.ts` (`computeAdditivePatchPlacement`) — graphSlice.applyAdditivePatch
  now resolves trigger-skip + ids, then delegates. Rules: blank→origin; selected/active node with exactly ONE outgoing
  UNLABELED edge A→B → `inserted_between` (remove that ONE edge, add A→firstNew + lastNew→B + internal chain edges); selected
  with zero/multiple/labeled outgoing → `appended`; no selection + sole tail → `appended`; ambiguous/no-anchor/trigger-first →
  `side_chain`. Guards: never split a labeled/router edge (no branch rewrite), a self-loop, or an edge to a missing node →
  fall back to appended; new-id endpoints mean the two replacement edges can never duplicate/invalidate. Outcome `placement`
  gains "inserted_between". WorkflowBuilder.handleApplyPreview picks notice by placement: inserted_between→"Preview inserted
  into draft — review required fields before activating."; appended/blank→"Preview applied to draft…"; side_chain→"Preview
  added as a separate draft chain…"; no-safe-op (patch null / nothing_added)→"ChainReact could not safely apply this preview."
  **HARD: only ONE edge ever removed (the split edge); all other edges + every node + its config/position untouched; no
  delete-node/replace-trigger/multi-branch-rewrite/overwrite-config; no auto-apply/save/activate/run; no separate workflow;
  empty config (nothing inferred); no OpenAI/Nous/direct gateway; no token.** **Limits:** one-edge split only; single-outgoing-
  unlabeled selected node only; no multi-branch rewrite; no auto-save. graphSlice.ts 573→548 lines (extraction; still pre-
  existing max-lines warning). Verified: tsc clean, focused green (pure placement helper 14 incl. all branches + no-branch-
  rewrite/self-loop/missing-child guards; graphSlice insert-between + multi-outgoing-append; builder integration insert-between
  notice + split edges, append, side-chain fallback; overlay/panel/reactAgent/ai-guidance/credential/memory-scope green),
  lint:structure OK, eslint 0 errors. No migrations. **Next: HERMES-AGENT-APPLY-CONFIG-HINTS** (required-field key hints on
  inserted nodes; optional apply-then-save).
- **HERMES-AGENT-APPLY-IN-PLACE — additive apply lands in-place, not always a side chain — LOCAL/UNPUSHED (2026-06-21)** —
  improved `graphSlice.applyAdditivePatch(patch, {appendAfterNodeId?})`: when the first added node is an ACTION and a safe
  anchor exists, the chain appends after it with ONE new edge (`placement:"appended"`). Anchor priority: the selected/active
  node (`configSlice.activeNodeId`, read fresh by `WorkflowBuilder.handleApplyPreview`) → else the SOLE chain tail
  (`findChainTailId`). Blank graph → origin (`placement:"blank"`). Ambiguous multi-tail / no anchor / trigger-first →
  detached side chain (`placement:"side_chain"`) with notice "Preview added as a separate draft chain because ChainReact
  could not safely determine where to insert it."; appended/blank → "Preview applied to draft — review required fields before
  activating." New nodes positioned via `computeNonOverlappingPosition` (stacked below the anchor); existing node config +
  positions NEVER moved. Edges ADD-ONLY: anchor edge endpoints always distinct/new (can't be invalid); existing edges never
  removed/rewritten/split. Outcome gained `placement`. **HARD (unchanged): no auto-apply; no full replacement; no separate
  workflow; no activate/run; no save/update API; no delete/replace/update-config/replace-trigger/branch-rewrite; empty config
  (no inferred secrets); no OpenAI/Nous/direct gateway; no token.** **Limits:** additive only; NO edge splitting / true
  mid-chain insertion yet; ambiguous graphs fall back to side chain. Verified: tsc clean, focused green (graphSlice
  applyAdditivePatch 96 incl. sole-tail/selected/trigger-first/multi-tail-fallback/config-untouched + placement; builder
  apply integration 6 incl. in-place edge + multi-tail fallback notice; overlay/panel green; reactAgent+ai-guidance+
  integrations 183 pass; memory-scope + credential-availability green), lint:structure OK, eslint 0 errors (1 pre-existing
  max-lines warning on graphSlice.ts). No migrations. **Next: HERMES-AGENT-APPLY-INSERT-BETWEEN** (true insertion between two
  nodes — first edge-rewrite; still explicit, no delete/save).
- **HERMES-AGENT-CREDENTIAL-AVAILABILITY-CONTEXT — live sanitized provider availability into the guard — LOCAL/UNPUSHED (2026-06-21)** —
  wired a LIVE credential-availability source into the scope guard so Hermes knows which providers are usable, safely. NEW
  `services/integrations/guidanceCredentialAvailability.ts` (`getGuidanceCredentialAvailability({accountId,userId})`): reads
  `integrations.listActiveByAccount` (service-role; route already authorized the member) and reduces rows to provider KEYS +
  registry display names — account-class providers → `accountSharedProviders`; personal-class connected by the CURRENT user →
  `currentUserPrivateProviders`; another member's personal connection EXCLUDED. DTO = `{accountSharedProviders[], currentUser
  PrivateProviders[], unavailableOrPrivateNotice?}` with `{providerKey, displayName?, status:"available"}`. Uses REGISTRY
  display name (getProvider().displayName), never the row's displayName (could be the account email). Degrades to EMPTY on read
  error. Placed in services/integrations (NOT services/ai-guidance) to respect the guidance-no-repositories boundary test
  (guidanceBoundaries.test.ts). Route (`/api/accounts/[id]/ai/workflow-guidance`) calls it after the credit gate and passes
  `contextInputs.sharedCredentialProviders`/`ownConnectionProviders` (KEYS) into the runner → buildSafeGuidanceContext (the
  guard re-sanitizes: shared filtered to account-class, deduped). Prompt adds "Only suggest using connections listed as
  available in this request, or ask the user to connect or share the provider first." **HARD: no token/refresh/secret/provider-
  account-id/integration-id/owner-id/email/name/account-id/raw-row; no other member's private connection; no workflow/apply
  change; no UI change; no migration; no OpenAI/Nous/direct gateway; degrades safe (never blocks guidance).** Conservative
  limit: explicitly-shared personal connections (CS slices) not yet summarized as account-shared (future widening). Verified:
  tsc clean, focused green (credential-availability service 6 incl. exclude-other-member/no-leak/safe-degrade; route wiring 2 +
  degrade; prompt instruction; guidanceBoundaries green after moving file out of ai-guidance; reactAgent+ai-guidance+integrations
  206 pass; existing memory-scope/guidance/preview/apply green), lint:structure OK, eslint 0. **Next: HERMES-AGENT-APPLY-IN-PLACE**
  (smarter additive insertion) or widening account-shared to include explicitly-shared personal connections.
- **HERMES-AGENT-MEMORY-SCOPE-GUARD — team-safe AI context scoping (policy + enforcement + tests) — LOCAL/UNPUSHED (2026-06-21)** —
  guards what request-scoped context Hermes guidance receives so a team/shared account never blends one member's PRIVATE
  context into another's. NEW `services/ai-guidance/guidanceContextPolicy.ts` (`buildSafeGuidanceContext`, pure/deterministic):
  scopes = user|account|workflow|global; output carries account type/role, account-SHARED connection availability (filters
  out personal providers defensively via credentialSharing), caller's OWN connection availability (adds `user` scope), and a
  generic `FOREIGN_PRIVATE_CONNECTION_NOTICE` when a team workflow by ANOTHER member uses a personal-provider node — never the
  owner identity/credential. EXCLUDES (unrepresentable): other members' memory/prefs/connections/credentials/prompts, tokens/
  secrets, raw emails/files/rows, service-role, full audit, and the caller's own userId/account id/email/name (identity stays
  server-side for auth+audit). `buildGatewayGuidancePrompt` gains `context` + an always-on scope instruction ("Use only the
  context included in this request. Do not infer or claim access to other team members' private data…"). Threaded:
  gateway client `requestHermesAgentGuidanceNormalized({context})` → runner `workflowGuidanceIntake` builds context from new
  `contextInputs` (account type/role, workflow createdByUserId, optional shared/own connection summaries) → route gathers
  account type via `accountsRepo.getById` + `record.createdByUserId` (creator id used ONLY for own-vs-foreign compare, never
  sent). **MEMORY POLICY: NO durable AI memory store; guidance is request-scoped; guidance/session/audit tables are NOT a
  memory source; audit stays aggregate-safe (unchanged).** **HARD: no new memory system, no Honcho, no migration, no workflow/
  apply change, no UI change; client never supplies account context; team membership alone never authorizes another member's
  private connection; cross-account workflowId still no-leak 404.** Credential-availability summaries not yet wired from a live
  source (guard omits them; future slice). Verified: tsc clean, focused green (policy 14 + prompt 4 + runner foreign-notice/
  no-id-leak + route contextInputs 2; reactAgent+ai-guidance 177 pass; existing guidance/preview/apply suites green),
  lint:structure OK, eslint 0. **Next: HERMES-AGENT-APPLY-IN-PLACE** (smarter additive insertion vs side chain) or wiring live
  credential-availability summaries into the guard.
- **HERMES-AGENT-APPLY-PREVIEW-PATCH — first mutation path: explicit additive apply to local draft — LOCAL/UNPUSHED (2026-06-21)** —
  the builder overlay's "Apply preview" turns a validated WorkflowPlan into an additive local-draft edit. NEW
  `services/ai-guidance/preview/planToBuilderPatch.ts` (deterministic, pure): plan trigger/action steps → `BuilderPreviewPatch`
  (`kind:"additive"`, patch-local refs `p0/p1`, linear edges, labels only — NO config/ids); skips `logic` steps (no V2 graph
  kind); null when no trigger/action steps. NEW patch types in `contracts/workflowPlanPreview.ts` (`BuilderPreviewPatch`/
  `BuilderPatchNode`/`BuilderPatchEdge`). NEW `graphSlice.applyAdditivePatch(patch)` (graphSlice ONLY imports the contract type,
  not services): mints REAL node/edge ids, appends nodes with EMPTY config (nothing inferred → required fields show "needs
  setup"), linear edges, marks dirty via the normal mechanism; SKIPS a proposed trigger when one already exists
  (`skippedTrigger`, no replace-trigger); places new nodes as a SIDE CHAIN to the right of existing (blank graph → origin);
  never deletes/replaces/updates existing nodes/edges/config; returns `{ok:false}` when nothing additive remains. Overlay gains
  optional `onApply` → "Apply preview" button (builder-only; absent without onApply). Panel `onPreviewToCanvas` now passes
  `{plan, preview}` (validated plan = apply source of truth) up through `BuilderGuidanceEntry.onShowPreview` →
  `WorkflowBuilder` `handleApplyPreview` (builds patch from plan, applies via graph slice, clears overlay, shows transient
  `builder-apply-notice` "Preview applied to draft — review required fields before activating."). **HARD: no auto-apply; no full
  replacement; no separate workflow; no activate/run; no save/update API; no delete/replace/update-config/replace-trigger/branch
  ops; empty config (no inferred secrets/config); browser calls only the guidance route; no OpenAI/Nous/Render/private-Hermes;
  no token.** **Limitations:** additive only; existing-workflow insertion is a SIDE CHAIN (exact in-place insertion = next slice);
  no automatic save (user saves via existing flow). Verified: tsc clean, focused green (patch converter 6 + graphSlice
  applyAdditivePatch 5 + overlay apply 2 + builder apply integration 4 [blank adds nodes/edges+empty-config+dirty+no-save;
  existing keeps all+trigger-skipped; overlay clears+notice; only guidance helper called] + panel show-on-canvas {plan,preview};
  reactAgent+ai-guidance + full builder suite green except 1 PRE-EXISTING flaky `variable-picker-file-array` test [verified fails
  on base via stash]), lint:structure OK (moved the 3 Hermes builder integration tests into
  `tests/integration/features/workflow-builder/hermes-guidance/` to stay under the 50-file leaf cap), eslint 0 errors (1
  pre-existing `max-lines` warning on graphSlice.ts). Live smoke NOT run (pure client/local-state). Docs: topology shipped-table/
  path/next-slices, runbook UI apply bullet. **Next: HERMES-AGENT-APPLY-IN-PLACE** (smarter additive insertion relative to
  existing nodes instead of side chain; still explicit, still no delete/replace, still no auto-save).
- **HERMES-AGENT-BUILDER-PREVIEW-OVERLAY — non-applied ghost preview on the canvas — LOCAL/UNPUSHED (2026-06-21)** — a
  `DraftPreview` can now render as a SEPARATE visual layer over the builder canvas. NEW
  `features/workflow-builder/canvas/BuilderPreviewOverlay.tsx` (pure presentational; imports only the DraftPreview type):
  shimmered/ghost "Suggested" nodes (`animate-pulse` + dashed border, class `builder-preview-node-ghost`, `data-preview`)
  joined by dashed `builder-preview-edge-dashed` edges, a "Suggested" badge, the `preview.notice` ("Preview only — your
  workflow has not changed."), and a "Discard preview" control; container `pointer-events-none` so canvas stays
  interactive. State lives in `WorkflowBuilder` as plain `useState<DraftPreview|null>` (NOT the graph store) — cleared on
  workflow-id switch; rendered as an absolute overlay in the center workspace. `WorkflowGuidancePanel` gains optional
  `onPreviewToCanvas?(preview)` → renders a builder-only "Show on canvas" button in the preview section (absent on
  dashboard = no canvas); `BuilderGuidanceEntry` threads `onShowPreview` → panel; `WorkflowBuilder` passes
  `onShowPreview={setPreviewOverlay}` + renders `<BuilderPreviewOverlay onDiscard={() => setPreviewOverlay(null)}>`.
  **HARD: visual/ephemeral only — never merges into the real React Flow graph/pendingNodes, no draftDefinition write, no
  dirty, no autosave, no save/update API, no node insertion into the real draft; Discard clears state only (no rollback —
  nothing mutated); NO Apply/Create/Use-this/Add-nodes/Run; browser still calls only the ChainReact route; no
  OpenAI/Nous/Render/private-Hermes; no token.** No route/helper/prompt change (previewDraft already shipped). Verified:
  tsc clean, focused green (overlay unit 5 + integration 4 incl. graph-byte-unchanged/not-dirty/no-updateWorkflow/discard
  + panel show-on-canvas 2 + static safety scan extended to overlay; reactAgent+ai-guidance + full builder suite 2165
  pass), lint:structure OK, eslint 0. Live smoke NOT run (pure client UI). Docs: topology shipped-table/path/next-slices,
  runbook UI overlay bullet. **Next: HERMES-AGENT-PLAN-APPLY** (first mutation path — explicit user Create/Use-this hands
  validated plan to deterministic builder; own approval-gated slice; AI still never auto-applies).
- **HERMES-AGENT-DRAFT-PREVIEW — validated plan → ephemeral non-applied preview — LOCAL/UNPUSHED (2026-06-21)** — a
  capability-validated `WorkflowPlan` can now be rendered as a review-only DRAFT PREVIEW. NEW
  `contracts/workflowPlanPreview.ts` (`DraftPreview`/`DraftPreviewNode`/`DraftPreviewEdge`, `DRAFT_PREVIEW_NOTICE`,
  `WORKFLOW_PLAN_PREVIEW_VERSION`) — a type DISTINCT from `WorkflowDefinition`/`draftDefinition` so it can't be saved
  accidentally; preview-only ids, labels only, `notApplied:true` on preview+nodes+edges. NEW
  `services/ai-guidance/preview/planToDraftPreview.ts` (deterministic, pure, model-free, imports no repo/DB/builder-store):
  plan steps → preview nodes (previewId `preview-step-N`, role, provider/type labels, `${provider}:${type}` label,
  purpose), ordered steps → linear `preview-edge-N` edges, `requiredInputs` → `missingInputs` + readable `warnings` (never
  config/values/credentials), title/summary carried, notice = "Preview only — your workflow has not changed.", empty/null
  plan → null. Route (`app/api/accounts/[id]/ai/workflow-guidance/route.ts`) derives `previewDraft = result.workflowPlan ?
  planToDraftPreview(result.workflowPlan) : null` and returns it (null whenever no validated plan → never from unvalidated
  plan). Helper `lib/api/ai/guidance.ts` types `previewDraft: DraftPreview | null`. UI (`WorkflowGuidancePanel.tsx`, reused
  by dashboard+builder) renders a PREVIEW-ONLY "Draft preview" section (numbered nodes role·label·purpose + "Still needs:"
  for missing keys + "Flow: a → b → c" from edges) under preview.notice; the text "Suggested plan" section is suppressed
  when a preview exists (no dup). **HARD: no workflow create/mutate/apply/run; no node insertion into the real canvas; no
  draftDefinition persistence; no save/update API; NO Apply/Create/Use-this/Add-nodes/Run control; preview is
  ephemeral/in-memory; no builder-store mutation; no direct OpenAI/Nous/Render/private-Hermes browser calls; no token in
  browser.** Verified: tsc clean, 160 focused (preview 9 + contract + UI 3 new incl. preview-supersedes-plan + route 2 new
  incl. preview-null-when-no-plan + builder/dashboard green), reactAgent+ai-guidance 156 pass, lint:structure OK, eslint 0.
  Live smoke NOT run (no env; not needed — pure transform). Docs: runbook preview-only contract + UI, topology shipped-
  table/path/next-slices. **Next: HERMES-AGENT-PLAN-APPLY** (first mutation path — explicit user "Create/Use this" hands
  validated plan to the deterministic builder; own approval-gated slice; AI still never auto-applies).
- **HERMES-AGENT-PLAN-EXTRACTION — advisory validated plan only — LOCAL/UNPUSHED (2026-06-21)** — Hermes guidance can now
  surface a structured `WorkflowPlan`, review-only. NEW `services/ai-guidance/gateway/extractPlanFromText.ts`
  (deterministic, model-free, never throws): pulls the FIRST shape-valid plan from a fenced ```json block (Zod shape
  schema; provider/type are claims), falls back to a bare JSON-only reply, tolerates prose (null), skips malformed/
  non-plan/multiple blocks safely, synthesizes missing refs, forces `notApplied:true`. `normalizeGatewayResponse`
  (gatewayResponseContract.ts) gates the candidate through existing `validateWorkflowPlan` (every `provider:type` must
  exist in the discovery registry): valid → `workflowPlan` set + raw block stripped from `guidanceText`; invalid → null
  + `warnings:["Suggested plan could not be validated."]` + guidance kept; none → null. Envelope-SIBLING plan-object
  path kept STRICT (invalid → INVALID_RESPONSE) for back-compat; only the in-text fenced path degrades gracefully.
  Prompt builder (`buildGatewayGuidancePrompt.ts`) adds RESPONSE_FORMAT_INSTRUCTIONS: normal-language guidance + optional
  single fenced json plan from catalog keys only, omit when thin, never claim it created/changed/saved/ran anything. UI
  (`WorkflowGuidancePanel.tsx`, reused by dashboard + builder) renders a REVIEW-ONLY "Suggested plan" section ("Review
  only — this has not changed your workflow.") with role · provider:type · purpose per step — NO create/apply/add/run
  control. Client helper `lib/api/ai/guidance.ts` now types `workflowPlan: WorkflowPlan | null`. Route unchanged (already
  passed workflowPlan+warnings through). **HARD: no workflow create/mutate/apply/run; no node insertion; no draft
  creation; no draftDefinition persistence; no preview graph yet; no direct OpenAI/Nous/Render/private-Hermes browser
  calls; no token in browser.** Verified: tsc clean, 171 focused (extractor 16 new + contract 6 new + UI 2 new + route 1
  new + builder/dashboard green), reactAgent+ai-guidance 147 pass, lint:structure OK, eslint 0. Live smoke NOT run
  (prompt changed but env not configured locally; optional per slice). Docs: runbook plan-extraction table + UI section,
  topology shipped-table/path/next-slices. **Next: HERMES-AGENT-DRAFT-PREVIEW** (validated plan → ephemeral non-applied
  preview graph; still no save/mutation; explicit user apply is a later slice).
- **HERMES-AGENT-GUIDANCE-UI-BUILDER — second "Build with me" entry inside the builder — LOCAL/UNPUSHED (2026-06-21)** —
  advisory guidance now reachable from the workflow builder. `features/workflow-builder/panels/BuilderGuidanceEntry.tsx`
  is a thin wrapper that reuses the SAME `WorkflowGuidancePanel` verbatim (no new request logic): a collapsed floating
  pill (bottom-left of the canvas, `absolute` overlay, starts closed) that on toggle reveals the panel, passing the
  in-context `workflowId` + the workflow's `accountId`. Mounted by `WorkflowBuilder.tsx` (new optional `accountId` +
  `guidanceEnabled` props; entry renders only when BOTH present) and gated in `app/workflows/[id]/page.tsx` via
  `isHermesAgentEnabled()` (default OFF → no entry) with `accountId={record.accountId}` (server-resolved, never
  client-supplied). The route/helper already supported `workflowId`; the route verifies the workflow belongs to the
  caller's account (no-leak 404) and passes its sanitized draft as optional context. **ADVISORY ONLY: no workflow
  create/mutate/apply/run, no plan extraction, no automatic node insertion; browser calls ONLY the ChainReact route —
  never gateway/vendor/Nous/private-Hermes, never a token (static-scan extended to the new file).** Verified: tsc clean,
  focused suites green (5 new builder-entry behavior tests + 4 WorkflowBuilder gating tests + extended static safety scan;
  dashboard panel/route/reactAgent/ai-guidance all still pass), lint:structure OK, eslint 0. Right drawer untouched (AI
  stays out per port-plan §4); left React Agent rail untouched. Docs: topology builder UI surface added. Next:
  HERMES-AGENT-PLAN-EXTRACTION.
- **HERMES-AGENT-GUIDANCE-UI — first user-facing "Build with me" panel — LOCAL/UNPUSHED (2026-06-21)** — advisory
  guidance UI on the workflows dashboard. `features/workflows/WorkflowGuidancePanel.tsx` (textarea + submit + loading
  + safe error + renders `guidanceText` under "Guidance") mounted in `app/workflows/page.tsx`, **server-gated on
  `isHermesAgentEnabled()`** (default OFF → panel not rendered, no dead box); `accountId` = page's resolved active
  account (prop, never client-supplied). Client helper `lib/api/ai/guidance.ts` `requestWorkflowGuidance({accountId,
  goalText, workflowId?})` → `postStructured` → `POST /api/accounts/[id]/ai/workflow-guidance` (barreled via
  lib/api/ai.ts). Browser calls ONLY the ChainReact route — never gateway/vendor/Nous/private-Hermes, never a token
  (static-scan test); component makes no direct fetch. Failures → safe "AI workflow guidance is temporarily
  unavailable." (credits denial shows its own safe msg); never shows internal error/envelope/usage. **ADVISORY ONLY:
  no workflow create/mutate/apply/run; no plan extraction (workflowPlan opaque, not rendered).** Verified: tsc clean,
  352 tests pass (9 new UI: render/disabled-empty/success/failure/loading/workflowId-forward/no-direct-call + route +
  reactAgent + ai-guidance green), lint:structure OK, eslint 0. Docs: runbook UI section + topology UI→route→capability
  path. Next: HERMES-AGENT-PLAN-EXTRACTION; optional builder-rail entry passing in-context workflowId.
- **HERMES-AGENT-CAPABILITY-ROUTE — gated server route for workflow guidance — LOCAL/UNPUSHED (2026-06-21)** — added
  `POST /api/accounts/[id]/ai/workflow-guidance` ([route.ts](./../app/api/accounts/[id]/ai/workflow-guidance/route.ts)).
  Gate order: `requireUserWithAccount(id)` (auth + account membership + freeze; accountId from URL param NEVER body,
  `.strict()` body rejects client accountId) → strict `{goalText, workflowId?}` → optional workflow ownership (must
  belong to THIS account → else no-leak 404; draft passed as safe context) → Hermes availability
  (HERMES_AGENT_ENABLED + config) BEFORE charge → `aiCreditGate({feature:"workflow_guidance", fast})` → capability
  runner via `runAuthorizedCapability` with the PERSISTENT `reactAgentAuditRecorder` injected. **Billing gap CLOSED:**
  added `workflow_guidance` to `core/billing/aiCreditPolicy.ts` FEATURE_BASE_CREDITS (base 1, same class as qa) and
  set the capability registry `creditFeature: "workflow_guidance"` (was null; lockstep test updated). **No
  `ai_cost_events` write → NO migration** (ChainReact makes no direct model call; the agent does — usage reconciliation
  deferred). Response = normalized advisory ONLY (`guidanceText/source/workflowPlan/warnings?`) — never raw envelope/
  usage/prompt/token/ids; provider failures → 503 GUIDANCE_UNAVAILABLE. **NO workflow mutation; NO UI; NO direct
  OpenAI/Nous/private-Hermes (route calls the runner, not the gateway client — static-scan test).** Verified: tsc clean,
  170 tests pass (16 new route tests + updated capability/lockstep; qa-route + aiCreditPolicy regressions green),
  lint:structure OK, eslint 0. Docs: runbook route section + topology. Next: HERMES-AGENT-GUIDANCE-UI (client entry
  point) → HERMES-AGENT-PLAN-EXTRACTION.
- **HERMES-AGENT-CAPABILITY — advisory React Agent capability `workflow_guidance_intake` — LOCAL/UNPUSHED (2026-06-20)**
  — exposed Hermes guidance through the existing React Agent governance allow-list, ADVISORY/read-only. Added registry
  entry in `services/ai/reactAgent/capabilities.ts` (`workflow_guidance_intake`, mode `read_only`, intent
  `request_workflow_guidance`, `creditFeature: null`, auditKind `react_agent.workflow_guidance_intake`) + new intent in
  `types.ts` (EXCLUDED from recognized free-text set — runs only via the server seam, never `handle()`). Server-only
  runner `services/ai/reactAgent/capabilities/workflowGuidanceIntake.ts`: builds safe DTO (sanitizer) → runs through
  `runAuthorizedCapability` (scope shape-validated; one safe audit row when a recorder is injected — scope ids + enums
  only, NO prompt/goal/guidance/token) → calls `requestHermesAgentGuidanceNormalized`. Lives in the `capabilities/`
  SUBMODULE so the boundary-imports fence (top-level only, relative-imports-only, no model/HTTP) stays intact. Gated by
  HERMES_AGENT_ENABLED (default OFF) + config → disabled/unconfigured returns typed unavailable with NO fetch. **NO
  workflow create/apply/run/delete; NO route/UI; NO direct OpenAI/Nous/private-Hermes; NO migration.** **Billing GAP
  (intentional):** no aiCreditGate for Hermes guidance yet — stays OFF by config until a future route wires the
  established gate. Verified: tsc clean, 128 tests pass (new orchestrator + capability-safety tests + 66 existing
  reactAgent incl. boundary-imports), lint:structure OK, eslint 0. Docs: runbook §5 capability subsection + topology.
  Next: HERMES-AGENT-CAPABILITY-ROUTE (gated route + aiCreditGate + persistent recorder + UI) → HERMES-AGENT-PLAN-EXTRACTION.
- **HERMES-AGENT-RESPONSE-CONTRACT — strict gateway response normalization — LOCAL/UNPUSHED (2026-06-20)** — now
  that the live success envelope is known (`{ ok:true, response:{ choices:[{ message:{ content } }], usage? } }`),
  added `services/ai-guidance/gateway/gatewayResponseContract.ts`: Zod `gatewaySuccessEnvelopeSchema` + pure
  `normalizeGatewayResponse(raw)` → advisory **`NormalizedGatewayGuidance`** (`ok, guidanceText, source:"hermes-agent",
  workflowPlan: WorkflowPlan|null, rawUsage?, warnings?`). Fail-closed: malformed/missing-choices/missing-or-empty
  content → INVALID_RESPONSE; gateway `{ok:false}` → PROVIDER_ERROR (safe short code only, nested downstream messages
  NOT surfaced); non-2xx → PROVIDER_ERROR status_<n>; timeout → TIMEOUT. `usage` sanitized to numeric token counts
  only (NOT billing-trusted); unknown extra fields ignored (never copied out). **workflowPlan stays null** — a plan
  is only surfaced if a structured plan object passes `validateWorkflowPlan` (arbitrary JSON/prose never accepted as
  a plan). Client now exposes `requestHermesAgentGuidanceNormalized` (+ `requestHermesAgentGuidance` thin adapter to
  the `GuidanceResult` port); dropped the old loose extraction (raw-string/`{guidance}`/bare-choices). Verified: tsc
  clean, 51 mocked tests (new `gatewayResponseContract.test.ts` + updated client test), lint:structure OK, eslint 0;
  **live smoke PASSED healthy end-to-end** (non-empty guidanceText, ~4.8s). Nothing user-facing/live-routed; no
  migration. Docs: runbook §5 response-contract table + topology doc. Next: HERMES-AGENT-CAPABILITY (scoped/audited
  server boundary) → HERMES-AGENT-PLAN-EXTRACTION (gate structured plans through validateWorkflowPlan).
- **HERMES-AGENT-PROD-CLIENT — Render gateway client (gated, inert) — LOCAL/UNPUSHED (2026-06-20)** — Marcus
  stood up real production-style infra on **Render**, so the local Docker **sandbox is SKIPPED** as the main
  direction. Topology: **Vercel ChainReact → Render public AI Gateway (`chainreact-ai-gateway-prod`,
  `https://chainreact-ai-gateway-prod.onrender.com`, `POST /api/hermes-agent/guidance`) → Render private Hermes
  Agent (`chainreact-hermes-agent-prod`, Ohio :8642, disk /opt/data, model `hermes-agent`) → OpenAI**. ChainReact
  calls ONLY the gateway — never a model vendor/Nous/private agent directly; holds ONLY
  `CHAINREACT_AI_GATEWAY_TOKEN`. **OPENAI_API_KEY / API_SERVER_KEY / private Hermes URL / internal token NEVER go
  in Vercel** (Render only). Shipped `services/ai-guidance/gateway/`: `gatewayConfig.ts` (reads HERMES_AGENT_ENABLED
  + CHAINREACT_AI_GATEWAY_URL/TOKEN + HERMES_AGENT_TIMEOUT_MS; null when off/unconfigured), `buildGatewayGuidancePrompt.ts`
  (safe prompt from de-identified DTO + scrubbed goal text), `hermesAgentGatewayClient.ts` (POST {prompt}, Bearer
  gateway token in header only, advisory-only, fail-closed typed errors, `createHermesAgentGatewayProvider` impl of
  the generic port), `index.ts` (`resolveServerGuidanceProvider` = gateway-when-enabled else noop; NOT re-exported
  from the generic barrel = server-only). **Gated/inert**: only calls out when HERMES_AGENT_ENABLED=true + config +
  explicit server caller; no route/UI/React Agent wired; not the app default. Verified: tsc clean, 40 mocked tests
  (client/config/safety incl. no-Render-secret-in-body, no browser import, token-only-in-header), lint:structure OK,
  eslint 0. **Live smoke VERIFIED HEALTHY end-to-end (2026-06-20)**: after a sequence of Render-side fixes
  (inbound gateway auth → gateway→agent auth "Missing Authentication header" → agent provider config "Unknown
  provider 'openai'" → model "Encrypted content not supported" feature) the gateway now returns HTTP 200 `ok=true`;
  **Working model-provider config (on the Hermes Agent, NOT ChainReact):** OpenAI is wired as a CUSTOM
  OpenAI-compatible provider named **`openai-api`** (NOT the built-in name `openai`), base URL
  `https://api.openai.com/v1`, model = the one configured on the agent (exposed to ChainReact as `hermes-agent`).
  `gpt-4o-mini` FAILED (agent sent encrypted reasoning content that model rejects); OpenRouter/Nous warnings were
  old/default config, not the intended path; direct Nous Portal/model API is NOT used.
  the ChainReact client smoke passes the 2xx branch ("OK end-to-end", ~3.5s), normalizing the OpenAI-style
  `{ok:true,response:{choices:[{message:{content}}]}}` envelope into an advisory guidance result. Every blocker was
  Render/agent-side config; ChainReact code needed NO change throughout. NO migration, nothing live-routed/user-facing
  (client still gated + explicitly-constructed only). Docs:
  [`hermes-agent-render-prod.md`](./runbooks/hermes-agent-render-prod.md) (authoritative),
  [`hermes-agent-production-topology.md`](./slices/phase-5/hermes-agent-production-topology.md); sandbox runbook
  marked secondary. Next: HERMES-AGENT-CAPABILITY (scoped/audited server boundary) → HERMES-AGENT-RESPONSE-CONTRACT
  (tighten the now-verified gateway success schema + structured plan extraction behind validateWorkflowPlan).
- **HERMES-AGENT PIVOT — direct Nous hosted-model integration STRIPPED — LOCAL/UNPUSHED (2026-06-20)** — Marcus
  changed direction: ChainReact will NOT call a hosted LLM model API directly, and Nous Portal is NOT a
  fallback. Target arch = **ChainReact → Hermes Agent (internal learning/skills brain) → OpenAI (provider
  underneath) → Hermes Agent → ChainReact validation/decision**. **Removed** from `services/ai-guidance` +
  `contracts`: `nousHermesAdapter`, `hostedHermesGuidanceProvider`, `hermesConfig` (HERMES_* Nous-model
  env/`ENABLE_HOSTED_HERMES_GUIDANCE` flag), `buildWorkflowGuidancePrompt`, `guidanceFallbackPolicy`, the opt-in
  live Nous smoke + its tests, and `docs/runbooks/hosted-hermes-setup.md`. Also discarded the uncommitted
  JSON-mode WIP (`guidanceIntake` contract + `parseGuidanceIntakeResponse`). **Retained (generic, Agent-ready):**
  guidance contracts (`aiGuidance.ts`, `guidanceSession.ts`, `guidanceSkillEvents.ts`), `WorkflowGuidanceProvider`
  port, safe-DTO `sanitizeWorkflowForGuidance` (privacy boundary), `workflowGuidanceIntake` seam (noop default),
  `validateWorkflowPlan` (registry capability gate), `skillEventBoundary` (private→global generalized events).
  Hard boundaries: Agent never mutates workflows / never touches Supabase/service-role/OAuth tokens/API
  keys/raw integration rows; execution never depends on the Agent; global skills get only sanitized generalized
  events. NO migration, nothing live-routed, no app/route/UI. New docs:
  [`hermes-agent-chainreact-architecture-spike.md`](./slices/phase-5/hermes-agent-chainreact-architecture-spike.md)
  + [`hermes-agent-sandbox.md`](./runbooks/hermes-agent-sandbox.md) (sandbox: Docker + persistent volume + OpenAI
  in AGENT config; future env `HERMES_AGENT_BASE_URL`/`_INTERNAL_TOKEN`/`_TIMEOUT_MS`, not yet consumed). Prior
  plan banner-superseded. Verified: tsc clean, 5 suites/21 tests pass, lint:structure OK. Next: HERMES-AGENT-SANDBOX
  → HERMES-AGENT-CLIENT (inert `WorkflowGuidanceProvider` posting safe DTO, flag-OFF, mocked-fetch).
- **React Agent GOVERNANCE ARC COMPLETE + live-verified — LOCAL/UNPUSHED (2026-06-20)** — CS-1 boundary →
  CS-7e live smoke (14 commits, `193627693`..`c6820d5a1`). One account/workflow/user-scoped seam
  (`runAuthorizedCapability`) validates scope+registry+intent and emits ONE `react_agent_audit_events` row
  (success/failed/denied, fail-open ×2, metadata-free/no-leak). Registry: `diagnosis_qa`(read_only/workflow_qa),
  `diagnosis_explain`(read_only/workflow_explanation), `repair_proposal`(proposes_change/workflow_repair),
  `repair_apply`(requires_approval/null-credit; apply is deterministic, NO model, NO aiCreditGate; `apply_repair`
  excluded from free-text handle). `proposed_patch_ref` (one-way sha256) correlates proposal↔apply w/ no approval
  table. CS-5b migration APPLIED+live-verified; arc added NO feature flags (governance always-on for wired
  routes; apply has no UI entry yet). DEFERRED: ai_cost_event_id link, `react_agent_approvals` table (CS-7f),
  cross-ledger grant hardening, Hermes design. Next: push verified batch (Marcus approval)
  or start Hermes. → [`react-agent-governance-closeout.md`](./slices/phase-4/ai/react-agent-governance-closeout.md).
- **AI architecture direction CORRECTED: React Agent + MCP + Hermes split — LOCAL/UNPUSHED (2026-06-19)** —
  **React Agent** = in-app customer-facing assistant (the product AI path, **first**); **MCP** =
  external/diagnostic **adapter** for ChatGPT/Claude/internal tools, **NOT** a dependency of the in-app
  agent and **NOT** the product path; **Hermes** = **later** scoped runtime/memory layer (behind the
  `AgentRuntimeAdapter` port), not a global shared brain; **ChainReact `services/*` stay the source of
  truth**. Principles: account/workflow/conversation-scoped · permissioned · audited · credit-gated ·
  deterministic-first · queued for long jobs (`agent_jobs`/worker, never long req/resp) · approval-based
  workflow changes · AI optional to execution · NO global memory / cross-account retrieval / autonomous
  mutation · safe DTOs only. Build order: deterministic diagnostics → Explain → Q&A → repair suggest →
  approved apply (all ✅ shipped) → **Hermes later**. **Corrects [hermes-hosting-plan.md](./slices/phase-4/hermes/hermes-hosting-plan.md) (`9b87fdd86`):
  audit stands + "Hermes unbuilt" true, but its MCP-hosting conclusion over-redirected — MCP hosting is a
  separate secondary adapter track, NOT the answer to Hermes.** Next slices: React Agent service boundary
  (CS-1) → conversation model → internal tool registry → audit events → queued jobs → Hermes memory.
  Docs-only; no code/env/migration. Doc `react-agent-hermes-architecture.md` →
  [`react-agent-hermes-architecture.md`](./slices/phase-4/ai/react-agent-hermes-architecture.md).
- **Builder activation/readiness UX: visible blocked-go-live reason — LOCAL/UNPUSHED (2026-06-19)** — the
  readiness surface was already strong (`collectBuilderValidationIssues` maps the shared `core/workflows`
  validator into plain-English, no-id builder issues; `ValidationSummary` groups errors→warnings; each
  node-issue button calls `openNode` → opens config + focuses the node; `no_trigger` has a Choose-trigger
  action; `LifecycleActions` already disables Activate/Resume when `blockingIssueCount>0`). **Gap:** the
  disabled-button reason was **hover-only** (`title`). **Fix:** `LifecycleActions` now renders an
  always-visible `role="status"` line under a blocked Activate/Resume — "N setup issue(s) to fix before
  activate/resume" + a "Review" link wired (via `BuilderHeader`) to the existing validation panel; hidden
  at 0 issues / on Pause. **No activation-rule/validation/bypass/backend/AI/migration/flag change; no
  id/secret/token/DTO leak (asserted).** Verified: LifecycleActions+BuilderHeader+validation 103, full
  layout+panels 630, eslint 0, typecheck clean, lint:structure OK; Check workflow untouched. Deferred:
  header-level "jump to first blocking step". Commit `8faa6f3eb` LOCAL/UNPUSHED →
  [`builder-activation-readiness-ux-closeout.md`](./slices/phase-4/workflows/builder-activation-readiness-ux-closeout.md).
- **Builder canvas UX: drag + config-open focus(+zoom tune) + connection UX — LOCAL/UNPUSHED (2026-06-19)** —
  four client-only canvas fixes. (1) Live node drag: `WorkflowCanvas` ran controlled React Flow with no
  `onNodesChange`, so nodes only moved at drag-stop; now local `rfNodes` + `applyNodeChanges` move the
  node live while the graph slice is written **only** at `onNodeDragStop` (no per-mousemove slice/
  readiness/AI/autosave/server work) — plus grab/grabbing cursor. (2) Config-open focus: opening a
  node's config bumps the canvas-focus signal in a `"config"` mode → `useCanvasNodeFocus` `setCenter`.
  **Tuned (`dd53119ee`)** so it zooms IN, never out: zoom is now a FLOOR `Math.max(getViewport().zoom,
  CONFIG_MIN_ZOOM=1.4)` (was a flat forced 1.2 → felt like zooming out when already zoomed in), left
  offset cut 220→60px; no re-pan on same node, re-pans on a different node; reveal/"Go to field" still
  forced 1.75 centered/450ms. (3) Connection UX (`784fe89d9`): empty-catch on `connectNodes` made
  invalid connects fail silently; now `.builder-handle` styling + hover/selected accent ring + crosshair
  cursor, and self-loop/duplicate rejections surface the `connectNodes` message via a transient
  `role="status"` `ConnectionHintBanner` (no toast lib added; hint is local state). Valid connects +
  edge semantics + trigger topology unchanged. No migration, flag, backend, or RLS change. Verified
  (zoom tune): focus+drag+connect 20, full canvas+hooks 301, typecheck 0, eslint 0, lint:structure OK
  (connection slice earlier: 36/121/115). Marcus manually confirmed connection UX ("feels super smooth")
  AND the tuned config-open zoom-in. Commits `192826625` + `fde9b1110` + `784fe89d9` + `dd53119ee`
  LOCAL/UNPUSHED → [`builder-canvas-ux-closeout.md`](./slices/phase-4/workflows/builder-canvas-ux-closeout.md).
- **Selected-node Q&A focus label — LOCAL/UNPUSHED (2026-06-19)** — a diagnostic question asked
  with a step open now renders a subtle **"Focused on: <safe label>"** line in the read-only
  `diagnosis_qa` answer. Label derived **client-side** from the visible draft node via canonical
  `getNodeDisplayName(node)` (custom step name → metadata/type label → "Trigger"/"Action"); stale/
  missing/unresolvable id → no line (silent fallback). **No raw selectedNodeId/config/secrets/`{{}}`/
  DTO rendered; no server-side context projection; Q&A route/payload/model context unchanged; stays
  read-only, no Apply/Preview; still routes to the Q&A endpoint; credit-denied still shows the safe
  exhausted copy.** No routing/billing/env/provider/gate/migration change. Verified during the slice
  (not re-run at closeout): diagnosisQa 21, consolidated 114, typecheck 0, eslint 0, lint:structure
  OK. Commit `d2dfdc092` LOCAL/UNPUSHED (origin `cf0e43b97`); ships UI-only with the polish batch.
  **Deferred:** provider-prefixed labels, backend model/schema changes. →
  [`builder-ai-selected-node-qa-closeout.md`](./slices/phase-4/ai/builder-ai-selected-node-qa-closeout.md).
- **Builder AI polish batch — LOCAL/UNPUSHED (2026-06-19)** — UI/copy polish on the live metered
  Builder AI (no routing/billing-gate/env/provider/migration change). Friendlier out-of-AI-credits
  copy (deterministic checks stay free + Account → Plan & billing path; no raw 402/code) + AI credits
  shown in Account → Plan & billing (used/limit/remaining/reset from `account_billing` via
  `getAiCreditUsage`, account-scoped). One-composer reframed ("Ask a question or describe a change";
  send button "Send"); fill-only example chips (never auto-submit/bypass AUTOROUTE/spend credits);
  clarification copy polished (retained prompt still hidden). Q&A answer presentation: "Read-only"
  badge + "You asked"/answer/"What to check next" + unchanged-workflow footer + "Answering…" loading
  state; **stays read-only, no Apply/Preview, no raw ids/config/tokens/DTO**. Planner result framed
  up front ("nothing has changed yet — review before applying"); **still no auto-apply**. Verified
  during the 4 slices (not re-run at closeout): typecheck 0, eslint 0 errors on touched files,
  focused suites green (71/220/115→94/106); `lint:structure` now OK (`docs/slices/phase-4` split to
  46); `_BuilderAiPanelChat.tsx` carries a pre-existing soft max-lines warning (416>400). Commits
  `e984d1dfb` + `e5b959017` + `d20d45567` + `5a641290f` LOCAL/UNPUSHED (origin `cf0e43b97`); ship is
  a UI-only deploy when approved. **Deferred:** chat-bubble "View AI usage" CTA, Q&A selected-node
  label (no safe label carried), one-click chips, `_BuilderAiPanelChat.tsx` split. →
  [`builder-ai-polish-closeout.md`](./slices/phase-4/ai/builder-ai-polish-closeout.md).
- **AI credit enforcement ON in Production (env enablement) — LIVE & VERIFIED (2026-06-19)** —
  set `ENABLE_AI_CREDIT_ENFORCEMENT=true` for **Production** in Vercel and redeployed the existing
  commit `6a14173f6` (env + redeploy only; **NO code/commit/push/migration**). `aiCreditGate` (shipped
  flag-OFF in AI-CREDITS-3b, wired into Q&A/Explain routes by QA-2) now meters: runs **before** the
  model call, deducts from the **workflow-owning account** AI pool, fail-closed. Q&A=`workflow_qa`,
  Explain=`workflow_explanation`, **1 credit each** (fast tier). **Verified this session in prod:** Q&A
  200/ok=true + answer renders; Explain 200/ok=true + explanation renders; Check stays
  deterministic/free; account `ai_credits_used` **0/20 → 2/20** after 1 Q&A + 1 Explain; telemetry
  `workflow_qa` 4→5 / `workflow_explanation` 7→8; standard smoke 24/8/0 + targeted credit smoke passed;
  disposable workflow cleaned up. Denial paths stay safe (402 `AI_CREDITS_EXHAUSTED` / 403 frozen / 503
  gate|provider). **Caveats:** no live insufficient-credit test (account had headroom); **Preview** flag
  left unset/off (restore only when staging exists); still ONE Supabase project → treat `db:push` as
  prod-impacting. `ENABLE_OPENAI_PROVIDER` left ON, OpenAI key untouched. →
  [`ai-credits-enforcement-prod-enablement-closeout.md`](./slices/phase-4/ai-credits-enforcement-prod-enablement-closeout.md).
- **One Builder AI composer + deterministic auto-routing (AI-DIAG-QA-AUTOROUTE) — PUSHED & LIVE in prod (2026-06-19)** —
  collapses Builder AI to **one feed, one composer, one send**; **deletes the AI-DIAG-QA-3 mini Q&A box**
  (`_BuilderAiPanelQa.tsx`, "chat in chat" Marcus rejected). Routing precedence in `handleComposerSubmit`:
  chat-fill first → follow-up always planner → else pure `classifyComposerIntent(text)` → `qa | plan | clarify`.
  Clear questions→read-only Q&A (`diagnosis_qa`), clear build/edit→planner, vague/mixed-mutation→session-local
  `intent_clarification` bubble (retained prompt NOT rendered; "Explain the issue"→Q&A / "Plan a fix"→planner;
  resolve-once; never persisted). **No LLM in the router**, no second control, no backend/route/client/migration/
  flag/env change; Q&A still read-only (no patch/Apply/Preview/run/cred), planner Apply still explicit;
  `selectedNodeId` still hint-only from `configSlice.activeNodeId`. `DIAGNOSIS_QA_MAX_QUESTION_LENGTH` now
  unused client-side but retained/exported as backend-cap doc. Soft line-count warnings remain on
  `_BuilderAiPanelChat.tsx`/`_BuilderAiPanelMessageItem.tsx`/`useBuilderAiActions.ts`. Inherited verification
  (NOT re-run at closeout): CS-1 classifier 51→59, CS-2 intentClarification 10/diagnosisQa 17/chatFill 5/
  diagnose 8, CS-3 autoRoute 14/classifier 59/68 suites 902, CS-4 diagnosisQa 15/chatFillHint 10/autoRoute 14/
  intentClarification 10/68 suites 900, typecheck 0, eslint 0 touched, lint:structure OK. Commits
  `e0212b481`+`7fa13774a`+`1ff3c0b24`+`d117cd2af` **PUSHED & live in prod** (origin `6a14173f6`, prod-smoked
  2026-06-19); `workflow_qa` migration `20260703000000` **confirmed applied in prod**. →
  [`ai-diag-qa-autoroute-closeout.md`](./slices/phase-4/ai/ai-diag-qa-autoroute-closeout.md).
- **Workflow diagnosis Q&A UI (AI-DIAG-QA-3) — UI live, NO flag, LOCAL/UNPUSHED (2026-06-17); mini box SUPERSEDED by AUTOROUTE (2026-06-19)** —
  exposes the AI-DIAG-QA-2 backend in the Builder AI panel: a small question box next to "Check
  workflow" (placeholder "Ask why this workflow won't run…", Ask→Asking…, Enter submits / Shift+Enter
  newline, clears on success). **Explicit submit only, single-shot, session-local** `diagnosis_qa`
  message (question + answer + optional pointers + optional needsUserDecision + "answer only, not
  changed/run" boundary); **never persisted** (not in `persistedMessageToChat`). Submit disabled on
  empty/whitespace, >500 chars, in-flight, or any guarded panel op; `asking` threaded into all
  diagnosis-action + composer guards. **No patch, no Preview/Apply from Q&A, no run/activate/cred/
  integration mutation, no new flag.** `selectedNodeId` = existing `configSlice.activeNodeId` (hint
  only, never rendered, omitted when no node open — no new selection system). Safe errors only
  (402/403/503/transport; no raw model/server/gate text); hostile-mock test proves smuggled ids/
  tokens/config/`{{` never reach DOM; UI imports no services/MCP. Inherited verification (not re-run
  at closeout): diagnosisQa 17 + regressions (chatFillHint 10/explain 14/diagnose 8/suggest 13/
  preview 15/apply 10/client 38), typecheck 0, eslint clean (12 files), lint:structure OK. Commit
  `facc05666` **PUSHED & live in prod** (in origin `6a14173f6`); `workflow_qa` telemetry migration
  `20260703000000` **confirmed applied in prod**. (Mini box superseded by AUTOROUTE.) →
  [`ai-diag-qa-3-closeout.md`](./slices/phase-4/ai/ai-diag-qa-3-closeout.md).
- **Workflow diagnosis Q&A backend (AI-DIAG-QA-2) — backend live, NO UI, NO flag, LOCAL/UNPUSHED (2026-06-17)** —
  single-shot, explanation-ONLY Q&A about the safe diagnosis. New route `POST /ai/diagnose/qa` mirrors the
  Explain (AI-DIAG-2) contract: re-derive DTO server-side (never trust client DTO) → access wall → OpenAI-503
  → `aiCreditGate` BEFORE model (feature `workflow_qa`, fast, 1 credit, workflow-owning account; 402/403/503)
  → `answerWorkflowQuestion` (injected client, structured tool, Zod, output cap; question = delimited DATA;
  text-only; never a patch; `needsUserDecision`; points to existing Preview fix) → fail-open telemetry. Model
  sees only `buildDiagnosisQaContext` (Explain allow-list + safe selected-node summary: path/type/description/
  sensitive ONLY — no values/ids/tokens/`{{nodeId.path}}`); bogus `selectedNodeId` ignored+never echoed.
  Client `askDiagnosisQuestion` sends id+question(+draft+selectedNodeId), never the DTO. **Telemetry now
  first-class** (`AI-DIAG-QA-2-TELEMETRY-CHECK`): migration `20260703000000` widened `ai_cost_events_feature_chk`
  to allow `workflow_qa` (non-destructive; **confirmed applied in prod**), so telemetry records
  `feature:"workflow_qa"` (was `other` fallback); `metadata.kind` stays `workflow_diagnosis_qa`. **No UI / no
  Hermes / no multi-turn / no patch / no new flag.** Commits `893f44001` (backend) + `9ddd74df6` (telemetry),
  **PUSHED & live in prod** (in origin `6a14173f6`); credit enforcement now ON in prod (2026-06-19) →
  [`ai-diag-qa-2-closeout.md`](./slices/phase-4/ai/ai-diag-qa-2-closeout.md) · [`ai-diag-qa-plan-1.md`](./slices/phase-4/ai/ai-diag-qa-plan-1.md).
- **Builder UX mini-arc — canvas ergonomics + tabs + config-tab consolidation + Data Map MVP + Settings MVP, LOCAL/UNPUSHED (2026-06-16)** —
  builder commits `a6ec958ac → 67ee7f6a6`: non-overlap append/insert + drag resolve, Arrange moved to
  the zoom/fit controls, per-branch tail "+ Add step" (global Add disabled when multiple tails), inline
  node rename + delete (existing safe-rewire), top tabs **Builder | Runs | Data Map | Settings** (no dead
  tabs), one config tab strip **Setup | Test | Data** (Advanced hidden until real metadata), single
  config-panel close ×, a **frontend-only Data Map MVP** outline (graph/draft/metadata-derived; field
  **labels** not values; friendly variable source labels, broken refs flagged; trigger `{{trigger.…}}` copy
  only; no raw ids/JSON/secrets), and a **frontend-only Settings MVP** (real workflow-level sections —
  name/status/publish/unsaved/trigger/counts/timestamps — read-only, editing deferred; "Coming later" rows
  for unbuilt behavior; no creds/node-config). **UI/canvas/state-only — no migration, no backend/runtime, no flag.**
  Interleaved with unrelated parallel CLI/security commits (NOT this arc). Not pushed / not prod-smoked →
  [`builder-ux-mini-arc-closeout.md`](./slices/phase-4/workflows/builder-ux-mini-arc-closeout.md).
- **AI guidance unreachable/orphan-node card (AI-GUIDANCE-UNREACHABLE-NODE-1) — GUIDANCE-ONLY, LOCAL/UNPUSHED (2026-06-17)** —
  promotes the existing `unreachable_node` graph finding from a generic one-line attention item to a
  dedicated **guidance-only** Builder AI card: count-aware copy (singular/plural "…not connected to the
  trigger, so it/they won't run"), safe step LABELS, and a static "What you can do" list (connect / move /
  delete). Multiple orphan findings aggregate into one card. **Deliberately NOT apply-capable** — NO
  Preview/Apply button, no patch/strategy/preview-flag/model/credit (the fix needs user intent; `removeNode`
  apply-blocked, `addEdge` target ambiguous). Detection UNCHANGED (still a shared `findGraphIssues` runtime/
  Activate blocker) — presentation-only. No-leak: labels only (tests assert raw ids absent from payload+DOM).
  No migration, no flag. Commit `c4407ae4d` local/unpushed (origin still `ba0af6616`) →
  [`ai-guidance-unreachable-node-1-closeout.md`](./slices/phase-4/ai/ai-guidance-unreachable-node-1-closeout.md).
- **AI repair narrow duplicate-edge cleanup (AI-REPAIR-COVERAGE-2) — 4th deterministic repair category, PUSHED to origin/v2-main (2026-06-17)** —
  removes a **redundant duplicate edge** (later edge identical by the graph key `(from, to, label ?? "")`;
  keep-first, removeEdge the rest). Same `from/to` with DIFFERENT labels = legitimate branch fan-out and
  is NEVER flagged (broad `from/to`-only cleanup rejected). Check-only detection (`findDuplicateEdges` →
  `DUPLICATE_EDGE` finding, safe endpoint labels, gates `overallReady` false); `findGraphIssues` untouched
  by duplicates (Check stricter than runtime). Deterministic Preview + Apply are **no-LLM/no-credit/
  no-telemetry**, `removeEdge`-only, draft-only, fail-closed → `NO_SAFE_PATCH`. **No migration, no flag.**
  Commit `b45bcabbc` is on `origin/v2-main` (deploys to prod per posture). NOTE: a later separate arc
  (AI-READINESS-CONVERGENCE `5c20d0011`) promoted **self-loop** into the shared `findGraphIssues` verdict —
  that did NOT change duplicate-edge behavior →
  [`ai-repair-coverage-2-closeout.md`](./slices/phase-4/ai/ai-repair-coverage-2-closeout.md).
- **AI repair self-loop edge cleanup (AI-REPAIR-COVERAGE-1) — 3rd deterministic repair category, LOCAL/UNPUSHED (2026-06-17)** —
  removes a **self-loop edge** (a connection whose `from === to` — a step wired to itself). Check-ONLY
  detection (`findSelfLoopEdges` in readiness diagnostic → `SELF_LOOP_EDGE` finding, safe labels, gates
  `overallReady` false); the shared runtime/activation validator is **intentionally untouched** (Check
  stricter than runtime, like the invalid-ref precedent). Deterministic Preview + Apply are **no-LLM /
  no-credit / no-model-telemetry**; **`removeEdge` only** (batch-removes all self-loops in one validated
  preview), validated through the existing preview/apply safety engine, fail-closed. Apply is
  **validated-preview-only + draft-only** (never runs/activates/registers triggers, never mutates
  creds/integrations). **No migration, no flag.** `useBuilderDiagnosisActions.ts` now over the soft
  400-line cap (extract handlers next). Single commit `882519ba0`, atop interleaved parallel work. Not
  pushed / not prod-smoked →
  [`ai-repair-coverage-1-self-loop-closeout.md`](./slices/phase-4/ai/ai-repair-coverage-1-self-loop-closeout.md).
- **AI repair dangling-edge cleanup (AI-REPAIR-4A/4B) — 2nd deterministic repair category, LOCAL/UNPUSHED (2026-06-16)** —
  removes a **dangling edge** (a connection whose `from`/`to` step no longer exists). Check surfaces an
  actionable `STALE_EDGE` card (safe labels only; 4B adds per-endpoint "which side vanished" flags →
  honest singular/plural copy + one descriptor per broken connection). Deterministic Preview + Apply are
  **no-LLM / no-credit / no-model-telemetry**; **`removeEdge` is the only op** (one per dangling edge,
  batch-removed in one validated preview — per-edge deferred since the validator rejects a still-dangling
  intermediate). Apply is **validated-preview-only + draft-only** (never runs/activates/registers triggers,
  never mutates creds/integrations). **No migration, no flag.** Not pushed / not prod-smoked →
  [`ai-repair-4-dangling-edge-closeout.md`](./slices/phase-4/ai/ai-repair-4-dangling-edge-closeout.md).
- **AI repair Apply arc (AI-REPAIR-3A→3L) — deterministic variable-reference repair + guarded Apply, LIVE in prod (2026-06-15)** —
  Check deterministically flags deleted-/unknown-node variable references (**no LLM / no AI credits / no
  model-call telemetry**). For an apply-safe field: **zero** candidates → manual "Open field", no Apply;
  **one** → "Preview fix" → "Apply fix"; **multiple** → user picks a replacement → "Preview selected fix"
  → "Apply fix" (app **never auto-picks**; selection re-validated server-side, anti-injection). Deterministic
  Preview + Apply are **no-LLM / no-credit / no-model-telemetry**; Apply **persists DRAFT only** — never
  runs/activates/deactivates/registers triggers, never mutates creds/integrations/provider accounts. Apply
  eligibility is fail-closed (`assessApplyReadiness`). **No migration, no flag.** Marcus prod-smoked all three
  flows. `HEAD==origin/v2-main==589036fb0` →
  [`ai-repair-3-apply-arc-closeout.md`](./slices/phase-4/ai/ai-repair-3-apply-arc-closeout.md).
- **AI diagnosis explanation (AI-DIAG-2) — safe single-call "Explain with AI", local-only (2026-06-12)** —
  deterministic check stays 0-credit/ungated (telemetry now → workflow-owning account); optional
  explicit-click explanation re-derives the safe DTO server-side, sends only an allow-listed projection
  to OpenAI fast (no ids/config/tokens/free-text), gated before the model call (`workflow_explanation`=1,
  workflow-owning account); explanation-only UI. Flags OFF, OpenAI not enabled → safe 503. Q&A/repair/
  Hermes deferred → `a66d0d87e`/`baea491b4`/`8e090b2f6` +
  [`ai-diag-2-llm-explanation-plan.md` §0](./slices/phase-4/ai-diag-2-llm-explanation-plan.md).
- **AI credit enforcement (AI-CREDITS-3b) — gate WIRED flag-OFF, local-only (2026-06-12)** — paid
  planner (`workflow_creation`) gated before the model call → 402 `AI_CREDITS_EXHAUSTED` (planner not
  called) / 403 frozen / 503 fail-closed; bills the workflow-owning account. Migration `20260621000000`
  on dev; gated dev smoke proved the RPC/gate path. Flag OFF everywhere (literal `"true"`). Full
  as-built + commits + deferred work →
  [`ai-credits-enforcement-3b-plan.md` §0](./slices/phase-4/ai-credits-enforcement-3b-plan.md).
- **Internal MCP diagnostic + reporting suite COMPLETE — stages 2A–2D, 43 tools (local-only, 2026-06-15)** —
  repo navigation, provider readiness, targeted verification, gated live diagnostics
  (run-failure/visibility, workflow-readiness, integration-/workflow-connections), workflow-graph
  diagnostics, no-leak scanner, composite doctors, and diagnostic/deploy-readiness reports
  (Phase 2D `69e3792d8`). Reports **compose** existing doctors/checks — no new route/brain/DB/mutation;
  output stays enums/counts/ids/field-names only (route=gate/validate/serialize ·
  `services/diagnostics/*`=brain · MCP=adapter/render). Deferred / do-not-build: smoke runners + any
  mutating/deploy/db/prod-data tools →
  [`mcp-diagnostic-suite-closeout.md`](./slices/phase-4/mcp-diagnostic-suite-closeout.md) +
  [`mcp/mcp-development-tooling-audit.md`](./slices/phase-4/mcp/mcp-development-tooling-audit.md).
- **Connected-app recovery + disconnect (local-only, 2026-06-12)** — **Reconnect UX-complete**
  on connected app cards (provider-level recovery, always visible on collapsed cards;
  filled-secondary + refresh glyph + "Refresh this connection" tooltip). **"Connect another"
  UX-complete** ("Add another account"). Per-account **Disconnect is LIVE / product-complete**
  — UI + backend (service/repo CD-1, routes CD-2, UI CD-3, polish `8c38d8b60`), and the
  `ENABLE_INTEGRATION_DISCONNECT` rollout flag was **removed `34b28e045`** (renders + works by
  default; no replacement flag). `markDisconnected()` dead code replaced by a service-role
  disconnect path. Soft-disconnect + best-effort revoke + `integration_revoked` cascade
  (last-active-row only; never auto-resume); no token/secret/raw-error leak. Localhost-OAuth
  observation audited as a dev redirect artifact, not a prod auth bug →
  [`connected-app-recovery-ux.md`](./slices/phase-4/connected-app-recovery-ux.md),
  [`connected-app-disconnect-plan.md`](./slices/phase-4/connected-app-disconnect-plan.md);
  commits `55c004501`/`deb4897a5`/`9964dc5d3`/`8c38d8b60`/`34b28e045`.
- **Production smoke closeout (2026-06-11)** — run-now `after()` reliability validated in
  prod (builder manual-run finalizes + appears on `/runs`); Slack action manual-run
  finalization validated; Slack channel loading recovered after Slack re-OAuth →
  `dd9e69502` + [`v2-go-live-status.md`](./slices/phase-4/v2-go-live-status.md).

## Owner preferences

- Local-only / push-gate; no fake UI, no invented backend; challenge only real
  architectural / security / product risk; verify-then-report with structured outputs →
  see [`CLAUDE.md`](../CLAUDE.md) + [`.claude/skills/README.md`](../.claude/skills/README.md).
- Small, scoped, reversible commits; strict honesty (never claim a check ran unless it did).

## Not captured here

- secrets / env / tokens / credentials / production or customer data
- per-message chat noise · unverified speculation
- rule bodies (→ `docs/rules/`) · roadmap / go-live / closeout / outcome detail
  (→ `docs/slices/`, `docs/roadmap/`) · every slice (→ closeouts)
