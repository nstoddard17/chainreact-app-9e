/**
 * @jest-environment node
 *
 * Tests for services/ai/tools/options.ts (Slice 4.AI-2).
 *
 * Mocks the resolver registry + integrations repo so we exercise the tool's
 * control flow (deps gate → integration lookup → dispatch → cap → sanitize)
 * without hitting a real provider.
 */
const mockGetOptionsResolver = jest.fn();
const mockGetActiveForExecution = jest.fn();
const mockEnsurePersonalAccount = jest.fn(async (userId: string) => ({
  id: `acct-${userId}`,
  type: "personal" as const,
  ownerUserId: userId,
  createdAt: "2026-05-30T00:00:00Z",
  updatedAt: "2026-05-30T00:00:00Z",
}));

// Slice 4.ACCOUNT-MODEL-22D-1: the tool resolves the workflow creator via the
// real `resolveWorkflowCreatorContext` helper, which reads
// `repositories/workflows.getById`. Mock the repo so the provenance-plumbing
// tests drive it without a DB.
const mockGetById = jest.fn();

jest.mock("@/services/options/_registry", () => ({
  getOptionsResolver: (...args: unknown[]) => mockGetOptionsResolver(...args),
}));
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));
jest.mock("@/repositories/workflows", () => ({
  getById: (...args: unknown[]) => mockGetById(...args),
}));
jest.mock("@/services/accounts/ensurePersonalAccount", () => ({
  ensurePersonalAccount: (userId: string) => mockEnsurePersonalAccount(userId),
}));

import { resolveOptionsSourceForAI } from "@/services/ai/tools/options";
import { MAX_OPTIONS_ITEMS } from "@/services/ai/tools/types";
import { OptionsResolverError } from "@/services/options/types";
import { getCredentialResolutionContext } from "@/services/oauth/credentialResolutionContext";

beforeEach(() => {
  mockGetOptionsResolver.mockReset();
  mockGetActiveForExecution.mockReset();
  mockGetById.mockReset();
});

