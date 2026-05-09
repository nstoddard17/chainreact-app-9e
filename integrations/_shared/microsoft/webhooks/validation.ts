/**
 * Microsoft Graph webhook validation-handshake helper — shared across
 * every Microsoft webhook receive route.
 *
 * Microsoft Graph performs a synchronous validation handshake when a
 * subscription is created OR renewed: it POSTs to the configured
 * `notificationUrl` (or `lifecycleNotificationUrl`) with a
 * `?validationToken=<token>` query parameter, and waits up to 10
 * seconds for the route to echo the token back as `text/plain` 200.
 * If the route fails or times out, the parent subscription operation
 * fails with a 4xx error.
 *
 * Some Microsoft tooling sends the validation token as the request
 * body with `Content-Type: text/plain` and NO query parameter. V1's
 * webhook route handles this; V2 mirrors via the body fallback.
 *
 * **Critical:** validation must NOT do DB I/O. Microsoft's 10-second
 * budget is hard. The helper is pure-Request — it consumes the body
 * (so callers receive both the validation result AND the body text
 * for downstream JSON parsing).
 *
 * Slice 7: extracted from inline logic in
 * `integrations/microsoft-outlook/webhooks/receive.ts`.
 */

export interface ValidationCheckResult {
  /**
   * The validation token Microsoft expects echoed back, OR `null` if
   * this is a notification request (not a validation handshake).
   */
  validationToken: string | null;
  /**
   * The request's body text. Already consumed via `request.text()` so
   * downstream callers MUST use this rather than re-reading from the
   * Request (a Request body can be consumed at most once).
   */
  bodyText: string;
}

export async function checkValidationHandshake(
  request: Request,
): Promise<ValidationCheckResult> {
  const url = new URL(request.url);
  const queryToken =
    url.searchParams.get("validationToken") ??
    url.searchParams.get("validationtoken");

  if (queryToken) {
    // Don't read the body — query-token validation is the common case
    // and skipping the body read keeps validation latency minimal.
    return { validationToken: queryToken, bodyText: "" };
  }

  // Some Microsoft tooling posts the validation token as the body with
  // Content-Type: text/plain. Honor that fallback before treating the
  // body as a notification envelope.
  const contentType = request.headers.get("content-type") ?? "";
  const bodyText = await request.text();
  if (contentType.toLowerCase().includes("text/plain") && bodyText.trim()) {
    return { validationToken: bodyText, bodyText };
  }

  return { validationToken: null, bodyText };
}
