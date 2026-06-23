/**
 * @jest-environment node
 *
 * Tests for `app/api/geoapify/autocomplete/route.ts` — the server proxy that
 * keeps the Geoapify API key off the client.
 *
 * Proves:
 *   - unauthenticated → 401,
 *   - the API key NEVER appears in the response body (key non-exposure),
 *   - only sanitized suggestions are returned,
 *   - short queries short-circuit with no upstream fetch,
 *   - a missing key / upstream error degrades to a free-text fallback (empty
 *     suggestions, never a 500).
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

import { GET } from "@/app/api/geoapify/autocomplete/route";

const SECRET = "GEOAPIFY_SECRET_999";
const realFetch = global.fetch;
const realKey = process.env.GEOAPIFY_API_KEY;

function req(q: string): Request {
  return new Request(`https://app.test/api/geoapify/autocomplete?q=${encodeURIComponent(q)}`);
}

function authed() {
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
}

afterEach(() => {
  jest.clearAllMocks();
  global.fetch = realFetch;
  if (realKey === undefined) delete process.env.GEOAPIFY_API_KEY;
  else process.env.GEOAPIFY_API_KEY = realKey;
});

describe("GET /api/geoapify/autocomplete", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await GET(req("Mountain View"));
    expect(res.status).toBe(401);
  });

  it("never exposes the API key and returns only sanitized suggestions", async () => {
    authed();
    process.env.GEOAPIFY_API_KEY = SECRET;
    let calledUrl = "";
    global.fetch = jest.fn(async (url: string) => {
      calledUrl = url;
      return {
        ok: true,
        json: async () => ({
          features: [
            {
              properties: {
                formatted: "1 Infinite Loop, Cupertino, CA",
                place_id: "p1",
                lat: 37.33,
                lon: -122.03,
                datasource: { license: "ODbL" },
              },
            },
          ],
        }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const res = await GET(req("1 Infinite Loop"));
    expect(res.status).toBe(200);
    const text = await res.text();

    // Key went to Geoapify, NOT to the client.
    expect(calledUrl).toContain(`apiKey=${SECRET}`);
    expect(text).not.toContain(SECRET);
    // Sanitized only — no raw payload.
    expect(text).not.toContain("datasource");
    expect(text).not.toContain("license");

    const body = JSON.parse(text);
    expect(body.suggestions).toEqual([
      { label: "1 Infinite Loop, Cupertino, CA", placeId: "p1", lat: 37.33, lon: -122.03 },
    ]);
  });

  it("short queries return empty with no upstream fetch", async () => {
    authed();
    process.env.GEOAPIFY_API_KEY = SECRET;
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const res = await GET(req("ab")); // below MIN length (3)
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.suggestions).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("degrades to free text (empty, degraded) when the key is missing", async () => {
    authed();
    delete process.env.GEOAPIFY_API_KEY;
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const res = await GET(req("Mountain View"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.suggestions).toEqual([]);
    expect(body.degraded).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("degrades to free text on an upstream error (never a 500)", async () => {
    authed();
    process.env.GEOAPIFY_API_KEY = SECRET;
    global.fetch = jest.fn(async () => ({ ok: false, status: 500 }) as unknown as Response) as unknown as typeof fetch;

    const res = await GET(req("Mountain View"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.suggestions).toEqual([]);
    expect(body.degraded).toBe(true);
  });
});
