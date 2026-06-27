/**
 * Action smoke harness — fixture CONTRACT (Jest-runtime side).
 *
 * The full typed fixture lives here (the offline CLI only parses the
 * provider/action/risk/requiredEnv subset from text — see
 * scripts/chainreact/smoke/inventory.ts). A fixture describes ONE registered
 * action: the config to run it with, the upstream/trigger context that config
 * resolves against, the env it needs for a real run, and the expected outcome.
 *
 * Risk classes (shared with the CLI core):
 *   - read        — no external mutation (lists, gets, pure transforms).
 *   - write       — creates/updates external state (send message, create record).
 *   - destructive — hard-to-reverse data loss (delete/purge). Never run unless
 *                   the operator opts in with --include-destructive.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { ActionRisk } from "@/scripts/chainreact/smoke/core";

export type { ActionRisk } from "@/scripts/chainreact/smoke/core";

export interface ActionSmokeExpectation {
  /** What a real run should produce. */
  readonly outcome: "success" | "failure";
  /** When outcome is "failure", require the thrown message to include this. */
  readonly errorIncludes?: string;
}

/**
 * Write-harness safety class (richer than `risk` / `liveRisk`). Decides which
 * live opt-ins a MUTATING fixture needs and whether it can be live-smoked at all.
 * See docs/slices/phase-4/readiness/write-smoke-harness-design.md.
 *   - writeSafe        — creates/updates only a throwaway resource the run owns;
 *                        can verify + clean up. Needs the write gate.
 *   - sendSafe         — sends/notifies; can ONLY target a controlled smoke
 *                        destination (env-pinned channel/mailbox). No provider
 *                        cleanup (a sent message is delivered). Needs the write gate.
 *   - destructiveSafe  — deletes/archives only a resource created by the SAME run.
 *                        Needs the write + destructive gates AND a smoke-owned
 *                        ledger resource.
 *   - billingSensitive — charges / customers / subscriptions. SKIPPED
 *                        (SANDBOX_REQUIRED) unless a dedicated test-mode account
 *                        is confirmed via `requiresSandboxEnv`.
 *   - neverLive        — cannot be safely live-smoked (irreversible external
 *                        broadcast / real-world effect). UNSAFE_NO_HARNESS;
 *                        unit/integration only.
 */
export type WriteLiveClass =
  | "writeSafe"
  | "sendSafe"
  | "destructiveSafe"
  | "billingSensitive"
  | "neverLive";

/**
 * How to read created external id(s) out of a step's output into the ledger.
 * Exactly ONE of `idPath` (single resource) or `idsPath` (multiple resources)
 * must be set.
 */
export interface CaptureSpec {
  /** Stable key the ledger stores this resource under (referenced by later steps). */
  readonly resourceKey: string;
  /**
   * SINGLE-resource capture. Dot-path into the step output holding the external id
   * (e.g. "id", "page.id"). The id is recorded under `resourceKey`, referenced
   * later as `{{ledger.<resourceKey>.id}}`.
   */
  readonly idPath?: string;
  /**
   * MULTI-resource capture. Dot-path to an ARRAY of created resources in the step
   * output (e.g. "records" for `create_multiple_records`'s `{records:[{id},...]}`).
   * Each element's id (from `idField`, default "id") is recorded under a distinct
   * derived key `<resourceKey><index>` (e.g. `record0`, `record1`) — referenced
   * later as `{{ledger.record0.id}}` AND fanned over by `verifyEach`/`cleanupEach`
   * via the `{{each.id}}` token. Mutually exclusive with `idPath`.
   */
  readonly idsPath?: string;
  /** Id field within each `idsPath` array element (default "id"). */
  readonly idField?: string;
  /** Human kind label for the report (e.g. "record", "page", "card"). NEVER the id. */
  readonly kind: string;
}

/**
 * A registered action run as a setup / verify / cleanup step. Its config may
 * reference the run marker via `{{smokeMarker}}` and a prior captured id via
 * `{{ledger.<resourceKey>.id}}` — resolved by the harness (not the engine).
 */
