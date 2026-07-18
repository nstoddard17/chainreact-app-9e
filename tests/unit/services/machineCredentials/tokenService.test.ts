/**
 * @jest-environment node
 *
 * Tests for the client_credentials token service. The store (loadSecrets /
 * readCachedToken / persistCachedToken) and audit repo are mocked; the mTLS
 * client is injected. Verifies cache-hit, mint-on-miss, single-flight collapse,
 * cache persistence, 401 re-mint, and REDACTED mint errors (no secret/token/body).
 */

const store = {
  loadSecrets: jest.fn(),
  readCachedToken: jest.fn(),
  persistCachedToken: jest.fn(),
};
jest.mock("@/services/machineCredentials/store", () => ({
  loadSecrets: (...a: unknown[]) => store.loadSecrets(...a),
  readCachedToken: (...a: unknown[]) => store.readCachedToken(...a),
  persistCachedToken: (...a: unknown[]) => store.persistCachedToken(...a),
}));
jest.mock("@/repositories/machineCredentials", () => ({
  recordMachineCredentialAudit: jest.fn().mockResolvedValue(undefined),
}));

import {
  getMachineAccessToken,
  withMachineToken,
  MachineCredentialNotConnectedError,
  MachineTokenMintError,
  __resetMintLocksForTests,
  type ClientCredentialsTokenConfig,
} from "@/services/machineCredentials/tokenService";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { MtlsResponse, MtlsRequestInput } from "@/services/http/mtls";

const now = new Date("2030-01-01T00:00:00Z");
const tokenConfig: ClientCredentialsTokenConfig = {
  tokenUrl: "https://accounts.adp.com/auth/oauth/v2/token",
  clientAuth: "basic",
};

const LOADED = {
  record: { id: "cred-1", cachedAccessTokenEncrypted: null, cachedTokenExpiresAt: null },
  secrets: { clientId: "cid", clientSecret: "csecret", certPem: "CERT", keyPem: "KEY" },
};

function mtlsReturning(responses: Array<MtlsResponse | Error>) {
  let i = 0;
  const request = jest.fn(async (_input: MtlsRequestInput): Promise<MtlsResponse> => {
    const r = responses[Math.min(i, responses.length - 1)] as MtlsResponse | Error;
    i++;
    if (r instanceof Error) throw r;
    return r;
  });
  return { mtls: { request }, request };
}

function tokenBody(access = "minted-token", expiresIn = 3600) {
  return { status: 200, headers: {}, body: JSON.stringify({ access_token: access, expires_in: expiresIn }) };
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetMintLocksForTests();
  store.loadSecrets.mockResolvedValue(LOADED);
  store.readCachedToken.mockReturnValue(null);
  store.persistCachedToken.mockResolvedValue(undefined);
});

