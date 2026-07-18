/**
 * @jest-environment node
 *
 * ADP API client tests. The machine-credential store is mocked (loadSecrets),
 * the mTLS client is injected, and the audit repo is stubbed — so the REAL client
 * path (load creds → mint token → mTLS call with Bearer + cert) runs against a
 * mocked ADP network boundary. Verifies: cert + Bearer presented, base url per
 * environment, bounded JSON, typed AdpApiError on non-2xx, and 401 → re-mint.
 */

const store = {
  loadSecrets: jest.fn(),
  readCachedToken: jest.fn((..._a: unknown[]) => null),
  persistCachedToken: jest.fn((..._a: unknown[]) => Promise.resolve(undefined)),
};
jest.mock("@/services/machineCredentials/store", () => ({
  loadSecrets: (...a: unknown[]) => store.loadSecrets(...a),
  readCachedToken: (...a: unknown[]) => store.readCachedToken(...a),
  persistCachedToken: (...a: unknown[]) => store.persistCachedToken(...a),
}));
jest.mock("@/repositories/machineCredentials", () => ({
  recordMachineCredentialAudit: jest.fn().mockResolvedValue(undefined),
}));

import { adpRequest, AdpApiError } from "@/integrations/adp/api/_request";
import { MachineCredentialNotConnectedError } from "@/services/machineCredentials/tokenService";
import { __resetMintLocksForTests } from "@/services/machineCredentials/tokenService";
import type { MtlsRequestInput, MtlsResponse } from "@/services/http/mtls";

const now = new Date("2030-01-01T00:00:00Z");

const LOADED = {
  record: {
    id: "cred-1",
    cachedAccessTokenEncrypted: null,
    cachedTokenExpiresAt: null,
    metadata: { environment: "prod", apiBaseUrl: "https://api.adp.com" },
  },
  secrets: { clientId: "cid", clientSecret: "csecret", certPem: "ADP-CERT", keyPem: "ADP-KEY" },
};

/** Injected mTLS that plays a scripted set of responses (token mint first). */
function mtlsScript(steps: Array<MtlsResponse | Error>) {
  const calls: MtlsRequestInput[] = [];
  let i = 0;
  const request = jest.fn(async (input: MtlsRequestInput): Promise<MtlsResponse> => {
    calls.push(input);
    const step = steps[Math.min(i, steps.length - 1)] as MtlsResponse | Error;
    i++;
    if (step instanceof Error) throw step;
    return step;
  });
  return { mtls: { request }, calls };
}

const tokenResp = (tok = "tok"): MtlsResponse => ({
  status: 200,
  headers: {},
  body: JSON.stringify({ access_token: tok, expires_in: 3600 }),
});

beforeEach(() => {
  jest.clearAllMocks();
  __resetMintLocksForTests();
  store.loadSecrets.mockResolvedValue(LOADED);
});

it("throws when no ADP credential is connected", async () => {
  store.loadSecrets.mockResolvedValue(null);
  const { mtls } = mtlsScript([tokenResp()]);
  await expect(
    adpRequest({ accountId: "a", method: "GET", path: "/hr/v2/workers", now }, mtls ? { mtls } : undefined),
  ).rejects.toBeInstanceOf(MachineCredentialNotConnectedError);
});

it("mints a token then calls ADP with Bearer + client cert on api.adp.com", async () => {
  const workers: MtlsResponse = {
    status: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workers: [{ associateOID: "W1" }] }),
  };
  const { mtls, calls } = mtlsScript([tokenResp("adp-token"), workers]);
  const res = await adpRequest(
    { accountId: "a", method: "GET", path: "/hr/v2/workers", query: { $top: 5 }, now },
    { mtls },
  );

  expect(res.status).toBe(200);
  expect(res.json).toEqual({ workers: [{ associateOID: "W1" }] });

  // First call = token mint (to accounts.adp.com), presenting the cert.
  expect(calls[0]!.url).toContain("accounts.adp.com");
  expect(calls[0]!.credential.certPem).toBe("ADP-CERT");
  // Second call = the API call: Bearer + cert, on api.adp.com with the query.
  expect(calls[1]!.url).toBe("https://api.adp.com/hr/v2/workers?%24top=5");
  expect(calls[1]!.headers?.authorization).toBe("Bearer adp-token");
  expect(calls[1]!.credential.certPem).toBe("ADP-CERT");
});

it("maps a non-2xx ADP response to a typed AdpApiError with a bounded code", async () => {
  const err: MtlsResponse = {
    status: 400,
    headers: {},
    body: JSON.stringify({
      confirmMessage: { processMessages: [{ processMessage: { codeValue: "WFN.0001" } }] },
    }),
  };
  const { mtls } = mtlsScript([tokenResp(), err]);
  try {
    await adpRequest({ accountId: "a", method: "GET", path: "/hr/v2/workers", now }, { mtls });
    throw new Error("expected throw");
  } catch (e) {
    expect(e).toBeInstanceOf(AdpApiError);
    expect((e as AdpApiError).status).toBe(400);
    expect((e as AdpApiError).providerErrorCode).toBe("WFN.0001");
  }
});

it("on 401 force-mints a fresh token and retries the call once", async () => {
  const unauthorized: MtlsResponse = { status: 401, headers: {}, body: "" };
  const ok: MtlsResponse = { status: 200, headers: {}, body: JSON.stringify({ ok: true }) };
  // mint tok-1 → api 401 → force-mint tok-2 → api 200
  const { mtls, calls } = mtlsScript([tokenResp("tok-1"), unauthorized, tokenResp("tok-2"), ok]);
  const res = await adpRequest({ accountId: "a", method: "GET", path: "/hr/v2/workers", now }, { mtls });
  expect(res.json).toEqual({ ok: true });
  // Final (4th) call carried the re-minted token.
  expect(calls[3]!.headers?.authorization).toBe("Bearer tok-2");
});