export interface ActionStepSpec {
  readonly provider: string;
  readonly action: string;
  readonly config: Readonly<Record<string, unknown>>;
  /** When this step creates a resource, how to capture its id into the ledger. */
  readonly captureResource?: CaptureSpec;
  /**
   * Dot-path into THIS step's output that must contain the unique smoke marker.
   * Used on a VERIFY (read-back) step to prove the marker on the persisted
   * resource — stronger than "the id exists". Mismatch / missing -> VERIFY_FAILED.
   * Env tokens (`{{env.*}}`) are resolved in the path.
   */
  readonly markerPath?: string;
  /**
   * Optional suffix appended to the run marker for the `markerPath` check, so a
   * read-back can prove a SPECIFIC value (not just "our marker is present"). E.g.
   * an update writes `{{smokeMarker}}updated`; `markerSuffix: "updated"` makes the
   * check require `crsmoke-<token>-updated` — a "seed" record (same run marker, no
   * "updated") then fails, proving the update actually landed. Absent -> the check
   * uses the bare run marker (presence only).
   */
  readonly markerSuffix?: string;
  /**
   * Assert that the scalar at `path` in THIS step's (read-back) output equals
   * `value`. Used to verify a STATE CHANGE the run marker cannot prove — e.g.
   * `{ path: "archived", value: true }` after archive_page, where the action's
   * own output hard-codes the flag (so only an INDEPENDENT read-back proves it).
   * Booleans/numbers compare strictly; a string `value` is token-resolved
   * (`{{env.*}}` / `{{smokeMarker}}`) first. Mismatch / missing -> VERIFY_FAILED.
   */
  readonly expectEquals?: {
    readonly path: string;
    readonly value: string | number | boolean;
  };
  /**
   * Assert that the ARRAY at `path` in THIS step's (read-back) output CONTAINS
   * `value`. Used to verify MEMBERSHIP by independent read-back rather than input
   * echo — e.g. `{ path: "idLabels", value: "{{env.SMOKE_TRELLO_LABEL_ID}}" }`
   * after add_label_to_card. The `value` string is token-resolved first. Missing
   * path / value absent -> VERIFY_FAILED.
   */
  readonly expectContains?: {
    readonly path: string;
    readonly value: string;
  };
  /**
   * Assert that the value at `path` in THIS step's (read-back) output is a
   * NON-EMPTY array. Used to verify a side effect whose content the smoke marker
   * cannot prove because the provider transforms it — e.g. Airtable REHOSTS an
   * uploaded attachment (the URL/filename we sent is replaced), so the only honest
   * proof is "the attachment field is now a populated array". `path` is token-
   * resolved (`{{env.*}}` / `{{smokeMarker}}`) like `markerPath`, so a dynamic
   * field name (`fields.{{env.SMOKE_AIRTABLE_ATTACHMENT_FIELD}}`) resolves. When
   * `elementHasKey` is set, EVERY element must also carry a truthy value at that
   * key (the strongest stable provider property — e.g. an attachment `id`).
   * Empty / missing / non-array -> VERIFY_FAILED.
   */
  readonly expectNonEmptyArray?: {
    readonly path: string;
    readonly elementHasKey?: string;
  };
  /**
   * Assert that the value at `path` in THIS step's (read-back) output is PRESENT
   * but EMPTY — proving a CLEAR / blank side effect that no marker can show (e.g.
   * `google-sheets:clear_range` then `get_cell_value` returns `value: null`). The
   * read-back contract must EXPOSE the path: every path segment must exist in the
   * output, and the terminal value must be one of `null` / `undefined` / `""`
   * (empty string) / `[]` (empty array). A MISSING path (any segment absent) is
   * NOT treated as empty — arbitrary object absence can never vacuously pass, so a
   * typo'd path or a sparse read-back FAILS rather than false-passing. A non-empty
   * scalar / populated array / object is NOT empty -> VERIFY_FAILED. (The read-back
   * STEP failing — a permission/API error — already fails before assertions run, so
   * an error is never read as "cleared".) `path` is token-resolved like `markerPath`.
   */
  readonly expectEmpty?: {
    readonly path: string;
  };
  /**
   * Assert that the JSON-serialized value at `path` in THIS step's (read-back) output
   * does NOT contain `value` — proving a REMOVAL the marker cannot (e.g. after
   * `delete_worksheet`, the deleted sheet's name is GONE from `get_worksheets`'
   * `worksheets`). The inverse of `markerPath`'s serialized-substring check, so it
   * works for a scalar OR a collection at `path`. `value` is token-resolved
   * (`{{smokeMarker}}` / `{{env.*}}` / `{{ledger.*}}`) first, so a marker-named target
   * resolves. When `value` is STILL present -> VERIFY_FAILED. (The read-back STEP
   * failing — a permission/API error — already fails before assertions run, so an error
   * is never read as "absent".) Pair with a presence assertion (e.g. `expectEquals`
   * on `count`) when a delete must ALSO prove the survivors are intact.
   */
  readonly expectAbsent?: {
    readonly path: string;
    readonly value: string;
  };
  /**
   * When true, this (verify) step is resolved by the SMOKE-ONLY read-back seam
   * (`WriteHarnessDeps.smokeReadBack`) rather than the registered-action engine
   * path — for providers that have no user-facing read action to verify against
   * (e.g. Trello card comments). `provider`/`action` name the smoke reader. The
   * step still goes through `markerPath` to confirm the marker on the provider's
   * INDEPENDENT read response (never the write echo).
   */
  readonly smokeRead?: boolean;
}

