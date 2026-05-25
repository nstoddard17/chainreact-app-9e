/**
 * @jest-environment node
 *
 * Slice 3.GDOCS-2 — documents.get wrapper.
 */
import { documentsGet } from "@/integrations/_shared/google/api/docs/documentsGet";
import { DocsNotFoundError } from "@/integrations/_shared/google/api/docs/errors";
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

describe("documentsGet", () => {
  it("GETs /v1/documents/{id} with Bearer auth and url-encodes the id", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(200, { documentId: "doc-1", title: "Report" }),
    );
    await documentsGet({ accessToken: "tok", documentId: "with/slash" });
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://docs.googleapis.com/v1/documents/with%2Fslash");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok",
    );
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(401, {}));
    await expect(
      documentsGet({ accessToken: "stale", documentId: "doc-1" }),
    ).rejects.toThrow(Unauthorized401Error);
  });

  it("throws DocsNotFoundError on HTTP 404", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(404, { error: { code: 404, message: "Document not found" } }),
    );
    await expect(
      documentsGet({ accessToken: "t", documentId: "missing" }),
    ).rejects.toThrow(DocsNotFoundError);
  });

  it("surfaces Google error.message on other 4xx/5xx", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(500, { error: { code: 500, message: "Backend error" } }),
    );
    await expect(
      documentsGet({ accessToken: "t", documentId: "doc-1" }),
    ).rejects.toThrow(/Backend error/);
  });
});
