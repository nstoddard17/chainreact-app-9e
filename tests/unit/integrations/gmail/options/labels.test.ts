/**
 * @jest-environment node
 *
 * Tests for `integrations/gmail/options/labels.ts` — Slice ANALYTICS-SOURCES-GMAIL-1.
 * Pin: shape, label id→name mapping, q filter, refresh-failure/401 →
 * INTEGRATION_DISCONNECTED, other → PROVIDER_ERROR (leak-free), missing-integration guard.
 */

const mockLabelsList = jest.fn();
jest.mock("@/integrations/gmail/api/usersLabelsList", () => ({
  __esModule: true,
  usersLabelsList: (...args: unknown[]) => mockLabelsList(...args),
}));

const mockRefresh = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (input: unknown) => mockRefresh(input) };
});

import { gmailLabelsResolver } from "@/integrations/gmail/options/labels";
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
  expect(gmailLabelsResolver.source).toBe("gmail:labels");
  expect(gmailLabelsResolver.provider).toBe("gmail");
  expect(gmailLabelsResolver.requiresIntegration).toBe(true);
});

it("maps labels to {value:id, label:name}; drops id-less; filters by q", async () => {
  mockLabelsList.mockResolvedValue({
    labels: [
      { id: "INBOX", name: "Inbox", type: "system" },
      { id: "Label_7", name: "Work", type: "user" },
      { name: "no-id" },
    ],
  });
  const all = await gmailLabelsResolver.resolve(ctx());
  expect(all.items).toEqual([
    { value: "INBOX", label: "Inbox" },
    { value: "Label_7", label: "Work" },
  ]);

  const filtered = await gmailLabelsResolver.resolve(ctx({ q: "work" }));
  expect(filtered.items.map((i) => i.value)).toEqual(["Label_7"]);
});

it("maps refresh-failure / 401 to INTEGRATION_DISCONNECTED (reconnect)", async () => {
  for (const err of [
    new IntegrationActionRequiredError({
      accountId: "acct-1",
      provider: "gmail",
      providerAccountId: null,
      reason: "refresh_failed",
    }),
    new Unauthorized401Error("401"),
  ]) {
    mockRefresh.mockRejectedValueOnce(err);
    const thrown = await gmailLabelsResolver.resolve(ctx()).catch((e) => e);
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    expect(thrown.code).toBe("INTEGRATION_DISCONNECTED");
    expect(thrown.message).not.toMatch(/tok|enc/);
  }
});

it("maps an unexpected provider error to PROVIDER_ERROR (leak-free)", async () => {
  mockLabelsList.mockRejectedValueOnce(new Error("boom secret token=tok"));
  const thrown = await gmailLabelsResolver.resolve(ctx()).catch((e) => e);
  expect(thrown).toBeInstanceOf(OptionsResolverError);
  expect(thrown.code).toBe("PROVIDER_ERROR");
  expect(thrown.message).not.toMatch(/secret|token=tok/);
});

it("throws INTEGRATION_DISCONNECTED when ctx.integration is null (no fetch)", async () => {
  const thrown = await gmailLabelsResolver.resolve(ctx({ integration: null })).catch((e) => e);
  expect(thrown).toBeInstanceOf(OptionsResolverError);
  expect(thrown.code).toBe("INTEGRATION_DISCONNECTED");
  expect(mockRefresh).not.toHaveBeenCalled();
});
