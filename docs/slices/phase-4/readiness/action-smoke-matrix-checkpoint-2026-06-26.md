# Action smoke matrix checkpoint — 2026-06-26

**Lane:** provider action testing/greening only (no triggers, no Connected Apps /
Builder / React Agent / Hermes / templates / UI polish).
**Source of truth:** `npm run chainreact -- smoke actions --cert` (offline certification
inventory; no DB, no provider calls). Cert seed:
[scripts/chainreact/smoke/certificationSeed.ts](../../../../scripts/chainreact/smoke/certificationSeed.ts).
**Branch:** `v2-main`. **Nothing pushed.**

## 1. Current matrix (this checkpoint)

```
Totals: 298 registered, 119 LIVE_PASS, 26 not-run, 153 missing-fixture,
        0 blocked-env, 0 fail, 0 bug, 0 sandbox-required, 0 unsafe-no-harness.
```

No drift from the 2026-06-25 snapshot in `docs/PROJECT_MEMORY.md` (119 LIVE_PASS).

**Per-provider (registered / LIVE_PASS / NOT_RUN / MISSING / BLOCKED / FAIL / BUG):**

| Provider | reg | LIVE_PASS | not-run | missing |
|---|---|---|---|---|
| airtable | 11 | **11** | 0 | 0 |
| google-drive | 7 | **7** | 0 | 0 |
| google-sheets | 12 | **12** | 0 | 0 |
| microsoft-onedrive | 7 | **7** | 0 | 0 |
| notion | 16 | 13 | 0 | 3 |
| microsoft-onenote | 12 | 9 | 0 | 3 |
| slack | 31 | 9 | 1 | 21 |
| trello | 8 | 6 | 0 | 2 |
| hubspot | 26 | 7 | 0 | 19 |
| microsoft-teams | 8 | 5 | 0 | 3 |
| microsoft-excel | 13 | 5 | 0 | 8 |
| google-calendar | 5 | 4 | 0 | 1 |
| microsoft-outlook-calendar | 5 | 4 | 0 | 1 |
| gmail | 15 | 3 | 0 | 12 |
| microsoft-outlook | 11 | 3 | 0 | 8 |
| google-docs | 5 | 2 | 0 | 3 |
| facebook | 8 | 1 | 0 | 7 |
| mailchimp | 14 | 4 | 0 | 10 |
| dropbox | 11 | 7 | 1 | 3 |
| google-analytics | 6 | 0 | 4 | 2 |
| monday | 24 | 0 | 10 | 14 |
| stripe | 16 | 0 | 4 | 12 |
| discord | 5 | 0 | 1 | 4 |
| github | 6 | 0 | 0 | 6 |
| shopify | 11 | 0 | 0 | 11 |
| native | 5 | 0 | 5 | 0 |

**Write-COMPLETE providers (every registered action LIVE_PASS):** airtable, google-drive,
google-sheets, microsoft-onedrive.

## 2. Read-fixture frontier is exhausted

The only remaining read-style (`get_/list_/fetch_/search_/find_/read_`) MISSING actions
are all **policy-excluded** (raw bytes / signed URL / block content), consistent with the
prior batches' "no raw bytes / signed URLs" rule:

- `gmail:get_attachment`, `microsoft-outlook:get_attachment` — attachment bytes.
- `dropbox:get_temporary_link` — signed URL.
- `notion:get_block`, `notion:get_block_children` — block content.

So the next greenable batches are **write** batches (create → independent read-back →
cleanup), or remaining unconnected-provider reads (monday / stripe / discord / github /
shopify) that depend on a connected smoke account.

## 3. Next batch SELECTED — `google-docs:update_document` (smallest safe write)

**Why this is the smallest safe batch:**
- **1 action.** Brings google-docs 2/5 → 3/5; after it, the only google-docs MISSING are
  policy-excluded (see §4), so google-docs becomes "write-complete modulo policy."
