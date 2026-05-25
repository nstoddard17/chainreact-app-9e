/**
 * @jest-environment node
 *
 * Tests for `integrations/airtable/api/basesList.ts` — Slice
 * 4.AIRTABLE-META-2. New list-bases helper (GET /v0/meta/bases) routed
 * through the shared `airtableRequest` transport. Backs the
 * `airtable:bases` resolver.
 */
import { basesList } from "@/integrations/airtable/api/basesList";
import { NotFoundError } from "@/integrations/_shared/airtable/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

afterEach(() => {
  jest.restoreAllMocks();
});

function mockFetchOnce(json: unknown, status = 200) {
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify(json), { status }));
}

const RESPONSE = {
  bases: [
    { id: "appONE", name: "CRM", permissionLevel: "create" },
    { id: "appTWO", name: "Inventory", permissionLevel: "edit" },
  ],
};

describe("basesList", () => {
  it("GETs /v0/meta/bases with a Bearer token and no query when no offset", async () => {
    const fetchSpy = mockFetchOnce(RESPONSE);
    await basesList({ accessToken: "tok" });
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://api.airtable.com/v0/meta/bases",
    );
    const init = fetchSpy.mock.calls[0]![1] as {
      method?: string;
      headers?: Record<string, string>;
    };
    expect(init.method).toBe("GET");
    expect(init.headers?.Authorization).toBe("Bearer tok");
  });

  it("appends the offset cursor when provided", async () => {
    const fetchSpy = mockFetchOnce(RESPONSE);
    await basesList({ accessToken: "tok", offset: "cursor123" });
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://api.airtable.com/v0/meta/bases?offset=cursor123",
    );
  });

  it("returns the bases array (+ offset when paginated)", async () => {
    mockFetchOnce({ ...RESPONSE, offset: "next" });
    const result = await basesList({ accessToken: "tok" });
    expect(result.bases).toHaveLength(2);
    expect(result.bases[0]).toEqual({
      id: "appONE",
      name: "CRM",
      permissionLevel: "create",
    });
    expect(result.offset).toBe("next");
  });

  it("propagates HTTP 401 as Unauthorized401Error (→ refreshAndRetry)", async () => {
    mockFetchOnce({ error: { type: "AUTH" } }, 401);
    await expect(basesList({ accessToken: "tok" })).rejects.toBeInstanceOf(
      Unauthorized401Error,
    );
  });

  it("propagates HTTP 404 as NotFoundError(bases)", async () => {
    mockFetchOnce({ error: { type: "NOT_FOUND", message: "nope" } }, 404);
    let captured: unknown;
    try {
      await basesList({ accessToken: "tok" });
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(NotFoundError);
    expect((captured as NotFoundError).resource).toBe("bases");
  });
});
