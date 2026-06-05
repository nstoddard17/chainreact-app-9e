/**
 * @jest-environment node
 *
 * CS-4b — typed client wrappers for the credential-owner endpoints. Mocks fetch;
 * proves the URLs, the safe-empty degradation, and discriminated results.
 */
import {
  fetchNodeCredentialOwners,
  fetchEligibleTargets,
  requestCredentialReassignment,
} from "@/lib/api/credentialOwners";

const realFetch = global.fetch;
const mockFetch = jest.fn();
beforeAll(() => {
  (global as unknown as { fetch: typeof fetch }).fetch = mockFetch as unknown as typeof fetch;
});
afterAll(() => {
  (global as unknown as { fetch: typeof fetch }).fetch = realFetch;
});
beforeEach(() => mockFetch.mockReset());

function jsonRes(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("fetchNodeCredentialOwners", () => {
  it("GETs the metadata endpoint and returns the body", async () => {
    const meta = { workflowId: "wf-1", canManage: true, nodes: [{ nodeId: "n1", provider: "gmail", status: "accepted", ownerDisplayName: "Dana" }] };
    mockFetch.mockResolvedValue(jsonRes(200, meta));
    const result = await fetchNodeCredentialOwners("wf-1");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/workflows/wf-1/credential-owners",
      expect.objectContaining({ method: "GET" }),
    );
    expect(result).toEqual(meta);
  });

  it("degrades to a safe empty state on non-200", async () => {
    mockFetch.mockResolvedValue(jsonRes(404, { error: "x" }));
    expect(await fetchNodeCredentialOwners("wf-1")).toEqual({ workflowId: "wf-1", canManage: false, nodes: [] });
  });

  it("degrades to safe empty on a malformed body", async () => {
    mockFetch.mockResolvedValue(jsonRes(200, { not: "metadata" }));
    expect(await fetchNodeCredentialOwners("wf-1")).toEqual({ workflowId: "wf-1", canManage: false, nodes: [] });
  });

  it("re-throws AbortError", async () => {
    mockFetch.mockRejectedValue(new DOMException("aborted", "AbortError"));
    await expect(fetchNodeCredentialOwners("wf-1")).rejects.toThrow("aborted");
  });
});

describe("fetchEligibleTargets", () => {
  it("GETs the node-scoped endpoint and returns members on success", async () => {
    mockFetch.mockResolvedValue(jsonRes(200, { members: [{ userId: "u1", displayName: "Dana", role: "member" }] }));
    const res = await fetchEligibleTargets("wf-1", "node-7");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/workflows/wf-1/nodes/node-7/credential-owner/eligible-targets",
      expect.objectContaining({ method: "GET" }),
    );
    expect(res).toEqual({ ok: true, members: [{ userId: "u1", displayName: "Dana", role: "member" }] });
  });

  it("returns the typed error code on failure", async () => {
    mockFetch.mockResolvedValue(jsonRes(403, { code: "FORBIDDEN" }));
    expect(await fetchEligibleTargets("wf-1", "node-7")).toEqual({ ok: false, code: "FORBIDDEN" });
  });
});

describe("requestCredentialReassignment", () => {
  it("POSTs to the request route with the target and returns status", async () => {
    mockFetch.mockResolvedValue(jsonRes(200, { ok: true, status: "pending" }));
    const res = await requestCredentialReassignment("wf-1", "node-7", "userB");
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("/api/workflows/wf-1/nodes/node-7/credential-owner/request");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ targetUserId: "userB" });
    expect(res).toEqual({ ok: true, status: "pending" });
  });

  it("returns the typed error code on failure", async () => {
    mockFetch.mockResolvedValue(jsonRes(409, { code: "DUPLICATE_REASSIGNMENT" }));
    expect(await requestCredentialReassignment("wf-1", "node-7", "userB")).toEqual({
      ok: false,
      code: "DUPLICATE_REASSIGNMENT",
    });
  });
});