- **Fully precedented, safe cleanup.** It reuses the exact certified pattern from
  SMOKE-WRITE-23 (`google-docs:create_document`, `LIVE_PASS_CLEANED`) + SMOKE-WRITE-27
  (Sheets create → mutate → **independent** read-back → cross-provider
  `google-drive:delete_file` permanent hard-delete): setup creates a marker-titled
  smoke-owned Doc → `update_document` edits it → **independent** `get_document`
  (already `LIVE_PASS`) read-back confirms the marker+suffix on the persisted content
  (handler echo never trusted) → whole Doc hard-deleted via cross-provider Drive delete
  (a documentId IS a Drive file id). Smoke-owned throughout; true erase.
- **No forbidden category:** not a send/broadcast, not billing, not a sharing link, not
  destructive-without-cleanup.

**LIVE cert is a gated operator run, not done in this checkpoint.** Greening to LIVE_PASS
requires `ALLOW_DB_INTEGRATION_TESTS=true` + `ALLOW_LIVE_PROVIDER_SMOKE=true` +
`ALLOW_LIVE_PROVIDER_WRITE_SMOKE=true` against a connected Google smoke account
(`SMOKE_ACCOUNT_ID` / `SMOKE_USER_ID`) via `npm run smoke:writes:live`. Per the
certification charter, **no `LIVE_PASS` cert row is added without a real live run** —
this checkpoint does not add one.

## 4. Classification of the remaining MISSING (so nothing is silently skipped)

**Forbidden by this lane (classify, never live-run):**
- `microsoft-teams:send_channel_message`, `:reply_to_channel_message`, `:send_chat_message`
  — send/broadcast.
- `google-docs:share_document` — sharing-permission/link mutation.
- All `stripe:*` create/update/cancel + `shopify:*` — billing/commerce mutations.
- `slack` sends/DMs (`send_direct_message`, `schedule_message`, …) — send/broadcast.

**Policy-excluded (raw bytes / signed URL / content):**
- `google-docs:export_document`, `gmail:get_attachment`, `microsoft-outlook:get_attachment`,
  `dropbox:get_temporary_link`, `notion:get_block(_children)`.

**Deferred — no safe cleanup / no independent verify (needs design before greening):**
- `microsoft-onenote:create_notebook`, `:create_section` — Graph exposes no API delete for
  notebooks/sections → would leave an un-cleanable artifact.
- `notion:create_database` — no archive-database action + no independent read-back
  (already documented deferred in the runbook).
- `trello:create_board`, `:create_list` — need a confirmed reversible cleanup
  (archive/delete) action before write-smoking.
- `microsoft-onenote:copy_page` — async (needs the `completeAsync` monitor-poll primitive,
  like `onedrive:copy_item`); medium effort, safe-but-not-smallest.

**Connected-account reads (greenable once the smoke account connects the provider):**
- `monday` (10 not-run), `stripe` reads (4 not-run, read-only finds — distinct from the
  forbidden billing mutations), `discord` (1 not-run), `google-analytics` (4 not-run —
  account exposes no GA property), plus `github` / `shopify` read surfaces.

## 5. Verification (this checkpoint, offline only)

- `npm run chainreact -- smoke actions --cert` → matrix above (offline inventory).
- `npx jest tests/unit/smoke-actions` → **33 suites / 381 tests pass** (incl.
  `fixtures-valid`, `certification`, registry-parity) — confirms the harness + matrix are
  internally consistent.
- No live provider calls, no DB writes, no cert rows added. **Nothing pushed.**

## 6. Next step (operator, gated)

Author the `google-docs:update_document` WRITE fixture (mirroring the Sheets
create→mutate→independent-read-back→Drive-delete fixtures) and live-cert it via
`npm run smoke:writes:live` with the three live gates + a connected Google smoke account.
On a green run (0 leaked), add its `LIVE_PASS_CLEANED` row to `certificationSeed.ts`.

## 7. Update — SMOKE-WRITE-34 fixture authored (2026-06-26, same day)

