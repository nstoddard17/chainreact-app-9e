import type { IntegrationRecord } from "@/repositories/integrations";

/**
 * Server-side types for the async `optionsSource` infrastructure
 * (Slice 3.30). The whole module under `services/options/` is server-
 * only — never importable from client code (`features/`, `components/`,
 * `lib/api/`, etc.). The structural boundary test
 * `tests/structure/client-server-boundary.test.ts` already catches
 * client-side imports of `services/*`.
 *
 * Plan reference: docs/slices/phase-3/options-source-plan.md.
 *
 * Design notes carried in via the Slice 3.29 plan:
 *   - OptionItem stays minimal — `{value, label, description?}` —
 *     mirroring `FieldOptionSchema` from `contracts/actionMeta.ts`.
 *     `group` / `icon` / `disabled` / `metadata` are explicitly out of
 *     scope until a real consumer demands them.
 *   - The discriminated response shape (`ok: true | false`) lets the
 *     client surface error codes per-state without HTTP-status guessing.
 *   - The error-code enum is finite and closed; renderers map each
 *     value to a distinct UX (loading / disconnected / "select parent
 *     first" / provider error + retry / etc.).
 *   - Resolvers never throw raw provider response bodies or tokens;
 *     they re-classify failures as `PROVIDER_ERROR` with a sanitized
 *     message.
 */

/**
 * Canonical option-item shape returned to the client. Matches the
 * static `FieldOptionSchema` so async option-source items render
 * through the same combobox/select primitives without a coercion
 * shim.
 */
export interface OptionItem {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
}

/**
 * Finite, closed enum of error codes returned in the route's discriminated
 * `ok: false` body. Renderers map each code to a distinct UX. New codes
 * MUST be added here AND in `lib/api/options.ts` together (the client
 * mirrors the same union).
 */
export type OptionsSourceErrorCode =
  | "UNAUTHENTICATED"
  | "INTEGRATION_DISCONNECTED"
  | "SOURCE_NOT_FOUND"
  | "MISSING_DEPENDENCY"
  | "PROVIDER_ERROR"
  | "SERVER_ERROR"
  | "UNKNOWN";

/**
 * Stable HTTP response shape (success arm). The route echoes the
 * `source` key in both arms so log scraping + future client-side
 * cache keys are trivial.
 */
export interface OptionsSourceSuccess {
  readonly ok: true;
  readonly source: string;
  readonly items: ReadonlyArray<OptionItem>;
  readonly hasMore: boolean;
}

/**
 * Stable HTTP response shape (error arm). `missingDependency` is only
 * set when `code === "MISSING_DEPENDENCY"` so renderers can surface
 * the parent-field name to the author.
 */
export interface OptionsSourceError {
  readonly ok: false;
  readonly source: string;
  readonly code: OptionsSourceErrorCode;
  readonly message: string;
  readonly missingDependency?: string;
}

export type OptionsSourceResponse = OptionsSourceSuccess | OptionsSourceError;

/**
 * Resolver-side typed failure. Resolvers throw this with one of the
 * non-`SERVER_ERROR` codes when they can classify the failure (e.g.
 * provider returned 4xx → `PROVIDER_ERROR`). Anything else uncaught
 * is mapped to `SERVER_ERROR` by the route.
 *
 * The constructor's `message` MUST be safe to ship to the browser —
 * no token leakage, no raw provider response bodies. Use a static
 * caller-friendly string ("Couldn't load Slack channels. Try again.")
 * not a passthrough of the provider's error.
 */
export class OptionsResolverError extends Error {
  readonly code: Exclude<OptionsSourceErrorCode, "SERVER_ERROR" | "UNAUTHENTICATED">;
  constructor(
    code: Exclude<OptionsSourceErrorCode, "SERVER_ERROR" | "UNAUTHENTICATED">,
    message: string,
  ) {
    super(message);
    this.name = "OptionsResolverError";
    this.code = code;
  }
}

