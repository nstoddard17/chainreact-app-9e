/**
 * @jest-environment node
 *
 * Tests for `app/api/options/[source]/route.ts` — Slice 3.30.
 *
 * Mock surface (mirrors providers-route.test.ts shape):
 *   - Supabase auth at the `createClient` boundary.
 *   - `repositories/integrations.getActiveForExecution` swap so the
 *     INTEGRATION_DISCONNECTED + happy-path branches can be exercised
 *     without a real DB / service-role client.
 *
 * The real `services/options/_registry.ts` runs unmocked — module-load
 * validation is part of the contract, and the `native:examples`
 * fixture is the resolver we want to exercise here.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) =>
    mockGetActiveForExecution(...args),
}));

// CS-4: the route resolves an ACCEPTED per-node credential owner via
// `resolveEffectiveNodeOwner`. Mock it so route tests drive the override without
// the flag/DB. Default null = no override (existing tests, which pass no nodeId,
// never invoke it). The helper's own flag-gating + accepted-only logic is unit-
// tested in tests/unit/services/teamCredentials/nodeCredentialOwners.test.ts.
const mockResolveOwner = jest.fn();
jest.mock("@/services/teamCredentials/nodeCredentialOwners", () => ({
  resolveEffectiveNodeOwner: (...args: unknown[]) => mockResolveOwner(...args),
}));

// Slice 4.ACCOUNT-MODEL-22D-1: the route resolves the workflow creator via the
// real `resolveWorkflowCreatorContext` helper, which reads
// `repositories/workflows.getById`. Mock the repo so the provenance-plumbing
// tests can drive it without a DB. Existing tests never pass `?workflowId=`,
// so the helper is never invoked for them and `getById` stays untouched.
const mockGetById = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getById: (...args: unknown[]) => mockGetById(...args),
}));

// Slice 4.ACCOUNT-MODEL-6: the route resolves the V2 owner account via
// this service. Stub to a synthetic personal account so the route doesn't
// need a real Supabase request context inside the test runner.
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

// The slack:channels happy-path tests below drive the real resolver
// (registered in `services/options/_registry.ts`) — but the resolver
// itself calls into `integrations/slack/api/conversationsList` and
// `core/encryption/tokens.decryptToken`. We mock those so the route
// test stays pure (no real Slack network, no real key material).
const mockConversationsList = jest.fn();
jest.mock("@/integrations/slack/api/conversationsList", () => ({
  __esModule: true,
  conversationsList: (...args: unknown[]) => mockConversationsList(...args),
}));

const mockDecryptToken = jest.fn();
jest.mock("@/core/encryption/tokens", () => ({
  __esModule: true,
  decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

// Resolver getter is mocked ONLY for the dedicated integration-flow
// tests below. Default behavior: `jest.requireActual` so the rest of
// the suite drives the real `native:examples` fixture path.
const mockGetOptionsResolver = jest.fn();
jest.mock("@/services/options/_registry", () => {
  const actual = jest.requireActual<typeof import("@/services/options/_registry")>(
    "@/services/options/_registry",
  );
  return {
    ...actual,
    getOptionsResolver: (...args: unknown[]) =>
      mockGetOptionsResolver(...args),
  };
});

import { GET as getOptions } from "@/app/api/options/[source]/route";
import {
  OptionsResolverError,
  type OptionsSourceResponse,
  type OptionsResolver,
} from "@/services/options/types";
import { getCredentialResolutionContext } from "@/services/oauth/credentialResolutionContext";

// `getOptionsResolver` is jest.mock'd above, so importing it directly
// from `_registry` returns the mock. `jest.requireActual` returns the
// real function — used by the default `beforeEach` so the fixture path
// runs against the real registry.
const realGetOptionsResolver =
  jest.requireActual<typeof import("@/services/options/_registry")>(
    "@/services/options/_registry",
  ).getOptionsResolver;

beforeEach(() => {
  mockGetUser.mockReset();
  mockGetActiveForExecution.mockReset();
  mockGetById.mockReset();
  mockConversationsList.mockReset();
  mockDecryptToken.mockReset();
  // Default: delegate to the real registry so the fixture-driven
  // tests don't need to manage the mock.
  mockGetOptionsResolver.mockReset();
  mockGetOptionsResolver.mockImplementation((source: string) =>
    realGetOptionsResolver(source),
  );
});

function authedUser(): void {
  mockGetUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  });
}

function unauthed(): void {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
}

function makeReq(url: string): Request {
  return new Request(url);
}

function paramsOf(source: string): { params: Promise<{ source: string }> } {
  return { params: Promise.resolve({ source }) };
}

describe("GET /api/options/[source] — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    unauthed();
    const res = await getOptions(
      makeReq("http://x/api/options/native:examples"),
      paramsOf("native:examples"),
    );
    expect(res.status).toBe(401);
  });
});

describe("GET /api/options/[source] — unknown source", () => {
  it("returns 200 + ok:false + code SOURCE_NOT_FOUND", async () => {
    authedUser();
    const res = await getOptions(
      makeReq("http://x/api/options/ghost:nothing"),
      paramsOf("ghost:nothing"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as OptionsSourceResponse;
    expect(body.ok).toBe(false);
    if (!body.ok) {
      expect(body.source).toBe("ghost:nothing");
      expect(body.code).toBe("SOURCE_NOT_FOUND");
    }
  });
});

describe("GET /api/options/[source] — required deps", () => {
  it("short-circuits with MISSING_DEPENDENCY when the resolver's required dep is absent", async () => {
    authedUser();
    const res = await getOptions(
      makeReq("http://x/api/options/native:examples"),
      paramsOf("native:examples"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as OptionsSourceResponse;
    expect(body.ok).toBe(false);
    if (!body.ok) {
      expect(body.code).toBe("MISSING_DEPENDENCY");
      expect(body.missingDependency).toBe("category");
    }
  });

  it("treats whitespace-only dep value as missing", async () => {
    authedUser();
    const res = await getOptions(
      makeReq("http://x/api/options/native:examples?deps[category]=%20"),
      paramsOf("native:examples"),
    );
    const body = (await res.json()) as OptionsSourceResponse;
    expect(body.ok).toBe(false);
    if (!body.ok) {
      expect(body.code).toBe("MISSING_DEPENDENCY");
      expect(body.missingDependency).toBe("category");
    }
  });

  it("required-dep check runs BEFORE the integration lookup", async () => {
    // Even when the resolver requires integration, missing-dep
    // short-circuits before the DB lookup. The fixture resolver
    // has requiresIntegration=false; assert the lookup is never
    // called in any case.
    authedUser();
    await getOptions(
      makeReq("http://x/api/options/native:examples"),
      paramsOf("native:examples"),
    );
    expect(mockGetActiveForExecution).not.toHaveBeenCalled();
  });
});

// ─── Slice 4.BUILDER-OPTIONS-1 — multi-parent required deps ─────────────────
describe("GET /api/options/[source] — multiple required deps", () => {
  // Synthetic resolver standing in for an Airtable-style field picker
  // that needs BOTH a base and a table. requiresIntegration:false keeps
  // the test focused on the dep-collection path (ctx.integration is null).
  const multiDepResolver: OptionsResolver = {
    source: "synthetic:multidep",
    provider: "synthetic",
    requiresIntegration: false,
    requiredDeps: ["baseId", "tableIdOrName"],
    resolve: jest.fn(),
  };

  beforeEach(() => {
    mockGetOptionsResolver.mockReturnValue(multiDepResolver);
    (multiDepResolver.resolve as jest.Mock).mockReset();
    (multiDepResolver.resolve as jest.Mock).mockResolvedValue({
      items: [{ value: "fldA", label: "Name" }],
      hasMore: false,
    });
  });

  it("short-circuits with MISSING_DEPENDENCY when only the first of two deps is present", async () => {
    authedUser();
    const res = await getOptions(
      makeReq("http://x/api/options/synthetic:multidep?deps[baseId]=app1"),
      paramsOf("synthetic:multidep"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as OptionsSourceResponse;
    expect(body.ok).toBe(false);
    if (!body.ok) {
      expect(body.code).toBe("MISSING_DEPENDENCY");
      expect(body.missingDependency).toBe("tableIdOrName");
    }
    // Resolver never runs while a required dep is missing.
    expect(multiDepResolver.resolve).not.toHaveBeenCalled();
  });

  it("short-circuits with MISSING_DEPENDENCY when only the second of two deps is present", async () => {
    authedUser();
    const res = await getOptions(
      makeReq(
        "http://x/api/options/synthetic:multidep?deps[tableIdOrName]=tbl1",
      ),
      paramsOf("synthetic:multidep"),
    );
    const body = (await res.json()) as OptionsSourceResponse;
    expect(body.ok).toBe(false);
    if (!body.ok) {
      expect(body.code).toBe("MISSING_DEPENDENCY");
      expect(body.missingDependency).toBe("baseId");
    }
    expect(multiDepResolver.resolve).not.toHaveBeenCalled();
  });

  it("invokes the resolver with BOTH dep values once all required deps are present", async () => {
    authedUser();
    const res = await getOptions(
      makeReq(
        "http://x/api/options/synthetic:multidep?deps[baseId]=app1&deps[tableIdOrName]=tbl1&q=na",
      ),
      paramsOf("synthetic:multidep"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as OptionsSourceResponse;
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.items).toEqual([{ value: "fldA", label: "Name" }]);
    }
    expect(multiDepResolver.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        q: "na",
        deps: { baseId: "app1", tableIdOrName: "tbl1" },
      }),
    );
  });
});

describe("GET /api/options/[source] — success path", () => {
  it("returns the fixture's filtered items for a valid query", async () => {
    authedUser();
    const res = await getOptions(
      makeReq("http://x/api/options/native:examples?deps[category]=fruit"),
      paramsOf("native:examples"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as OptionsSourceResponse;
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.source).toBe("native:examples");
      expect(body.hasMore).toBe(false);
      expect(body.items.map((i) => i.value)).toEqual([
        "apple",
        "banana",
        "cherry",
      ]);
    }
  });

  it("applies the `q` search filter (case-insensitive substring)", async () => {
    authedUser();
    const res = await getOptions(
      makeReq(
        "http://x/api/options/native:examples?deps[category]=fruit&q=ap",
      ),
      paramsOf("native:examples"),
    );
    const body = (await res.json()) as OptionsSourceResponse;
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.items.map((i) => i.value)).toEqual(["apple"]);
    }
  });

  it("returns an empty items array when nothing matches", async () => {
    authedUser();
    const res = await getOptions(
      makeReq(
        "http://x/api/options/native:examples?deps[category]=fruit&q=zzz",
      ),
      paramsOf("native:examples"),
    );
    const body = (await res.json()) as OptionsSourceResponse;
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.items).toEqual([]);
      expect(body.hasMore).toBe(false);
    }
  });

  it("returns the second category branch (colors) correctly", async () => {
    authedUser();
    const res = await getOptions(
      makeReq("http://x/api/options/native:examples?deps[category]=color"),
      paramsOf("native:examples"),
    );
    const body = (await res.json()) as OptionsSourceResponse;
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.items.map((i) => i.value)).toEqual(["red", "green", "blue"]);
    }
  });
});

describe("GET /api/options/[source] — resolver error mapping", () => {
  it("maps OptionsResolverError('PROVIDER_ERROR') to ok:false + code PROVIDER_ERROR", async () => {
    // The fixture deliberately throws OptionsResolverError("PROVIDER_ERROR", ...)
    // when category === "throw" so this path is testable without a
    // synthetic mock resolver.
    authedUser();
    const res = await getOptions(
      makeReq("http://x/api/options/native:examples?deps[category]=throw"),
      paramsOf("native:examples"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as OptionsSourceResponse;
    expect(body.ok).toBe(false);
    if (!body.ok) {
      expect(body.code).toBe("PROVIDER_ERROR");
      expect(body.message).toBe("Couldn't load examples. Try again.");
    }
  });
});

describe("GET /api/options/[source] — long query clamp", () => {
  it("trims and length-caps the `q` parameter without crashing", async () => {
    authedUser();
    const longQ = "a".repeat(1024);
    const res = await getOptions(
      makeReq(
        `http://x/api/options/native:examples?deps[category]=fruit&q=${longQ}`,
      ),
      paramsOf("native:examples"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as OptionsSourceResponse;
    // Long q has no match → empty items.
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.items).toEqual([]);
    }
  });
});

describe("GET /api/options/[source] — requiresIntegration branch", () => {
  // The only registered fixture has requiresIntegration: false, so the
  // integration-lookup branch needs a synthetic resolver. We mock
  // getOptionsResolver for just these cases to keep services/options/
  // registry minimal (one fixture per the plan).
  const syntheticResolver: OptionsResolver = {
    source: "synthetic:integration",
    provider: "synthetic",
    requiresIntegration: true,
    resolve: jest.fn().mockResolvedValue({
      items: [{ value: "v1", label: "L1" }],
      hasMore: false,
    }),
  };

  it("returns INTEGRATION_DISCONNECTED when no active integration row exists", async () => {
    authedUser();
    mockGetOptionsResolver.mockReturnValue(syntheticResolver);
    mockGetActiveForExecution.mockResolvedValue(null);

    const res = await getOptions(
      makeReq("http://x/api/options/synthetic:integration"),
      paramsOf("synthetic:integration"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as OptionsSourceResponse;
    expect(body.ok).toBe(false);
    if (!body.ok) {
      expect(body.code).toBe("INTEGRATION_DISCONNECTED");
      expect(body.message).toMatch(/synthetic/);
    }
    // The integration lookup was called with the resolver's provider —
    // the V2 owner account (`acct-user-1`) is resolved from the
    // signed-in user via `ensurePersonalAccount` before the lookup.
    expect(mockGetActiveForExecution).toHaveBeenCalledWith(
      "acct-user-1",
      "synthetic",
      null,
    );
  });

  it("invokes the resolver with the integration record on the happy path", async () => {
    authedUser();
    const integrationRow = {
      id: "int-1",
      accountId: "acct-user-1",
      connectedByUserId: "user-1",
      provider: "synthetic",
      providerAccountId: "acct-1",
      displayName: null,
      accessTokenEncrypted: "enc",
      refreshTokenEncrypted: null,
      accessTokenExpiresAt: null,
      scopes: [],
      accountMetadata: {},
      disconnectedAt: null,
      createdAt: "2026-05-22T00:00:00Z",
      updatedAt: "2026-05-22T00:00:00Z",
    };
    mockGetOptionsResolver.mockReturnValue(syntheticResolver);
    mockGetActiveForExecution.mockResolvedValue(integrationRow);
    // Reset the resolver's internal jest.fn call history.
    (syntheticResolver.resolve as jest.Mock).mockClear();
    (syntheticResolver.resolve as jest.Mock).mockResolvedValue({
      items: [{ value: "v1", label: "L1" }],
      hasMore: false,
    });

    const res = await getOptions(
      makeReq("http://x/api/options/synthetic:integration?q=foo"),
      paramsOf("synthetic:integration"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as OptionsSourceResponse;
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.items).toEqual([{ value: "v1", label: "L1" }]);
      expect(body.hasMore).toBe(false);
    }
    expect(syntheticResolver.resolve).toHaveBeenCalledWith({
      userId: "user-1",
      integration: integrationRow,
      q: "foo",
      deps: {},
    });
  });

  it("maps an integration-lookup throw to SERVER_ERROR with a sanitized message", async () => {
    authedUser();
    mockGetOptionsResolver.mockReturnValue(syntheticResolver);
    mockGetActiveForExecution.mockRejectedValue(
      new Error("supabase: secret connection string leaked here"),
    );

    const res = await getOptions(
      makeReq("http://x/api/options/synthetic:integration"),
      paramsOf("synthetic:integration"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as OptionsSourceResponse;
    expect(body.ok).toBe(false);
    if (!body.ok) {
      expect(body.code).toBe("SERVER_ERROR");
      // The underlying message MUST NOT leak.
      expect(body.message).not.toMatch(/supabase|secret|connection/i);
    }
  });

  it("maps an uncaught resolver throw to SERVER_ERROR (not PROVIDER_ERROR)", async () => {
    authedUser();
    const throwyResolver: OptionsResolver = {
      ...syntheticResolver,
      resolve: jest.fn().mockRejectedValue(new Error("boom internals")),
    };
    mockGetOptionsResolver.mockReturnValue(throwyResolver);
    mockGetActiveForExecution.mockResolvedValue({
      id: "int-1",
      userId: "user-1",
      provider: "synthetic",
    });

    const res = await getOptions(
      makeReq("http://x/api/options/synthetic:integration"),
      paramsOf("synthetic:integration"),
    );
    const body = (await res.json()) as OptionsSourceResponse;
    expect(body.ok).toBe(false);
    if (!body.ok) {
      expect(body.code).toBe("SERVER_ERROR");
      expect(body.message).not.toMatch(/boom|internals/i);
    }
  });

  it("propagates OptionsResolverError thrown from a requiresIntegration resolver", async () => {
    authedUser();
    const errResolver: OptionsResolver = {
      ...syntheticResolver,
      resolve: jest
        .fn()
        .mockRejectedValue(
          new OptionsResolverError("PROVIDER_ERROR", "Provider said no."),
        ),
    };
    mockGetOptionsResolver.mockReturnValue(errResolver);
    mockGetActiveForExecution.mockResolvedValue({
      id: "int-1",
      userId: "user-1",
      provider: "synthetic",
    });

    const res = await getOptions(
      makeReq("http://x/api/options/synthetic:integration"),
      paramsOf("synthetic:integration"),
    );
    const body = (await res.json()) as OptionsSourceResponse;
    expect(body.ok).toBe(false);
    if (!body.ok) {
      expect(body.code).toBe("PROVIDER_ERROR");
      expect(body.message).toBe("Provider said no.");
    }
  });
});

describe("GET /api/options/slack:channels — end-to-end through the real resolver (Slice 3.32)", () => {
  const slackIntegrationRow = {
    id: "int-slack",
    accountId: "acct-user-1",
    connectedByUserId: "user-1",
    provider: "slack",
    providerAccountId: "T01TEAM",
    displayName: "Test Workspace",
    accessTokenEncrypted: "enc:cipher",
    refreshTokenEncrypted: null,
    accessTokenExpiresAt: null,
    scopes: ["channels:read"],
    accountMetadata: {},
    disconnectedAt: null,
    createdAt: "2026-05-22T00:00:00Z",
    updatedAt: "2026-05-22T00:00:00Z",
  };

  it("returns ok:true + mapped channels when an active integration is connected", async () => {
    authedUser();
    mockGetActiveForExecution.mockResolvedValue(slackIntegrationRow);
    mockDecryptToken.mockReturnValue("xoxb-decrypted");
    mockConversationsList.mockResolvedValue({
      channels: [
        { id: "C1", name: "general", purpose: { value: "Announcements" } },
        { id: "C2", name: "random" },
      ],
      hasMore: false,
      nextCursor: null,
    });

    const res = await getOptions(
      makeReq("http://x/api/options/slack:channels"),
      paramsOf("slack:channels"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as OptionsSourceResponse;
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.source).toBe("slack:channels");
      expect(body.items).toEqual([
        { value: "C1", label: "#general", description: "Announcements" },
        { value: "C2", label: "#random" },
      ]);
      expect(body.hasMore).toBe(false);
    }
    expect(mockGetActiveForExecution).toHaveBeenCalledWith(
      "acct-user-1",
      "slack",
      null,
    );
    expect(mockDecryptToken).toHaveBeenCalledWith("enc:cipher");
  });

  it("returns INTEGRATION_DISCONNECTED when no active Slack integration exists", async () => {
    authedUser();
    mockGetActiveForExecution.mockResolvedValue(null);

    const res = await getOptions(
      makeReq("http://x/api/options/slack:channels"),
      paramsOf("slack:channels"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as OptionsSourceResponse;
    expect(body.ok).toBe(false);
    if (!body.ok) {
      expect(body.code).toBe("INTEGRATION_DISCONNECTED");
      expect(body.message).toMatch(/slack/i);
    }
    // No token decryption / wrapper invocation when the route's
    // integration guard short-circuits.
    expect(mockDecryptToken).not.toHaveBeenCalled();
    expect(mockConversationsList).not.toHaveBeenCalled();
  });

  it("forwards `q` as the resolver's client-side filter", async () => {
    authedUser();
    mockGetActiveForExecution.mockResolvedValue(slackIntegrationRow);
    mockDecryptToken.mockReturnValue("xoxb-decrypted");
    mockConversationsList.mockResolvedValue({
      channels: [
        { id: "C1", name: "general" },
        { id: "C2", name: "engineering" },
        { id: "C3", name: "random" },
      ],
      hasMore: false,
      nextCursor: null,
    });

    const res = await getOptions(
      makeReq("http://x/api/options/slack:channels?q=eng"),
      paramsOf("slack:channels"),
    );
    const body = (await res.json()) as OptionsSourceResponse;
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.items.map((i) => i.value)).toEqual(["C2"]);
    }
  });
});

describe("GET /api/options/[source] — deps parsing", () => {
  it("parses multiple deps[*] parameters", async () => {
    authedUser();
    const synthetic: OptionsResolver = {
      source: "synthetic:deps",
      provider: "synthetic",
      requiresIntegration: false,
      resolve: jest.fn().mockResolvedValue({
        items: [],
        hasMore: false,
      }),
    };
    mockGetOptionsResolver.mockReturnValue(synthetic);

    await getOptions(
      makeReq(
        "http://x/api/options/synthetic:deps?deps[baseId]=B1&deps[tableId]=T1",
      ),
      paramsOf("synthetic:deps"),
    );
    expect(synthetic.resolve).toHaveBeenCalledWith({
      userId: "user-1",
      integration: null,
      q: "",
      deps: { baseId: "B1", tableId: "T1" },
    });
  });

  it("trims whitespace from dep values + drops empty ones", async () => {
    authedUser();
    const synthetic: OptionsResolver = {
      source: "synthetic:deps",
      provider: "synthetic",
      requiresIntegration: false,
      resolve: jest.fn().mockResolvedValue({ items: [], hasMore: false }),
    };
    mockGetOptionsResolver.mockReturnValue(synthetic);

    await getOptions(
      makeReq(
        "http://x/api/options/synthetic:deps?deps[a]=%20%20kept%20%20&deps[b]=%20",
      ),
      paramsOf("synthetic:deps"),
    );
    expect(synthetic.resolve).toHaveBeenCalledWith({
      userId: "user-1",
      integration: null,
      q: "",
      deps: { a: "kept" },
    });
  });
});

// ─── Slice 4.ACCOUNT-MODEL-22D-2 — credential-sharing policy ─────────────────
//
// With a workflow context (`?workflowId=`), the route classifies the provider
// and resolves the credential the way EXECUTION (22B) does: account providers
// account-shared on the workflow account; personal providers creator-pinned +
// creator-only. Without a workflow context, the safe legacy behavior (editor's
// personal account) is preserved — the existing suite above exercises that.
describe("GET /api/options/[source] — credential-sharing policy (22D-2)", () => {
  // `slack` classifies ACCOUNT; `gmail` classifies PERSONAL. Synthetic sources
  // point at those provider strings so the policy classifier drives behavior.
  const accountResolver: OptionsResolver = {
    source: "slackopt:resource",
    provider: "slack",
    requiresIntegration: true,
    resolve: jest.fn(),
  };
  const personalResolver: OptionsResolver = {
    source: "gmailopt:resource",
    provider: "gmail",
    requiresIntegration: true,
    resolve: jest.fn(),
  };

  beforeEach(() => {
    (accountResolver.resolve as jest.Mock).mockReset();
    (accountResolver.resolve as jest.Mock).mockResolvedValue({
      items: [{ value: "v1", label: "L1" }],
      hasMore: false,
    });
    (personalResolver.resolve as jest.Mock).mockReset();
    (personalResolver.resolve as jest.Mock).mockResolvedValue({
      items: [{ value: "v1", label: "L1" }],
      hasMore: false,
    });
  });

  it("account provider resolves the WORKFLOW account, account-shared (no pin)", async () => {
    authedUser();
    mockGetOptionsResolver.mockReturnValue(accountResolver);
    mockGetActiveForExecution.mockResolvedValue({ id: "int-1", provider: "slack" });
    mockGetById.mockResolvedValue({
      id: "wf-9",
      createdByUserId: "creator-42",
      accountId: "acct-team",
    });

    // Requester (user-1) is NOT the creator — but account providers are shared,
    // so this still succeeds (no owner gate for account providers).
    const res = await getOptions(
      makeReq("http://x/api/options/slackopt:resource?workflowId=wf-9"),
      paramsOf("slackopt:resource"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as OptionsSourceResponse;
    expect(body.ok).toBe(true);
    // Workflow account, no 4th provenance-pin arg.
    expect(mockGetActiveForExecution).toHaveBeenCalledWith("acct-team", "slack", null);
    expect(accountResolver.resolve).toHaveBeenCalledTimes(1);
  });

  it("personal provider + requester IS the creator resolves PINNED to the creator", async () => {
    authedUser(); // user-1
    mockGetOptionsResolver.mockReturnValue(personalResolver);
    mockGetActiveForExecution.mockResolvedValue({ id: "int-g", provider: "gmail" });
    mockGetById.mockResolvedValue({
      id: "wf-9",
      createdByUserId: "user-1", // requester IS the creator
      accountId: "acct-team",
    });
    // Capture the credential-resolution context visible to the resolver — proves
    // the refreshable-resolver auth style is pinned too (refreshAndRetry reads
    // this context).
    let seenPin: string | null | undefined = "UNSET";
    (personalResolver.resolve as jest.Mock).mockImplementation(async () => {
      seenPin = getCredentialResolutionContext()?.createdByUserId;
      return { items: [{ value: "v1", label: "L1" }], hasMore: false };
    });

    const res = await getOptions(
      makeReq("http://x/api/options/gmailopt:resource?workflowId=wf-9"),
      paramsOf("gmailopt:resource"),
    );
    expect(res.status).toBe(200);
    // Workflow account, pinned to the creator (user-1).
    expect(mockGetActiveForExecution).toHaveBeenCalledWith("acct-team", "gmail", null, {
      connectedByUserId: "user-1",
    });
    expect(seenPin).toBe("user-1");
  });

  it("personal provider + requester is NOT the creator returns NOT_WORKFLOW_OWNER and fetches NOTHING", async () => {
    authedUser(); // user-1
    mockGetOptionsResolver.mockReturnValue(personalResolver);
    mockGetById.mockResolvedValue({
      id: "wf-9",
      createdByUserId: "creator-42", // someone else owns the workflow
      accountId: "acct-team",
    });

    const res = await getOptions(
      makeReq("http://x/api/options/gmailopt:resource?workflowId=wf-9"),
      paramsOf("gmailopt:resource"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as OptionsSourceResponse;
    expect(body.ok).toBe(false);
    if (!body.ok) {
      expect(body.code).toBe("NOT_WORKFLOW_OWNER");
    }
    // NO co-member credential lookup, NO provider fetch — the no-leak guarantee.
    expect(mockGetActiveForExecution).not.toHaveBeenCalled();
    expect(personalResolver.resolve).not.toHaveBeenCalled();
  });

  it("personal provider + creator has no connection returns OWNER_MUST_CONNECT", async () => {
    authedUser(); // user-1 == creator
    mockGetOptionsResolver.mockReturnValue(personalResolver);
    mockGetActiveForExecution.mockResolvedValue(null); // creator hasn't connected
    mockGetById.mockResolvedValue({
      id: "wf-9",
      createdByUserId: "user-1",
      accountId: "acct-team",
    });

    const res = await getOptions(
      makeReq("http://x/api/options/gmailopt:resource?workflowId=wf-9"),
      paramsOf("gmailopt:resource"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as OptionsSourceResponse;
    expect(body.ok).toBe(false);
    if (!body.ok) {
      expect(body.code).toBe("OWNER_MUST_CONNECT");
    }
    expect(personalResolver.resolve).not.toHaveBeenCalled();
  });

  describe("CS-4 — accepted per-node credential owner", () => {
    beforeEach(() => {
      mockResolveOwner.mockReset();
      mockResolveOwner.mockResolvedValue(null);
    });

    it("accepted owner B + requester IS B → resolves PINNED to B (assigned owner)", async () => {
      authedUser(); // user-1
      mockGetOptionsResolver.mockReturnValue(personalResolver);
      mockResolveOwner.mockResolvedValue("user-1"); // user-1 is the assigned owner
      mockGetActiveForExecution.mockResolvedValue({ id: "int-g", provider: "gmail" });
      mockGetById.mockResolvedValue({
        id: "wf-9",
        createdByUserId: "creator-42", // creator is NOT user-1
        accountId: "acct-team",
      });

      let seenPin: string | null | undefined = "UNSET";
      (personalResolver.resolve as jest.Mock).mockImplementation(async () => {
        seenPin = getCredentialResolutionContext()?.createdByUserId;
        return { items: [{ value: "v1", label: "L1" }], hasMore: false };
      });

      const res = await getOptions(
        makeReq("http://x/api/options/gmailopt:resource?workflowId=wf-9&nodeId=node-7"),
        paramsOf("gmailopt:resource"),
      );
      expect(res.status).toBe(200);
      // Pinned to the ASSIGNED owner (user-1), not the creator.
      expect(mockGetActiveForExecution).toHaveBeenCalledWith("acct-team", "gmail", null, {
        connectedByUserId: "user-1",
      });
      expect(seenPin).toBe("user-1");
      expect(mockResolveOwner).toHaveBeenCalledWith("wf-9", "node-7");
    });

    it("accepted owner B + requester is the CREATOR → NOT_WORKFLOW_OWNER, fetches NOTHING", async () => {
      authedUser(); // user-1 == creator, but no longer the effective owner
      mockGetOptionsResolver.mockReturnValue(personalResolver);
      mockResolveOwner.mockResolvedValue("owner-B");
      mockGetById.mockResolvedValue({
        id: "wf-9",
        createdByUserId: "user-1",
        accountId: "acct-team",
      });

      const res = await getOptions(
        makeReq("http://x/api/options/gmailopt:resource?workflowId=wf-9&nodeId=node-7"),
        paramsOf("gmailopt:resource"),
      );
      const body = (await res.json()) as OptionsSourceResponse;
      expect(body.ok).toBe(false);
      if (!body.ok) expect(body.code).toBe("NOT_WORKFLOW_OWNER");
      expect(mockGetActiveForExecution).not.toHaveBeenCalled();
      expect(personalResolver.resolve).not.toHaveBeenCalled();
    });

    it("no accepted owner (null) → falls back to creator-pinned", async () => {
      authedUser(); // user-1 == creator
      mockGetOptionsResolver.mockReturnValue(personalResolver);
      mockResolveOwner.mockResolvedValue(null);
      mockGetActiveForExecution.mockResolvedValue({ id: "int-g", provider: "gmail" });
      mockGetById.mockResolvedValue({
        id: "wf-9",
        createdByUserId: "user-1",
        accountId: "acct-team",
      });

      const res = await getOptions(
        makeReq("http://x/api/options/gmailopt:resource?workflowId=wf-9&nodeId=node-7"),
        paramsOf("gmailopt:resource"),
      );
      expect(res.status).toBe(200);
      expect(mockGetActiveForExecution).toHaveBeenCalledWith("acct-team", "gmail", null, {
        connectedByUserId: "user-1",
      });
    });

    it("assigned owner without a connection → OWNER_MUST_CONNECT", async () => {
      authedUser(); // user-1 is the assigned owner
      mockGetOptionsResolver.mockReturnValue(personalResolver);
      mockResolveOwner.mockResolvedValue("user-1");
      mockGetActiveForExecution.mockResolvedValue(null); // owner hasn't connected
      mockGetById.mockResolvedValue({
        id: "wf-9",
        createdByUserId: "creator-42",
        accountId: "acct-team",
      });

      const res = await getOptions(
        makeReq("http://x/api/options/gmailopt:resource?workflowId=wf-9&nodeId=node-7"),
        paramsOf("gmailopt:resource"),
      );
      const body = (await res.json()) as OptionsSourceResponse;
      expect(body.ok).toBe(false);
      if (!body.ok) expect(body.code).toBe("OWNER_MUST_CONNECT");
    });

    it("account/service provider ignores the node owner (never even looks it up)", async () => {
      authedUser();
      mockGetOptionsResolver.mockReturnValue(accountResolver);
      mockGetActiveForExecution.mockResolvedValue({ id: "int-1", provider: "slack" });
      mockGetById.mockResolvedValue({
        id: "wf-9",
        createdByUserId: "creator-42",
        accountId: "acct-team",
      });

      const res = await getOptions(
        makeReq("http://x/api/options/slackopt:resource?workflowId=wf-9&nodeId=node-7"),
        paramsOf("slackopt:resource"),
      );
      expect(res.status).toBe(200);
      // Account-shared, no pin — and the node-owner lookup is skipped entirely.
      expect(mockGetActiveForExecution).toHaveBeenCalledWith("acct-team", "slack", null);
      expect(mockResolveOwner).not.toHaveBeenCalled();
    });
  });

  it("personal provider with NO workflow context keeps the legacy personal-account behavior", async () => {
    authedUser(); // user-1
    mockGetOptionsResolver.mockReturnValue(personalResolver);
    mockGetActiveForExecution.mockResolvedValue({ id: "int-g", provider: "gmail" });

    const res = await getOptions(
      makeReq("http://x/api/options/gmailopt:resource"),
      paramsOf("gmailopt:resource"),
    );
    expect(res.status).toBe(200);
    // No workflowId → no workflow lookup, editor's personal account, no pin.
    expect(mockGetById).not.toHaveBeenCalled();
    expect(mockGetActiveForExecution).toHaveBeenCalledWith("acct-user-1", "gmail", null);
    expect(personalResolver.resolve).toHaveBeenCalledTimes(1);
    const ctx = (personalResolver.resolve as jest.Mock).mock.calls[0]![0];
    expect(ctx).not.toHaveProperty("workflowCreator");
  });
});
