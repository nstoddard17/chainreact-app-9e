/**
 * @jest-environment node
 *
 * Tests for app/api/integrations/oauth/[provider]/ingest/route.ts.
 *
 * The route is thin — auth check, body validation, dispatcher call,
 * typed-error mapping. We mock the supabase client and the dispatcher,
 * and verify the wire contract.
 */
const mockGetUser = jest.fn();
const mockHandleTokenIngest = jest.fn();

jest.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
  }),
}));

jest.mock("@/services/oauth/dispatcher", () => ({
  handleTokenIngest: (...args: unknown[]) => mockHandleTokenIngest(...args),
}));

import { POST } from "@/app/api/integrations/oauth/[provider]/ingest/route";
import { TokenIngestVerificationError } from "@/contracts/integration";
import { InvalidStateError } from "@/services/oauth/state";

const params = Promise.resolve({ provider: "trello" });

function makeRequest(body: unknown): Request {
  return new Request("http://x/api/integrations/oauth/trello/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockHandleTokenIngest.mockReset();
});

describe("POST /api/integrations/oauth/[provider]/ingest — auth", () => {
  it("returns 401 when getUser returns an error", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: new Error("no session"),
    });
    const res = await POST(makeRequest({ state: "x", token: "y" }), { params });
    expect(res.status).toBe(401);
    expect(mockHandleTokenIngest).not.toHaveBeenCalled();
  });

  it("returns 401 when getUser returns no user", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await POST(makeRequest({ state: "x", token: "y" }), { params });
    expect(res.status).toBe(401);
    expect(mockHandleTokenIngest).not.toHaveBeenCalled();
  });
});

describe("POST /api/integrations/oauth/[provider]/ingest — body validation", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
  });

  it("returns 400 on empty body", async () => {
    const res = await POST(makeRequest(""), { params });
    expect(res.status).toBe(400);
    expect(mockHandleTokenIngest).not.toHaveBeenCalled();
  });

  it("returns 400 on non-JSON body", async () => {
    const res = await POST(makeRequest("not-json{"), { params });
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is a JSON array", async () => {
    const res = await POST(makeRequest("[1,2,3]"), { params });
    expect(res.status).toBe(400);
  });

  it("returns 400 when state is missing", async () => {
    const res = await POST(makeRequest({ token: "y" }), { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/state/);
  });

  it("returns 400 when state is not a string", async () => {
    const res = await POST(makeRequest({ state: 123, token: "y" }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 400 when token is missing", async () => {
    const res = await POST(makeRequest({ state: "x" }), { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/token/);
  });

  it("returns 400 when token is empty string", async () => {
    const res = await POST(makeRequest({ state: "x", token: "" }), { params });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/integrations/oauth/[provider]/ingest — dispatcher error mapping", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
  });

  it("returns 400 on InvalidStateError (state shape stripped from response)", async () => {
    mockHandleTokenIngest.mockRejectedValueOnce(
      new InvalidStateError("already consumed or expired"),
    );
    const res = await POST(makeRequest({ state: "x", token: "y" }), { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid state");
  });

  it("returns 400 on TokenIngestVerificationError (reason surfaced)", async () => {
    mockHandleTokenIngest.mockRejectedValueOnce(
      new TokenIngestVerificationError("trello", "invalid token"),
    );
    const res = await POST(makeRequest({ state: "x", token: "y" }), { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid token");
  });

  it("returns 502 on network-shaped errors (body is the stable code, not the raw message)", async () => {
    mockHandleTokenIngest.mockRejectedValueOnce(new Error("fetch failed reaching trello.com/api"));
    const res = await POST(makeRequest({ state: "x", token: "y" }), { params });
    expect(res.status).toBe(502); // transient-vs-fatal status heuristic preserved
    const body = await res.json();
    expect(body.error).toBe("ingest_failed");
  });

  it("returns 500 on unexpected errors", async () => {
    mockHandleTokenIngest.mockRejectedValueOnce(new Error("boom"));
    const res = await POST(makeRequest({ state: "x", token: "y" }), { params });
    expect(res.status).toBe(500);
  });

  it("V2-READY-21: a hostile unexpected error leaks no identifiers — body is the stable code only", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const hostile =
      'duplicate key violates constraint "integrations_pkey" account=acct-77 ' +
      "provider-account=bob@example.com token=tok-SECRET scope=read:all";
    mockHandleTokenIngest.mockRejectedValueOnce(new Error(hostile));
    const res = await POST(makeRequest({ state: "x", token: "y" }), { params });
    expect(res.status).toBe(500);
    const raw = await res.text();
    expect(JSON.parse(raw).error).toBe("ingest_failed");
    for (const frag of [
      "integrations_pkey",
      "constraint",
      "acct-77",
      "bob@example.com",
      "tok-SECRET",
      "read:all",
    ]) {
      expect(raw).not.toContain(frag);
    }
    // Diagnostics retained server-side only.
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("never echoes the token back in any error response body", async () => {
    const sensitiveToken = "abc-secret-token-9999";
    mockHandleTokenIngest.mockRejectedValueOnce(
      new TokenIngestVerificationError("trello", "invalid token"),
    );
    const res = await POST(
      makeRequest({ state: "x", token: sensitiveToken }),
      { params },
    );
    const body = await res.text();
    expect(body).not.toContain(sensitiveToken);
  });
});

describe("POST /api/integrations/oauth/[provider]/ingest — success", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
  });

  it("returns 200 with redirect on success", async () => {
    mockHandleTokenIngest.mockResolvedValueOnce({
      integration: { id: "int-1", provider: "trello" },
    });
    const res = await POST(makeRequest({ state: "x", token: "y" }), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.redirect).toBe("/apps?integration=connected&provider=trello");
    expect(mockHandleTokenIngest).toHaveBeenCalledWith({
      userId: "user-1",
      provider: "trello",
      state: "x",
      token: "y",
    });
  });

  it("never echoes the token back in the success response body", async () => {
    const sensitiveToken = "abc-secret-token-9999";
    mockHandleTokenIngest.mockResolvedValueOnce({
      integration: { id: "int-1", provider: "trello" },
    });
    const res = await POST(
      makeRequest({ state: "x", token: sensitiveToken }),
      { params },
    );
    const body = await res.text();
    expect(body).not.toContain(sensitiveToken);
  });
});
