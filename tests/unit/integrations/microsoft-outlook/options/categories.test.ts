/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-outlook/options/categories.ts` —
 * RESOLVERS-1. Pin: shape, category displayName → value AND label (the
 * PATCH stores NAMES, not Graph ids), q filter, nextLink → hasMore,
 * 403/InsufficientScopeError → PROVIDER_REAUTH_REQUIRED (new
 * MailboxSettings.Read scope — reconnect), refresh-failure/401 →
 * INTEGRATION_DISCONNECTED, other → PROVIDER_ERROR (leak-free),
 * missing-integration guard, and the add_categories meta wiring.
 */

const mockCategoriesList = jest.fn();
jest.mock("@/integrations/microsoft-outlook/api/listMasterCategories", () => ({
  __esModule: true,
  listMasterCategories: (...args: unknown[]) => mockCategoriesList(...args),
}));

const mockRefresh = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (input: unknown) => mockRefresh(input) };
});

import { outlookCategoriesResolver } from "@/integrations/microsoft-outlook/options/categories";
import { outlookAddCategoriesMeta } from "@/integrations/microsoft-outlook/actions/addCategories.meta";
import {
  InsufficientScopeError,
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

const integration = {
  accountId: "acct-1",
  accessTokenEncrypted: "enc",
} as unknown as IntegrationRecord;

function ctx(overrides: Partial<OptionsResolverContext> = {}): OptionsResolverContext {
  return { userId: "user-1", integration, q: "", deps: {}, ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRefresh.mockImplementation((input: { apiCall: (t: string) => unknown }) =>
    input.apiCall("tok"),
  );
});

it("declares the canonical source / provider / requiresIntegration fields", () => {
  expect(outlookCategoriesResolver.source).toBe("microsoft-outlook:categories");
  expect(outlookCategoriesResolver.provider).toBe("microsoft-outlook");
  expect(outlookCategoriesResolver.requiresIntegration).toBe(true);
  expect(outlookCategoriesResolver.requiredDeps).toBeUndefined();
});

it("maps categories to {value: displayName, label: displayName} — NEVER the Graph id — and filters by q", async () => {
  mockCategoriesList.mockResolvedValue({
    value: [
      { id: "guid-1", displayName: "Red Category" },
      { id: "guid-2", displayName: "Follow up" },
      { id: "guid-3", displayName: null },
      { id: "guid-4" },
    ],
    nextLink: null,
  });
  const all = await outlookCategoriesResolver.resolve(ctx());
  // value = the NAME the add_categories PATCH stores (not the id).
  expect(all.items).toEqual([
    { value: "Red Category", label: "Red Category" },
    { value: "Follow up", label: "Follow up" },
  ]);
  expect(all.hasMore).toBe(false);
  expect(JSON.stringify(all.items)).not.toMatch(/guid-/);

  const filtered = await outlookCategoriesResolver.resolve(ctx({ q: "follow" }));
  expect(filtered.items.map((i) => i.value)).toEqual(["Follow up"]);
});

it("passes a bounded page size to the wrapper and reports hasMore from nextLink without leaking the URL", async () => {
  mockCategoriesList.mockResolvedValue({
    value: [{ id: "g1", displayName: "Work" }],
    nextLink: "https://graph.microsoft.com/v1.0/me/outlook/masterCategories?$skip=100",
  });
  const result = await outlookCategoriesResolver.resolve(ctx());
  expect(mockCategoriesList).toHaveBeenCalledWith({ accessToken: "tok", top: 100 });
  expect(result.hasMore).toBe(true);
  expect(JSON.stringify(result.items)).not.toMatch(/graph\.microsoft\.com/);
});

it("maps InsufficientScopeError (403 — token predates MailboxSettings.Read) to PROVIDER_REAUTH_REQUIRED", async () => {
  mockRefresh.mockRejectedValueOnce(
    new InsufficientScopeError("403 insufficient scope", "microsoft-outlook"),
  );
  const thrown = await outlookCategoriesResolver.resolve(ctx()).catch((e) => e);
  expect(thrown).toBeInstanceOf(OptionsResolverError);
  expect((thrown as OptionsResolverError).code).toBe("PROVIDER_REAUTH_REQUIRED");
  expect((thrown as Error).message).toMatch(/reconnect/i);
  expect((thrown as Error).message).not.toMatch(/403|scope|tok/i);
});

it("maps refresh-failure / 401 to INTEGRATION_DISCONNECTED (reconnect)", async () => {
  for (const err of [
    new IntegrationActionRequiredError({
      accountId: "acct-1",
      provider: "microsoft-outlook",
      providerAccountId: null,
      reason: "refresh_failed",
    }),
    new Unauthorized401Error("401"),
  ]) {
    mockRefresh.mockRejectedValueOnce(err);
    const thrown = await outlookCategoriesResolver.resolve(ctx()).catch((e) => e);
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    expect((thrown as OptionsResolverError).code).toBe("INTEGRATION_DISCONNECTED");
    expect((thrown as Error).message).not.toMatch(/tok|enc/);
  }
});

it("maps an unexpected provider error to PROVIDER_ERROR (leak-free)", async () => {
  mockCategoriesList.mockRejectedValueOnce(new Error("boom secret token=tok"));
  const thrown = await outlookCategoriesResolver.resolve(ctx()).catch((e) => e);
  expect(thrown).toBeInstanceOf(OptionsResolverError);
  expect((thrown as OptionsResolverError).code).toBe("PROVIDER_ERROR");
  expect((thrown as Error).message).not.toMatch(/secret|token=tok/);
});

it("throws INTEGRATION_DISCONNECTED when ctx.integration is null (no fetch)", async () => {
  const thrown = await outlookCategoriesResolver
    .resolve(ctx({ integration: null }))
    .catch((e) => e);
  expect(thrown).toBeInstanceOf(OptionsResolverError);
  expect((thrown as OptionsResolverError).code).toBe("INTEGRATION_DISCONNECTED");
  expect(mockRefresh).not.toHaveBeenCalled();
});

describe("add_categories meta wiring (RESOLVERS-1)", () => {
  it("categories stays a string-array with a per-chip picker + manual entry", () => {
    const categories = outlookAddCategoriesMeta.fields.find(
      (f) => f.name === "categories",
    );
    expect(categories).toBeDefined();
    expect(categories!.type).toBe("string-array");
    expect(categories!.optionsSource).toBe("microsoft-outlook:categories");
    expect(categories!.allowManualEntry).toBe(true);
    expect(categories!.required).toBe(true);
  });
});
