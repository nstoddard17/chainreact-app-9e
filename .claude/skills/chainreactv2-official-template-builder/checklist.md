# Official Template Builder — pre-commit checklist

Run top to bottom before the local commit. Every box must be checkable with evidence from the
actual code/tests — not from memory or assumption.

## 1. Reality of the nodes (inspect before you write)

- [ ] Every `provider` id used exists in [integrations/_registry.ts](../../../integrations/_registry.ts)
      (`getProvider(id)` returns a manifest).
- [ ] Every action `provider:type` exists in
      [services/discovery/_registry.ts](../../../services/discovery/_registry.ts)
      (`getActionMeta("provider:type")` is defined) **and** has a runtime handler
      (`getActionHandler(provider, type)` in
      [services/execution/handlers/_registry.ts](../../../services/execution/handlers/_registry.ts)).
- [ ] Every trigger `provider:type` exists (`getTriggerMeta("provider:type")` is defined).
- [ ] Every config key set on a node is a **declared field `name`** from that node's metadata
      `fields[]` — not a `displayName`, UI `label`, output name, or guessed key.
- [ ] Every enum/option value used matches a real static option from the field metadata
      (dynamic `optionsSource` fields get a `__REDACTED__` placeholder, not a guessed value).
- [ ] Nothing was invented. If any id was missing, the work STOPPED and reported it.

## 2. Graph validity ([contracts/workflowDefinition.ts](../../../contracts/workflowDefinition.ts))

- [ ] ≤ 1 trigger node.
- [ ] Every edge `from`/`to` references an existing node `id`.
- [ ] No self-loop edges; no duplicate `(from, to, label)` edges.
- [ ] Each node has sane `position` coordinates.
- [ ] The definition parses against `WorkflowDefinitionSchema` (the use route re-validates it;
      a failure there → `INVALID_TEMPLATE` 422).

## 3. Sanitization + schema (no-leak engine reuse)

- [ ] The `definition` was produced/validated via `sanitizeWorkflowDefinitionForExport`
      **and** `TemplateDefinitionSchema.parse(...)` — no hand-rolled redaction.
- [ ] `schemaVersion === EXPORT_SCHEMA_VERSION`.
- [ ] `__REDACTED__` markers are present wherever a credential / account / resource must be
      reselected at use-time.

## 4. Official metadata

- [ ] `source: 'official'` **and** `accountId: null` (DB CHECK enforces the pair).
- [ ] `createdByUserId: null` (no real provenance user).
- [ ] `visibility: 'public'` (officials list regardless; set for clarity).
- [ ] `creatorDisplayNameSnapshot` is a safe label (e.g. `"ChainReact"`) or null — never an email/id.
- [ ] Minted **service-role only** (`createTemplateServiceRole`) — never via a client route.
- [ ] Title + description are marketplace-safe (no PII, no internal ids).

## 5. No-leak — none of these appear in the definition or any DTO

- [ ] No OAuth token / refresh token / API key.
- [ ] No webhook signing secret.
- [ ] No provider account label / provider account email.
- [ ] No integration id.
- [ ] No credential-owner user id / `connected_by_user_id` / `workflow_node_credentials` data.
- [ ] No real `account_id` / `created_by_user_id` in any public DTO
      (`MarketplaceTemplateSummary` omits both — assert it).
- [ ] No Stripe / customer / subscription id.
- [ ] No private account / member data.

## 6. Tests

- [ ] `definition` validates against `TemplateDefinitionSchema` (+ `WorkflowDefinitionSchema`).
- [ ] Official appears in `listMarketplaceTemplatesServiceRole()` with `isOfficial === true`.
- [ ] Marketplace DTO omits `accountId` + `createdByUserId` (asserted).
- [ ] Use-template can instantiate a workflow (where reachable in test).
- [ ] No-leak assertion over the serialized definition + DTOs (section 5).

## 7. Verification commands (state which ran + results — never claim unrun)

- [ ] `npm run typecheck` clean.
- [ ] Focused `npm test` suite for the template area green.
- [ ] If a migration was added: `npm run lint:migrations` passed + RLS/GRANT reviewed, then
      `npm run db:push` applied.
- [ ] `npm run lint:structure` OK (if files added/moved).

## 8. Commit + boundaries

- [ ] One local commit, clear `type(scope): summary (SLICE-MARKER)` message.
- [ ] No UI / rewards / moderation / import added (unless Marcus asked).
- [ ] **Nothing pushed.**
