# Changelog — @chainreact/mobile-contracts

All notable changes to this package are documented here. Published versions
are immutable; every publish gets an entry BEFORE it is tagged.

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
