/**
 * @jest-environment node
 *
 * REACT-AGENT-GUIDED-BUILD-1 — OAuth callback popup completion bridge.
 *
 * A connect flow launched from the builder's guided Connect stage carries an
 * allow-listed `returnContext` inside the SIGNED state. The callback must then
 * redirect the popup to the FIXED internal completion page (never /apps, never
 * a caller-supplied URL) for success and every error branch — and must keep
 * the classic /apps redirects byte-identical when no return context is present.
 */
const mockHandleCallback = jest.fn();
const mockCreate = jest.fn();
const mockConsumeByNonce = jest.fn();

jest.mock("@/services/oauth/dispatcher", () => {
  const actual = jest.requireActual("@/services/oauth/dispatcher");
  return {
    ...actual,
    handleCallback: (...args: unknown[]) => mockHandleCallback(...args),
  };
});

jest.mock("@/repositories/oauthStates", () => ({
  create: (...args: unknown[]) => mockCreate(...args),
  consumeByNonce: (...args: unknown[]) => mockConsumeByNonce(...args),
}));

import { randomBytes } from "node:crypto";
import { GET } from "@/app/api/integrations/oauth/[provider]/callback/route";
import { createState } from "@/services/oauth/state";
import { ReconnectIdentityMismatchError } from "@/services/oauth/dispatcher";

const TEST_KEY = randomBytes(32).toString("base64");
const PARAMS = { params: Promise.resolve({ provider: "slack" }) };
const ATTEMPT_NONCE = "attempt-nonce-1234";

beforeEach(() => {
  mockHandleCallback.mockReset();
  mockCreate.mockReset();
  mockCreate.mockResolvedValue(undefined);
  mockConsumeByNonce.mockReset();
  process.env.OAUTH_STATE_SIGNING_KEY = TEST_KEY;
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
});

afterEach(() => {
  delete process.env.OAUTH_STATE_SIGNING_KEY;
  delete process.env.NEXT_PUBLIC_APP_URL;
});

async function popupState(): Promise<string> {
  const { token } = await createState({
    userId: "user-1",
    accountId: "acct-1",
    provider: "slack",
    requestedScopes: [],
    returnContext: { surface: "builder_popup", nonce: ATTEMPT_NONCE },
  });
  return token;
}

async function plainState(): Promise<string> {
  const { token } = await createState({
    userId: "user-1",
    accountId: "acct-1",
    provider: "slack",
    requestedScopes: [],
  });
  return token;
}

function req(query: string): Request {
  return new Request(
    `https://app.example.test/api/integrations/oauth/slack/callback?${query}`,
  );
}

function location(res: Response): URL {
  const loc = res.headers.get("location");
  expect(loc).toBeTruthy();
  return new URL(loc!);
}

describe("popup flow (returnContext present in signed state)", () => {
  it("success redirects to the fixed completion page with status=connected + the attempt nonce", async () => {
    mockHandleCallback.mockResolvedValueOnce({ integration: { provider: "slack" } });
    const state = await popupState();
    const res = await GET(req(`code=abc&state=${encodeURIComponent(state)}`), PARAMS);
    const url = location(res);
    expect(url.pathname).toBe("/integrations/oauth-popup-complete");
    expect(url.searchParams.get("provider")).toBe("slack");
    expect(url.searchParams.get("status")).toBe("connected");
    expect(url.searchParams.get("nonce")).toBe(ATTEMPT_NONCE);
  });

  it("provider ?error= redirects to the completion page with status=error", async () => {
    const state = await popupState();
    const res = await GET(
      req(`error=access_denied&state=${encodeURIComponent(state)}`),
      PARAMS,
    );
    expect(mockHandleCallback).not.toHaveBeenCalled();
    const url = location(res);
    expect(url.pathname).toBe("/integrations/oauth-popup-complete");
    expect(url.searchParams.get("status")).toBe("error");
    expect(url.searchParams.get("code")).toBe("access_denied");
    expect(url.searchParams.get("nonce")).toBe(ATTEMPT_NONCE);
  });

  it("dispatcher failure redirects to the completion page with a STABLE redacted code", async () => {
    mockHandleCallback.mockRejectedValueOnce(
      new Error("raw provider secret-bearing message"),
    );
    const state = await popupState();
    const res = await GET(req(`code=abc&state=${encodeURIComponent(state)}`), PARAMS);
    const url = location(res);
    expect(url.pathname).toBe("/integrations/oauth-popup-complete");
    expect(url.searchParams.get("status")).toBe("error");
    expect(url.searchParams.get("code")).toBe("callback_failed");
    expect(url.toString()).not.toContain("secret-bearing");
  });

  it("reconnect identity mismatch keeps its stable code on the completion page", async () => {
    mockHandleCallback.mockRejectedValueOnce(new ReconnectIdentityMismatchError());
    const state = await popupState();
    const res = await GET(req(`code=abc&state=${encodeURIComponent(state)}`), PARAMS);
    const url = location(res);
    expect(url.pathname).toBe("/integrations/oauth-popup-complete");
    expect(url.searchParams.get("code")).toBe("reconnect_account_mismatch");
  });

  it("a FORGED (unsigned) state cannot steer the redirect — falls back to /apps", async () => {
    const forgedPayload = Buffer.from(
      JSON.stringify({
        userId: "u",
        accountId: "a",
        provider: "slack",
        nonce: "x",
        expiresAt: Math.floor(Date.now() / 1000) + 600,
        requestedScopes: [],
        returnContext: { surface: "builder_popup", nonce: ATTEMPT_NONCE },
      }),
    ).toString("base64url");
    mockHandleCallback.mockRejectedValueOnce(new Error("invalid state"));
    const res = await GET(
      req(`code=abc&state=${encodeURIComponent(`${forgedPayload}.AAAA`)}`),
      PARAMS,
    );
    const url = location(res);
    expect(url.pathname).toBe("/apps");
  });
});

describe("classic flow (no returnContext) is unchanged", () => {
  it("success still redirects to /apps?integration=connected", async () => {
    mockHandleCallback.mockResolvedValueOnce({ integration: { provider: "slack" } });
    const state = await plainState();
    const res = await GET(req(`code=abc&state=${encodeURIComponent(state)}`), PARAMS);
    const url = location(res);
    expect(url.pathname).toBe("/apps");
    expect(url.searchParams.get("integration")).toBe("connected");
    expect(url.searchParams.get("provider")).toBe("slack");
  });

  it("provider error still redirects to /apps?integration_error=", async () => {
    const state = await plainState();
    const res = await GET(
      req(`error=access_denied&state=${encodeURIComponent(state)}`),
      PARAMS,
    );
    const url = location(res);
    expect(url.pathname).toBe("/apps");
    expect(url.searchParams.get("integration_error")).toBe("access_denied");
  });

  it("missing code/state still redirects to /apps with the stable code", async () => {
    const res = await GET(req(""), PARAMS);
    const url = location(res);
    expect(url.pathname).toBe("/apps");
    expect(url.searchParams.get("integration_error")).toBe("missing_code_or_state");
  });
});
