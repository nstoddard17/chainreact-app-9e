# ChainReactV2 Claude Skills

Project-specific skills that give future Claude chats consistent working rules for
ChainReactV2 — so context doesn't have to be re-explained every session.

These complement (do not replace) the root [`CLAUDE.md`](../../CLAUDE.md). When a skill
and `CLAUDE.md` conflict, `CLAUDE.md` and explicit user instructions win.

**Project status:** ChainReactV2 is **live in production** at `https://chainreact.app`
(deploying from `v2-main`). Authoritative live/status detail:
[`docs/slices/phase-4/v2-go-live-status.md`](../../docs/slices/phase-4/v2-go-live-status.md).
The **Local only** rule below still applies as the **default** — commit locally, don't
push unless Marcus explicitly approves a batch. On his explicit approval, the push goes
to `v2-main` and **deploys to prod** (intended; no staging env yet). "Don't push by
default" does not mean "V2 isn't live."

**Where the durable rules live (reference these, don't copy their bodies):** repo rules →
[`docs/rules/`](../../docs/rules/); universal provider authoring rules → root
[`CLAUDE.md`](../../CLAUDE.md) under **"V2 Provider Authoring Rules"**. Skills should point
at these, never paste their content.

## When to use which skill

| Skill | Use when | Output |
|---|---|---|
| [`chainreactv2-local-slice-executor`](./chainreactv2-local-slice-executor/SKILL.md) | **Default** for implementing a bounded local coding slice (feature, fix, refactor). | Code changes + local commit + slice report. |
| [`chainreactv2-security-review`](./chainreactv2-security-review/SKILL.md) | Auditing or implementing anything touching credentials, OAuth, API keys, webhooks, membership, RLS, service-role routes, deletion/transfer, billing gates, or public endpoints. | Threat note + no-leak review/tests, or a security audit doc. |
| [`chainreactv2-planning-doc-writer`](./chainreactv2-planning-doc-writer/SKILL.md) | A **planning-only** slice — design before implementation. | A grounded planning doc under `docs/slices/...`. No source changes. |
| [`chainreactv2-closeout-writer`](./chainreactv2-closeout-writer/SKILL.md) | An arc / slice-group is finished and needs a handoff. | A concise closeout doc. Docs-only. |
| [`chainreactv2-memory-curator`](./chainreactv2-memory-curator/SKILL.md) | After an arc closeout, a major status change (go-live, branch switch), or a durable decision — or when Marcus asks to update project memory. | Updated [`docs/PROJECT_MEMORY.md`](../../docs/PROJECT_MEMORY.md) (rolling state index) + short report. Docs-only. |
| [`chainreactv2-provider-integration-builder`](./chainreactv2-provider-integration-builder/SKILL.md) | Adding a **new app/provider integration** end-to-end. | Manifest + actions/triggers + handlers + tests + owner-task report. |
| [`chainreactv2-official-template-builder`](./chainreactv2-official-template-builder/SKILL.md) | Adding **official ChainReact workflow templates** / seeding the marketplace catalog. | `source='official'` template(s) on real, supported, credential-free nodes + no-leak tests + local commit. |

## Always-on project rules (every skill inherits these)

- **Local only.** Never `git push`, open a PR, or trigger remote work unless Marcus
  explicitly says so. Local commits with clear reports are the unit of progress.
- **V2 is the cleaner rebuild of V1** (`chainreact-app-9e`). Consult V1 for provider
  behavior, but **port/adapt into V2's boundaries — never blindly copy V1**, and
  challenge V1 behavior that is wrong or obsolete.
- **No fake UI, no invented backend.** Don't add controls a backend doesn't support,
  and don't claim behavior that isn't wired. If it isn't real, say so.
- **Account-scoped model** is the spine — see the slice executor skill for the rules.
- **Credentials are sensitive by default.** Personal-provider credentials must never
  silently cross members. See the security skill.
- **Risky/public features ship behind a flag that defaults OFF.**
- **Challenge plans only on real architectural / security / product risk** — don't slow
  down routine work.

## Conventions discovered in this repo (so skills stay accurate)

- Tests: **Jest** under `tests/{unit,integration,parity,structure}`; e2e via Playwright
  under `tests/e2e`. Scripts: `npm test`, `npm run typecheck`, `npm run lint`,
  `npm run lint:structure`, `npm run lint:migrations`.
- Migrations: `supabase/migrations/`, applied with `npm run db:push`
  (`scripts/db-push.mjs`). RLS + explicit GRANTs enforced by `lint:migrations`.
- Feature flags: `process.env.ENABLE_<NAME> === "true"` (default OFF), wrapped in
  `services/*/flags.ts`-style modules.
- Docs: `docs/slices/<phase>/...` with a header block (title + slice marker, **Type**,
  **Date**, **Branch**, a **Source of truth** list of verified file links) and relative
  `../../../path` markdown links. Commit hashes are 9 chars.