describe("getMachineAccessToken", () => {
  it("throws when no credential is connected", async () => {
    store.loadSecrets.mockResolvedValue(null);
    const { mtls } = mtlsReturning([tokenBody()]);
    await expect(
      getMachineAccessToken({ accountId: "a", provider: "adp", tokenConfig, now }, { mtls }),
    ).rejects.toBeInstanceOf(MachineCredentialNotConnectedError);
  });

  it("returns the cached token without minting when fresh", async () => {
    store.readCachedToken.mockReturnValue({ accessToken: "cached", expiresAt: "2030-01-01T01:00:00Z" });
    const { mtls, request } = mtlsReturning([tokenBody()]);
    const t = await getMachineAccessToken({ accountId: "a", provider: "adp", tokenConfig, now }, { mtls });
    expect(t.accessToken).toBe("cached");
    expect(request).not.toHaveBeenCalled();
  });

  it("mints on cache miss, sends Basic auth + client_credentials, and persists the token", async () => {
    const { mtls, request } = mtlsReturning([tokenBody("fresh-token", 1800)]);
    const t = await getMachineAccessToken({ accountId: "a", provider: "adp", tokenConfig, now }, { mtls });
    expect(t.accessToken).toBe("fresh-token");
    expect(t.expiresAt).toBe(new Date(now.getTime() + 1800 * 1000).toISOString());

    const call = request.mock.calls[0]![0];
    expect(call.method).toBe("POST");
    expect(call.headers?.authorization).toMatch(/^Basic /);
    expect(call.body).toContain("grant_type=client_credentials");
    // The cert/key are presented to the token endpoint (mutual TLS).
    expect(call.credential.certPem).toBe("CERT");

    expect(store.persistCachedToken).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "fresh-token" }),
    );
  });

  it("collapses concurrent callers into a single mint (single-flight)", async () => {
    const { mtls, request } = mtlsReturning([tokenBody()]);
    const [a, b, c] = await Promise.all([
      getMachineAccessToken({ accountId: "a", provider: "adp", tokenConfig, now }, { mtls }),
      getMachineAccessToken({ accountId: "a", provider: "adp", tokenConfig, now }, { mtls }),
      getMachineAccessToken({ accountId: "a", provider: "adp", tokenConfig, now }, { mtls }),
    ]);
    expect(request).toHaveBeenCalledTimes(1);
    expect([a.accessToken, b.accessToken, c.accessToken]).toEqual([
      "minted-token",
      "minted-token",
      "minted-token",
    ]);
  });

  it("sends client_id/secret in the body when clientAuth='body'", async () => {
    const { mtls, request } = mtlsReturning([tokenBody()]);
    await getMachineAccessToken(
      { accountId: "a", provider: "adp", tokenConfig: { ...tokenConfig, clientAuth: "body" }, now },
      { mtls },
    );
    const call = request.mock.calls[0]![0];
    expect(call.headers?.authorization).toBeUndefined();
    expect(call.body).toContain("client_id=cid");
    expect(call.body).toContain("client_secret=csecret");
  });
});

describe("mint errors (redacted)", () => {
  it("maps a non-2xx token response to MachineTokenMintError with the OAuth2 error code only", async () => {
    const { mtls } = mtlsReturning([
      { status: 401, headers: {}, body: JSON.stringify({ error: "invalid_client", error_description: "secret detail" }) },
    ]);
    try {
      await getMachineAccessToken({ accountId: "a", provider: "adp", tokenConfig, now }, { mtls });
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(MachineTokenMintError);
      expect((e as MachineTokenMintError).providerErrorCode).toBe("invalid_client");
      expect((e as MachineTokenMintError).status).toBe(401);
      // error_description must NOT leak into the message.
      expect((e as Error).message).not.toContain("secret detail");
    }
  });

  it("rejects a 200 response with no access_token", async () => {
    const { mtls } = mtlsReturning([{ status: 200, headers: {}, body: JSON.stringify({ token_type: "Bearer" }) }]);
    await expect(
      getMachineAccessToken({ accountId: "a", provider: "adp", tokenConfig, now }, { mtls }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
});

describe("withMachineToken", () => {
  it("re-mints once and retries on a 401 from the API call", async () => {
    // First getToken → mint 'tok-1'; apiCall throws 401; force-mint 'tok-2'; retry ok.
    const { mtls } = mtlsReturning([tokenBody("tok-1"), tokenBody("tok-2")]);
    const seen: string[] = [];
    const result = await withMachineToken(
      { accountId: "a", provider: "adp", tokenConfig, now },
      async (token) => {
        seen.push(token);
        if (seen.length === 1) throw new Unauthorized401Error();
        return "ok";
      },
      { mtls },
    );
    expect(result).toBe("ok");
    expect(seen).toEqual(["tok-1", "tok-2"]);
  });

  it("propagates non-401 errors without re-minting", async () => {
    const { mtls, request } = mtlsReturning([tokenBody("tok-1")]);
    await expect(
      withMachineToken(
        { accountId: "a", provider: "adp", tokenConfig, now },
        async () => {
          throw new Error("boom");
        },
        { mtls },
      ),
    ).rejects.toThrow("boom");
    expect(request).toHaveBeenCalledTimes(1); // no re-mint
  });
});