The `google-docs:update_document` WRITE fixture is now **authored + registered**
([tests/fixtures/action-smoke/google-docs/update_document.ts](../../../../tests/fixtures/action-smoke/google-docs/update_document.ts),
registered in [tests/smoke-actions/fixtures.ts](../../../../tests/smoke-actions/fixtures.ts)).
Phase plan: setup `create_document` (marker title+body, capture `documentId`) → execute
`update_document` append `<marker>updated` (`insertLocation:"end"`, never the body-wiping
`replace`) → verify independent `get_document` read-back (marker on flattened `content`,
`markerSuffix:"updated"`) → cleanup cross-provider `google-drive:delete_file`
(`permanent:true`, true erase). `destructiveSafe`, smoke-owned throughout.

**Matrix delta:** `google-docs:update_document` moved **MISSING_FIXTURE → NOT_RUN**.
Totals now **298 registered / 119 LIVE_PASS / 27 not-run / 152 missing / 0 fail / 0 bug**;
google-docs **5 / 2 / 1 / 2**.

**Live run status: LIVE_NOT_RUN_READY.** The three live gates
(`ALLOW_DB_INTEGRATION_TESTS`, `ALLOW_LIVE_PROVIDER_SMOKE`,
`ALLOW_LIVE_PROVIDER_WRITE_SMOKE`) are **unset** in this environment (they are explicit
per-run operator opt-ins, not in `.env.local`), so the gated live write run was **not**
performed and **no `LIVE_PASS` cert row was added** (charter: no cert without a real live
pass). `SMOKE_ACCOUNT_ID` / `SMOKE_USER_ID` are present; the remaining precondition is the
operator enabling the gates against a connected Google smoke account, then
`npm run smoke:writes:live`. On a green run (0 leaked) add the `LIVE_PASS_CLEANED` row to
`certificationSeed.ts`.

**Offline verification (this turn):** `npx jest tests/unit/smoke-actions` → 33 suites /
381 tests pass (incl. `fixtures-valid`, `certification`, registry-parity);
`npm run chainreact -- smoke actions --cert` → matrix delta above; `npx tsc --noEmit` →
exit 0; eslint on the 2 touched files → 0; `npm run lint:structure` → OK.

## 8. Update — SMOKE-WRITE-34 LIVE-CERTIFIED (2026-06-26, same day)

`google-docs:update_document` is now **`LIVE_PASS_CLEANED`**. Ran the targeted live write
smoke against the connected Google smoke account (gates set inline for the one command;
they are safety opt-ins, not secrets):

```
ALLOW_DB_INTEGRATION_TESTS=true ALLOW_LIVE_PROVIDER_SMOKE=true \
ALLOW_LIVE_PROVIDER_WRITE_SMOKE=true ALLOW_DESTRUCTIVE_PROVIDER_SMOKE=true \
SMOKE_PROVIDER=google-docs SMOKE_GOOGLE_DOCS_CONNECTED=1 npm run smoke:writes:live
```

