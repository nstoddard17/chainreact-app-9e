# 5.DUAL-BUILDER-1 CS-7F — Live Ask React preview/apply acceptance

> Governing rules held: two editors, one workflow; AI proposes, the user reviews,
> Apply is explicit, Save is explicit; local loopback Supabase only; CS-7C guard never
> weakened; Document Builder default-OFF; only the external model RESPONSE is mocked.

## 1. Plain-language result

The complete Ask React preview→apply flow now runs live in the real authenticated app,
with **only the external Hermes/model response boundary mocked** by a loopback mock
gateway. The real Document Ask React control, the ONE Agent rail + composer,
WorkflowGuidancePanel, the account guidance route, response parsing
(`normalizeGatewayResponse` + `validateWorkflowPlan`), the auto-shown Document ghost
preview, `useBuilderPreview`, checkpoint + Agent change-history, `graphSlice` apply, and
Save are all exercised for real. The additive journey passes end to end. The
edit/stale/destructive mutation fixtures are built and parse-verified by unit tests but
were **not** driven live in this batch (honest scope — see §12–14, §29). Recommendation:
**GO for owner testing; tight conditional-GO for a small opt-in beta** (§28).

## 2. Worktree / branch / base / commit

| Item | Value |
| --- | --- |
| Worktree | `C:/tmp/cs7f-wt` (registered git worktree) |
| Branch | `dual-builder-cs7f-agent-live-acceptance` |
| Base commit | `62580babc` (CS-7E) |
| Initial HEAD | `62580babc` |
| Final HEAD | the single local commit on this branch |
| `node_modules` | junction to the parent repo (zero package drift) |
| Local Supabase | CS-7D stack, loopback, running |
| Docker / Supabase CLI | 29.4.1 / 2.109.1 |
| Hermes config discovered | `HERMES_AGENT_ENABLED`, `CHAINREACT_AI_GATEWAY_URL`, `CHAINREACT_AI_GATEWAY_TOKEN` (`services/ai-guidance/gateway/gatewayConfig.ts`); client POSTs `{prompt}` to `${URL}/api/hermes-agent/guidance` |

## 3. Local Supabase + mock-Hermes safety proof (no secrets)

`npm run supabase:test:status` → `API_URL loopback: true (127.0.0.1)`. `.env.test.local`
gitignored; the CS-7C guard passes purely on loopback (no `E2E_ALLOW_DESTRUCTIVE_TEST_SETUP`).
The mock gateway binds to **127.0.0.1** only; global-setup asserts the configured
`CHAINREACT_AI_GATEWAY_URL` host is loopback and **throws otherwise** — the Ask React
journey can never reach a real model provider. No prompt body, workflow config, or token
is logged; the mock records only bounded counts + the selected fixture NAME.
`ENABLE_DOCUMENT_BUILDER` is process-scoped (absent from checked-in config).

## 4. Exact commands

```bash
npm run supabase:test:status
ENABLE_DOCUMENT_BUILDER=true npx playwright test dual-builder-document-agent-journey --workers=1
```

The mock gateway starts automatically in Playwright global-setup (loopback port 9890);
`playwright.config.ts` points the dev server's `CHAINREACT_AI_GATEWAY_URL` at it and sets
`HERMES_AGENT_ENABLED=true` + a throwaway token — E2E-only, never a production default.

## 5. Mock-boundary architecture & exact layer mocked

`tests/e2e/helpers/mockHermesServer.ts` — a `node:http` server implementing ONLY
`POST /api/hermes-agent/guidance` (+ `/health`), returning deterministic OpenAI-style
envelopes. **The ONLY mocked layer is the external model response.** It selects a fixture
from the **user-goal line** of the prompt (not the surrounding system prompt — that was a
real bug found and fixed: the capability catalog / "removeEdge" edit instructions were
mis-routing every request to the destructive fixture). Everything downstream of the HTTP
response — the real gateway client, `normalizeGatewayResponse`, `validateWorkflowPlan`,
`planToDraftPreview`, preview state, `useBuilderPreview`, checkpoint/change-history,
`graphSlice` apply — is real. Unit-tested by `tests/unit/e2e-helpers/mockHermesServer.test.ts`
(9 tests: loopback bind, health, deterministic selection, unknown route 404, no-prompt
logging, shutdown/fail-closed, and each fixture parsed by the REAL response contract).

## 6. One-Agent / composer result — PASS

