/**
 * Client-side helper for the `location` field's address autocomplete.
 *
 * Talks ONLY to our own proxy route (`/api/geoapify/autocomplete`) — it never
 * sees, imports, or references the Geoapify API key. The key lives exclusively
 * server-side (`services/geoapify/autocomplete.ts` + the route). This file is
 * importable from client components; `services/*` is not (enforced by the
 * client-server boundary structure test), which is why the suggestion type is
 * re-declared here rather than imported from the service.
 */

/** Sanitized suggestion shape returned by the proxy route. */
export interface LocationSuggestion {
  readonly label: string;
  readonly placeId?: string;
  readonly lat?: number;
  readonly lon?: number;
}

export interface FetchLocationSuggestionsOptions {
  readonly signal?: AbortSignal;
}

/**
 * Fetch address suggestions for `query`. Resolves to `[]` on any failure
 * (non-OK status, parse error, missing key → the route returns `degraded`), so
 * the caller always degrades cleanly to a free-text field. Re-throws
 * `AbortError` so the caller can distinguish a cancelled request from "no
 * results".
 */
export async function fetchLocationSuggestions(
  query: string,
  options: FetchLocationSuggestionsOptions = {},
): Promise<LocationSuggestion[]> {
  let res: Response;
  try {
    res = await fetch(
      `/api/geoapify/autocomplete?q=${encodeURIComponent(query)}`,
      { signal: options.signal },
    );
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return [];
  }

  if (!res.ok) return [];

  try {
    const data: unknown = await res.json();
    const suggestions = (data as { suggestions?: unknown })?.suggestions;
    return Array.isArray(suggestions) ? (suggestions as LocationSuggestion[]) : [];
  } catch {
    return [];
  }
}
