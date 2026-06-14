/**
 * Shared base for the Builder AI client modules (split out of the original
 * monolithic `lib/api/ai.ts` in Slice 4.AI-REPAIR-CLEANUP-1 — refactor only, no
 * behavior change).
 *
 * Holds the transport plumbing (`postStructured` / `fetchJson` / `AiApiError`)
 * and the two genuinely cross-capability symbols (`AiOpaquePatch`,
 * `AI_CREDITS_EXHAUSTED_MESSAGE`). The capability modules
 * (`plan` / `thread` / `diagnostics` / `runRepair`) import from here; the public
 * surface is re-exported verbatim by the `lib/api/ai.ts` barrel.
 *
 * Both AI routes return a STRUCTURED result body (with an `ok` boolean) for
 * handled outcomes — including the non-2xx "handled failure" statuses (plan:
 * 503/502; apply: 428/409/400-with-code). `postStructured` returns those bodies
 * as results; it only THROWS `AiApiError` for transport-level failures whose body
 * has no `ok` (401 / 404 / 500 / bad-request validation).
 */

/** Opaque to the client — produced by the plan route, forwarded to apply. */
export type AiOpaquePatch = Record<string, unknown>;

/**
 * Slice 4.AI-CREDITS-3b-ii — the single user-facing copy for an AI-credit
 * exhaustion denial (route returns `code: "AI_CREDITS_EXHAUSTED"`, HTTP 402).
 * Shared by the failure renderer (`PlanFailure`) and the hook's `friendlyError`
 * so the message can't drift. Plain, safe copy: no account ids, no raw counters,
 * no plan internals, no upgrade CTA (paywall UI is a later slice).
 */
export const AI_CREDITS_EXHAUSTED_MESSAGE =
  "You've used all AI credits for this billing period. Try again after your credits reset, or upgrade your plan.";

export class AiApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AiApiError";
    this.status = status;
  }
}

function hasOkFlag(body: unknown): body is { ok: boolean } {
  return typeof body === "object" && body !== null && typeof (body as { ok?: unknown }).ok === "boolean";
}

/**
 * POST a structured-result AI request. Returns the parsed body when it carries
 * an `ok` flag (handled outcome, any status); throws `AiApiError` otherwise.
 */
export async function postStructured<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (hasOkFlag(parsed)) return parsed as T;
  const message =
    (parsed && typeof parsed === "object" && typeof (parsed as { error?: unknown }).error === "string"
      ? (parsed as { error: string }).error
      : null) ?? `AI request failed (HTTP ${res.status}).`;
  throw new AiApiError(message, res.status);
}

// Type-only alias for the `init` argument of `fetch()`. Inferring from
// `typeof fetch` avoids referencing the DOM `RequestInit` typename, which
// the eslint `no-undef` rule flags even in type position.
type FetchInit = Parameters<typeof fetch>[1];

export async function fetchJson<T>(url: string, init?: FetchInit): Promise<T> {
  const res = await fetch(url, init);
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const message =
      (parsed && typeof parsed === "object" && typeof (parsed as { error?: unknown }).error === "string"
        ? (parsed as { error: string }).error
        : null) ?? `Request failed (HTTP ${res.status}).`;
    throw new AiApiError(message, res.status);
  }
  return parsed as T;
}
