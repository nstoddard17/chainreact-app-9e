import { NextResponse } from "next/server";
import { requireUser } from "@/app/api/providers/_shared";
import {
  fetchGeoapifyAutocomplete,
  GEOAPIFY_MIN_QUERY_LENGTH,
  type LocationSuggestion,
} from "@/services/geoapify/autocomplete";

/**
 * GET /api/geoapify/autocomplete?q=<query> — server proxy for Geoapify Address
 * Autocomplete, backing the `location` config-field type.
 *
 * Why a proxy: the Geoapify API key is a server-only secret
 * (`process.env.GEOAPIFY_API_KEY`). The browser must NEVER receive, import, or
 * bundle it. The client field calls this route; this route calls Geoapify with
 * the key and returns only sanitized suggestions.
 *
 * Stable body (always HTTP 200 except the 401 auth gate):
 *   { suggestions: Array<{ label, placeId?, lat?, lon? }>, degraded?: true }
 *
 * `degraded: true` signals the field should behave as plain free text:
 *   - key not configured,
 *   - query too short (the field also skips client-side), or
 *   - an upstream error.
 * The field keeps full free-text entry in every case — the picker is additive,
 * never a dead control.
 *
 * Security:
 *   - `requireUser()` gates the proxy so it is not an open, unauthenticated key
 *     relay.
 *   - The API key is read here and handed to the service; it is never echoed in
 *     the response. Suggestions carry only the formatted address (+ optional
 *     place id / lat / lon) — no raw Geoapify payload.
 */
function emptyResponse(degraded: boolean): NextResponse {
  return NextResponse.json({ suggestions: [] as LocationSuggestion[], degraded });
}

export async function GET(request: Request): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  // Skip very short inputs server-side (defense-in-depth; the client also
  // skips). Not an error — just nothing to suggest yet.
  if (q.length < GEOAPIFY_MIN_QUERY_LENGTH) {
    return NextResponse.json({ suggestions: [] as LocationSuggestion[] });
  }

  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    // Missing key → free-text fallback (never a dead control, never a 500).
    return emptyResponse(true);
  }

  try {
    const suggestions = await fetchGeoapifyAutocomplete({ query: q, apiKey });
    return NextResponse.json({ suggestions });
  } catch {
    // Upstream/network failure → free-text fallback. No raw error to client.
    return emptyResponse(true);
  }
}
