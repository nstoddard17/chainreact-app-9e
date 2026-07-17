/**
 * @jest-environment node
 *
 * Tests for `integrations/mailchimp/options/links.ts` — the `mailchimp:links`
 * resolver backing the `link_clicked` trigger's `url` filter.
 *
 * Found by the RESOLVERS-2 contradiction sweep: `url` was a plain text box
 * whose value the poll matches against Mailchimp's reported URL VERBATIM, so a
 * trailing slash / utm_ param / http-vs-https difference made the trigger fire
 * zero times with no error — a silent misconfiguration. The pins that matter
 * here are that the committed `value` is the URL STRING (not Mailchimp's
 * internal url id), because that is what the matcher compares.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

const mockReportClickDetails = jest.fn();
jest.mock("@/integrations/_shared/mailchimp/api/reports", () => ({
  reportClickDetails: (...args: unknown[]) => mockReportClickDetails(...args),
}));

import { mailchimpLinksResolver } from "@/integrations/mailchimp/options/links";
import { NotFoundError } from "@/integrations/_shared/mailchimp/errors";
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
  providerAccountId: "12345",
  displayName: "Acme (Mailchimp)",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: [],
  accountMetadata: { dc: "us14" },
  disconnectedAt: null,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
};

function ctx(
  overrides: Partial<OptionsResolverContext> = {},
): OptionsResolverContext {
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: { campaignId: "camp-1" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockReportClickDetails.mockReset();
});

describe("mailchimpLinksResolver — shape", () => {
  it("declares source/provider and cascades off the sibling campaignId field", () => {
    expect(mailchimpLinksResolver.source).toBe("mailchimp:links");
    expect(mailchimpLinksResolver.provider).toBe("mailchimp");
    expect(mailchimpLinksResolver.requiresIntegration).toBe(true);
    expect(mailchimpLinksResolver.requiredDeps).toEqual(["campaignId"]);
  });
});

describe("mailchimpLinksResolver — wrapper invocation", () => {
  it("calls reportClickDetails for the selected campaign on the account's dc", async () => {
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    mockReportClickDetails.mockResolvedValueOnce([]);

    await mailchimpLinksResolver.resolve(ctx());

    expect(mockReportClickDetails.mock.calls[0]![0]).toEqual({
      accessToken: "decrypted-token",
      dc: "us14",
      campaignId: "camp-1",
      count: 100,
    });
    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.provider).toBe("mailchimp");
    expect(args.accountId).toBe("acct-user-1");
    expect(args.providerAccountId).toBe("12345");
  });
});

describe("mailchimpLinksResolver — dependency gating", () => {
  it("throws MISSING_DEPENDENCY (no API call) until a campaign is chosen", async () => {
    const badDeps: ReadonlyArray<Record<string, unknown>> = [
      {},
      { campaignId: "" },
    ];
    for (const deps of badDeps) {
      await expect(
        mailchimpLinksResolver.resolve(
          ctx({ deps: deps as Readonly<Record<string, string>> }),
        ),
      ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    }
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });
});

describe("mailchimpLinksResolver — mapping", () => {
  it("commits the URL STRING as the value, not Mailchimp's internal url id (the poll matches on the URL)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { id: "url-abc", url: "https://example.com/landing", total_clicks: 12 },
    ]);
    const result = await mailchimpLinksResolver.resolve(ctx());
    expect(result.items).toEqual([
      {
        value: "https://example.com/landing",
        label: "https://example.com/landing",
        description: "12 clicks",
      },
    ]);
    // The internal id must never become the committed value — it would never
    // match the reported URL and the trigger would silently never fire.
    expect(result.items[0]!.value).not.toBe("url-abc");
  });

  it("singularizes a one-click description and omits it when the count is absent", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { id: "u1", url: "https://a.example/1", total_clicks: 1 },
      { id: "u2", url: "https://a.example/2" },
    ]);
    const result = await mailchimpLinksResolver.resolve(ctx());
    expect(result.items[0]!.description).toBe("1 click");
    expect(result.items[1]!.description).toBeUndefined();
  });

  it("skips rows with no usable url and applies a case-insensitive q filter", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { id: "u1", url: "https://example.com/pricing" },
      { id: "u2", url: "" },
      { id: "u3" },
      { id: "u4", url: "https://example.com/blog" },
    ]);
    const all = await mailchimpLinksResolver.resolve(ctx());
    expect(all.items.map((i) => i.value)).toEqual([
      "https://example.com/pricing",
      "https://example.com/blog",
    ]);

    mockRefreshAndRetry.mockResolvedValueOnce([
      { id: "u1", url: "https://example.com/pricing" },
      { id: "u4", url: "https://example.com/blog" },
    ]);
    const filtered = await mailchimpLinksResolver.resolve(ctx({ q: "PRICING" }));
    expect(filtered.items.map((i) => i.value)).toEqual([
      "https://example.com/pricing",
    ]);
  });
});

describe("mailchimpLinksResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED with no integration, and with no dc, without calling the API", async () => {
    await expect(
      mailchimpLinksResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    await expect(
      mailchimpLinksResolver.resolve(
        ctx({ integration: { ...integration, accountMetadata: {} } }),
      ),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("maps IntegrationActionRequiredError + Unauthorized401Error → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-user-1",
        provider: "mailchimp",
        providerAccountId: "12345",
        reason: "refresh_not_supported",
      }),
    );
    await expect(mailchimpLinksResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(mailchimpLinksResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("treats a deleted campaign / absent click report (NotFoundError) as an empty picker, not an error", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("click-details for campaign camp-1"),
    );
    const result = await mailchimpLinksResolver.resolve(ctx());
    expect(result).toEqual({ items: [], hasMore: false });
  });

  it("maps other errors → PROVIDER_ERROR with a static message (no token / raw body leak)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('click-details failed: {"detail":"mc-secret-leak"} Bearer xyz'),
    );
    try {
      await mailchimpLinksResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("mc-secret-leak");
      expect(msg).not.toContain("Bearer");
    }
  });
});
