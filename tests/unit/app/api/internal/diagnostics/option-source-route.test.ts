/**
 * @jest-environment node
 *
 * Tests for `app/api/internal/diagnostics/option-source/route.ts` and the gate
 * in `app/api/internal/diagnostics/_shared.ts` (Slice 4.MCP-STAGE-2B-1).
 *
 * The route runs the REAL `resolveOptionsSource` service (so mapping + no-leak
 * are genuine); only the leaf boundaries are mocked — same surface as
 * `tests/unit/app/api/options/options-route.test.ts`:
 *   - `getActiveForExecution`, `ensurePersonalAccount`, `getById`,
 *     `resolveEffectiveNodeOwner`, and `getOptionsResolver`.
 * There is NO `requireUser`/Supabase-auth mock — the diagnostic route has no
 * browser cookie; the machine bearer is the trust boundary and the subject is
 * the explicit `userId` in the body.
 */

const mockGetActiveForExecution = jest.fn();
const mockMarkNeedsReconnect = jest.fn((..._args: unknown[]): Promise<boolean> => Promise.resolve(false));
const mockClearNeedsReconnect = jest.fn((..._args: unknown[]) => Promise.resolve());
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) =>
    mockGetActiveForExecution(...args),
  // V2-READY-28 — resolveOptionsSource marks/clears the reconnect-needed signal on
  // the PROVIDER_REAUTH_REQUIRED / successful-load arms. markNeedsReconnect returns a
  // boolean (true = first-mark transition, V2-READY-28B). These were missing from this
  // diagnostics-route mock (the sibling live-route test already had them), so the real
  // resolver hit an undefined function and the reauth code surfaced as SERVER_ERROR.
  markNeedsReconnect: (...args: unknown[]) => mockMarkNeedsReconnect(...args),
  clearNeedsReconnect: (...args: unknown[]) => mockClearNeedsReconnect(...args),
}));

// V2-READY-28B — resolveOptionsSource fires a one-shot reconnect notification on a
// true first-mark. Mock the service so this route test never creates real rows.
const mockNotifyReconnectNeeded = jest.fn((..._args: unknown[]) => Promise.resolve());
jest.mock("@/services/integrations/reconnectNotification", () => ({
  notifyReconnectNeeded: (...args: unknown[]) => mockNotifyReconnectNeeded(...args),
}));

const mockResolveOwner = jest.fn();
jest.mock("@/services/teamCredentials/nodeCredentialOwners", () => ({
  resolveEffectiveNodeOwner: (...args: unknown[]) => mockResolveOwner(...args),
}));

const mockGetById = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getById: (...args: unknown[]) => mockGetById(...args),
}));

const mockEnsurePersonalAccount = jest.fn(async (userId: string) => ({
  id: `acct-${userId}`,
  type: "personal" as const,
  ownerUserId: userId,
  createdAt: "2026-05-30T00:00:00Z",
  updatedAt: "2026-05-30T00:00:00Z",
}));
jest.mock("@/services/accounts/ensurePersonalAccount", () => ({
  ensurePersonalAccount: (userId: string) => mockEnsurePersonalAccount(userId),
}));

const mockGetOptionsResolver = jest.fn();
jest.mock("@/services/options/_registry", () => {
  const actual = jest.requireActual<typeof import("@/services/options/_registry")>(
    "@/services/options/_registry",
  );
  return {
    ...actual,
    getOptionsResolver: (...args: unknown[]) => mockGetOptionsResolver(...args),
  };
});

import { POST } from "@/app/api/internal/diagnostics/option-source/route";
import { applyDiagnosticsGate } from "@/app/api/internal/diagnostics/_shared";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";

const realGetOptionsResolver =
  jest.requireActual<typeof import("@/services/options/_registry")>(
    "@/services/options/_registry",
  ).getOptionsResolver;

const GOOD_TOKEN = "diagnostics-token-abcdef*0123456789";

beforeEach(() => {
  mockGetActiveForExecution.mockReset();
  mockGetById.mockReset();
  mockResolveOwner.mockReset();
  mockResolveOwner.mockResolvedValue(null);
  mockGetOptionsResolver.mockReset();
  mockGetOptionsResolver.mockImplementation((source: string) =>
    realGetOptionsResolver(source),
  );
  process.env.DIAGNOSTICS_API_ENABLED = "1";
  process.env.DIAGNOSTICS_API_TOKEN = GOOD_TOKEN;
  delete process.env.DIAGNOSTICS_API_ALLOW_PROD;
});