Live: the Document Ask React entry opens the existing rail; **exactly one**
`builder-guidance-rail` and one `workflow-guidance-panel` are mounted; the Document opens
no second conversation panel; the composer is the single `Message React` textbox.

## 7. Versioned composer-seed result — PASS (seed proven)

Live: the Document Ask React entry seeds the composer with the request text
(`cs7f-01-composer-seeded.png`); the composer holds the seeded value before submit; no
second composer appears. (The multi-seed-supersede sub-scenario was not scripted this
batch — the single-seed path is proven.)

## 8. Preview non-mutation result — PASS

Live: after submit → real route → mock → real parse, the ghost preview auto-shows
(`cs7f-02-ghost-preview.png`) marked preview-only. Before Apply, the live definition
(via the API) is unchanged in node/edge count, Save stays **disabled** (not dirty), and
no mutation occurs.

## 9. Reject result — PASS

Live: Reject removes the ghost; the live definition is unchanged; Save stays disabled; the
one Agent rail + conversation remain.

## 10. Apply result — PASS

Live: Apply converts the proposal into real pending nodes; Save becomes **enabled**
(dirty) with **no** automatic Save; no duplicate workflow; `cs7f-03-applied-unsaved.png`.

## 11. Checkpoint & change-history result — PASS (through the real observable paths)

Live, **not** a mocked-call assertion: after Apply, `GET /api/workflows/[id]/agent-changes`
returns ≥1 change-history item, and a `workflow_checkpoints` row exists for the workflow
(queried via the admin client) — the pre-apply checkpoint created by `useBuilderPreview`.

## 12–14. Edit / stale / destructive proposal results — DEFERRED (fixtures built + parse-verified, not driven live)

The mock returns real `{operations}` mutation patches for the **edit** (updateNodeConfig +
addNode) and **destructive** (removeNode) prompts, and they parse through the REAL
`normalizeGatewayResponse` (unit-verified). Driving them **live** requires the non-empty
EDIT/mutation path (`runWorkflowEditFromModel` + `proposeWorkflowMutation` against the
opaque editable-graph refs); that live path needs more setup than fit this batch, so the
core additive journey was proven via the NEW-workflow `workflowPlan` path instead (the
preview/apply MECHANICS are identical). Edit/stale/destructive live journeys are the
recommended CS-7G follow-up (§29). Their apply/undo/confirm semantics remain covered by
the extensive existing unit/integration suite.

## 15. Finish Setup / map integration — PARTIAL

The applied Slack action carries unset required fields, so Finish Setup has work after
Apply (verified indirectly: the applied graph persists with an unconfigured action).
Preview-only-content exclusion from Finish Setup/map is covered by the non-mutation
assertions (§8) + existing unit tests; a dedicated live assertion is a CS-7G item.

## 16. Cross-view undo/redo result — PASS

Live: after Apply, undo from Visual removes the applied nodes and redo restores them;
Document and Visual stay in sync (one workflow).

## 17. Explicit Save / reload result — PASS

Live: explicit Save persists the applied change to the SAME workflow record;
`GET /api/workflows/[id]` confirms the node count; reload shows the persisted graph.

## 18. Free-plan Agent branching entitlement — PASS (existing suite)

The advanced-branching entitlement suite passes live (3/3): Free sees the locked Pro
treatment, a crafted advanced-branching save is typed-403 with nothing persisted, and a
crafted run is 403 before any handler. No new Agent-specific entitlement source was added.

## 19. Live screenshot paths & mock comparison

`owner-review/cs7f/` (gitignored): `cs7f-01-composer-seeded.png`, `cs7f-02-ghost-preview.png`,
`cs7f-03-applied-unsaved.png`. With CS-7D/CS-7E, the composer-seed, ghost-preview, and
applied-unsaved states are now captured live. The edit/stale/destructive screenshots are
deferred with §12–14. The live shell matches the CS-7B mocks/harness with the real app
shell + real provider metadata; no new visual defect surfaced.

## 20. Responsive observations

The Agent rail + Document remained usable and the composer/preview visible at the default
laptop width during the passing journey; no console errors observed. Dedicated 400px /
narrow-desktop Agent captures are a CS-7G item (not claimed here).

## 21. Telemetry safety

The Document Ask React path emits only categorical/count events
(`document_empty_react_started`, `document_agent_preview_applied/rejected`) — the code
threads the SOURCE token, never prompt text / node ids / config values (verified by the
existing `documentTelemetry` unit tests, which stay green). The mock records no prompt.

