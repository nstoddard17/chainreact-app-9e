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

jest.mock("@/services/options/_registry", () => ({
  getOptionsResolver: (...args: unknown[]) => mockGetOptionsResolver(...args),
}));
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));

import { resolveOptionsSourceForAI } from "@/services/ai/tools/options";
import { MAX_OPTIONS_ITEMS } from "@/services/ai/tools/types";
import { OptionsResolverError } from "@/services/options/types";

beforeEach(() => {
  mockGetOptionsResolver.mockReset();
  mockGetActiveForExecution.mockReset();
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