(`ALLOW_DESTRUCTIVE_PROVIDER_SMOKE` is also required — the fixture is `destructiveSafe`:
its cleanup is a smoke-owned delete. `SMOKE_PROVIDER=google-docs` scopes the run to
google-docs only, so no other provider's writes execute.)

**Live result — PASS, 0 leaked:**
```
PASS  google-docs:update_document [destructiveSafe]
    setup ok · execute ok · verify ok · verify ok — marker confirmed on read-back · cleanup ok
    created 1 / cleaned 1 / remaining 0 (document) | artifact: cleaned
```
(`google-docs:create_document` re-ran in the same scoped sweep and also PASSED, created 1 /
cleaned 1 / 0 leaked.)

**Cert row added** to `certificationSeed.ts` (`SMOKE-WRITE-34`, `LIVE_PASS_CLEANED`,
2026-06-26). **Matrix:** `update_document` NOT_RUN → LIVE_PASS. Totals now **298 registered
/ 120 LIVE_PASS / 26 not-run / 152 missing / 0 fail / 0 bug**; google-docs **5 / 3 / 0 /
2** — only the policy-excluded `share_document` (sharing) + `export_document` (bytes)
remain. Re-verified: `--cert` shows `PASS_CLEAN google-docs:update_document (2026-06-26)`;
`tests/unit/smoke-actions` 381 pass; `tsc` exit 0; eslint 0; `lint:structure` OK.

## 9. Update — native logic actions LIVE-CERTIFIED (2026-06-26, same day)

Greened the safest NOT_RUN frontier: the **native** logic actions. They take NO provider
credentials, so they were the smallest safe batch. Ran the narrowest scoped live READ
sweep (no write/destructive gates needed — native is read-class):

```
ALLOW_DB_INTEGRATION_TESTS=true ALLOW_LIVE_PROVIDER_SMOKE=true \
SMOKE_PROVIDER=native SMOKE_NATIVE_HTTP_URL=https://example.com \
npm run smoke:actions:run:workflow:live
```

**Live result — 5 pass / 0 fail / 0 skip (Gate OK):** `native:delay`,
`native:format_transformer`, `native:http_request`, `native:if_then_condition`,
`native:router` each ran as a real TERMINAL workflow run in engine REAL mode. Read-class:
no external resource created, so created/cleaned/leaked is N/A.

**Cert rows added (4)** — `native:delay`, `native:if_then_condition`, `native:router`,
`native:http_request` → `LIVE_PASS` (2026-06-26). **`native:format_transformer` is
deliberately left NOT_RUN** — it is the always-run uncertified baseline that proves the
live harness path is real every sweep (certification.test guards this).

**Matrix:** Totals now **298 registered / 124 LIVE_PASS / 22 not-run / 152 missing / 0
fail / 0 bug**; native **5 / 4 / 1 / 0**. Re-verified: `--cert` shows the 4 native
`LIVE_PASS` rows + `format_transformer` NOT_RUN; `tests/unit/smoke-actions` 381 pass;
`tsc` exit 0; eslint 0; `lint:structure` OK.

**Remaining 22 NOT_RUN** are all connected-account reads that self-skip without the
provider connected on the smoke account: `monday` (10), `stripe` reads (4 — read-only
finds, not the forbidden billing mutations), `google-analytics` (4 — account exposes no
GA property), `dropbox:search_files` (needs a query), `discord:fetch_messages`, plus
`slack:delete_message` (destructive, non-liveSafe — inventory/handler-only). Next safe
batch depends on connecting one of those providers on the smoke account.

## 10. Update — dropbox:search_files LIVE-CERTIFIED + connection probe (2026-06-26, same day)

Probed the remaining NOT_RUN frontier with the live read sweep (CERT-SKIPs the 124 already
passed → no re-calls; self-skips unconnected providers). **Connection status on the smoke
account:**

| Provider | NOT_RUN reads | Status this run |
|---|---|---|
| **dropbox** | `search_files` | **CONNECTED → PASS** (ran with `SMOKE_DROPBOX_QUERY=test`) |
| discord | `fetch_messages` | not connected → SKIP |
| monday | 10 reads | not connected → SKIP |
| stripe | 4 reads | not connected → SKIP (scoped `SMOKE_PROVIDER=stripe`: 0/0/4) |
| google-analytics | 4 reads | connected, but **no usable GA account/property** (selector `accountId` auto-discovery finds nothing) → SKIP |

**Selected batch: `dropbox:search_files`** — the only connected, runnable read left.

```
ALLOW_DB_INTEGRATION_TESTS=true ALLOW_LIVE_PROVIDER_SMOKE=true \
SMOKE_DROPBOX_QUERY=test npm run smoke:actions:run:workflow:live
```

**Live result:** `dropbox:search_files` → **PASS** (read-only name-search, one bounded page
of file metadata — no bytes/signed-URLs/content; nothing created/cleaned/leaked). The
free-text query is Dropbox's one non-auto-discoverable selector, so it ran with a benign
`SMOKE_DROPBOX_QUERY`.

**Cert row added (1):** `dropbox:search_files` → `LIVE_PASS` (2026-06-26). Dropbox reads
now complete (`list_folder` + `get_file_metadata` + `search_files`).

**Matrix:** Totals now **298 registered / 125 LIVE_PASS / 21 not-run / 152 missing / 0
fail / 0 bug**; dropbox **11 / 8 / 0 / 3** (the 3 missing are `upload`/`download` + the
sharing-link write — write/policy-excluded). Re-verified: `--cert`, `tests/unit/smoke-actions`
381 pass, `tsc` 0, eslint 0, `lint:structure` OK.

**Remaining 21 NOT_RUN are all blocked on connection/data, not on this lane:** monday (10)
+ stripe (4) + discord (1) need the provider connected on the smoke account;
google-analytics (4) needs a GA account/property on the connected account;
`slack:delete_message` stays non-liveSafe (inventory-only); `native:format_transformer`
stays the uncertified baseline. No safe live cert is possible for them until a provider is
connected — the next lane move would be MISSING_FIXTURE fixture-building (e.g. a safe
write batch with cleanup) rather than the NOT_RUN frontier.

## 11. Runnable NOT_RUN frontier EXHAUSTED + MISSING_FIXTURE cleanup feasibility (2026-06-26)

Re-probed the live read sweep (fresh): **1 pass** (the `format_transformer` baseline),
**20 skip**, **73 cert-skip**, Gate OK — i.e. every remaining NOT_RUN read self-skips and
`dropbox:search_files` now CERT-SKIPs. **There is no connected, runnable read-only NOT_RUN
action left to certify.** The 21 NOT_RUN break down exactly as: monday 10 + stripe 4 +
discord 1 (not connected on the smoke account), google-analytics 4 (connected, no usable
GA account/property), `slack:delete_message` (non-liveSafe), `native:format_transformer`
(intentional baseline). Unlocking any requires CONNECTING that provider on the smoke
account (or adding a GA property) — outside what this lane can do alone.

**MISSING_FIXTURE next-batch feasibility (verified this turn, so it isn't re-investigated):**

| Candidate (connected provider) | Cleanup path | Verdict |
|---|---|---|
| `trello:create_list` | none — Trello's registered actions have **no list-archive/close action** (only `archive_card`) | **DEFER** — no safe teardown |
| `trello:create_board` | none — **no board-delete action** registered | **DEFER** — no safe teardown |
| `microsoft-onenote:create_notebook` | none — Graph has no notebook DELETE | **DEFER** — no teardown |
| `microsoft-onenote:create_section` | none — Graph has no section DELETE | **DEFER** — no teardown |
| `microsoft-onenote:copy_page` | `delete_page` (certified hard-delete) + `get_page_content` verify | **FEASIBLE but not small** — async via the **Graph operations** endpoint; the existing `completeAsync` primitive targets OneDrive's `*.svc.ms` copy monitor, so it needs harness plumbing for the OneNote operations poll (its own slice) |
| `notion:create_database` | none — no archive-database action + no independent read-back | **DEFER** |

Everything else MISSING is forbidden (sends/billing/sharing-link) or policy-excluded
(bytes/signed-URL/block-content).

**Conclusion / recommended next slices (in order):**
1. **Connect a NOT_RUN provider on the smoke account** (monday / a Stripe test account /
   discord, or add a GA property) → unlocks 1–10 read certs each with zero fixture work.
2. **`microsoft-onenote:copy_page`** as its own slice — extend the smoke `completeAsync`
   poller to the OneNote Graph-operations endpoint, then author + live-cert (OneNote is
   connected; cleanup via certified `delete_page`).

No cert row added this turn (nothing safely runnable); no fixture authored (no
small/safe MISSING candidate). Matrix unchanged at **125 LIVE_PASS / 21 not-run / 152
missing**.

## 12. SMOKE-WRITE-35 — `microsoft-onenote:copy_page` authored, LIVE CERT BLOCKED (2026-06-26)

Built the async OneNote copy infrastructure and attempted a live cert. **Authored +
offline-validated, but NOT certified** — the live attempt did not produce a clean pass.

**Async monitor support added (host allow-list UNCHANGED):**
- New smoke-only seam `microsoft-onenote:copy_monitor`
  ([tests/smoke-actions/writeHarnessDeps/onenoteCopyMonitor.ts](../../../../tests/smoke-actions/writeHarnessDeps/onenoteCopyMonitor.ts)),
  registered in the reader composer. It polls the OneNote Graph **operations** endpoint
  (`graph.microsoft.com/v1.0/me/onenote/operations/{id}`) to terminal completion and
  returns only the copied `{ pageId }`.
- **No host allow-list widening:** the OneNote operation URL is on the exact Graph base
  host, which `isTrustedGraphMonitorUrl` already trusts. The OneDrive `*.svc.ms` /
  `*.sharepoint.com` suffixes are untouched.
- **Key difference from the OneDrive monitor:** the OneNote operations endpoint is
  **authenticated**, so the poll sends a bearer token via `refreshAndRetry` (vs
  OneDrive's unauthenticated pre-signed monitor). Reuses the pure `pollAsyncCopyCompletion`
  loop + budget unchanged.
- Fixture [tests/fixtures/action-smoke/microsoft-onenote/copy_page.ts](../../../../tests/fixtures/action-smoke/microsoft-onenote/copy_page.ts):
  setup `create_page` → execute `copy_page` (into the same smoke section) →
  `completeAsync` poll → verify `get_page_content` → `cleanupEach delete_page` (source +
  copy, hard delete). Offline gates green (391 unit smoke tests incl. 10 new poller tests,
  fixtures-valid, parity; tsc clean on touched files; eslint 0).

**Live command:**
```
ALLOW_DB_INTEGRATION_TESTS=true ALLOW_LIVE_PROVIDER_SMOKE=true \
ALLOW_LIVE_PROVIDER_WRITE_SMOKE=true ALLOW_DESTRUCTIVE_PROVIDER_SMOKE=true \
SMOKE_PROVIDER=microsoft-onenote SMOKE_MICROSOFT_ONENOTE_CONNECTED=1 npm run smoke:writes:live
```

**Live result — BLOCKED, NOT certified:**
- `copy_page` → **VERIFY_FAILED**: execute SUCCEEDED but `completeAsync` reported *"async
  execute returned no monitor URL to complete"* — the handler's `operationLocation` came
  back **empty/null** for this run, so the operation poll had no URL. (The write harness
  reads the persisted `step.output`, which preserves handler fields — OneDrive's
  `monitorUrl` reads fine the same way — so this is a genuinely-null `operationLocation`,
  not a harness-stripping artifact.) **Root cause not yet pinned** (per "don't guess"):
  candidates are (a) Graph returned 202 without an `Operation-Location` header under the
  current account state, or (b) copying a page into the **same** section it already lives
  in behaves differently (the harness discovers only ONE smoke section, so same-section
  copy is currently the only option).
- **Concurrent env instability:** the pre-existing certified `microsoft-onenote:update_page`
  and `delete_page` fixtures ALSO **FAILED** this run with Graph *"onenote page … not
  found: The specified resource ID does not exist"* immediately after creating the page —
  classic OneNote **create→read propagation lag**. The OneNote smoke account is currently
  unreliable for create-then-act flows, which undermines any copy_page cert attempt right
  now. (`create_page` alone PASSED.)

**Leak disclosure:** `copy_page`'s execute (the Graph copy POST) succeeded, so a copied
page was likely created server-side, but its id was never captured (null
`operationLocation`) → it is **untracked** and may remain in the smoke/test section
(marker-titled `crsmoke-…page`). The source page WAS cleaned (created 1 / cleaned 1). The
untracked copy should be swept from the smoke section. **Do not re-run `copy_page` live
until the `operationLocation` behavior is understood** — each failed run can leave one
untracked copy.

**Classification:** **env/provider blocker** (null `operationLocation` + OneNote
create→read lag), NOT a harness or fixture-logic bug (offline-validated). **No cert row
added.** Fixture stays **NOT_RUN**. Matrix: **125 LIVE_PASS / 22 not-run / 151 missing**
(copy_page MISSING_FIXTURE → NOT_RUN; no LIVE_PASS change).

**Next steps to unblock:** (1) instrument `pagesCopyToSection` to confirm whether Graph
returns 202 + `Operation-Location` for the smoke copy (synchronous-vs-async + same-section
question); (2) teach the live dev test to discover/create a SECOND smoke section so the
copy targets a DIFFERENT section; (3) re-run when the OneNote smoke account is not lagging
(create_page/update_page/delete_page all green again); then add the
`LIVE_PASS_CLEANED` row.

## 13. SMOKE-WRITE-35 unblock — ROOT CAUSE FOUND + FIXED, cert still deferred (2026-06-26)

Live-instrumented the OneNote copy (one-off diagnostic
[scripts/trash/onenote-copy-diagnose-and-sweep.ts](../../../../scripts/trash/onenote-copy-diagnose-and-sweep.ts),
marker-scoped to the smoke `[TEST]` section). **Root cause of the null `operationLocation`
— confirmed with evidence:**

- OneNote `copyToSection` returns **202 with the operation URL in the `Location` header,
  NOT `Operation-Location`** (the spec/most-Graph-ops header — absent here). The 202 BODY
  is a separate async-operation resource (`{ id, status:"not started" }`). The production
  wrapper read only `Operation-Location` → always `null` → copy un-pollable. **This was a
  real production bug** (workflow authors got a null operation URL too).
- **Further evidence:** GET-ing that `Location` URL returns the **copied PAGE resource
  itself** (`id, title, contentUrl, parentSection…`, HTTP 200 at +2s) — there is **no
  status-bearing operation endpoint to poll**. So the copy is effectively done as soon as
  the `Location` resolves; its page id is right there.

**Fixes (both verified live):**
1. **Production wrapper** [pagesCopyToSection.ts](../../../../integrations/microsoft-onenote/api/pagesCopyToSection.ts):
   `operationLocation = Operation-Location ?? Location` (prefer spec header, fall back to
   the one OneNote actually uses). +3 wrapper unit tests.
2. **Smoke seam** [onenoteCopyMonitor.ts](../../../../tests/smoke-actions/writeHarnessDeps/onenoteCopyMonitor.ts):
   `normalizeOneNoteOperation` now treats a **page-resource** body (no `status`, has `id`)
   as `completed` with `resourceId = body.id` (status checked first, so an operation
   resource's own id is never mistaken for a page id). +2 unit tests.

**Live verification (scoped `SMOKE_PROVIDER=microsoft-onenote`):** `copy_page` now runs
`setup ok → execute ok → async operation completed; resource captured → verify ok →
marker confirmed on read-back`. **The core blocker is solved** — async capture +
independent verification work end-to-end.

**Remaining blocker (why still NOT certified): OneNote create→delete propagation lag.**
`copy_page`'s `cleanupEach` deletes source + copy; one delete failed (`CLEANUP_FAILED`,
1 left) because a just-created page wasn't yet deletable. The pre-existing **certified**
`delete_page` fixture FAILED the **same** run with the same lag — so this is an
**environmental OneNote eventual-consistency** issue, not specific to `copy_page` (an
earlier run had all three of create/update/delete_page green; it is intermittent).

**Sweep:** after each run, swept the smoke section for `crsmoke-` pages —
**found N / deleted N / remaining 0** (re-confirmed stable at 0; nothing leaked).

**Cert decision:** NOT certified (per "do not certify yet", and cleanup did not reach
`remaining 0` for `copy_page`). Fixture stays **NOT_RUN**. Matrix unchanged: **125
LIVE_PASS / 22 not-run / 151 missing**.

**Next slice to certify:** add a **bounded, smoke-only delete retry** (retry-with-backoff
+ treat a 404 as already-cleaned/idempotent) to the write-harness cleanup step — this
absorbs the OneNote create→delete lag for BOTH `copy_page` and the flaky `delete_page`
fixture. Then a clean `copy_page` run (all phases ok, remaining 0) earns the
`LIVE_PASS_CLEANED` row. (The dual-section-copy idea from §12 is NOT needed — same-section
copy works fine; the only real issues were the `Location` header + delete lag.)
