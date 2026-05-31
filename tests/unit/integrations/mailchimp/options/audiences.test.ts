/**
 * @jest-environment node
 *
 * Tests for `integrations/mailchimp/options/audiences.ts` — Slice 3.MAILCHIMP-2.
 *
 * Pin:
 *   - Shape: no requiredDeps, requiresIntegration=true.
 *   - Wrapper invocation via listsList with dc + accountId from
 *     ctx.integration.
 *   - Mapping (id → value, name → label, stats.member_count → description).
 *   - Empty response → empty items.
 *   - Missing dc on accountMetadata → INTEGRATION_DISCONNECTED.
 *   - Error sanitization (Unauthorized401, IntegrationActionRequired,
 *     generic).
 *   - hasMore reflects totalItems vs lists.length.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { mailchimpAudiencesResolver } from "@/integrations/mailchimp/options/audiences";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "mailchimp",
  providerAccountId: "mc-account-9001",
  displayName: "Acme (Mailchimp)",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: ["account_access"],
  accountMetadata: { dc: "us21", accountName: "Acme" },
  disconnectedAt: null,
  createdAt: "2026-05-22T00:00:00Z",
  updatedAt: "2026-05-22T00:00:00Z",
};

function ctx(
  overrides: Partial<OptionsResolverContext> = {},
): OptionsResolverContext {
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: {},
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("mailchimpAudiencesResolver — shape", () => {
  it("declares no requiredDeps and requires an integration", () => {
    expect(mailchimpAudiencesResolver.source).toBe("mailchimp:audiences");
    expect(mailchimpAudiencesResolver.provider).toBe("mailchimp");
    expect(mailchimpAudiencesResolver.requiresIntegration).toBe(true);
    expect(mailchimpAudiencesResolver.requiredDeps).toBeUndefined();
  });
});

describe("mailchimpAudiencesResolver — wrapper invocation", () => {
  it("calls refreshAndRetry with provider=mailchimp and accountId=integration.providerAccountId", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      lists: [{ id: "abc", name: "Acme" }],
      totalItems: 1,
    });
    await mailchimpAudiencesResolver.resolve(ctx());
    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.accountId).toBe("acct-user-1");
    expect(args.provider).toBe("mailchimp");
    expect(args.providerAccountId).toBe("mc-account-9001");
    expect(typeof args.apiCall).toBe("function");
  });

  it("threads dc=us21 + count=100 from accountMetadata.dc into listsList", async () => {
    // Verify the inner apiCall the resolver passes to refreshAndRetry
    // invokes listsList with the dc captured from accountMetadata.
    // We spy on globalThis.fetch so the listsList wrapper hits the
    // expected per-dc URL.
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ lists: [], total_items: 0 }), {
          status: 200,
        }),
      );

    mockRefreshAndRetry.mockImplementationOnce(
      async (input: {
        apiCall: (t: string) => Promise<{
          lists: ReadonlyArray<{ id: string }>;
          totalItems: number;
        }>;
      }) => input.apiCall("decrypted-token"),
    );

    await mailchimpAudiencesResolver.resolve(ctx());
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("https://us21.api.mailchimp.com/3.0/lists");
    expect(new URL(url).searchParams.get("count")).toBe("100");
    fetchSpy.mockRestore();
  });
});

describe("mailchimpAudiencesResolver — mapping", () => {
  it("maps id → value, name → label, member_count → '<n> members' description", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      lists: [
        { id: "abc", name: "Acme", stats: { member_count: 42 } },
        { id: "xyz", name: "Beta", stats: { member_count: 1 } },
      ],
      totalItems: 2,
    });
    const result = await mailchimpAudiencesResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "abc", label: "Acme", description: "42 members" },
      { value: "xyz", label: "Beta", description: "1 member" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("omits description when member_count missing", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      lists: [{ id: "abc", name: "Acme" }],
      totalItems: 1,
    });
    const result = await mailchimpAudiencesResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "abc", label: "Acme" }]);
  });

  it("falls back to id when name missing", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      lists: [{ id: "weird" }],
      totalItems: 1,
    });
    const result = await mailchimpAudiencesResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "weird", label: "weird" }]);
  });

  it("drops lists with missing / empty id", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      lists: [
        { id: "", name: "Bad" },
        { name: "No id" },
        { id: "good", name: "Good" },
      ],
      totalItems: 3,
    });
    const result = await mailchimpAudiencesResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "good", label: "Good" }]);
  });

  it("returns empty items when response.lists is empty", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ lists: [], totalItems: 0 });
    const result = await mailchimpAudiencesResolver.resolve(ctx());
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it("case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      lists: [
        { id: "abc", name: "Acme Newsletter" },
        { id: "xyz", name: "Beta Channel" },
      ],
      totalItems: 2,
    });
    const result = await mailchimpAudiencesResolver.resolve(ctx({ q: "ACME" }));
    expect(result.items).toEqual([{ value: "abc", label: "Acme Newsletter" }]);
  });

  it("hasMore=true when totalItems exceeds returned lists.length", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      lists: [{ id: "a", name: "A" }],
      totalItems: 150,
    });
    const result = await mailchimpAudiencesResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });
});

describe("mailchimpAudiencesResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when ctx.integration is null", async () => {
    await expect(
      mailchimpAudiencesResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws INTEGRATION_DISCONNECTED when accountMetadata.dc is missing", async () => {
    const noDc: IntegrationRecord = {
      ...integration,
      accountMetadata: { accountName: "Acme" }, // dc missing
    };
    await expect(
      mailchimpAudiencesResolver.resolve(ctx({ integration: noDc })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws INTEGRATION_DISCONNECTED when accountMetadata.dc is empty string", async () => {
    const emptyDc: IntegrationRecord = {
      ...integration,
      accountMetadata: { dc: "" },
    };
    await expect(
      mailchimpAudiencesResolver.resolve(ctx({ integration: emptyDc })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps IntegrationActionRequiredError → INTEGRATION_DISCONNECTED (refresh_not_supported branch)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "mailchimp",
        providerAccountId: "mc-account-9001",
        reason: "refresh_not_supported",
      }),
    );
    await expect(
      mailchimpAudiencesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps Unauthorized401Error → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      mailchimpAudiencesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR with sanitized message (no raw body leak)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('Mailchimp GET failed: {"raw":"mailchimp-secret-leak"}'),
    );
    try {
      await mailchimpAudiencesResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      expect((err as Error).message).not.toContain("mailchimp-secret-leak");
      expect((err as Error).message).not.toContain("raw");
    }
  });
});
