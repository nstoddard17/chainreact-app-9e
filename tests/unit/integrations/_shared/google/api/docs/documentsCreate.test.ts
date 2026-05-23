/**
 * @jest-environment node
 *
 * Slice 3.GDOCS-2 — documents.create wrapper.
 */
import { documentsCreate } from "@/integrations/_shared/google/api/docs/documentsCreate";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

const mockFetch = jest.fn();
const originalFetch = global.fetch;

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
  delete process.env.GOOGLE_DOCS_API_BASE;
});

afterEach(() => {
  global.fetch = originalFetch;
});

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    headers: new Headers(),
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

describe("documentsCreate", () => {
  it("POSTs to /v1/documents with { title } body and Bearer auth", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(200, { documentId: "doc-1", title: "Report" }),
    );

    const result = await documentsCreate({
      accessToken: "ya29.access",
      title: "Report",
    });

    expect(result.documentId).toBe("doc-1");
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://docs.googleapis.com/v1/documents");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ title: "Report" });
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer ya29.access",
    );
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  });

  it("throws Unauthorized401Error on HTTP 401 (refreshAndRetry contract)", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(401, {}));
    await expect(
      documentsCreate({ accessToken: "stale", title: "T" }),
    ).rejects.toThrow(Unauthorized401Error);
  });

  it("surfaces Google error.message on 4xx/5xx", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(403, {
        error: { code: 403, message: "Insufficient scope.", status: "PERMISSION_DENIED" },
      }),
    );
    await expect(
      documentsCreate({ accessToken: "t", title: "T" }),
    ).rejects.toThrow(/Insufficient scope/);
  });

  it("honors GOOGLE_DOCS_API_BASE env override (e2e mock surface)", async () => {
    process.env.GOOGLE_DOCS_API_BASE = "http://localhost:9999";
    mockFetch.mockResolvedValueOnce(
      jsonResponse(200, { documentId: "doc-1" }),
    );
    await documentsCreate({ accessToken: "t", title: "T" });
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toBe("http://localhost:9999/v1/documents");
  });
});
