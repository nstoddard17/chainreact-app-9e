import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { MAILCHIMP_API_VERSION, mailchimpApiOrigin } from "./_base";
import {
  ConflictError,
  NotFoundError,
  surfaceMailchimpError,
} from "../errors";

/**
 * Shared HTTP request helper for Mailchimp Marketing API v3 wrappers.
 *
 * Slice 14 Commit 3. Mirrors `_shared/hubspot/api/_request.ts` and
 * `_shared/shopify/api/_request.ts` shape — thin per-resource
 * wrappers (members.ts, segments.ts, lists.ts) construct path + body
 * and delegate to this helper for HTTP semantics + auth + error
 * mapping + dc-routing.
 *
 * **Per-datacenter routing.** Every API call needs the user's `dc`
 * value (e.g. `"us21"`) to construct the host. The helper requires it
 * as a first-class input — there is no default. Action handlers
 * thread it from the integration row's `accountMetadata.dc` (captured
 * during OAuth callback in Commit 2). Empty / null dc throws
 * `MissingDataCenterError` via `mailchimpApiOrigin`.
 *
 * Wire-format:
 *   - `Authorization: Bearer <token>` — standard OAuth2 bearer. The
 *     token is the user's decrypted access token from
 *     `integrations.access_token_encrypted`, threaded by
 *     `refreshAndRetry`'s `apiCall` callback.
 *   - `Content-Type: application/json` — Mailchimp Marketing v3 uses
 *     JSON in/out. Form-encoded is NOT supported.
 *   - `Accept: application/json` — defensive; Mailchimp defaults to JSON.
 *
 * Body handling:
 *   - GET / DELETE: no body. Query params attached via `URLSearchParams`
 *     in the optional `query` field.
 *   - POST / PATCH / PUT: the `body` object is JSON-stringified
 *     verbatim. `null` / `undefined` field values are dropped at the
 *     wrapper layer (per-resource files), not here.
 *
 * Error mapping:
 *   - 401 → `Unauthorized401Error` (caught by `refreshAndRetry`). For
 *     Mailchimp the wrapper's `refreshToken()` throws
 *     `RefreshNotSupportedError` so 401s surface as
 *     `IntegrationActionRequiredError(reason: "refresh_not_supported")`
 *     — user sees a "reconnect Mailchimp" prompt. Same shape as
 *     Slack / Notion / Shopify / GitHub.
 *   - 404 → `NotFoundError(resource)`. Resource label gives the caller
 *     a stable, user-meaningful string.
 *   - 409 → `ConflictError(resource, body)`. Mailchimp returns 409 for
 *     "Member Exists" on member-create paths and for duplicate-tag /
 *     duplicate-segment on segment paths. Slice 14 Commit 3's
 *     `add_subscriber` uses PUT (upsert) so the wrapper itself avoids
 *     409, but the typed shape is exposed for future actions.
 *   - 400 → also wrapped as `ConflictError` when Mailchimp returns the
 *     classic "Member Exists" envelope; the wire status code for that
 *     specific case is 400 (NOT 409) per current Mailchimp docs. We
 *     promote 400 with `title: "Member Exists"` to ConflictError so
 *     the caller's conflict-detection branch fires consistently.
 *   - Other non-OK → generic `Error("Mailchimp <method> <path>
 *     failed: <message>")`. The Mailchimp error envelope's
 *     `detail`/`title` field is extracted via `surfaceMailchimpError`.
 */

export interface MailchimpRequestInput {
  /** Decrypted access token from the integration row. */
  accessToken: string;
  /**
   * Datacenter prefix from `integrations.accountMetadata.dc` (e.g.
   * `"us21"`). REQUIRED — empty / null throws `MissingDataCenterError`.
   */
  dc: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /**
   * Path relative to the Mailchimp v3 base (`/3.0/`). MUST start with
   * a leading slash. The helper prepends the `/3.0/` versioned segment;
   * callers pass paths like `"/lists/abc/members/<hash>"`.
   */
  path: string;
  /** Optional query parameters appended to the URL. */
  query?: URLSearchParams;
  /**
   * Optional JSON body object. Stringified verbatim — drop nulls /
   * undefineds at the wrapper layer if needed. Pass `undefined` for
   * GET / DELETE / endpoints that take no body.
   */
  body?: Readonly<Record<string, unknown> | readonly unknown[]>;
  /**
   * Resource label for `NotFoundError` / `ConflictError`. Pass a
   * stable, user-meaningful string like `"subscriber a@b.com"`,
   * `"segment 12345"`, or `"audience (create)"`.
   */
  resourceForNotFound: string;
}

/**
 * Mailchimp's "Member Exists" failure mode arrives as HTTP 400 with
 * `title: "Member Exists"` in the error envelope — NOT 409. Detect
 * this shape so callers' conflict-detection branches fire on the
 * real semantic event regardless of wire-status quirk.
 */
function isMemberExistsBody(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return typeof parsed.title === "string" && parsed.title === "Member Exists";
  } catch {
    return false;
  }
}

export async function mailchimpRequest<T>(
  input: MailchimpRequestInput,
): Promise<T> {
  const origin = mailchimpApiOrigin(input.dc);
  const normalizedPath = input.path.startsWith("/")
    ? input.path
    : `/${input.path}`;
  const queryString = input.query ? input.query.toString() : "";
  const url = `${origin}/${MAILCHIMP_API_VERSION}${normalizedPath}${
    queryString ? `?${queryString}` : ""
  }`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.accessToken}`,
    Accept: "application/json",
  };

  let bodyString: string | undefined;
  if (input.body !== undefined) {
    headers["Content-Type"] = "application/json";
    bodyString = JSON.stringify(input.body);
  }

  const res = await fetch(url, {
    method: input.method,
    headers,
    body: bodyString,
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      `Mailchimp ${input.method} ${input.path} returned HTTP 401`,
    );
  }
  if (res.status === 404) {
    const text = await res.text().catch(() => "");
    throw new NotFoundError(
      input.resourceForNotFound,
      surfaceMailchimpError(text, 404),
    );
  }
  if (res.status === 409) {
    const text = await res.text().catch(() => "");
    throw new ConflictError(input.resourceForNotFound, text);
  }
  if (res.status === 400) {
    const text = await res.text().catch(() => "");
    if (isMemberExistsBody(text)) {
      // Mailchimp's "Member Exists" arrives as HTTP 400, not 409.
      // Promote to ConflictError so callers can match on a single
      // typed shape rather than sniffing the wire envelope themselves.
      throw new ConflictError(input.resourceForNotFound, text);
    }
    throw new Error(
      `Mailchimp ${input.method} ${input.path} failed: ${surfaceMailchimpError(text, 400)}`,
    );
  }
  if (res.status === 204) {
    // No content — caller chose a void return shape. JSON.parse would
    // fail on the empty body. Treat as "{}".
    return {} as T;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Mailchimp ${input.method} ${input.path} failed: ${surfaceMailchimpError(text, res.status)}`,
    );
  }

  // Read once: Mailchimp Marketing v3 always returns JSON on 2xx with
  // content.
  return (await res.json()) as T;
}
