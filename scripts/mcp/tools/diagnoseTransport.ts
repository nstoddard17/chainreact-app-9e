/**
 * Internal MCP server — shared transport for the LIVE (Plane-B) diagnostic tools.
 *
 * IMPORT FENCE — LOCAL + `node`-runtime globals only (`fetch`, `AbortController`,
 * `setTimeout`). NEVER imports app code, services, repositories, or Supabase. Every
 * live diagnostic tool POSTs JSON here and renders the already-sanitized DTO.
 *
 * Config (env, never hardcoded):
 *   MCP_DIAGNOSTICS_URL    base origin of the app (default http://127.0.0.1:3000
 *                          — local/dev, NEVER production by default).
 *   MCP_DIAGNOSTICS_TOKEN  bearer matching the app's DIAGNOSTICS_API_TOKEN.
 *                          Distinct from MCP_HTTP_TOKEN.
 *
 * Extracted from `diagnoseLive.ts` for file-size hygiene as the live-tool set grew.
 */

const DEFAULT_URL = "http://127.0.0.1:3000";
const REQUEST_TIMEOUT_MS = 20_000;

function baseUrl(): string {
  const raw = (process.env.MCP_DIAGNOSTICS_URL ?? "").trim();
  return raw.length > 0 ? raw.replace(/\/+$/, "") : DEFAULT_URL;
}

/** Result of the shared POST: either a parsed DTO or a ready-to-return message. */
export type PostResult<T> = { ok: true; dto: T } | { ok: false; message: string };

/**
 * Shared transport for every Plane-B tool: check the token, POST JSON with the
 * bearer, and map transport / gate statuses to a helpful message. Returns the
 * parsed DTO on 200. Never throws.
 */
export async function postDiagnostic<T>(
  path: string,
  payload: Record<string, unknown>,
): Promise<PostResult<T>> {
  const token = (process.env.MCP_DIAGNOSTICS_TOKEN ?? "").trim();
  if (!token) {
    return {
      ok: false,
      message:
        "Error: MCP_DIAGNOSTICS_TOKEN is not set. Set it (matching the app's " +
        "DIAGNOSTICS_API_TOKEN) to use live diagnostics. This is a developer tool; " +
        "the live diagnostics route is OFF by default.",
    };
  }

  const url = `${baseUrl()}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      message:
        `Could not reach the diagnostic API at ${url}. Is the app running and is ` +
        `MCP_DIAGNOSTICS_URL correct? (${reason})`,
    };
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401) {
    return {
      ok: false,
      message:
        "The diagnostic API rejected the request (401). Check that " +
        "MCP_DIAGNOSTICS_TOKEN matches the app's DIAGNOSTICS_API_TOKEN.",
    };
  }
  if (res.status === 404) {
    return {
      ok: false,
      message:
        "Live diagnostics are disabled or not found (404). On the app, set " +
        "DIAGNOSTICS_API_ENABLED=1 (and DIAGNOSTICS_API_ALLOW_PROD=1 in production) " +
        "to enable this read-only route.",
    };
  }
  if (res.status === 400) {
    return {
      ok: false,
      message:
        "The diagnostic API rejected the input (400). Check the required fields " +
        "for this tool (see its description).",
    };
  }
  if (res.status !== 200) {
    return { ok: false, message: `The diagnostic API returned an unexpected status ${res.status}.` };
  }

  try {
    return { ok: true, dto: (await res.json()) as T };
  } catch {
    return { ok: false, message: "The diagnostic API returned a non-JSON body." };
  }
}
