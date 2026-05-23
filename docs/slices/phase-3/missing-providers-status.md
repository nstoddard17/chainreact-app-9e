# Missing Providers — Status & Plan

**Status:** Living tracker. Created Slice 3.DISCORD-3 (2026-05-23).
**Context:** Phase 2 closeout originally deferred several V1 providers from V2 with the acceptance that a later audit would prove which were worth shipping. Marcus has now updated the product direction: bring every intended deferred provider to the same V2-completeness level as Slack / Gmail / HubSpot / Mailchimp before the provider-completeness / metadata phase is considered closed.

This is a **product-direction update, not a correction** of the prior Phase 2 closeout. The previous closeout shipped exactly what was accepted at the time; the completeness bar is now being raised by the product owner.

---

## Decision

Complete the following V1 providers in V2 at the same level (runtime → resolvers → action metas → COVERED_PROVIDERS flip):

- **Discord** ← in flight (DISCORD-1 audit, DISCORD-2 runtime, DISCORD-3 resolvers all landed; DISCORD-4 metas next)
- Google Docs
- OneNote
- Monday
- Dropbox
- Facebook
- Google Analytics

Skip (explicit product decision):

- **ManyChat** — out of scope.
- **Twitter / X** — out of scope.

Trello is already shipped.

---

## Ordering

Provider arcs run sequentially in this order:

1. **Discord** (in flight)
2. Google Docs
3. OneNote
4. Monday
5. Dropbox
6. Facebook
7. Google Analytics

Each arc follows the now-standard 4-slice pattern that emerged from the HubSpot / Mailchimp / Discord arcs:

| Slice | Purpose |
| --- | --- |
| `<PROVIDER>-1` | Audit + scope plan (doc-only) |
| `<PROVIDER>-2` | Runtime port (manifest, OAuth, action handlers, schemas, shared API helpers, handler-registry wiring, tests) |
| `<PROVIDER>-3` | OptionsSource resolvers (resolver-first) |
| `<PROVIDER>-4` | Action metas + COVERED_PROVIDERS flip |

Optional follow-on slices (per-provider as needed):

- `<PROVIDER>-N-triggers` — webhook / polling trigger metas when the trigger architecture decision is settled.

---

## Per-provider notes

### Discord — complete except deferred member_join
- DISCORD-1: audit doc landed at `docs/slices/phase-3/discord-metadata-plan.md` (commit `4205697c8`).
- DISCORD-2: runtime port (5 actions only, no triggers) landed at commit `c0aace04b`.
- DISCORD-3: 6 OptionsSource resolvers landed at commit `b04224574`.
- DISCORD-4: action metas for the 5 ported actions + COVERED_PROVIDERS flip landed at commit `6eafedb31`.
- DISCORD-4A: registry trim landed at commit `36c4133d4`.
- DISCORD-5: trigger architecture decision doc (per-trigger answer to D-DC1) landed at commit `4d9a9df11`.
- DISCORD-6: `discord:slash_command` webhook trigger via Discord's Interactions Endpoint URL (Ed25519 signed) landed at commit `21b8753b5`.
- DISCORD-7: `discord:new_message` polling trigger over `GET /channels/{id}/messages?after={id}` (this slice).
- **DISCORD-N-member-join — deferred with hard blocker**: Discord REST has no join-time-indexed members endpoint (`GET /guilds/{id}/members` sorts by user id); audit log doesn't record joins; Application Webhooks don't cover `GUILD_MEMBER_ADD`. Revisit conditions: V2 ships gateway-worker infrastructure (Phase-level), OR Discord adds `GUILD_MEMBER_ADD` to Event Webhooks, OR Discord adds a join-time-indexed REST endpoint. See `docs/slices/phase-3/discord-trigger-architecture-plan.md` §4.3.

**Production follow-ups (tracked, not blocking):**
- Bot install permissions surface: production needs `permissions=` query param on the OAuth authorize URL OR operator documentation for required Discord Developer Portal permissions (View Channel, Send Messages, Read Message History, Manage Messages, Manage Roles, `applications.commands` scope).
- **MESSAGE_CONTENT privileged intent (DISCORD-7 operator burden):** `discord:new_message`'s `content` payload field arrives EMPTY when the bot lacks the MESSAGE_CONTENT privileged intent. Operator must enable it in the Discord Developer Portal under "Bot → Privileged Gateway Intents → Message Content Intent". For bots in 100+ guilds, Discord additionally requires manual approval. Without the intent, the `contentFilter` config field still functions but always evaluates against empty strings (effectively rejects every message when set).
- Slash-command options/arguments builder UI (DISCORD-6 future polish) — the API helper accepts options[] verbatim but the meta keeps fields minimal v1.
- Workflow-customizable slash-command ephemeral reply (DISCORD-6 future) — currently every invocation shows "Workflow triggered." privately; future may let workflows fill the immediate reply.
- `channelName` / `guildName` on `new_message` trigger payload arrive `null` because Discord's raw messages API doesn't include them. Follow-up plumbs them through trigger config from the picker labels at activation time.
- Role hierarchy filtering on `discord:roles` resolver.
- GUILD_MEMBERS privileged intent for `discord:members` resolver (large servers).
- discord-rich-text FieldType polish.
- FieldMeta conditional visibility polish.
- string-array + optionsSource / multi-select polish.

### Google Docs — not started
- Audit + scope plan needed (`gdocs-1`).

### OneNote — not started
- Audit + scope plan needed (`onenote-1`).

### Monday — not started
- Audit + scope plan needed (`monday-1`).

### Dropbox — not started
- Audit + scope plan needed (`dropbox-1`).

### Facebook — not started
- Audit + scope plan needed (`facebook-1`). Multiple Facebook products in V1 (Pages, Ads, Messenger) — audit will need to scope which subset ships.

### Google Analytics — not started
- Audit + scope plan needed (`ganalytics-1`). Mostly read-only triggers / data fetches in V1; resolver-heavy.

---

## Out-of-scope (explicit)

- ManyChat — skipped per product decision.
- Twitter / X — skipped per product decision.

---

## Update protocol

When a provider arc lands a slice, update the relevant per-provider note in §"Per-provider notes" with the commit hash and current state. Keep this doc small and operational — detailed audits live in each provider's `<provider>-metadata-plan.md` file under this directory.