/**
 * Async-completion spec for an EXECUTE action that returns a PENDING long-running
 * operation (e.g. Microsoft Graph `/copy` -> `202 Accepted` + a monitor URL)
 * INSTEAD of the created resource's id. The harness reads the trusted monitor URL
 * out of the execute output at `monitorUrlPath`, polls it to TERMINAL completion via
 * the smoke-only read-back seam (`provider`/`action` select the poller), then
 * captures the completed resource id from the poll output into the ledger via
 * `captureResource` — so the subsequent verify + cleanup can target the REAL
 * created object. A missing monitor URL, a poll failure/timeout, or a completion
 * that yields no id is VERIFY_FAILED (the run never proceeds with an uncaptured
 * resource, so a verified-but-unowned object can never leak).
 *
 * This is SMOKE-ONLY: the production action stays honest (it returns "pending" and
 * does not poll). Nothing here changes runtime behavior.
 */
export interface AsyncCompletionSpec {
  /** Dot-path in the EXECUTE output holding the trusted provider monitor URL. */
  readonly monitorUrlPath: string;
  /** Smoke-only read-back seam (provider, action) that polls the monitor URL. */
  readonly provider: string;
  readonly action: string;
  /** How to record the COMPLETED resource id (from the poll output) into the ledger. */
  readonly captureResource: CaptureSpec;
}

/**
 * Mutation-smoke spec layered onto a fixture. Present only on write/destructive
 * fixtures; absent on read fixtures (the read path ignores it entirely).
 */
