/**
 * @jest-environment node
 *
 * Tests for lib/api/internalReactAgent.ts (INTERNAL-FEEDBACK-2).
 *
 * Business rule: the typed client hits the internal metrics endpoint (same-origin
 * cookie carries the session), returns the parsed DTO on 200, and raises a typed
 * InternalReactAgentApiError (carrying the status) on any non-2xx — so a
 * non-admin/signed-out 404 surfaces as an error the dashboard can render.
 */

import {
  fetchReactAgentMetrics,
  InternalReactAgentApiError,
} from "@/lib/api/internalReactAgent";

const DTO = { totals: { agentChanges: 7 } };

afterEach(() => {
  (global.fetch as unknown) = undefined;
});

function mockFetch(status: number, body: unknown) {
  global.fetch = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe("fetchReactAgentMetrics", () => {
  it("returns the parsed DTO on 200", async () => {
    mockFetch(200, DTO);
    await expect(fetchReactAgentMetrics()).resolves.toEqual(DTO);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/internal/react-agent/metrics",
      { headers: { accept: "application/json" } },
    );
  });

  it("encodes from/to into the query string", async () => {
    mockFetch(200, DTO);
    await fetchReactAgentMetrics({ from: "2026-06-01T00:00:00.000Z", to: "2026-06-30T00:00:00.000Z" });
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("from=2026-06-01");
    expect(url).toContain("to=2026-06-30");
  });

  it("throws a typed error carrying the status on 404", async () => {
    mockFetch(404, { error: "not_found" });
    await expect(fetchReactAgentMetrics()).rejects.toMatchObject({
      constructor: InternalReactAgentApiError,
      status: 404,
    });
  });
});
