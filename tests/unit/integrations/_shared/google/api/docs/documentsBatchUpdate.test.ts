/**
 * @jest-environment node
 *
 * Slice 3.GDOCS-2 — documents.batchUpdate wrapper.
 */
import { documentsBatchUpdate } from "@/integrations/_shared/google/api/docs/documentsBatchUpdate";
import { DocsNotFoundError } from "@/integrations/_shared/google/api/docs/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

const mockFetch = jest.fn();
const originalFetch = global.fetch;

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
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

describe("documentsBatchUpdate", () => {
  it("POSTs /v1/documents/{id}:batchUpdate with { requests } body", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { documentId: "doc-1" }));
    const requests = [
      { insertText: { location: { index: 1 }, text: "hello" } },
    ];
    await documentsBatchUpdate({
      accessToken: "tok",
      documentId: "doc-1",
      requests,
    });
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://docs.googleapis.com/v1/documents/doc-1:batchUpdate");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ requests });
  });

  it("forwards multi-request payloads verbatim (replace mode = delete + insert)", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { documentId: "doc-1" }));
    const requests = [
      { deleteContentRange: { range: { startIndex: 1, endIndex: 50 } } },
      { insertText: { location: { index: 1 }, text: "replaced" } },
    ];
    await documentsBatchUpdate({
      accessToken: "tok",
      documentId: "doc-1",
      requests,
    });
    const init = mockFetch.mock.calls[0]![1]!;
    expect(JSON.parse(init.body as string).requests).toEqual(requests);
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(401, {}));
    await expect(
      documentsBatchUpdate({
        accessToken: "stale",
        documentId: "doc-1",
        requests: [],
      }),
    ).rejects.toThrow(Unauthorized401Error);
  });

  it("throws DocsNotFoundError on HTTP 404", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(404, { error: { code: 404, message: "Not found" } }),
    );
    await expect(
      documentsBatchUpdate({
        accessToken: "t",
        documentId: "missing",
        requests: [],
      }),
    ).rejects.toThrow(DocsNotFoundError);
  });

  it("surfaces Google error.message on 4xx/5xx other than 401/404", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(400, {
        error: { code: 400, message: "Index out of range" },
      }),
    );
    await expect(
      documentsBatchUpdate({
        accessToken: "t",
        documentId: "doc-1",
        requests: [{ insertText: { location: { index: 99999 }, text: "x" } }],
      }),
    ).rejects.toThrow(/Index out of range/);
  });
});
