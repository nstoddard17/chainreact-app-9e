/**
 * @jest-environment node
 *
 * Slice 4.WORKFLOW-PORTABILITY-TEMPLATES-TIER-POLICY-3 / CS-XT-2+3 — tier gating + downgrade
 * bypass on GET /api/accounts/[id]/workflows/export. Mocks supabase auth, the role gate, the
 * workflows + accounts repos, the export-tier + downgrade flags, and the plan-capability resolver.
 * Proves: flag OFF preserves any-member access (no capability read); flag ON tier+role-gates the
 * normal bulk export using the ACTUAL plan; and the `?purpose=downgrade` owner-only org-only path
 * bypasses the tier gate while still sanitizing.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockRequireRole = jest.fn();
jest.mock("@/services/accounts/accountAuthz", () => ({
  requireAccountRole: (...a: unknown[]) => mockRequireRole(...a),
}));

const mockListByAccount = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  listByAccount: (...a: unknown[]) => mockListByAccount(...a),
}));

const mockGetAccount = jest.fn();
jest.mock("@/repositories/accounts", () => ({
  getById: (...a: unknown[]) => mockGetAccount(...a),
}));

const mockTierGatingEnabled = jest.fn();
jest.mock("@/services/workflows/portabilityFlags", () => ({
  isExportTierGatingEnabled: () => mockTierGatingEnabled(),
}));

const mockDowngradeEnabled = jest.fn();
jest.mock("@/services/billing/billingFeatureFlags", () => ({
  isBusinessDowngradeEnabled: () => mockDowngradeEnabled(),
}));

const mockResolveCaps = jest.fn();
jest.mock("@/services/billing/planCapabilities", () => ({
  resolveAccountCapabilities: (...a: unknown[]) => mockResolveCaps(...a),
}));

import { GET } from "@/app/api/accounts/[id]/workflows/export/route";
import { REDACTION_MARKER } from "@/services/workflows/exportWorkflow";

const ACCOUNT = "acct-gate";

function rec(id: string, name: string, token: string) {
  return {
    id,
    accountId: ACCOUNT,
    createdByUserId: "user-leak",
    name,
    state: "draft",
    draftDefinition: {
      nodes: [
        {
          id: "n1",
          kind: "action",
          provider: "slack",
          type: "post",
          position: { x: 0, y: 0 },
          config: { channel: "C1", botToken: token, contact: "vp@acme.com" },
        },
      ],
      edges: [],
    },
  };
}

function req(query = ""): Request {
  return new Request(`http://x/api/accounts/${ACCOUNT}/workflows/export${query}`);
}
function params() {
  return { params: Promise.resolve({ id: ACCOUNT }) };
}
function authed() {
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1", email: "u@x.test" } }, error: null });
}
function caps(canBulkExport: boolean, plan = "free") {
  return {
    plan,
    fallback: false,
    capabilities: { plan, canBulkExport, canCreateTemplates: false, canUseBuiltInTemplates: true },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  authed();
  mockRequireRole.mockResolvedValue({ ok: true, role: "owner" });
  mockListByAccount.mockResolvedValue([rec("wf-1", "Alpha", "xoxb-planted-1234567")]);
  mockTierGatingEnabled.mockReturnValue(false);
  mockDowngradeEnabled.mockReturnValue(false);
  mockGetAccount.mockResolvedValue({ id: ACCOUNT, type: "organization" });
});

// ── Normal bulk export — flag OFF (preserve today's behavior) ──────────────────────────────────

describe("normal bulk export — ENABLE_EXPORT_TIER_GATING OFF", () => {
  it("allows any member (owner/admin/member) and never reads capabilities", async () => {
    const res = await GET(req(), params());
    expect(res.status).toBe(200);
    expect(mockRequireRole).toHaveBeenCalledWith("user-1", ACCOUNT, ["owner", "admin", "member"]);
    expect(mockResolveCaps).not.toHaveBeenCalled();
  });
});

// ── Normal bulk export — flag ON (tier + role gate) ─────────────────────────────────────────────

describe("normal bulk export — ENABLE_EXPORT_TIER_GATING ON", () => {
  beforeEach(() => mockTierGatingEnabled.mockReturnValue(true));

  it("tightens the role set to owner/admin", async () => {
    mockResolveCaps.mockResolvedValue(caps(true, "team"));
    await GET(req(), params());
    expect(mockRequireRole).toHaveBeenCalledWith("user-1", ACCOUNT, ["owner", "admin"]);
  });

  it("Free personal account is blocked (403 UPGRADE_REQUIRED), no workflow read", async () => {
    mockResolveCaps.mockResolvedValue(caps(false, "free"));
    const res = await GET(req(), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("UPGRADE_REQUIRED");
    expect(mockListByAccount).not.toHaveBeenCalled();
  });

  it("Pro personal account is allowed (200)", async () => {
    mockResolveCaps.mockResolvedValue(caps(true, "pro"));
    const res = await GET(req(), params());
    expect(res.status).toBe(200);
  });

  it("Team owner/admin is allowed (200)", async () => {
    mockResolveCaps.mockResolvedValue(caps(true, "team"));
    const res = await GET(req(), params());
    expect(res.status).toBe(200);
  });

  it("Team member is blocked (403 FORBIDDEN) — no capability/workflow read", async () => {
    mockRequireRole.mockResolvedValue({ ok: false, reason: "forbidden" });
    const res = await GET(req(), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
    expect(mockResolveCaps).not.toHaveBeenCalled();
    expect(mockListByAccount).not.toHaveBeenCalled();
  });

  it("Business owner/admin is allowed (200)", async () => {
    mockResolveCaps.mockResolvedValue(caps(true, "business"));
    const res = await GET(req(), params());
    expect(res.status).toBe(200);
  });

  it("Business member is blocked (403 FORBIDDEN)", async () => {
    mockRequireRole.mockResolvedValue({ ok: false, reason: "forbidden" });
    const res = await GET(req(), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
  });

  it("non-member → 403 NOT_ACCOUNT_MEMBER (no existence oracle), no capability read", async () => {
    mockRequireRole.mockResolvedValue({ ok: false, reason: "not_member" });
    const res = await GET(req(), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("NOT_ACCOUNT_MEMBER");
    expect(mockResolveCaps).not.toHaveBeenCalled();
  });

  it("allowed response carries NO Stripe ids / billing internals and redacts secrets", async () => {
    mockResolveCaps.mockResolvedValue(caps(true, "business"));
    const res = await GET(req(), params());
    const text = await res.text();
    expect(text).not.toMatch(/stripe/i);
    expect(text).not.toMatch(/customer/i);
    expect(text).not.toMatch(/subscription/i);
    expect(text).not.toMatch(/xoxb-planted/);
    expect(text).not.toMatch(/vp@acme\.com/);
    expect(text).toContain(REDACTION_MARKER);
  });
});

// ── Downgrade safety export — ?purpose=downgrade (owner-only, org-only, tier gate bypassed) ──────

describe("downgrade export bypass — ?purpose=downgrade", () => {
  it("404 when ENABLE_BUSINESS_DOWNGRADE is OFF (dark surface)", async () => {
    mockDowngradeEnabled.mockReturnValue(false);
    const res = await GET(req("?purpose=downgrade"), params());
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("NOT_FOUND");
    expect(mockRequireRole).not.toHaveBeenCalled();
  });

  it("Business owner exports even when the normal tier gate would block — bypasses capabilities", async () => {
    mockDowngradeEnabled.mockReturnValue(true);
    mockTierGatingEnabled.mockReturnValue(true); // normal gate would apply…
    const res = await GET(req("?purpose=downgrade"), params());
    expect(res.status).toBe(200);
    expect(mockRequireRole).toHaveBeenCalledWith("user-1", ACCOUNT, ["owner"]);
    expect(mockResolveCaps).not.toHaveBeenCalled(); // …but it is bypassed for downgrade
  });

  it("Business admin cannot use the downgrade bypass (owner-only → 403 FORBIDDEN)", async () => {
    mockDowngradeEnabled.mockReturnValue(true);
    mockRequireRole.mockResolvedValue({ ok: false, reason: "forbidden" });
    const res = await GET(req("?purpose=downgrade"), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
    expect(mockListByAccount).not.toHaveBeenCalled();
  });

  it("non-member → 403 NOT_ACCOUNT_MEMBER on the downgrade bypass", async () => {
    mockDowngradeEnabled.mockReturnValue(true);
    mockRequireRole.mockResolvedValue({ ok: false, reason: "not_member" });
    const res = await GET(req("?purpose=downgrade"), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("NOT_ACCOUNT_MEMBER");
  });

  it("a non-organization account (team) cannot use the downgrade bypass (400 NOT_BUSINESS_ACCOUNT)", async () => {
    mockDowngradeEnabled.mockReturnValue(true);
    mockGetAccount.mockResolvedValue({ id: ACCOUNT, type: "team" });
    const res = await GET(req("?purpose=downgrade"), params());
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("NOT_BUSINESS_ACCOUNT");
    expect(mockListByAccount).not.toHaveBeenCalled();
  });

  it("downgrade export still redacts planted secrets (same sanitizer)", async () => {
    mockDowngradeEnabled.mockReturnValue(true);
    const res = await GET(req("?purpose=downgrade"), params());
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toMatch(/xoxb-planted/);
    expect(text).not.toMatch(/vp@acme\.com/);
    expect(text).toContain(REDACTION_MARKER);
  });
});
