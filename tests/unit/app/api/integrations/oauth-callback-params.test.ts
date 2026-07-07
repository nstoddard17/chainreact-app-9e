/**
 * @jest-environment node
 *
 * QUICKBOOKS-1 — generic callback-params passthrough on the OAuth
 * callback route. Some providers deliver tenancy ONLY as extra query
 * params on the provider redirect (QuickBooks `realmId`); the route
 * must collect every param EXCEPT code/state and forward them through
 * the dispatcher verbatim, for every provider (no per-provider logic).
 */
const mockHandleCallback = jest.fn();

jest.mock("@/services/oauth/dispatcher", () => {
  const actual = jest.requireActual("@/services/oauth/dispatcher");
  return {
    ...actual,
    handleCallback: (...args: unknown[]) => mockHandleCallback(...args),
  };
});

import { GET } from "@/app/api/integrations/oauth/[provider]/callback/route";

beforeEach(() => {
  mockHandleCallback.mockReset();
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
});

function callbackRequest(query: string): Request {
  return new Request(
    `https://app.example.test/api/integrations/oauth/quickbooks/callback?${query}`,
  );
}

const PARAMS = { params: Promise.resolve({ provider: "quickbooks" }) };

describe("OAuth callback — callbackParams passthrough", () => {
  it("forwards extra query params (realmId) minus code/state to the dispatcher", async () => {
    mockHandleCallback.mockResolvedValueOnce({
      integration: { provider: "quickbooks" },
    });
    const res = await GET(
      callbackRequest("code=abc&state=sig.state&realmId=9130350000000"),
      PARAMS,
    );
    expect(res.status).toBeGreaterThanOrEqual(300); // redirect to /apps
    expect(mockHandleCallback).toHaveBeenCalledWith({
      provider: "quickbooks",
      code: "abc",
      state: "sig.state",
      callbackParams: { realmId: "9130350000000" },
    });
  });

  it("passes an empty record when the provider sent no extra params", async () => {
    mockHandleCallback.mockResolvedValueOnce({
      integration: { provider: "quickbooks" },
    });
    await GET(callbackRequest("code=abc&state=sig.state"), PARAMS);
    expect(mockHandleCallback.mock.calls[0]![0]).toMatchObject({
      callbackParams: {},
    });
  });

  it("still short-circuits provider errors before any dispatcher call", async () => {
    const res = await GET(
      callbackRequest("error=access_denied&realmId=42"),
      PARAMS,
    );
    expect(mockHandleCallback).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toContain("integration_error");
  });
});
