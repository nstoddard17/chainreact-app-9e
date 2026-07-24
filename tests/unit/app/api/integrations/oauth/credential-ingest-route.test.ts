/**
 * @jest-environment node
 *
 * Tests for app/api/integrations/oauth/[provider]/credential-ingest/route.ts.
 *
 * The route is thin — auth check, strict body validation, dispatcher call,
 * typed-error mapping. We mock the supabase client and the dispatcher and
 * verify the wire contract, including that NO credential value ever appears
 * in a response body.
 */
const mockGetUser = jest.fn();
const mockHandleCredentialIngest = jest.fn();

jest.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
  }),
}));

jest.mock("@/services/oauth/dispatcher", () => ({
  handleCredentialIngest: (...args: unknown[]) => mockHandleCredentialIngest(...args),
}));

import { POST } from "@/app/api/integrations/oauth/[provider]/credential-ingest/route";
import { CredentialVerificationError } from "@/contracts/integration";
import { InvalidStateError } from "@/services/oauth/state";

const params = Promise.resolve({ provider: "fleetio" });

const GOOD_BODY = {
  state: "state-1",
  credentials: { apiKey: "key-secret-1", accountToken: "acct-secret-2" },
};

function makeRequest(body: unknown): Request {
  return new Request("http://x/api/integrations/oauth/fleetio/credential-ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockHandleCredentialIngest.mockReset();
});

describe("credential-ingest route — auth", () => {
  it("returns 401 when unauthenticated (dispatcher never called)", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await POST(makeRequest(GOOD_BODY), { params });
    expect(res.status).toBe(401);
    expect(mockHandleCredentialIngest).not.toHaveBeenCalled();
  });
});

describe("credential-ingest route — body validation", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  });

  it("returns 400 on empty body", async () => {
    const res = await POST(makeRequest(""), { params });
    expect(res.status).toBe(400);
    expect(mockHandleCredentialIngest).not.toHaveBeenCalled();
  });

  it("returns 400 on non-JSON body", async () => {
    const res = await POST(makeRequest("nope{"), { params });
    expect(res.status).toBe(400);
  });

  it("returns 400 when state is missing", async () => {
    const res = await POST(makeRequest({ credentials: GOOD_BODY.credentials }), { params });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/state/);
  });

  it("returns 400 when credentials is missing or not an object", async () => {
    for (const credentials of [undefined, null, "x", [1]]) {
      const res = await POST(makeRequest({ state: "s", credentials }), { params });
      expect(res.status).toBe(400);
    }
    expect(mockHandleCredentialIngest).not.toHaveBeenCalled();
  });

  it("returns 400 when credentials is an empty object", async () => {
    const res = await POST(makeRequest({ state: "s", credentials: {} }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 400 when a credential value is not a non-empty string", async () => {
    for (const value of ["", 42, null, {}]) {
      const res = await POST(
        makeRequest({ state: "s", credentials: { apiKey: value } }),
        { params },
      );
      expect(res.status).toBe(400);
    }
    expect(mockHandleCredentialIngest).not.toHaveBeenCalled();
  });

  it("returns 400 when a credential value exceeds the size bound", async () => {
    const res = await POST(
      makeRequest({ state: "s", credentials: { apiKey: "x".repeat(5000) } }),
      { params },
    );
    expect(res.status).toBe(400);
  });
});

describe("credential-ingest route — dispatch + error mapping", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  });

  it("returns 200 with the apps redirect on success and forwards the exact input set", async () => {
    mockHandleCredentialIngest.mockResolvedValueOnce({ integration: { id: "int-1" } });
    const res = await POST(makeRequest(GOOD_BODY), { params });
    expect(res.status).toBe(200);
    expect((await res.json()).redirect).toBe(
      "/apps?integration=connected&provider=fleetio",
    );
    expect(mockHandleCredentialIngest).toHaveBeenCalledWith({
      userId: "user-1",
      provider: "fleetio",
      state: "state-1",
      credentials: GOOD_BODY.credentials,
    });
  });

  it("maps InvalidStateError to a generic 400 (no state internals leaked)", async () => {
    mockHandleCredentialIngest.mockRejectedValueOnce(new InvalidStateError("nonce gone"));
    const res = await POST(makeRequest(GOOD_BODY), { params });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid state");
  });

  it("maps CredentialVerificationError to 400 surfacing ONLY the safe reason", async () => {
    mockHandleCredentialIngest.mockRejectedValueOnce(
      new CredentialVerificationError("fleetio", "invalid API key"),
    );
    const res = await POST(makeRequest(GOOD_BODY), { params });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid API key");
  });

  it("maps a transient verify failure to 502 with a redacted code", async () => {
    mockHandleCredentialIngest.mockRejectedValueOnce(
      new Error("Fleetio verify failed: could not reach the Fleetio API"),
    );
    const res = await POST(makeRequest(GOOD_BODY), { params });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).not.toMatch(/Fleetio verify failed/); // redacted code, not raw message
  });

  it("maps unexpected errors to 500 with a redacted code", async () => {
    mockHandleCredentialIngest.mockRejectedValueOnce(new Error("supabase exploded at row 5"));
    const res = await POST(makeRequest(GOOD_BODY), { params });
    expect(res.status).toBe(500);
    expect((await res.json()).error).not.toMatch(/supabase/);
  });

  it("never echoes a credential value in ANY response body", async () => {
    const cases: Array<() => void> = [
      () => mockHandleCredentialIngest.mockResolvedValueOnce({ integration: { id: "i" } }),
      () =>
        mockHandleCredentialIngest.mockRejectedValueOnce(
          new CredentialVerificationError("fleetio", "invalid API key"),
        ),
      () => mockHandleCredentialIngest.mockRejectedValueOnce(new Error("boom")),
    ];
    for (const arm of cases) {
      arm();
      const res = await POST(makeRequest(GOOD_BODY), { params });
      const text = JSON.stringify(await res.json());
      expect(text).not.toContain(GOOD_BODY.credentials.apiKey);
      expect(text).not.toContain(GOOD_BODY.credentials.accountToken);
    }
  });
});
