/**
 * @jest-environment node
 *
 * Tests for `integrations/notion/options/users.ts`.
 *
 * Pin: shape (no deps, requiresIntegration), wrapper invocation via
 * refreshAndRetry(provider=notion), mapping (id→value, name/workspace/id→label,
 * type→description), no-email-surfaced, q filter, error sanitization.
 */
const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (...a: unknown[]) => mockRefreshAndRetry(...a) };
});

import { notionUsersResolver } from "@/integrations/notion/options/users";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { OptionsResolverError, type OptionsResolverContext } from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-1",
  connectedByUserId: "user-1",
  provider: "notion",
  providerAccountId: "notion-ws-1",
  displayName: "Acme (Notion)",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: [],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
};

const ctx = (o: Partial<OptionsResolverContext> = {}): OptionsResolverContext => ({
  userId: "user-1",
  integration,
  q: "",
  deps: {},
  ...o,
});

beforeEach(() => mockRefreshAndRetry.mockReset());

describe("notionUsersResolver", () => {
  it("declares no requiredDeps and requires an integration", () => {
    expect(notionUsersResolver.source).toBe("notion:users");
    expect(notionUsersResolver.provider).toBe("notion");
    expect(notionUsersResolver.requiresIntegration).toBe(true);
    expect(notionUsersResolver.requiredDeps).toBeUndefined();
  });

  it("calls refreshAndRetry with provider=notion + the integration account/provider ids", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ results: [], has_more: false, next_cursor: null });
    await notionUsersResolver.resolve(ctx());
    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.provider).toBe("notion");
    expect(args.accountId).toBe("acct-1");
    expect(args.providerAccountId).toBe("notion-ws-1");
  });

  it("maps id→value, name→label, type→description; never surfaces email", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      results: [
        { object: "user", id: "u1", type: "person", name: "Ada", person: { email: "ada@x.com" } },
        { object: "user", id: "u2", type: "bot", name: null, bot: { workspace_name: "Acme WS" } },
        { object: "user", id: "", name: "skip-empty-id" },
      ],
      has_more: true,
      next_cursor: "c1",
    });
    const result = await notionUsersResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "u1", label: "Ada", description: "person" },
      { value: "u2", label: "Acme WS", description: "bot" },
    ]);
    expect(result.hasMore).toBe(true);
    expect(JSON.stringify(result.items)).not.toContain("ada@x.com");
  });

  it("filters by q (case-insensitive label substring)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      results: [
        { object: "user", id: "u1", name: "Ada" },
        { object: "user", id: "u2", name: "Grace" },
      ],
      has_more: false,
      next_cursor: null,
    });
    const result = await notionUsersResolver.resolve(ctx({ q: "grac" }));
    expect(result.items).toEqual([{ value: "u2", label: "Grace" }]);
  });

  it("maps auth/reconnect errors to INTEGRATION_DISCONNECTED, others to PROVIDER_ERROR", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(notionUsersResolver.resolve(ctx())).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-1",
        provider: "notion",
        providerAccountId: "notion-ws-1",
        reason: "refresh_not_supported",
      }),
    );
    await expect(notionUsersResolver.resolve(ctx())).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    mockRefreshAndRetry.mockRejectedValueOnce(new Error("boom"));
    await expect(notionUsersResolver.resolve(ctx())).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });

  it("throws INTEGRATION_DISCONNECTED when no integration", async () => {
    await expect(notionUsersResolver.resolve(ctx({ integration: null }))).rejects.toBeInstanceOf(OptionsResolverError);
  });
});