export interface WriteHarnessSpec {
  readonly liveClass: WriteLiveClass;
  /** Unique prefix stamped onto created names/text so leaked junk is recognizable. */
  readonly smokeMarker: string;
  /** Registered actions that create prerequisite throwaway resources. */
  readonly setup?: readonly ActionStepSpec[];
  /** How to capture the execute action's created resource id into the ledger. */
  readonly captureResource?: CaptureSpec;
  /**
   * Async-completion: when the EXECUTE action returns a PENDING operation + a
   * monitor URL (not the created id), poll the monitor URL to terminal completion
   * and capture the completed resource id into the ledger. See `AsyncCompletionSpec`.
   */
  readonly completeAsync?: AsyncCompletionSpec;
  /** A registered READ action keyed on a captured id (confirms the side effect). */
  readonly verify?: ActionStepSpec;
  /**
   * MULTI-resource verify: run once PER captured ledger resource (the ids from an
   * `idsPath` capture). Each iteration binds the reserved `{{each.id}}` token to one
   * captured id, then applies `markerPath` / `markerSuffix` / `expectEquals` /
   * `expectContains` to that record's INDEPENDENT read-back. ALL iterations must
   * pass or the run is VERIFY_FAILED. Fans over every captured ledger resource —
   * intended for a homogeneous multi-resource fixture (e.g. create/update_multiple).
   */
  readonly verifyEach?: ActionStepSpec;
  /**
   * MULTI-STEP verify: a LIST of INDEPENDENT read-back steps, each its own
   * registered read (or `smokeRead`) action with its own assertions (`markerPath` /
   * `markerSuffix` / `expectEquals` / `expectContains` / `expectNonEmptyArray` /
   * `expectEmpty`). EVERY step must pass or the run is VERIFY_FAILED. Mirrors
   * `setup: ActionStepSpec[]` on the verify side — for a side effect that needs
   * MULTIPLE bounded facts proven (e.g. `delete_row` shifts rows up: read A1 still ==
   * keep-before, A2 == the row that shifted up, A3 now empty — three independent
   * `get_cell_value` reads that together pin exactly which row was deleted). Runs in
   * addition to (after) any single `verify` / `verifyEach`. Each step's config is
   * token-resolved like every other step. Distinct from `verifyEach` (which fans ONE
   * template over captured ledger ids); these are heterogeneous, explicitly listed.
   */
  readonly verifyAll?: readonly ActionStepSpec[];
  /**
   * Dot-path into the EXECUTE output that should echo the unique smoke marker
   * (e.g. the created card's `name`). When set, the harness confirms the marker
   * round-tripped — a cheap existence+ownership check for pilots with no separate
   * read-back action. A mismatch is VERIFY_FAILED.
   */
  readonly markerEchoPath?: string;
  /**
   * The EXECUTE action under test IS the disposition — it removes the captured
   * ledger resource(s) (e.g. `delete_record`, `archive_card`). When true and the
   * execute step succeeds, the harness marks every `{{ledger.*}}` resource the
   * execute config references as cleaned and reports artifact "cleaned" (the
   * smoke object is gone) — no separate `cleanup` step runs (and none should be
   * declared). Verification still happens via an INDEPENDENT read-back proving the
   * resource is absent (the delete itself is never trusted). On execute FAILURE
   * the resource is left (honest leak); the run is already a gate failure.
   */
  readonly executeIsCleanup?: boolean;
  /** A registered destructive action keyed on a captured id (removes the resource). */
  readonly cleanup?: ActionStepSpec;
  /**
   * MULTI-resource cleanup: run once PER captured ledger resource, binding
   * `{{each.id}}` to each captured id (e.g. `delete_record` per record from an
   * `idsPath` capture). `cleanupKind` applies to each. Every captured resource must
   * clean for `artifact: "cleaned"`; ANY failure -> the run is not PASS_CLEANED
   * (delete-kind -> CLEANUP_FAILED, the gate fails). Partial cleanup is never a pass.
   */
  readonly cleanupEach?: ActionStepSpec;
  /**
   * What the cleanup action does to the smoke object — decides both whether
   * cleanup is REQUIRED for safety and how a leftover is reported:
   *   - "delete" (default when `cleanup` is set) — REQUIRED: a delete flow's
   *     safety claim depends on it. Success -> artifact "cleaned" (object gone);
   *     failure -> CLEANUP_FAILED (gate fail).
   *   - "archive" — BEST-EFFORT: success -> artifact "archived" (object persists,
   *     reversible); failure -> artifact "left", still PASS (harmless on a
   *     throwaway smoke account). Use for providers without a hard delete.
   * Absent + no `cleanup` -> the create intentionally leaves an artifact ("left").
   */
  readonly cleanupKind?: "delete" | "archive";
  /** billingSensitive only: env var that confirms a test-mode/sandbox account. */
  readonly requiresSandboxEnv?: string;
  /**
   * Allow `cleanup` / `cleanupEach` steps whose `provider` differs from the
   * provider that CREATED the targeted ledger resource — CROSS-PROVIDER cleanup.
   * Off by default: the harness REFUSES an un-declared cross-provider cleanup so a
   * typo'd provider can never silently run a destructive call against the wrong API.
   *
   * Use ONLY when the created resource genuinely lives in a sibling provider's
   * namespace within the SAME account family — e.g. a Google Docs document or a
   * Google Sheets spreadsheet IS a Google Drive file, so its `documentId` /
   * `spreadsheetId` is a Drive file id and the certified `google-drive:delete_file`
   * is the correct teardown (neither Docs nor Sheets has its own delete action).
   * The smoke-owned guard still applies — cleanup may only target a
   * `{{ledger.<key>.id}}` this run created — so cross-provider cleanup can never
   * touch a pre-existing foreign file. The ledger records the CREATING provider per
   * entry; the cleanup step records the cleanup provider, so the disposition stays
   * honest. See docs/runbooks/action-smoke-cli.md (cross-provider cleanup policy).
   */
  readonly crossProviderCleanup?: boolean;
}

