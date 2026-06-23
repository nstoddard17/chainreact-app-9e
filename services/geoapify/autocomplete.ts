/**
 * Server-only Geoapify Address Autocomplete helper (config-field UX sweep —
 * `location` field type).
 *
 * Security contract (carried from the audit §6/§8):
 *   - The Geoapify API key is read from `process.env.GEOAPIFY_API_KEY` and is
 *     ONLY ever attached to the outbound request to Geoapify. It is NEVER
 *     returned to the browser. The browser calls our own proxy route
 *     (`/api/geoapify/autocomplete`); only this module sees the key.
 *   - The response is sanitized to a small, fixed shape — formatted address +
 *     optional place id / lat / lon — so no raw Geoapify payload, attribution,
 *     or per-field PII beyond the address the user is typing leaves the server.
 *
 * This module lives under `services/` and must stay server-only (the
 * client-server boundary structure test enforces that `features/` /
 * `lib/api/` never import `services/*`). The client helper is
 * `lib/api/geoapify.ts`; it talks to the route, never to this module.
 */

/**
 * Minimum query length before we hit Geoapify. Mirrors the client-side skip so
 * the server is defense-in-depth: even a hand-crafted request for a 1-char
 * query short-circuits to an empty result instead of spending a Geoapify call.
 */
export const GEOAPIFY_MIN_QUERY_LENGTH = 3;

/** Cap suggestions returned to the picker — a short, scannable list. */
export const GEOAPIFY_AUTOCOMPLETE_LIMIT = 5;

const GEOAPIFY_AUTOCOMPLETE_URL =
  "https://api.geoapify.com/v1/geocode/autocomplete";

/**
 * The ONLY shape that crosses the server→client boundary for a location
 * suggestion. `label` is the formatted address string the user picks (and that
 * gets stored in workflow config). `placeId` / `lat` / `lon` are optional UI
 * metadata — not required for launch and never the stored value.
 */
export interface LocationSuggestion {
  readonly label: string;
  readonly placeId?: string;
  readonly lat?: number;
  readonly lon?: number;
}

interface GeoapifyFeatureLike {
  properties?: {
    formatted?: unknown;
    place_id?: unknown;
    lat?: unknown;
    lon?: unknown;
  } | null;
}

/**
 * Map a raw Geoapify autocomplete payload (GeoJSON FeatureCollection) into the
 * sanitized `LocationSuggestion[]`. Pure + defensive: anything missing a usable
 * `formatted` address is dropped, and only the four allow-listed properties are
 * ever copied across. No raw feature, geometry, bbox, or datasource attribution
 * is forwarded.
 */
export function sanitizeGeoapifyResults(raw: unknown): LocationSuggestion[] {
  const features =
    raw && typeof raw === "object" && Array.isArray((raw as { features?: unknown }).features)
      ? ((raw as { features: unknown[] }).features)
      : [];

  const out: LocationSuggestion[] = [];
  for (const feature of features) {
    const props = (feature as GeoapifyFeatureLike)?.properties;
    if (!props || typeof props !== "object") continue;

    const formatted = props.formatted;
    if (typeof formatted !== "string" || formatted.trim().length === 0) continue;

    const suggestion: {
      label: string;
      placeId?: string;
      lat?: number;
      lon?: number;
    } = { label: formatted };

    if (typeof props.place_id === "string" && props.place_id.length > 0) {
      suggestion.placeId = props.place_id;
    }
    if (typeof props.lat === "number" && Number.isFinite(props.lat)) {
      suggestion.lat = props.lat;
    }
    if (typeof props.lon === "number" && Number.isFinite(props.lon)) {
      suggestion.lon = props.lon;
    }

    out.push(suggestion);
    if (out.length >= GEOAPIFY_AUTOCOMPLETE_LIMIT) break;
  }
  return out;
}

export interface GeoapifyAutocompleteInput {
  /** Trimmed user query. Caller guarantees length ≥ GEOAPIFY_MIN_QUERY_LENGTH. */
  readonly query: string;
  /** Server-only Geoapify API key — NEVER returned to the client. */
  readonly apiKey: string;
  readonly signal?: AbortSignal;
  /** Injectable for tests; defaults to global fetch. */
  readonly fetchImpl?: typeof fetch;
}

/**
 * Call Geoapify Address Autocomplete and return sanitized suggestions. Throws
 * on a non-OK response or network failure — the route catches and degrades to
 * a free-text field (empty suggestion list) so the control is never dead.
 */
export async function fetchGeoapifyAutocomplete(
  input: GeoapifyAutocompleteInput,
): Promise<LocationSuggestion[]> {
  const doFetch = input.fetchImpl ?? fetch;

  const url = new URL(GEOAPIFY_AUTOCOMPLETE_URL);
  url.searchParams.set("text", input.query);
  url.searchParams.set("limit", String(GEOAPIFY_AUTOCOMPLETE_LIMIT));
  url.searchParams.set("format", "geojson");
  // The key is attached here and ONLY here. It never appears in any value
  // returned from this function.
  url.searchParams.set("apiKey", input.apiKey);

  const res = await doFetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: input.signal,
  });

  if (!res.ok) {
    // Do not surface Geoapify's body — it can echo the key in error contexts.
    throw new Error(`Geoapify autocomplete returned HTTP ${res.status}`);
  }

  const json: unknown = await res.json();
  return sanitizeGeoapifyResults(json);
}
