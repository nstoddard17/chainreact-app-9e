/**
 * Typed client for the async options API (Slice 3.30).
 *
 * Per project-structure-and-module-boundaries.md §5 + the workflow-
 * builder-ui rule: components and feature hooks call this module,
 * never `fetch()` directly. Errors carry a stable `code` so UIs can
 * branch.
 *
 * Mirrors the conventions of `lib/api/discovery.ts` and
 * `lib/api/workflows.ts` — same error class shape, same
 * content-type handling, same URL-encoding strategy.
 *
 * Plan reference: docs/slices/phase-3/options-source-plan.md.
 *
 * The client's union of `OptionsApiErrorCode` mirrors
 * `services/options/types.ts` `OptionsSourceErrorCode` value-for-
 * value. The duplication is intentional — the structural boundary
 * test forbids `lib/api/` from importing `services/`. Adding a new
 * code requires touching BOTH files (and adding a test that asserts
 * the route-side enum and the client-side enum stay in lockstep).
 */

/**
 * Stable, finite error union. KEEP IN SYNC with
 * `services/options/types.ts` `OptionsSourceErrorCode`.
 */
export type OptionsApiErrorCode =
  | "UNAUTHENTICATED"
  | "INTEGRATION_DISCONNECTED"
  | "SOURCE_NOT_FOUND"
  | "MISSING_DEPENDENCY"
  | "PROVIDER_ERROR"
  | "SERVER_ERROR"
  | "UNKNOWN";

/**
 * Mirror of `services/options/types.ts` `OptionItem`. Same field-by-
 * field shape so future renderers can hand items to combobox/select
 * primitives without coercion.
 */
export interface OptionItem {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
}

export interface OptionsApiSuccess {
  readonly ok: true;
  readonly source: string;
  readonly items: ReadonlyArray<OptionItem>;
  readonly hasMore: boolean;
}

export interface OptionsApiError {
  readonly ok: false;
  readonly source: string;
  readonly code: OptionsApiErrorCode;
  readonly message: string;
  readonly missingDependency?: string;
}

export type OptionsApiResponse = OptionsApiSuccess | OptionsApiError;

export interface FetchOptionsSourceArgs {
  /**
   * Trimmed search query. The route trims + length-caps too; sending
   * the un-trimmed text is fine but wastes URL bytes on every
   * keystroke. The hook (Slice 3.31) will hold the un-trimmed input
   * and let this client send it as-is.
   */
  readonly q?: string;
  /**
   * `dependsOn` parent values. Empty / whitespace-only values are
   * still serialized — the route trims and treats them as missing,
   * which is the same outcome as omitting the key.
   */
  readonly deps?: Readonly<Record<string, string>>;
  /**
   * Optional AbortSignal so the caller (typically the hook) can
   * cancel an in-flight fetch on dep change / unmount.
   */
  readonly signal?: AbortSignal;
}

/**
 * Build the URL for a given source key + query args. Exposed for
 * tests + future cache-key derivation. Pure function — no `fetch`,
 * no side effects.
 */
export function buildOptionsSourceUrl(
  source: string,
  args: FetchOptionsSourceArgs = {},
): string {
  const params = new URLSearchParams();
  if (args.q !== undefined && args.q.length > 0) {
    params.set("q", args.q);
  }
  if (args.deps) {
    for (const [parent, value] of Object.entries(args.deps)) {
      // Match the route's `deps[<parent>]` key encoding.
      params.set(`deps[${parent}]`, value);
    }
  }
  const qs = params.toString();
  const path = `/api/options/${encodeURIComponent(source)}`;
  return qs.length > 0 ? `${path}?${qs}` : path;
}

/**
 * Fetch one page of options for `source`. Returns the route's
 * discriminated body verbatim — the caller (hook) branches on
 * `ok: true | false` + `code` to drive renderer UX.
 *
 * Network / non-JSON failures are mapped to a synthetic
 * `OptionsApiError` with `code: "UNKNOWN"` so callers handle a single
 * union type regardless of whether the failure came from the route or
 * the transport. `AbortError` is the ONE exception — it re-throws
 * because the caller (typically a hook with an AbortController)
 * relies on the throw to detect canceled fetches without overwriting
 * newer state.
 */
export async function fetchOptionsSource(
  source: string,
  args: FetchOptionsSourceArgs = {},
): Promise<OptionsApiResponse> {
  const url = buildOptionsSourceUrl(source, args);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      ...(args.signal !== undefined && { signal: args.signal }),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      // Surface aborts to the caller — they own the new state.
      throw err;
    }
    return {
      ok: false,
      source,
      code: "UNKNOWN",
      message: "Network error. Try again.",
    };
  }

  // 401 lands as `UNAUTHENTICATED` per the `requireUser()` contract.
  if (res.status === 401) {
    return {
      ok: false,
      source,
      code: "UNAUTHENTICATED",
      message: "Please sign in.",
    };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return {
      ok: false,
      source,
      code: res.ok ? "UNKNOWN" : "SERVER_ERROR",
      message: `Couldn't read response (HTTP ${res.status}).`,
    };
  }

  // Route returns the discriminated body verbatim. Validate the
  // shape so a stale / wrong response surface doesn't crash the
  // hook.
  if (!body || typeof body !== "object" || !("ok" in body)) {
    return {
      ok: false,
      source,
      code: "UNKNOWN",
      message: "Unexpected response shape.",
    };
  }
  return body as OptionsApiResponse;
}
