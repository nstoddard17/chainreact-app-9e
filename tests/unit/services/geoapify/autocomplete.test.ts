/**
 * @jest-environment node
 *
 * Tests for the server-only Geoapify autocomplete helper (config-field UX
 * sweep — `location` field type).
 *
 * Proves:
 *   - `sanitizeGeoapifyResults` returns ONLY the allow-listed fields
 *     (label / placeId / lat / lon) and drops malformed / unformatted features
 *     and any raw payload.
 *   - `fetchGeoapifyAutocomplete` attaches the API key to the OUTBOUND request
 *     only, and never includes it in the returned data.
 */
import {
  sanitizeGeoapifyResults,
  fetchGeoapifyAutocomplete,
  GEOAPIFY_AUTOCOMPLETE_LIMIT,
} from "@/services/geoapify/autocomplete";

describe("sanitizeGeoapifyResults", () => {
  it("maps features to {label, placeId, lat, lon} and nothing else", () => {
    const raw = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            formatted: "1600 Amphitheatre Pkwy, Mountain View, CA",
            place_id: "abc123",
            lat: 37.42,
            lon: -122.08,
            country: "United States",
            datasource: { sourcename: "openstreetmap", license: "ODbL" },
          },
          geometry: { type: "Point", coordinates: [-122.08, 37.42] },
        },
      ],
    };
    const out = sanitizeGeoapifyResults(raw);
    expect(out).toEqual([
      {
        label: "1600 Amphitheatre Pkwy, Mountain View, CA",
        placeId: "abc123",
        lat: 37.42,
        lon: -122.08,
      },
    ]);
    // No raw payload leaks through.
    expect(JSON.stringify(out)).not.toContain("datasource");
    expect(JSON.stringify(out)).not.toContain("geometry");
    expect(JSON.stringify(out)).not.toContain("license");
  });

  it("drops features with no usable formatted address", () => {
    const out = sanitizeGeoapifyResults({
      features: [
        { properties: { formatted: "" } },
        { properties: { place_id: "x" } },
        { properties: null },
        {},
        { properties: { formatted: "   " } },
      ],
    });
    expect(out).toEqual([]);
  });

  it("omits optional fields when absent or wrong-typed", () => {
    const out = sanitizeGeoapifyResults({
      features: [{ properties: { formatted: "Paris, France", lat: "not-a-number" } }],
    });
    expect(out).toEqual([{ label: "Paris, France" }]);
  });

  it("caps results at the autocomplete limit", () => {
    const features = Array.from({ length: 20 }, (_, i) => ({
      properties: { formatted: `Address ${i}` },
    }));
    expect(sanitizeGeoapifyResults({ features }).length).toBe(
      GEOAPIFY_AUTOCOMPLETE_LIMIT,
    );
  });

  it("returns [] for non-object / featureless input", () => {
    expect(sanitizeGeoapifyResults(null)).toEqual([]);
    expect(sanitizeGeoapifyResults("nope")).toEqual([]);
    expect(sanitizeGeoapifyResults({ results: [] })).toEqual([]);
  });
});

describe("fetchGeoapifyAutocomplete", () => {
  it("attaches the apiKey to the outbound URL but never returns it", async () => {
    let calledUrl = "";
    const fetchImpl = jest.fn(async (url: string) => {
      calledUrl = url;
      return {
        ok: true,
        json: async () => ({ features: [{ properties: { formatted: "Berlin, Germany" } }] }),
      } as unknown as Response;
    });

    const out = await fetchGeoapifyAutocomplete({
      query: "Berlin",
      apiKey: "SECRET_KEY_123",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    // The key is on the request to Geoapify…
    expect(calledUrl).toContain("apiKey=SECRET_KEY_123");
    expect(calledUrl).toContain("text=Berlin");
    // …but never in the returned data.
    expect(JSON.stringify(out)).not.toContain("SECRET_KEY_123");
    expect(out).toEqual([{ label: "Berlin, Germany" }]);
  });

  it("throws on a non-OK upstream response (route catches → free text)", async () => {
    const fetchImpl = jest.fn(async () => ({ ok: false, status: 429 }) as unknown as Response);
    await expect(
      fetchGeoapifyAutocomplete({
        query: "x",
        apiKey: "k",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/HTTP 429/);
  });
});
