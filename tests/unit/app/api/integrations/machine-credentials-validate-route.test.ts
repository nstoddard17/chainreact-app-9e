/**
 * @jest-environment node
 *
 * Tests for the pre-submit certificate validate route. Uses the REAL mTLS
 * certificate validation (fixture cert/key) behind mocked auth/authz, and asserts
 * it returns only SAFE metadata + typed codes — never the cert body or key.
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

import { POST } from "@/app/api/integrations/machine-credentials/[provider]/validate/route";
import {
  TEST_CLIENT_CERT_PEM,
  TEST_CLIENT_KEY_PEM,
} from "@/tests/fixtures/mtls/testCerts";
import { generateKeyPairSync } from "node:crypto";

const params = { params: Promise.resolve({ provider: "adp" }) };
function req(body: unknown) {
  return new Request("https://app.example.test/api/integrations/machine-credentials/adp/validate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
function ok() {
  mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  mockGetProvider.mockReturnValue({ authFlow: "machine_credentials", isEnabled: false });
  mockResolveActiveAccount.mockResolvedValue({ ok: true, accountId: "a1" });
  mockRequireAccountRole.mockResolvedValue({ ok: true, role: "owner" });
}

beforeEach(() => jest.clearAllMocks());

describe("POST validate — authz", () => {
  it("401 unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await POST(req({}), params)).status).toBe(401);
  });
  it("403 for a non-owner/admin member", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockGetProvider.mockReturnValue({ authFlow: "machine_credentials", isEnabled: false });
    mockResolveActiveAccount.mockResolvedValue({ ok: true, accountId: "a1" });
    mockRequireAccountRole.mockResolvedValue({ ok: false, reason: "forbidden" });
    expect((await POST(req({ certPem: "x", keyPem: "y" }), params)).status).toBe(403);
  });
});

describe("POST validate — parsing (safe metadata only)", () => {
  it("returns keyMatches:true + subject for a matching cert/key, no secret echoed", async () => {
    ok();
    const res = await POST(req({ certPem: TEST_CLIENT_CERT_PEM, keyPem: TEST_CLIENT_KEY_PEM }), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cert.keyMatches).toBe(true);
    expect(body.cert.subject).toContain("CN=chainreact-mtls-test");
    expect(body.cert.fingerprint256).toMatch(/^[0-9A-F:]+$/);
    // Never echoes the cert body or key.
    expect(JSON.stringify(body)).not.toContain("BEGIN CERTIFICATE");
    expect(JSON.stringify(body)).not.toContain("PRIVATE KEY");
  });

  it("reports keyMatches:false for a non-matching key", async () => {
    ok();
    const other = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const otherKey = other.privateKey.export({ type: "sec1", format: "pem" }) as string;
    const res = await POST(req({ certPem: TEST_CLIENT_CERT_PEM, keyPem: otherKey }), params);
    const body = await res.json();
    expect(body.cert.keyMatches).toBe(false);
    expect(body.ok).toBe(false);
  });

  it("returns a typed code for an unparseable certificate", async () => {
    ok();
    const res = await POST(req({ certPem: "-----BEGIN CERTIFICATE-----\nbad\n-----END CERTIFICATE-----", keyPem: TEST_CLIENT_KEY_PEM }), params);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("certificate_parse_failed");
  });

  it("400 when cert or key is missing", async () => {
    ok();
    expect((await POST(req({ certPem: "", keyPem: "" }), params)).status).toBe(400);
  });
});