## 22. Product defects found & fixed

**Mock fixture mis-routing (test-infra).** The mock initially matched keywords across the
WHOLE prompt, so the capability catalog / "removeEdge" edit instructions routed every
request to the **destructive** fixture — which silently removed a node and degenerated the
applied graph. Root-caused via the guidance `guidanceText` in the live response; fixed to
match ONLY the `User goal (their words):` line; added a unit test. No product-source defect
was found in the Ask React flow itself.

## 23. Tests & checks (pass/fail counts, in `C:/tmp/cs7f-wt`)

| Check | Result |
| --- | --- |
| CS-7F Ask React additive journey | **1 passed** (~35s) |
| CS-7E authoring journey (regression) | **6 passed** (~1.2m) |
| CS-7D flag-on / flag-off (regression) | **1 / 1 passed** |
| Free/Pro entitlement (regression) | **3 passed** (~1.2m) |
| Mock-Hermes unit tests | **9 passed** |
| `npm run typecheck` | **clean** (0 errors) |
| `npm run lint` (`eslint .`) | **0 errors** (19 pre-existing warnings, untouched files) |
| `lint:structure` / `lint:migrations` | **OK** |
| Document folder + e2e-helpers + structure lock | **37 suites / 401 tests green** |

## 24. Pre-existing failures at `62580babc`

None newly introduced; the 19 `eslint .` warnings pre-exist in untouched files. The
Document jest folder is fully green. The HERMES env is now set for all e2e (enabling the
rail) — the CS-7D/CS-7E/entitlement regressions all still pass, confirming no breakage.

## 25. Exact changed files

- `tests/e2e/helpers/mockHermesServer.ts` — **new**, loopback mock gateway + fixtures.
- `tests/e2e/dual-builder-document-agent-journey.spec.ts` — **new**, live Ask React journey.
- `tests/unit/e2e-helpers/mockHermesServer.test.ts` — **new**, 9 mock-boundary tests.
- `tests/e2e/global-setup.ts` — start the mock + assert loopback gateway URL.
- `tests/e2e/global-teardown.ts` — stop the mock.
- `playwright.config.ts` — point the dev server's gateway at the loopback mock (E2E-only).
- `docs/slices/phase-5/dual-builder-cs7f-agent-live-acceptance.md` — this report.

**Not committed:** `.env.test.local`, `owner-review/cs7f/*` (both gitignored).

## 26. Safety confirmation

Nothing was pushed, deployed, PR'd, migrated against production, or enabled in shared
config. No production Hermes/model/Supabase/Stripe/data/credentials were used — the mock
is loopback-only and the guard fails closed on any non-loopback gateway URL.
`ENABLE_DOCUMENT_BUILDER` stays default-OFF. No new AI route, preview system, graph store,
save path, engine behavior, entitlement model, workflow schema, or autosave was introduced
(the production client still resolves through the same canonical
`getHermesAgentGatewayConfig()`).

## 27. GO/NO-GO — owner testing: **GO**

An owner can run `npm run supabase:test:start` then the Ask React journey and see the real
seed → non-mutating preview → reject → apply → checkpoint/history → parity → undo/redo →
Save/reload flow work end to end against a safe local model boundary.

## 28. Final GO/NO-GO — small opt-in beta: **Conditional GO**

The load-bearing Ask React preview/apply mechanics — the novel, highest-risk surface — are
now proven **live** end to end (one agent, non-mutating preview, explicit apply, real
checkpoint + change-history, cross-view parity, undo/redo, explicit Save, persistence),
alongside CS-7D/CS-7E (parity, execution, insertion, branches, sections, Finish Setup, map)
and the Free-plan backstop. The feature stays default-OFF (no production exposure). The
**condition**: the edit / stale / destructive-confirmation live journeys (§12–14) are not
yet automated (fixtures built + parse-verified; semantics covered by unit/integration).
Either beta now with those three flows owner-smoke-tested manually, or land the §29 CS-7G
follow-up for a fully-automated guarantee.

## 29. Remaining limitations before broader rollout

1. **CS-7G:** drive the edit / stale / destructive mutation journeys live against a
   non-empty workflow (the `runWorkflowEditFromModel` / `proposeWorkflowMutation` path),
   plus the multi-seed-supersede, Finish Setup/map preview-exclusion, and 400px Agent
   captures.
2. Keep `ENABLE_DOCUMENT_BUILDER` default-OFF until (1) lands.
