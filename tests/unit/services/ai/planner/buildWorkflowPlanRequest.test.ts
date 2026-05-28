/**
 * @jest-environment node
 *
 * Tests for services/ai/planner/buildWorkflowPlanRequest.ts (Slice 4.AI-8A).
 *
 * This is the grounding seam: it composes the LIVE AI-2 provider catalog (real
 * registries, not mocked) with the caller's connected integrations, then returns
 * a ModelGenerateInput. It must make NO model call. Only the integrations repo
 * is mocked (it would otherwise hit Supabase); the catalog runs for real so the
 * test proves grounding stays in sync with the registry as providers are added.
 */
const mockListActiveByUser = jest.fn();

jest.mock("@/repositories/integrations", () => ({
  listActiveByUser: (...args: unknown[]) => mockListActiveByUser(...args),
}));

import { buildWorkflowPlanRequest } from "@/services/ai/planner/buildWorkflowPlanRequest";
import { getProviderCatalog } from "@/services/ai/tools/providerCatalog";
import { MODELS } from "@/core/ai/models";
import type { IntegrationRecord } from "@/repositories/integrations";

function makeRecord(overrides: Partial<IntegrationRecord> = {}): IntegrationRecord {
  return {
    id: "int-1",
    userId: "u1",
    provider: "slack",
    providerAccountId: "T123",
    displayName: "Acme Workspace",
    accessTokenEncrypted: "ENC_ACCESS_SECRET",
    refreshTokenEncrypted: "ENC_REFRESH_SECRET",
    accessTokenExpiresAt: null,
    scopes: ["channels:read", "chat:write"],
    accountMetadata: { email: "owner@example.com", botToken: "BOT_SECRET" },
    disconnectedAt: null,
    createdAt: "2026-05-25T00:00:00Z",
    updatedAt: "2026-05-25T00:00:00Z",
    ...overrides,
  };
}

function systemMessage(messages: readonly { role: string; content: string }[]): string {
  return messages.find((m) => m.role === "system")!.content;
}

beforeEach(() => {
  mockListActiveByUser.mockReset();
  mockListActiveByUser.mockResolvedValue([]);
});

describe("buildWorkflowPlanRequest — grounding", () => {
  it("grounds the prompt in the live AI-2 provider catalog", async () => {
    // Slice 4.AI-30 — AI-30 added deterministic provider narrowing, so a
    // mid-specificity request like "Notify me on Slack about new emails"
    // only renders the narrowed subset (slack + email candidates + native).
    // The "first usable provider in the registry" may not be in that
    // subset, so the assertion would flake on an alphabetic registry order
    // change. Use a vague request that triggers the full-catalog fallback
    // (`no_provider_mention` / `ambiguous_broad_request`) so the original
    // contract — "the live catalog is rendered into the prompt" — holds
    // independent of which provider happens to be alphabetically first.
    const req = await buildWorkflowPlanRequest({
      userId: "u1",
      userRequest: "do something",
    });
    const system = systemMessage(req.messages);

    const catalog = getProviderCatalog();
    expect(catalog.ok).toBe(true);
    if (!catalog.ok) return;

    const usable = catalog.data.providers.find(
      (p) => p.actions.length > 0 || p.triggers.length > 0,
    );
    expect(usable).toBeDefined();
    const sampleKey = usable!.actions[0]?.key ?? usable!.triggers[0]?.key;
    expect(sampleKey).toBeDefined();
    expect(system).toContain(sampleKey!);
  });

  it("omits live providers that have no usable metadata (pending providers)", async () => {
    const req = await buildWorkflowPlanRequest({
      userId: "u1",
      userRequest: "do something",
    });
    const system = systemMessage(req.messages);

    const catalog = getProviderCatalog();
    if (!catalog.ok) return;
    const pending = catalog.data.providers.filter(
      (p) => p.actions.length === 0 && p.triggers.length === 0,
    );
    for (const p of pending) {
      expect(system).not.toContain(`(id: ${p.id})`);
    }
  });

  it("passes the user request through verbatim", async () => {
    const req = await buildWorkflowPlanRequest({
      userId: "u1",
      userRequest: "EXACT REQUEST TEXT",
    });
    expect(req.messages.find((m) => m.role === "user")!.content).toBe(
      "EXACT REQUEST TEXT",
    );
  });
});

describe("buildWorkflowPlanRequest — model selection", () => {
  it("targets the creation feature → strong tier + strong output cap", async () => {
    const req = await buildWorkflowPlanRequest({ userId: "u1", userRequest: "x" });
    expect(req.feature).toBe("creation");
    expect(req.tier).toBe("strong");
    expect(req.maxOutputTokens).toBe(MODELS.strong.maxOutputTokens);
  });

  it("honors an explicit tier override", async () => {
    const req = await buildWorkflowPlanRequest({
      userId: "u1",
      userRequest: "x",
      tier: "fast",
    });
    expect(req.tier).toBe("fast");
    expect(req.maxOutputTokens).toBe(MODELS.fast.maxOutputTokens);
  });
});

describe("buildWorkflowPlanRequest — connected integrations", () => {
  it("includes connected integrations by provider, never token material", async () => {
    mockListActiveByUser.mockResolvedValue([makeRecord()]);
    const req = await buildWorkflowPlanRequest({ userId: "u1", userRequest: "x" });
    const system = systemMessage(req.messages);

    expect(system).toContain("slack");
    expect(system).toContain("Acme Workspace");

    for (const needle of [
      "ENC_ACCESS_SECRET",
      "ENC_REFRESH_SECRET",
      "BOT_SECRET",
      "accessTokenEncrypted",
      "botToken",
    ]) {
      expect(system).not.toContain(needle);
    }
  });

  it("degrades to the none-connected message when the lookup fails", async () => {
    mockListActiveByUser.mockRejectedValue(new Error("db down"));
    const req = await buildWorkflowPlanRequest({ userId: "u1", userRequest: "x" });
    expect(systemMessage(req.messages).toLowerCase()).toContain(
      "no connected integrations",
    );
  });
});

describe("buildWorkflowPlanRequest — no live model call", () => {
  it("returns a request without invoking any network/model client", async () => {
    const fetchSpy = jest.fn();
    const original = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch?: unknown }).fetch = fetchSpy;
    try {
      const req = await buildWorkflowPlanRequest({ userId: "u1", userRequest: "x" });
      expect(req.messages.length).toBe(2);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      (globalThis as { fetch?: unknown }).fetch = original;
    }
  });
});