describe("resolveOptionsSourceForAI", () => {
  it("returns NOT_FOUND for an unknown source", async () => {
    mockGetOptionsResolver.mockReturnValue(undefined);
    const result = await resolveOptionsSourceForAI({ source: "nope:nope", userId: "u1" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("NOT_FOUND");
    expect(mockGetActiveForExecution).not.toHaveBeenCalled();
  });

  it("resolves a provider-backed source with an active integration", async () => {
    const resolve = jest.fn().mockResolvedValue({
      items: [{ value: "C1", label: "#general" }],
      hasMore: false,
    });
    mockGetOptionsResolver.mockReturnValue({
      source: "slack:channels",
      provider: "slack",
      requiresIntegration: true,
      resolve,
    });
    mockGetActiveForExecution.mockResolvedValue({ id: "i1", provider: "slack" });

    const result = await resolveOptionsSourceForAI({
      source: "slack:channels",
      userId: "u1",
      q: "  gen  ",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.items).toEqual([{ value: "C1", label: "#general" }]);
    expect(result.data.hasMore).toBe(false);
    expect(result.data.truncated).toBe(false);
    // q is trimmed before dispatch.
    expect(resolve).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", q: "gen", integration: { id: "i1", provider: "slack" } }),
    );
  });

  it("returns INTEGRATION_DISCONNECTED when no active integration and never dispatches", async () => {
    const resolve = jest.fn();
    mockGetOptionsResolver.mockReturnValue({
      source: "slack:channels",
      provider: "slack",
      requiresIntegration: true,
      resolve,
    });
    mockGetActiveForExecution.mockResolvedValue(null);

    const result = await resolveOptionsSourceForAI({ source: "slack:channels", userId: "u1" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INTEGRATION_DISCONNECTED");
    expect(resolve).not.toHaveBeenCalled();
  });

  it("returns MISSING_DEPENDENCY before any integration lookup", async () => {
    const resolve = jest.fn();
    mockGetOptionsResolver.mockReturnValue({
      source: "google-sheets:sheets",
      provider: "google-sheets",
      requiresIntegration: true,
      requiredDeps: ["spreadsheetId"],
      resolve,
    });

    const result = await resolveOptionsSourceForAI({
      source: "google-sheets:sheets",
      userId: "u1",
      deps: {},
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("MISSING_DEPENDENCY");
    expect(result.missingDependency).toBe("spreadsheetId");
    expect(mockGetActiveForExecution).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
  });

  it("maps an OptionsResolverError to a sanitized PROVIDER_ERROR", async () => {
    mockGetOptionsResolver.mockReturnValue({
      source: "slack:channels",
      provider: "slack",
      requiresIntegration: true,
      resolve: jest.fn().mockRejectedValue(
        new OptionsResolverError("PROVIDER_ERROR", "Couldn't load Slack channels. Try again."),
      ),
    });
    mockGetActiveForExecution.mockResolvedValue({ id: "i1" });

    const result = await resolveOptionsSourceForAI({ source: "slack:channels", userId: "u1" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("PROVIDER_ERROR");
    expect(result.message).toBe("Couldn't load Slack channels. Try again.");
  });

  it("downgrades an unexpected throw to SERVER_ERROR", async () => {
    mockGetOptionsResolver.mockReturnValue({
      source: "native:examples",
      provider: "native",
      requiresIntegration: false,
      resolve: jest.fn().mockRejectedValue(new Error("kaboom — raw provider body")),
    });

    const result = await resolveOptionsSourceForAI({ source: "native:examples", userId: "u1" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("SERVER_ERROR");
    expect(result.message).not.toContain("kaboom");
  });

  // ── Slice 4.ACCOUNT-MODEL-22D-2 — credential-sharing policy (mirrors route) ──
  it("account provider resolves the WORKFLOW account, account-shared (no pin)", async () => {
    const resolve = jest.fn().mockResolvedValue({
      items: [{ value: "C1", label: "#general" }],
      hasMore: false,
    });
    mockGetOptionsResolver.mockReturnValue({
      source: "slack:channels",
      provider: "slack", // account class
      requiresIntegration: true,
      resolve,
    });
    mockGetActiveForExecution.mockResolvedValue({ id: "i1", provider: "slack" });
    mockGetById.mockResolvedValue({
      id: "wf-9",
      createdByUserId: "creator-42", // requester u1 is NOT creator, but shared
      accountId: "acct-team",
    });

    const result = await resolveOptionsSourceForAI({
      source: "slack:channels",
      userId: "u1",
      workflowId: "wf-9",
    });
    expect(result.ok).toBe(true);
    // Workflow account, no provenance pin.
    expect(mockGetActiveForExecution).toHaveBeenCalledWith("acct-team", "slack", null);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("personal provider + requester IS the creator resolves PINNED to the creator", async () => {
    let seenPin: string | null | undefined = "UNSET";
    const resolve = jest.fn().mockImplementation(async () => {
      seenPin = getCredentialResolutionContext()?.createdByUserId;
      return { items: [{ value: "g1", label: "Label" }], hasMore: false };
    });
    mockGetOptionsResolver.mockReturnValue({
      source: "gmail:labels",
      provider: "gmail", // personal class
      requiresIntegration: true,
      resolve,
    });
    mockGetActiveForExecution.mockResolvedValue({ id: "ig", provider: "gmail" });
    mockGetById.mockResolvedValue({
      id: "wf-9",
      createdByUserId: "u1", // requester IS the creator
      accountId: "acct-team",
    });

    const result = await resolveOptionsSourceForAI({
      source: "gmail:labels",
      userId: "u1",
      workflowId: "wf-9",
    });
    expect(result.ok).toBe(true);
    // Workflow account, pinned to the creator (u1).
    expect(mockGetActiveForExecution).toHaveBeenCalledWith("acct-team", "gmail", null, {
      connectedByUserId: "u1",
    });
    // The refreshable-resolver auth style is pinned via the 22B context too.
    expect(seenPin).toBe("u1");
  });

  it("personal provider + requester is NOT the creator returns NOT_WORKFLOW_OWNER and fetches NOTHING", async () => {
    const resolve = jest.fn();
    mockGetOptionsResolver.mockReturnValue({
      source: "gmail:labels",
      provider: "gmail",
      requiresIntegration: true,
      resolve,
    });
    mockGetById.mockResolvedValue({
      id: "wf-9",
      createdByUserId: "creator-42", // someone else owns it
      accountId: "acct-team",
    });

    const result = await resolveOptionsSourceForAI({
      source: "gmail:labels",
      userId: "u1",
      workflowId: "wf-9",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("NOT_WORKFLOW_OWNER");
    // No co-member credential lookup, no resolver dispatch — no-leak guarantee.
    expect(mockGetActiveForExecution).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
  });

  it("personal provider + creator has no connection returns OWNER_MUST_CONNECT", async () => {
    const resolve = jest.fn();
    mockGetOptionsResolver.mockReturnValue({
      source: "gmail:labels",
      provider: "gmail",
      requiresIntegration: true,
      resolve,
    });
    mockGetActiveForExecution.mockResolvedValue(null); // creator hasn't connected
    mockGetById.mockResolvedValue({
      id: "wf-9",
      createdByUserId: "u1", // requester == creator
      accountId: "acct-team",
    });

    const result = await resolveOptionsSourceForAI({
      source: "gmail:labels",
      userId: "u1",
      workflowId: "wf-9",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("OWNER_MUST_CONNECT");
    expect(resolve).not.toHaveBeenCalled();
  });

  it("personal provider with NO workflow context keeps the legacy personal-account behavior", async () => {
    const resolve = jest.fn().mockResolvedValue({ items: [], hasMore: false });
    mockGetOptionsResolver.mockReturnValue({
      source: "gmail:labels",
      provider: "gmail",
      requiresIntegration: true,
      resolve,
    });
    mockGetActiveForExecution.mockResolvedValue({ id: "ig", provider: "gmail" });

    await resolveOptionsSourceForAI({ source: "gmail:labels", userId: "u1" });

    // No workflowId → no workflow lookup, editor's personal account, no pin.
    expect(mockGetById).not.toHaveBeenCalled();
    expect(mockGetActiveForExecution).toHaveBeenCalledWith("acct-u1", "gmail", null);
    const ctx = resolve.mock.calls[0]![0];
    expect(ctx).not.toHaveProperty("workflowCreator");
  });

  it("caps items to MAX_OPTIONS_ITEMS and flags truncated + hasMore", async () => {
    const many = Array.from({ length: MAX_OPTIONS_ITEMS + 50 }, (_, i) => ({
      value: `v${i}`,
      label: `L${i}`,
    }));
    mockGetOptionsResolver.mockReturnValue({
      source: "native:examples",
      provider: "native",
      requiresIntegration: false,
      resolve: jest.fn().mockResolvedValue({ items: many, hasMore: false }),
    });

    const result = await resolveOptionsSourceForAI({ source: "native:examples", userId: "u1" });
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.items).toHaveLength(MAX_OPTIONS_ITEMS);
    expect(result.data.truncated).toBe(true);
    expect(result.data.hasMore).toBe(true);
  });
});
