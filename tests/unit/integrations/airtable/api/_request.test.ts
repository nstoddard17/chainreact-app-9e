/**
 * @jest-environment node
 *
 * Tests for the shared Airtable HTTP request helper. Verifies header
 * shape, error mapping (401 / 404 / other), and the
 * encodeTableSegment helper.
 */
import {
  airtableRequest,
  encodeTableSegment,
} from "@/integrations/airtable/api/_request";
import { NotFoundError } from "@/integrations/_shared/airtable/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

beforeEach(() => {
  delete process.env.AIRTABLE_API_BASE;
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.AIRTABLE_API_BASE;
});

function mockFetchOnce(response: {
  ok: boolean;
  status?: number;
  json?: unknown;
  text?: string;
}) {
  const body = response.text !== undefined ? response.text : JSON.stringify(response.json ?? {});
  jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(body, {
        status: response.status ?? (response.ok ? 200 : 500),
      }),
    );
}

describe("airtableRequest — happy path", () => {
  it("sends Authorization: Bearer + GET to api.airtable.com by default", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

    await airtableRequest({
      accessToken: "tok",
      method: "GET",
      path: "/v0/meta/whoami",
      resourceForNotFound: "test",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://api.airtable.com/v0/meta/whoami",
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok",
    );
    // No Content-Type on GET (no body).
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("adds Content-Type: application/json + JSON body on POST", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    await airtableRequest({
      accessToken: "tok",
      method: "POST",
      path: "/v0/app/tbl",
      body: { fields: { Name: "x" } },
      resourceForNotFound: "test",
    });

    const init = fetchSpy.mock.calls[0]![1]!;
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
    expect(init.body).toBe(JSON.stringify({ fields: { Name: "x" } }));
  });

  it("appends query parameters", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const params = new URLSearchParams();
    params.append("filterByFormula", "{Name}='Alice'");
    params.append("maxRecords", "10");

    await airtableRequest({
      accessToken: "tok",
      method: "GET",
      path: "/v0/app/tbl",
      query: params,
      resourceForNotFound: "test",
    });

    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("filterByFormula=");
    expect(url).toContain("maxRecords=10");
  });

  it("respects AIRTABLE_API_BASE override (e2e mock surface)", async () => {
    process.env.AIRTABLE_API_BASE = "http://localhost:9880";
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await airtableRequest({
      accessToken: "tok",
      method: "GET",
      path: "/v0/meta/whoami",
      resourceForNotFound: "test",
    });
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "http://localhost:9880/v0/meta/whoami",
    );
  });
});

describe("airtableRequest — error mapping", () => {
  it("401 → Unauthorized401Error (caught by refreshAndRetry)", async () => {
    mockFetchOnce({ ok: false, status: 401, text: "unauthorized" });
    await expect(
      airtableRequest({
        accessToken: "tok",
        method: "GET",
        path: "/v0/app/tbl",
        resourceForNotFound: "test",
      }),
    ).rejects.toThrow(Unauthorized401Error);
  });

  it("404 → NotFoundError with resource label + parsed error message", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      json: { error: { type: "NOT_FOUND", message: "Record does not exist" } },
    });
    let captured: unknown;
    try {
      await airtableRequest({
        accessToken: "tok",
        method: "GET",
        path: "/v0/app/tbl/rec1",
        resourceForNotFound: "record rec1",
      });
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(NotFoundError);
    const e = captured as NotFoundError;
    expect(e.resource).toBe("record rec1");
    expect(e.message).toContain("Record does not exist");
  });

  it("other 4xx/5xx → generic Error with parsed error code", async () => {
    mockFetchOnce({
      ok: false,
      status: 422,
      json: { error: { message: "Invalid request" } },
    });
    await expect(
      airtableRequest({
        accessToken: "tok",
        method: "POST",
        path: "/v0/app/tbl",
        body: {},
        resourceForNotFound: "test",
      }),
    ).rejects.toThrow(/Airtable POST .* failed: Invalid request/);
  });

  it("non-JSON error body → HTTP <status> fallback", async () => {
    mockFetchOnce({ ok: false, status: 502, text: "Bad Gateway" });
    await expect(
      airtableRequest({
        accessToken: "tok",
        method: "GET",
        path: "/v0/app/tbl",
        resourceForNotFound: "test",
      }),
    ).rejects.toThrow(/HTTP 502/);
  });
});

describe("encodeTableSegment", () => {
  it("encodes spaces and slashes", () => {
    expect(encodeTableSegment("My Table")).toBe("My%20Table");
    expect(encodeTableSegment("a/b")).toBe("a%2Fb");
  });

  it("leaves table-id-shaped strings unchanged", () => {
    expect(encodeTableSegment("tblXXXXXXXXX")).toBe("tblXXXXXXXXX");
  });

  it("encodes ampersands and other URL-significant chars", () => {
    expect(encodeTableSegment("a&b")).toBe("a%26b");
    expect(encodeTableSegment("a?b")).toBe("a%3Fb");
  });
});
