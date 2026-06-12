/**
 * @jest-environment node
 *
 * Parity: the live builder route (`GET /api/options/[source]`) and the internal
 * diagnostic route (`POST /api/internal/diagnostics/option-source`) MUST agree on
 * the resolved `OptionsSourceErrorCode` / success classification for identical
 * inputs (Slice 4.MCP-STAGE-2B-1).
 *
 * Both routes delegate to the SAME `resolveOptionsSource` service, so this is the
 * structural guarantee that diagnosis reflects production behavior. We mock the
 * shared leaf boundaries once and drive both routes per scenario, asserting
 * `(ok, code)` match.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));

const mockResolveOwner = jest.fn();
jest.mock("@/services/teamCredentials/nodeCredentialOwners", () => ({
  resolveEffectiveNodeOwner: (...args: unknown[]) => mockResolveOwner(...args),
}));

const mockGetById = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getById: (...args: unknown[]) => mockGetById(...args),
}));

jest.mock("@/services/accounts/ensurePersonalAccount", () => ({
  ensurePersonalAccount: async (userId: string) => ({
    id: `acct-${userId}`,
    type: "personal" as const,
    ownerUserId: userId,
    createdAt: "2026-05-30T00:00:00Z",
    updatedAt: "2026-05-30T00:00:00Z",
  }),
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

import { GET as getOptions } from "@/app/api/options/[source]/route";
import { POST as postDiagnostic } from "@/app/api/internal/diagnostics/option-source/route";
import { type OptionsResolver, type OptionsSourceResponse } from "@/services/options/types";

const realGetOptionsResolver =
  jest.requireActual<typeof import("@/services/options/_registry")>(
    "@/services/options/_registry",
  ).getOptionsResolver;

const TOKEN = "parity-token-0123456789abcdef";
const USER = "user-1";

beforeEach(() => {
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: USER } }, error: null });
  mockGetActiveForExecution.mockReset();
  mockGetById.mockReset();
  mockResolveOwner.mockReset();
  mockResolveOwner.mockResolvedValue(null);
  mockGetOptionsResolver.mockReset();
  mockGetOptionsResolver.mockImplementation((s: string) => realGetOptionsResolver(s));
  process.env.DIAGNOSTICS_API_ENABLED = "1";
  process.env.DIAGNOSTICS_API_TOKEN = TOKEN;
  delete process.env.DIAGNOSTICS_API_ALLOW_PROD;
});

interface Classification {
  ok: boolean;
  code: string | null;
}

async function liveCode(source: string, query = "", workflowId?: string): Promise<Classification> {
  const qs = new URLSearchParams(query);
  if (workflowId) qs.set("workflowId", workflowId);
  const url = `http://x/api/options/${source}${qs.toString() ? `?${qs}` : ""}`;
  const res = await getOptions(new Request(url), { params: Promise.resolve({ source }) });
  const body = (await res.json()) as OptionsSourceResponse;
  return { ok: body.ok, code: body.ok ? null : body.code };
}

async function diagCode(source: string, workflowId?: string): Promise<Classification> {
  const res = await postDiagnostic(
    new Request("http://x/api/internal/diagnostics/option-source", {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ source, userId: USER, ...(workflowId && { workflowId }) }),
    }),
  );
  const dto = await res.json();
  return { ok: dto.ok, code: dto.code };
}

const personalResolver: OptionsResolver = {
  source: "gmailopt:resource",
  provider: "gmail",
  requiresIntegration: true,
  resolve: jest.fn().mockResolvedValue({ items: [{ value: "v", label: "L" }], hasMore: false }),
};
const accountResolver: OptionsResolver = {
  source: "slackopt:resource",
  provider: "slack",
  requiresIntegration: true,
  resolve: jest.fn().mockResolvedValue({ items: [{ value: "v", label: "L" }], hasMore: false }),
};

describe("live ↔ diagnostic parity on classification", () => {
  it("SOURCE_NOT_FOUND", async () => {
    expect(await diagCode("ghost:nothing")).toEqual(await liveCode("ghost:nothing"));
  });

  it("MISSING_DEPENDENCY", async () => {
    expect(await diagCode("native:examples")).toEqual(await liveCode("native:examples"));
  });

  it("INTEGRATION_DISCONNECTED", async () => {
    mockGetOptionsResolver.mockReturnValue(accountResolver);
    mockGetActiveForExecution.mockResolvedValue(null);
    const diag = await diagCode("slackopt:resource");
    mockGetActiveForExecution.mockResolvedValue(null);
    const live = await liveCode("slackopt:resource");
    expect(diag).toEqual(live);
    expect(diag.code).toBe("INTEGRATION_DISCONNECTED");
  });

  it("success classification", async () => {
    mockGetOptionsResolver.mockReturnValue(accountResolver);
    mockGetActiveForExecution.mockResolvedValue({ id: "int-1", provider: "slack" });
    const diag = await diagCode("slackopt:resource");
    mockGetActiveForExecution.mockResolvedValue({ id: "int-1", provider: "slack" });
    const live = await liveCode("slackopt:resource");
    expect(diag).toEqual(live);
    expect(diag.ok).toBe(true);
  });

  it("NOT_WORKFLOW_OWNER (personal provider, non-creator)", async () => {
    mockGetOptionsResolver.mockReturnValue(personalResolver);
    mockGetById.mockResolvedValue({
      id: "wf-9",
      createdByUserId: "creator-42",
      accountId: "acct-team",
    });
    const diag = await diagCode("gmailopt:resource", "wf-9");
    mockGetById.mockResolvedValue({
      id: "wf-9",
      createdByUserId: "creator-42",
      accountId: "acct-team",
    });
    const live = await liveCode("gmailopt:resource", "", "wf-9");
    expect(diag).toEqual(live);
    expect(diag.code).toBe("NOT_WORKFLOW_OWNER");
  });
});