export interface ActionSmokeFixture {
  /** Provider id — matches the integrations/<provider> folder + handler entry. */
  readonly provider: string;
  /** Action type — matches the registered handler `type` (e.g. send_channel_message). */
  readonly action: string;
  readonly risk: ActionRisk;
  /** Node config; may contain `{{trigger.*}}` / `{{nodeId.*}}` references. */
  readonly config: Readonly<Record<string, unknown>>;
  /** Upstream node outputs available for resolution (keyed by node id). */
  readonly variables?: Readonly<Record<string, unknown>>;
  /** Overrides merged over the default synthetic trigger event. */
  readonly triggerEvent?: Partial<TriggerEvent>;
  /**
   * Env vars a REAL run needs (test connection ids, tokens-by-proxy, channel
   * ids, …). If ANY is unset the run SKIPs (never fails) — this is how the
   * harness stays safe without connected-provider credentials.
   */
  readonly requiredEnv?: readonly string[];
  /**
   * Maps a config FIELD to an ENV VAR NAME. At run time the harness overlays the
   * env value onto `config[field]` (so a real channel id / base id comes from env,
   * never a hardcoded literal). Each mapped env var should also appear in
   * `requiredEnv` so a missing one SKIPs before any workflow is created.
   */
  readonly configFromEnv?: Readonly<Record<string, string>>;
  /**
   * Opt-in marker: may this fixture run in LIVE-connected workflow mode (real
   * provider call, not engine test mode)? Only `liveSafe: true` fixtures run when
   * the harness is in workflow-live mode — everything else SKIPs. Reserve this for
   * read-only or low-risk actions against a throwaway smoke resource. Absent /
   * false → never runs live. A destructive action must NEVER be liveSafe.
   */
  readonly liveSafe?: boolean;
  /**
   * Live-mode risk classification, gating which env opt-ins live mode requires:
   *   - "read"        — runs with ALLOW_LIVE_PROVIDER_SMOKE.
   *   - "write"       — also needs ALLOW_LIVE_PROVIDER_WRITE_SMOKE.
   *   - "destructive" — needs the destructive double-opt-in (includeDestructive +
   *                     ALLOW_DESTRUCTIVE_PROVIDER_SMOKE).
   * Defaults to `risk` when omitted (fail-safe: a write fixture can't be treated
   * as a read by forgetting to set it).
   */
  readonly liveRisk?: ActionRisk;
  readonly expect: ActionSmokeExpectation;
  /**
   * Mutation-smoke spec — present only on write/destructive fixtures run through
   * the write harness (tests/smoke-actions/writeHarness.ts). Absent on read
   * fixtures; the read path never looks at it. Additive: existing fixtures and
   * consumers are unaffected.
   */
  readonly writeHarness?: WriteHarnessSpec;
  /** Optional free-text note for the runbook / report context. */
  readonly notes?: string;
}

/** Live-mode risk for gating: explicit `liveRisk`, else fall back to `risk`. */
export function effectiveLiveRisk(fixture: ActionSmokeFixture): ActionRisk {
  return fixture.liveRisk ?? fixture.risk;
}

/**
 * Effective config = the fixture config with `configFromEnv` env values overlaid.
 * Only overlays present, non-empty env values; missing ones are expected to be
 * caught by the `requiredEnv` SKIP. Pure.
 */
export function resolveFixtureConfig(
  fixture: ActionSmokeFixture,
  envLookup: (name: string) => string | undefined,
): Readonly<Record<string, unknown>> {
  const overlay: Record<string, unknown> = {};
  for (const [field, envName] of Object.entries(fixture.configFromEnv ?? {})) {
    const v = envLookup(envName);
    if (v !== undefined && v !== "") overlay[field] = v;
  }
  return { ...fixture.config, ...overlay };
}

/** Identity helper that pins the fixture type at authoring time. */
export function defineActionSmokeFixture(fixture: ActionSmokeFixture): ActionSmokeFixture {
  return fixture;
}

/**
 * Identity helper for a MUTATING fixture — pins the fixture type AND requires the
 * `writeHarness` spec at authoring time (a write fixture without a phase plan is
 * an authoring bug). Returns the same widened `ActionSmokeFixture` so it drops
 * into `ALL_SMOKE_FIXTURES` unchanged.
 */
export function defineWriteSmokeFixture(
  fixture: ActionSmokeFixture & { readonly writeHarness: WriteHarnessSpec },
): ActionSmokeFixture {
  return fixture;
}

export function fixtureKey(fixture: Pick<ActionSmokeFixture, "provider" | "action">): string {
  return `${fixture.provider}:${fixture.action}`;
}
