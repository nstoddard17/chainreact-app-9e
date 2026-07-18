/**
 * @jest-environment node
 *
 * Route authz + failure-path tests for the machine-credential connect/disconnect
 * routes. Mocks supabase auth + the active-account resolver + role gate + the
 * connect service, so the ROUTE's own guards are isolated: auth → provider gate
 * (exists / machine-flow / enabled) → owner/admin → service → typed HTTP mapping.
 * Load-bearing: an unauthorized/member caller is refused BEFORE the service, and
 * NO secret ever appears in a response.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockGetProvider = jest.fn();
jest.mock("@/integrations/_registry", () => ({
  getProvider: (...a: unknown[]) => mockGetProvider(...a),
}));

const mockResolveActiveAccount = jest.fn();
jest.mock("@/services/accounts/activeAccount", () => ({
  resolveActiveAccount: (...a: unknown[]) => mockResolveActiveAccount(...a),
}));

const mockRequireAccountRole = jest.fn();
jest.mock("@/services/accounts/accountAuthz", () => ({
  requireAccountRole: (...a: unknown[]) => mockRequireAccountRole(...a),
}));

const mockConnect = jest.fn();
const mockDisconnect = jest.fn();
jest.mock("@/services/machineCredentials/connect", () => {
  const actual = jest.requireActual("@/services/machineCredentials/connect");
  return {
    ...actual,
    connectMachineCredential: (...a: unknown[]) => mockConnect(...a),
    disconnectMachineProvider: (...a: unknown[]) => mockDisconnect(...a),
  };
});

import { POST as CONNECT } from "@/app/api/integrations/machine-credentials/[provider]/connect/route";
import { POST as DISCONNECT } from "@/app/api/integrations/machine-credentials/[provider]/disconnect/route";
import { MachineConnectInputError } from "@/services/machineCredentials/types";
import { CertificateExpiredError } from "@/services/http/mtls";
import { UnsupportedMachineProviderError } from "@/services/machineCredentials/connect";

const ACCOUNT = "acct-1";
const params = { params: Promise.resolve({ provider: "adp" }) };

function req(body: unknown) {
  return new Request("https://app.example.test/api/integrations/machine-credentials/adp/connect", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
const goodBody = {
  clientId: "cid",
  clientSecret: "SUPER-SECRET",
  certPem: "CERT",
  keyPem: "KEY",
  environment: "iat",
};

function signedIn() {
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
}
function machineProvider(enabled = true) {
  mockGetProvider.mockReturnValue({ authFlow: "machine_credentials", isEnabled: enabled });
}
function activeOk() {
  mockResolveActiveAccount.mockResolvedValue({ ok: true, accountId: ACCOUNT });
}
function ownerAdmin() {
  mockRequireAccountRole.mockResolvedValue({ ok: true, role: "owner" });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST connect — authz gating", () => {
  it("401 when unauthenticated (service untouched)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await CONNECT(req(goodBody), params);
    expect(res.status).toBe(401);
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("404 when the provider is not a machine-credential provider", async () => {
    signedIn();
    mockGetProvider.mockReturnValue({ authFlow: "code_callback", isEnabled: true });
    const res = await CONNECT(req(goodBody), params);
    expect(res.status).toBe(404);
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("403 when the provider is disabled (ADP today)", async () => {
    signedIn();
    machineProvider(false);
    const res = await CONNECT(req(goodBody), params);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("provider_disabled");
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("403 when the caller is not owner/admin (member denied)", async () => {
    signedIn();
    machineProvider();
    activeOk();
    mockRequireAccountRole.mockResolvedValue({ ok: false, reason: "forbidden" });
    const res = await CONNECT(req(goodBody), params);
    expect(res.status).toBe(403);
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("403 when the caller is not a member of any active account", async () => {
    signedIn();
    machineProvider();
    mockResolveActiveAccount.mockResolvedValue({ ok: false, reason: "not_member" });
    const res = await CONNECT(req(goodBody), params);
    expect(res.status).toBe(403);
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("400 on a non-JSON body", async () => {
    signedIn();
    machineProvider();
    const res = await CONNECT(req("not json"), params);
    expect(res.status).toBe(400);
  });
});

describe("POST connect — success + failure mapping (no secret leak)", () => {
  beforeEach(() => {
    signedIn();
    machineProvider();
    activeOk();
    ownerAdmin();
  });

  it("owner/admin connect returns the safe DTO and NEVER echoes secrets", async () => {
    const dto = {
      id: "cred-1",
      provider: "adp",
      certFingerprint256: "AB:CD",
      certSubject: "CN=x",
      certNotAfter: "2126-01-01T00:00:00Z",
      environment: "iat",
    };
    mockConnect.mockResolvedValue(dto);
    const res = await CONNECT(req(goodBody), params);
    expect(res.status).toBe(200);
    const bodyText = JSON.stringify(await res.json());
    expect(bodyText).not.toContain("SUPER-SECRET");
    expect(bodyText).not.toContain("KEY");
    expect(mockConnect).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: ACCOUNT, provider: "adp", actorUserId: "user-1" }),
    );
  });

  it("maps a MachineConnectInputError to 400 with its code (no value echoed)", async () => {
    mockConnect.mockRejectedValue(new MachineConnectInputError("invalid_client_id", "bad"));
    const res = await CONNECT(req(goodBody), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_client_id");
  });

  it("maps a redacted certificate error to 400 with the cert code", async () => {
    mockConnect.mockRejectedValue(new CertificateExpiredError("2020-01-01T00:00:00Z"));
    const res = await CONNECT(req(goodBody), params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("certificate_expired");
    expect(JSON.stringify(body)).not.toContain("BEGIN");
  });

  it("maps an unsupported provider to 404", async () => {
    mockConnect.mockRejectedValue(new UnsupportedMachineProviderError("adp"));
    const res = await CONNECT(req(goodBody), params);
    expect(res.status).toBe(404);
  });

  it("collapses an unexpected error to a generic 400 code", async () => {
    mockConnect.mockRejectedValue(new Error("stack trace with /secret/path"));
    const res = await CONNECT(req(goodBody), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("connect_failed");
  });
});

describe("POST disconnect", () => {
  it("401 unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await DISCONNECT(req({}), params);
    expect(res.status).toBe(401);
    expect(mockDisconnect).not.toHaveBeenCalled();
  });

  it("403 for a member (not owner/admin)", async () => {
    signedIn();
    machineProvider();
    activeOk();
    mockRequireAccountRole.mockResolvedValue({ ok: false, reason: "forbidden" });
    const res = await DISCONNECT(req({}), params);
    expect(res.status).toBe(403);
    expect(mockDisconnect).not.toHaveBeenCalled();
  });

  it("owner/admin disconnect returns the result", async () => {
    signedIn();
    machineProvider();
    activeOk();
    ownerAdmin();
    mockDisconnect.mockResolvedValue({ disconnected: true });
    const res = await DISCONNECT(req({}), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ disconnected: true });
  });
});
