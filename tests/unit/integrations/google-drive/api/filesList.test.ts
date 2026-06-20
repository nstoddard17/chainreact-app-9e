/**
 * @jest-environment node
 *
 * Slice 4.GDRIVE-READ-2 — focused coverage for the `nameContains` clause
 * added to the shared `filesList` wrapper (consumed by search_files).
 *
 * The clause must:
 *   - append `name contains '<value>'` to the Drive `q`;
 *   - escape single quotes so a caller-supplied query cannot break out of
 *     the `q` literal (injection guard);
 *   - combine with the existing folder + trashed clauses via ` and `;
 *   - be absent entirely when no nameContains is supplied (list_files path
 *     stays unchanged).
 */
import { filesList } from "@/integrations/google-drive/api/filesList";

const mockFetch = jest.fn();
const originalFetch = global.fetch;

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

function okResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "",
    headers: new Headers(),
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

function qParamOf(call: unknown[]): string | null {
  const url = new URL(String(call[0]));
  return url.searchParams.get("q");
}

describe("filesList — nameContains clause", () => {
  it("appends `name contains '<value>'` and keeps trashed=false", async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ files: [] }));
    await filesList({ accessToken: "tok", nameContains: "report" });

    const q = qParamOf(mockFetch.mock.calls[0]!);
    expect(q).toContain("name contains 'report'");
    expect(q).toContain("trashed=false");
  });

  it("escapes single quotes in the query (injection guard)", async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ files: [] }));
    await filesList({ accessToken: "tok", nameContains: "o'brien' or name contains 'x" });

    const q = qParamOf(mockFetch.mock.calls[0]!);
    // Every embedded quote is backslash-escaped — no unescaped `'` that
    // would terminate the literal and inject a second clause.
    expect(q).toContain("name contains 'o\\'brien\\' or name contains \\'x'");
  });

  it("combines folder + nameContains clauses with ` and `", async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ files: [] }));
    await filesList({ accessToken: "tok", folderId: "fld-A", nameContains: "report" });

    const q = qParamOf(mockFetch.mock.calls[0]!);
    expect(q).toContain("'fld-A' in parents");
    expect(q).toContain("name contains 'report'");
    expect(q).toContain(" and ");
  });

  it("omits any name clause when nameContains is absent (list_files unchanged)", async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ files: [] }));
    await filesList({ accessToken: "tok" });

    const q = qParamOf(mockFetch.mock.calls[0]!);
    expect(q).not.toContain("name contains");
  });
});