function makeReq(body: unknown, token: string | null = GOOD_TOKEN): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  return new Request("http://x/api/internal/diagnostics/option-source", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

// ───────────────────────────── Gate (unit) ─────────────────────────────
describe("applyDiagnosticsGate — env injection (deterministic)", () => {
  const req = () =>
    new Request("http://x", { headers: { authorization: `Bearer ${GOOD_TOKEN}` } });

  it("404 when DIAGNOSTICS_API_ENABLED is unset (non-disclosure)", () => {
    const g = applyDiagnosticsGate(req(), { DIAGNOSTICS_API_TOKEN: GOOD_TOKEN });
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.response.status).toBe(404);
  });

  it("404 in production without DIAGNOSTICS_API_ALLOW_PROD", () => {
    const g = applyDiagnosticsGate(req(), {
      DIAGNOSTICS_API_ENABLED: "1",
      DIAGNOSTICS_API_TOKEN: GOOD_TOKEN,
      NODE_ENV: "production",
    });
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.response.status).toBe(404);
  });

  it("allowed in production WITH DIAGNOSTICS_API_ALLOW_PROD + good bearer", () => {
    const g = applyDiagnosticsGate(req(), {
      DIAGNOSTICS_API_ENABLED: "1",
      DIAGNOSTICS_API_ALLOW_PROD: "1",
      DIAGNOSTICS_API_TOKEN: GOOD_TOKEN,
      NODE_ENV: "production",
    });
    expect(g.ok).toBe(true);
  });

  it("401 on wrong bearer when enabled", () => {
    const r = new Request("http://x", { headers: { authorization: "Bearer nope" } });
    const g = applyDiagnosticsGate(r, {
      DIAGNOSTICS_API_ENABLED: "1",
      DIAGNOSTICS_API_TOKEN: GOOD_TOKEN,
    });
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.response.status).toBe(401);
  });

  it("401 when the server token is unset (fails closed)", () => {
    const g = applyDiagnosticsGate(req(), {
      DIAGNOSTICS_API_ENABLED: "1",
    });
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.response.status).toBe(401);
  });
});

describe("POST /api/internal/diagnostics/option-source — gate (route)", () => {
  it("404 when disabled, regardless of a valid bearer", async () => {
    delete process.env.DIAGNOSTICS_API_ENABLED;
    const res = await POST(makeReq({ source: "native:examples", userId: "u1" }));
    expect(res.status).toBe(404);
  });

  it("401 when bearer is missing (route enabled)", async () => {
    const res = await POST(makeReq({ source: "native:examples", userId: "u1" }, null));
    expect(res.status).toBe(401);
  });

  it("401 when bearer is wrong", async () => {
    const res = await POST(makeReq({ source: "native:examples", userId: "u1" }, "wrong"));
    expect(res.status).toBe(401);
  });

  it("the configured token never appears in any gate response body", async () => {
    delete process.env.DIAGNOSTICS_API_ENABLED;
    const r404 = await POST(makeReq({ source: "native:examples", userId: "u1" }));
    expect(await r404.text()).not.toContain(GOOD_TOKEN);
    process.env.DIAGNOSTICS_API_ENABLED = "1";
    const r401 = await POST(makeReq({ source: "native:examples", userId: "u1" }, "wrong"));
    expect(await r401.text()).not.toContain(GOOD_TOKEN);
  });

  it("proceeds (200) when enabled + good bearer", async () => {
    // native:examples requires a dep — reaching MISSING_DEPENDENCY proves the
    // gate let the request through.
    const res = await POST(makeReq({ source: "native:examples", userId: "u1" }));
    expect(res.status).toBe(200);
  });
});

