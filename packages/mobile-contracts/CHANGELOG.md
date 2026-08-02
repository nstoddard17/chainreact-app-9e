# Changelog — @chainreact/mobile-contracts

All notable changes to this package are documented here. Published versions
are immutable; every publish gets an entry BEFORE it is tagged.

## 0.2.0 — 2026-08-02 (unpublished)

M1 endpoint contracts (MOBILE-COMPANION-M1-MOBILE-READ-API-1). Pre-1.0:
strict shapes may change with a minor bump; no client is pinned yet.

- `MobileAppConfigSchema` (strict, **breaking vs 0.1.0**): adds required
  `contractsSchemaVersion` and `maintenance {active, message}`.
- `MobileAccountSummarySchema`: adds `capabilities { canManageAccount }` —
  optional-but-always-populated (server projection of authorization rules;
  M0-shaped payloads still parse).
- New `MobileWorkflowNodeSummarySchema` (strict — labeling data only, node
  configuration structurally rejected) and `MobileWorkflowDetailSchema`
  (strict — the lightweight detail; no draftDefinition, no edges, no config).
- New list envelopes `MobileWorkflowListResponseSchema` /
  `MobileRunListResponseSchema` (strict; items + `pageInfo` only).
- `MOBILE_ERROR_CODES`: adds `INVALID_CURSOR`.
- `MOBILE_CURSOR_MAX_LENGTH` transport bound exported.
- Fixtures updated + extended (workflow detail, list pages, hostile
  graph-carrying negative fixture).

## 0.1.0 — 2026-07-31 (unpublished)

Initial M0 foundation (MOBILE-COMPANION-M0-CONTRACTS-FOUNDATION-1). Not yet
published to any registry; publish-ready only.

- Contract identity: `MOBILE_CONTRACTS_SCHEMA_VERSION = 1`,
  `MOBILE_API_VERSION = "v1"`, `MOBILE_API_BASE_PATH`.
- Error envelope `{error, code?, details?}`, `MOBILE_ERROR_CODES`,
  confirmation-required 409 detail (strict).
- Cursor pagination primitives (`nextCursor` + `hasMore`).
- Account context: account types/roles (parity with web contracts), account
  summary, session shape.
- Workflows: state + disabled-reason enums (parity), provider chip, lifetime
  run stats, mobile workflow summary (no draftDefinition, ever).
- Runs: display status + triggered-by enums (parity), run summary, strict
  run step / run detail — step outputs, trigger events, fatal errors, and
  error `details` are structurally rejected.
- Humanized error mirror (title/description/hint/action/severity).
- Integration-health summary (derived booleans + counts only, strict).
- Usage summary (mirrors `AccountUsageSummary`, no plan/Stripe fields).
- Deep-link targets (strict discriminated union; navigation hints only).
- Push data payload (strict; ids + type tag only, `v: 1`).
- App-config / minimum-version gate schema (strict).
- Synthetic fixtures `fixtures/v1/**` incl. negative (must-fail) fixtures.