/**
 * Workflow provenance threaded into an options request when the caller
 * supplies a `workflowId` (Slice 4.ACCOUNT-MODEL-22D-1).
 *
 * PLUMBING ONLY. This carries the workflow's `created_by_user_id` so a LATER
 * slice (22D-2) can apply the creator-pinned credential policy for personal
 * providers (see `core/integrations/credentialSharing.ts` + the 22B execution
 * pin). In 22D-1 NOTHING consumes this for credential resolution — the route
 * and the AI options tool still resolve the caller's personal-account
 * integration exactly as before, so behavior is unchanged.
 */
export interface WorkflowCreatorContext {
  readonly workflowId: string;
  readonly createdByUserId: string;
}

/**
 * Server-side resolver context built by the route before invocation.
 *   - `integration` is always present when the resolver declares
 *     `requiresIntegration: true`; the route returns
 *     `INTEGRATION_DISCONNECTED` upstream if no active row exists.
 *   - `q` is trimmed, length-capped, never `undefined`.
 *   - `deps` is always defined; absent dependsOn values are simply
 *     missing keys. The route also validates `requiredDeps` upstream
 *     and short-circuits with `MISSING_DEPENDENCY` before resolver
 *     dispatch.
 *   - `workflowCreator` is present ONLY when the caller supplied a
 *     `workflowId` that resolved to a visible workflow (Slice 22D-1).
 *     It is provenance for a future credential-policy slice (22D-2);
 *     resolvers MUST NOT consult it for credential resolution yet.
 */
export interface OptionsResolverContext {
  readonly userId: string;
  readonly integration: IntegrationRecord | null;
  readonly q: string;
  readonly deps: Readonly<Record<string, string>>;
  readonly workflowCreator?: WorkflowCreatorContext;
}

/**
 * Resolver return shape — same as the success-arm body minus the
 * route-known `source` echo. `hasMore` advertises that more items
 * exist beyond this single page; the v1 client/renderer use it as a
 * UI hint ("Showing first 200 — refine with search") rather than as
 * a pagination cursor.
 */
export interface OptionsResolverResult {
  readonly items: ReadonlyArray<OptionItem>;
  readonly hasMore: boolean;
}

/**
 * Resolver definition. Every resolver registers explicitly in
 * `services/options/_registry.ts`. The registry validates `source`
 * format + duplicate rejection at module load.
 */
export interface OptionsResolver {
  /**
   * Canonical lookup key in `<provider>:<resource>` form. Examples:
   * `slack:channels`, `airtable:tables`, `native:examples` (test fixture).
   */
  readonly source: string;
  /**
   * Provider id matching the manifest registry. For native test
   * fixtures, `"native"`.
   */
  readonly provider: string;
  /**
   * When true, the route looks up the user's active integration via
   * `repositories/integrations.getActiveForExecution(userId, provider, null)`
   * and short-circuits with `INTEGRATION_DISCONNECTED` if no row is
   * found. The resolver then receives the row as `ctx.integration`.
   *
   * When false (native fixtures only in v1), the route skips the
   * lookup and passes `ctx.integration = null`.
   */
  readonly requiresIntegration: boolean;
  /**
   * Optional list of dependsOn field names the resolver requires.
   * The route validates each is present + non-empty in the
   * query-string `deps[*]` map BEFORE invoking the resolver and
   * short-circuits with `MISSING_DEPENDENCY` if any is missing.
   */
  readonly requiredDeps?: ReadonlyArray<string>;
  resolve(ctx: OptionsResolverContext): Promise<OptionsResolverResult>;
}

/**
 * Validates the `<provider>:<resource>` source key format. Mirrors the
 * `ActionMetaSchema` `key` regex constraint (lowercase, dash-or-
 * underscore-separated provider, lowercase + underscore resource).
 *
 * Exported so the registry can guard against malformed sources at
 * module load with a clear error.
 */
export const OPTIONS_SOURCE_KEY_REGEX = /^[a-z][a-z0-9_-]*:[a-z][a-z0-9_]*$/;
