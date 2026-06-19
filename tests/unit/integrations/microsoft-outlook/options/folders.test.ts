/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-outlook/options/folders.ts` — Slice
 * ANALYTICS-SOURCES-OUTLOOK-1. Pin: shape, folder id→displayName mapping, q
 * filter, refresh-failure/401 → INTEGRATION_DISCONNECTED, other → PROVIDER_ERROR
 * (leak-free), missing-integration guard.
 */

const mockFoldersList = jest.fn();
jest.mock("@/integrations/microsoft-outlook/api/listMailFolders", () => ({
  __esModule: true,
  listMailFolders: (...args: unknown[]) => mockFoldersList(...args),
}));

const mockRefresh = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (input: unknown) => mockRefresh(input) };
});

import { outlookFoldersResolver } from "@/integrations/microsoft-outlook/options/folders";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

const integration = { accountId: "acct-1", accessTokenEncrypted: "enc" } as unknown as IntegrationRecord;

function ctx(overrides: Partial<OptionsResolverContext> = {}): OptionsResolverContext {
  return { userId: "user-1", integration, q: "", deps: {}, ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRefresh.mockImplementation((input: { apiCall: (t: string) => unknown }) => input.apiCall("tok"));
});

it("declares the canonical source / provider / requiresIntegration fields", () => {
  expect(outlookFoldersResolver.source).toBe("microsoft-outlook:folders");
  expect(outlookFoldersResolver.provider).toBe("microsoft-outlook");
  expect(outlookFoldersResolver.requiresIntegration).toBe(true);
});

it("maps folders to {value:id, label:displayName}; drops id-less; filters by q", async () => {
  mockFoldersList.mockResolvedValue({
    value: [
      { id: "inbox", displayName: "Inbox" },
      { id: "AQMkAD7", displayName: "Work" },
      { displayName: "no-id" },
    ],
  });
  const all = await outlookFoldersResolver.resolve(ctx());
  expect(all.items).toEqual([
    { value: "inbox", label: "Inbox" },
    { value: "AQMkAD7", label: "Work" },
  ]);

  const filtered = await outlookFoldersResolver.resolve(ctx({ q: "work" }));
  expect(filtered.items.map((i) => i.value)).toEqual(["AQMkAD7"]);
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
    const thrown = await outlookFoldersResolver.resolve(ctx()).catch((e) => e);
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    expect(thrown.code).toBe("INTEGRATION_DISCONNECTED");
    expect(thrown.message).not.toMatch(/tok|enc/);
  }
});

it("maps an unexpected provider error to PROVIDER_ERROR (leak-free)", async () => {
  mockFoldersList.mockRejectedValueOnce(new Error("boom secret token=tok"));
  const thrown = await outlookFoldersResolver.resolve(ctx()).catch((e) => e);
  expect(thrown).toBeInstanceOf(OptionsResolverError);
  expect(thrown.code).toBe("PROVIDER_ERROR");
  expect(thrown.message).not.toMatch(/secret|token=tok/);
});

it("throws INTEGRATION_DISCONNECTED when ctx.integration is null (no fetch)", async () => {
  const thrown = await outlookFoldersResolver.resolve(ctx({ integration: null })).catch((e) => e);
  expect(thrown).toBeInstanceOf(OptionsResolverError);
  expect(thrown.code).toBe("INTEGRATION_DISCONNECTED");
  expect(mockRefresh).not.toHaveBeenCalled();
});