// ───────────────────────── Input validation ─────────────────────────
describe("POST … — input validation", () => {
  it("400 when source is missing", async () => {
    const res = await POST(makeReq({ userId: "u1" }));
    expect(res.status).toBe(400);
  });
  it("400 when source is malformed", async () => {
    const res = await POST(makeReq({ source: "not a key", userId: "u1" }));
    expect(res.status).toBe(400);
  });
  it("400 when userId is missing", async () => {
    const res = await POST(makeReq({ source: "native:examples" }));
    expect(res.status).toBe(400);
  });
  it("400 when deps is not a flat string map", async () => {
    const res = await POST(
      makeReq({ source: "native:examples", userId: "u1", deps: { a: 5 } }),
    );
    expect(res.status).toBe(400);
  });
  it("400 on a non-JSON body", async () => {
    const req = new Request("http://x/api/internal/diagnostics/option-source", {
      method: "POST",
      headers: { authorization: `Bearer ${GOOD_TOKEN}`, "content-type": "application/json" },
      body: "{not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

// ─────────────────── Per-code mapping (closed taxonomy) ───────────────────
const syntheticIntegration: OptionsResolver = {
  source: "synthetic:integration",
  provider: "synthetic",
  requiresIntegration: true,
  resolve: jest.fn(),
};
const accountResolver: OptionsResolver = {
  source: "slackopt:resource",
  provider: "slack", // account-shared
  requiresIntegration: true,
  resolve: jest.fn(),
};
const personalResolver: OptionsResolver = {
  source: "gmailopt:resource",
  provider: "gmail", // personal
  requiresIntegration: true,
  resolve: jest.fn(),
};

describe("POST … — maps every closed OptionsSourceErrorCode", () => {
  it("SOURCE_NOT_FOUND for a well-formed but unregistered key", async () => {
    const res = await POST(makeReq({ source: "ghost:nothing", userId: "u1" }));
    const dto = await res.json();
    expect(dto).toMatchObject({ ok: false, code: "SOURCE_NOT_FOUND", itemCount: 0 });
  });

  it("MISSING_DEPENDENCY (with missingDependency name) ", async () => {
    const res = await POST(makeReq({ source: "native:examples", userId: "u1" }));
    const dto = await res.json();
    expect(dto).toMatchObject({
      ok: false,
      code: "MISSING_DEPENDENCY",
      missingDependency: "category",
    });
  });

  it("INTEGRATION_DISCONNECTED when no active row", async () => {
    mockGetOptionsResolver.mockReturnValue(syntheticIntegration);
    mockGetActiveForExecution.mockResolvedValue(null);
    const res = await POST(makeReq({ source: "synthetic:integration", userId: "u1" }));
    const dto = await res.json();
    expect(dto).toMatchObject({
      ok: false,
      code: "INTEGRATION_DISCONNECTED",
      requiresIntegration: true,
      integrationConnected: false,
    });
  });

  it("OWNER_MUST_CONNECT — creator editing, no connection", async () => {
    mockGetOptionsResolver.mockReturnValue(personalResolver);
    mockGetActiveForExecution.mockResolvedValue(null);
    mockGetById.mockResolvedValue({ id: "wf-9", createdByUserId: "u1", accountId: "acct-team" });
    const res = await POST(
      makeReq({ source: "gmailopt:resource", userId: "u1", workflowId: "wf-9" }),
    );
    const dto = await res.json();
    expect(dto).toMatchObject({
      ok: false,
      code: "OWNER_MUST_CONNECT",
      credentialDecision: "personal-creator",
    });
  });

  it("NOT_WORKFLOW_OWNER — non-creator on a personal provider", async () => {
    mockGetOptionsResolver.mockReturnValue(personalResolver);
    mockGetById.mockResolvedValue({
      id: "wf-9",
      createdByUserId: "creator-42",
      accountId: "acct-team",
    });
    const res = await POST(
      makeReq({ source: "gmailopt:resource", userId: "u1", workflowId: "wf-9" }),
    );
    const dto = await res.json();
    expect(dto).toMatchObject({ ok: false, code: "NOT_WORKFLOW_OWNER" });
  });

  it("PROVIDER_ERROR from an OptionsResolverError", async () => {
    mockGetOptionsResolver.mockReturnValue({
      ...syntheticIntegration,
      resolve: jest.fn().mockRejectedValue(
        new OptionsResolverError("PROVIDER_ERROR", "Provider said no."),
      ),
    });
    mockGetActiveForExecution.mockResolvedValue({ id: "int-1", provider: "synthetic" });
    const res = await POST(makeReq({ source: "synthetic:integration", userId: "u1" }));
    const dto = await res.json();
    expect(dto).toMatchObject({ ok: false, code: "PROVIDER_ERROR" });
  });

  it("PROVIDER_REAUTH_REQUIRED from an OptionsResolverError", async () => {
    mockGetOptionsResolver.mockReturnValue({
      ...syntheticIntegration,
      resolve: jest.fn().mockRejectedValue(
        new OptionsResolverError("PROVIDER_REAUTH_REQUIRED", "Reconnect."),
      ),
    });
    mockGetActiveForExecution.mockResolvedValue({ id: "int-1", provider: "synthetic" });
    const res = await POST(makeReq({ source: "synthetic:integration", userId: "u1" }));
    const dto = await res.json();
    expect(dto).toMatchObject({ ok: false, code: "PROVIDER_REAUTH_REQUIRED" });
  });

  it("SERVER_ERROR on an uncaught resolver throw", async () => {
    mockGetOptionsResolver.mockReturnValue({
      ...syntheticIntegration,
      resolve: jest.fn().mockRejectedValue(new Error("boom internals")),
    });
    mockGetActiveForExecution.mockResolvedValue({ id: "int-1", provider: "synthetic" });
    const res = await POST(makeReq({ source: "synthetic:integration", userId: "u1" }));
    const dto = await res.json();
    expect(dto).toMatchObject({ ok: false, code: "SERVER_ERROR" });
    // Underlying error never leaks.
    expect(JSON.stringify(dto)).not.toMatch(/boom|internals/i);
  });

  it("SERVER_ERROR on an integration-lookup throw (sanitized)", async () => {
    mockGetOptionsResolver.mockReturnValue(syntheticIntegration);
    mockGetActiveForExecution.mockRejectedValue(
      new Error("supabase: secret connection string leaked here"),
    );
    const res = await POST(makeReq({ source: "synthetic:integration", userId: "u1" }));
    const dto = await res.json();
    expect(dto).toMatchObject({ ok: false, code: "SERVER_ERROR" });
    expect(JSON.stringify(dto)).not.toMatch(/supabase|secret|connection/i);
  });
});

// ───────────────────────── Success: count only ─────────────────────────
describe("POST … — success returns count only, never items", () => {
  it("returns itemCount and drops the items / labels / values", async () => {
    mockGetOptionsResolver.mockReturnValue({
      ...accountResolver,
      resolve: jest.fn().mockResolvedValue({
        items: [
          { value: "C1", label: "#secret-finance", description: "Private channel" },
          { value: "C2", label: "#leadership" },
        ],
        hasMore: true,
      }),
    });
    mockGetActiveForExecution.mockResolvedValue({ id: "int-1", provider: "slack" });
    mockGetById.mockResolvedValue({
      id: "wf-9",
      createdByUserId: "creator-42",
      accountId: "acct-team",
    });

    const res = await POST(
      makeReq({ source: "slackopt:resource", userId: "u1", workflowId: "wf-9" }),
    );
    const dto = await res.json();
    expect(dto).toMatchObject({
      ok: true,
      source: "slackopt:resource",
      code: null,
      itemCount: 2,
      hasMore: true,
      credentialDecision: "account",
      requiresIntegration: true,
      integrationConnected: true,
    });
    const json = JSON.stringify(dto);
    // No item labels / channel names / values.
    expect(json).not.toContain("secret-finance");
    expect(json).not.toContain("leadership");
    expect(json).not.toContain("Private channel");
    expect(json).not.toContain("C1");
    expect(dto).not.toHaveProperty("items");
  });
});

// ───────────────────────── No-leak guarantees ─────────────────────────
describe("POST … — no-leak", () => {
  it("never serializes token blobs, scopes, connectedByUserId, message, or items", async () => {
    const integrationRow = {
      id: "int-slack",
      accountId: "acct-team",
      connectedByUserId: "creator-SECRET-42",
      provider: "slack",
      providerAccountId: "T01TEAM",
      displayName: "Acme Workspace",
      accessTokenEncrypted: "enc:VERYSECRETCIPHER",
      refreshTokenEncrypted: "enc:REFRESHSECRET",
      accessTokenExpiresAt: null,
      scopes: ["channels:read", "groups:read"],
      accountMetadata: { team: "Acme" },
      disconnectedAt: null,
      createdAt: "2026-05-22T00:00:00Z",
      updatedAt: "2026-05-22T00:00:00Z",
    };
    mockGetOptionsResolver.mockReturnValue({
      ...accountResolver,
      resolve: jest.fn().mockResolvedValue({
        items: [{ value: "C1", label: "#general" }],
        hasMore: false,
      }),
    });
    mockGetActiveForExecution.mockResolvedValue(integrationRow);
    mockGetById.mockResolvedValue({
      id: "wf-9",
      createdByUserId: "creator-42",
      accountId: "acct-team",
    });

    const res = await POST(
      makeReq({ source: "slackopt:resource", userId: "u1", workflowId: "wf-9" }),
    );
    const dto = await res.json();
    const json = JSON.stringify(dto);
    for (const forbidden of [
      "VERYSECRETCIPHER",
      "REFRESHSECRET",
      "channels:read",
      "groups:read",
      "creator-SECRET-42",
      "enc:",
      "general",
      "Acme",
    ]) {
      expect(json).not.toContain(forbidden);
    }
    for (const key of [
      "accessTokenEncrypted",
      "refreshTokenEncrypted",
      "scopes",
      "connectedByUserId",
      "message",
      "items",
    ]) {
      expect(dto).not.toHaveProperty(key);
    }
  });
});

// ───────────── NOT_WORKFLOW_OWNER performs NO credential fetch ─────────────
describe("POST … — not-owner fetches nothing", () => {
  it("does not call getActiveForExecution for a non-creator on a personal provider", async () => {
    mockGetOptionsResolver.mockReturnValue(personalResolver);
    (personalResolver.resolve as jest.Mock).mockClear();
    mockGetById.mockResolvedValue({
      id: "wf-9",
      createdByUserId: "creator-42",
      accountId: "acct-team",
    });
    const res = await POST(
      makeReq({ source: "gmailopt:resource", userId: "u1", workflowId: "wf-9" }),
    );
    const dto = await res.json();
    expect(dto.code).toBe("NOT_WORKFLOW_OWNER");
    expect(mockGetActiveForExecution).not.toHaveBeenCalled();
    expect(personalResolver.resolve).not.toHaveBeenCalled();
  });
});
