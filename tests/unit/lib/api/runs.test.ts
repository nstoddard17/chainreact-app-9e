/**
 * @jest-environment jsdom
 *
 * Tests for lib/api/runs.ts (Slice 4.RUNS-PAGE-1).
 *
 * The typed client is a thin fetch wrapper — these tests pin the URL
 * shape, the error mapping, and the response unwrap.
 */
import { listRuns, RunApiError } from "@/lib/api/runs";

beforeEach(() => {
  (globalThis as { fetch?: unknown }).fetch = jest.fn();
});
afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

function mockFetchOk(body: unknown): void {
  (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => body,
  } as Response);
}

function mockFetchError(status: number, body: unknown): void {
  (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => body,
  } as Response);
}

describe("lib/api/runs.listRuns", () => {
  it("GETs /api/runs and unwraps { runs: [] }", async () => {
    mockFetchOk({ runs: [{ id: "r1" }, { id: "r2" }] });
    const out = await listRuns();
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/runs");
    expect(out).toHaveLength(2);
  });

  it("appends ?limit= when provided", async () => {
    mockFetchOk({ runs: [] });
    await listRuns({ limit: 10 });
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/runs?limit=10");
  });

  it("throws RunApiError(UNAUTHENTICATED) on 401", async () => {
    mockFetchError(401, { error: "unauthenticated" });
    await expect(listRuns()).rejects.toMatchObject({
      name: "RunApiError",
      code: "UNAUTHENTICATED",
      status: 401,
    });
  });

  it("throws RunApiError(SERVER_ERROR) on 5xx", async () => {
    mockFetchError(503, { error: "db is sad" });
    await expect(listRuns()).rejects.toMatchObject({
      code: "SERVER_ERROR",
      status: 503,
    });
  });

  it("uses the default 'Request failed (n)' message when the body is non-JSON", async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);
    let caught: RunApiError | null = null;
    try {
      await listRuns();
    } catch (err) {
      caught = err as RunApiError;
    }
    expect(caught).toBeInstanceOf(RunApiError);
    expect(caught?.message).toMatch(/Request failed \(502\)/);
  });
});
