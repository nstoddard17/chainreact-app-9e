/**
 * @jest-environment node
 *
 * mailchimp options-resolver contract suite — one provider-level suite
 * consolidating the former per-resolver files (PROVIDER-CONTRACT-CONSOLIDATION-1C).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockRefreshAndRetry = jest.fn();
const mockReportClickDetails = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

jest.mock("@/integrations/_shared/mailchimp/api/reports", () => ({
  reportClickDetails: (...args: unknown[]) => mockReportClickDetails(...args),
}));

import { mailchimpAudiencesResolver } from "@/integrations/mailchimp/options/audiences";
import { IntegrationActionRequiredError, Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { OptionsResolverError, type OptionsResolverContext } from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";
import { mailchimpCampaignsResolver } from "@/integrations/mailchimp/options/campaigns";
import { mailchimpLinksResolver } from "@/integrations/mailchimp/options/links";
import { NotFoundError } from "@/integrations/_shared/mailchimp/errors";
import { mailchimpMembersResolver } from "@/integrations/mailchimp/options/members";
import { mailchimpSegmentsResolver } from "@/integrations/mailchimp/options/segments";

// ---------------------------------------------------------------------------
// Merged from the former audiences.test.ts
// Tests for `integrations/mailchimp/options/audiences.ts` — Slice 3.MAILCHIMP-2.
// Pin:
// - Shape: no requiredDeps, requiresIntegration=true.
// - Wrapper invocation via listsList with dc + accountId from
// ctx.integration.
// - Mapping (id → value, name → label, stats.member_count → description).
// - Empty response → empty items.
// - Missing dc on accountMetadata → INTEGRATION_DISCONNECTED.
// - Error sanitization (Unauthorized401, IntegrationActionRequired,
// generic).
// - hasMore reflects totalItems vs lists.length.
// ---------------------------------------------------------------------------
describe("audiences (options)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former campaigns.test.ts
// Tests for `integrations/mailchimp/options/campaigns.ts` — Slice 3.MAILCHIMP-2.
// Pin:
// - Shape: no requiredDeps, requiresIntegration=true.
// - Wrapper invocation via campaignsList sorted create_time DESC.
// - Mapping (id → value, settings.title → label, fallback chain to
// subject_line then id; status + type joined as description).
// - Description excludes content/html/preview_text/archive_url.
// - Empty response → empty items.
// - Missing dc → INTEGRATION_DISCONNECTED.
// - Error sanitization.
// ---------------------------------------------------------------------------
describe("campaigns (options)", () => {

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
  accountMetadata: { dc: "us21" },
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

describe("mailchimpCampaignsResolver — shape", () => {
  it("declares no requiredDeps and requires an integration", () => {
    expect(mailchimpCampaignsResolver.source).toBe("mailchimp:campaigns");
    expect(mailchimpCampaignsResolver.provider).toBe("mailchimp");
    expect(mailchimpCampaignsResolver.requiresIntegration).toBe(true);
    expect(mailchimpCampaignsResolver.requiredDeps).toBeUndefined();
  });
});

describe("mailchimpCampaignsResolver — wrapper invocation", () => {
  it("calls refreshAndRetry pinned to the integration's accountId", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([]);
    await mailchimpCampaignsResolver.resolve(ctx());
    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.provider).toBe("mailchimp");
    expect(args.providerAccountId).toBe("mc-account-9001");
  });

  it("threads dc + sort=create_time DESC into the campaignsList call", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ campaigns: [] }), { status: 200 }),
      );
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    await mailchimpCampaignsResolver.resolve(ctx());
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("https://us21.api.mailchimp.com/3.0/campaigns");
    const params = new URL(url).searchParams;
    expect(params.get("sort_field")).toBe("create_time");
    expect(params.get("sort_dir")).toBe("DESC");
    expect(params.get("count")).toBe("100");
    fetchSpy.mockRestore();
  });
});

describe("mailchimpCampaignsResolver — mapping", () => {
  it("maps id → value, settings.title → label, status+type → description", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      {
        id: "campaign-1",
        status: "sent",
        type: "regular",
        settings: { title: "Q1 Newsletter", subject_line: "Hello!" },
      },
      {
        id: "campaign-2",
        status: "save",
        type: "regular",
        settings: { title: "Q2 Draft", subject_line: "Coming soon" },
      },
    ]);
    const result = await mailchimpCampaignsResolver.resolve(ctx());
    expect(result.items).toEqual([
      {
        value: "campaign-1",
        label: "Q1 Newsletter",
        description: "sent · regular",
      },
      {
        value: "campaign-2",
        label: "Q2 Draft",
        description: "save · regular",
      },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("falls back to subject_line when settings.title missing", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      {
        id: "campaign-1",
        status: "sent",
        settings: { subject_line: "Hello recipients" },
      },
    ]);
    const result = await mailchimpCampaignsResolver.resolve(ctx());
    expect(result.items[0]!.label).toBe("Hello recipients");
  });

  it("falls back to id when both title and subject_line missing", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { id: "campaign-1", status: "sent" },
    ]);
    const result = await mailchimpCampaignsResolver.resolve(ctx());
    expect(result.items[0]!.label).toBe("campaign-1");
  });

  it("omits description when status + type both missing", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { id: "campaign-1", settings: { title: "Bare" } },
    ]);
    const result = await mailchimpCampaignsResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "campaign-1", label: "Bare" }]);
  });

  it("DOES NOT include recipient-facing fields (archive_url, html, preview_text) in items", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      {
        id: "campaign-1",
        status: "sent",
        type: "regular",
        archive_url: "https://us21.list-manage.com/very-public-leak",
        settings: {
          title: "Q1",
          subject_line: "Hi",
          preview_text: "preview-leak",
          from_name: "From-leak",
          reply_to: "reply-leak@example.com",
        },
      },
    ]);
    const result = await mailchimpCampaignsResolver.resolve(ctx());
    const serialized = JSON.stringify(result.items);
    expect(serialized).not.toContain("very-public-leak");
    expect(serialized).not.toContain("preview-leak");
    expect(serialized).not.toContain("From-leak");
    expect(serialized).not.toContain("reply-leak@example.com");
  });

  it("drops campaigns with missing / empty id", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { id: "", settings: { title: "Bad" } },
      { settings: { title: "No id" } },
      { id: "good", settings: { title: "Good" } },
    ]);
    const result = await mailchimpCampaignsResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual(["good"]);
  });

  it("returns empty items when no campaigns", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([]);
    const result = await mailchimpCampaignsResolver.resolve(ctx());
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it("case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { id: "1", settings: { title: "Newsletter Spring" } },
      { id: "2", settings: { title: "Newsletter Fall" } },
      { id: "3", settings: { title: "Promo" } },
    ]);
    const result = await mailchimpCampaignsResolver.resolve(
      ctx({ q: "newsletter" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["1", "2"]);
  });
});

describe("mailchimpCampaignsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when ctx.integration is null", async () => {
    await expect(
      mailchimpCampaignsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws INTEGRATION_DISCONNECTED when accountMetadata.dc is missing", async () => {
    const noDc: IntegrationRecord = {
      ...integration,
      accountMetadata: {},
    };
    await expect(
      mailchimpCampaignsResolver.resolve(ctx({ integration: noDc })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps IntegrationActionRequiredError → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "mailchimp",
        providerAccountId: "mc-account-9001",
        reason: "refresh_not_supported",
      }),
    );
    await expect(
      mailchimpCampaignsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps Unauthorized401Error → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      mailchimpCampaignsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR with sanitized message", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('Mailchimp GET failed: {"raw":"campaigns-secret-leak"}'),
    );
    try {
      await mailchimpCampaignsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      expect((err as Error).message).not.toContain("campaigns-secret-leak");
    }
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former links.test.ts
// Tests for `integrations/mailchimp/options/links.ts` — the `mailchimp:links`
// resolver backing the `link_clicked` trigger's `url` filter.
// Found by the RESOLVERS-2 contradiction sweep: `url` was a plain text box
// whose value the poll matches against Mailchimp's reported URL VERBATIM, so a
// trailing slash / utm_ param / http-vs-https difference made the trigger fire
// zero times with no error — a silent misconfiguration. The pins that matter
// here are that the committed `value` is the URL STRING (not Mailchimp's
// internal url id), because that is what the matcher compares.
// ---------------------------------------------------------------------------
describe("links (options)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former members.test.ts
// Tests for `integrations/mailchimp/options/members.ts`.
// Pin: shape (requiredDeps=[audience_id]), dep + dc preconditions, mapping
// (email→value/label, status→description), q filter, error sanitization.
// ---------------------------------------------------------------------------
describe("members (options)", () => {

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-1",
  connectedByUserId: "user-1",
  provider: "mailchimp",
  providerAccountId: "mc-9001",
  displayName: "Acme (Mailchimp)",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: ["account_access"],
  accountMetadata: { dc: "us21" },
  disconnectedAt: null,
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
};

const ctx = (o: Partial<OptionsResolverContext> = {}): OptionsResolverContext => ({
  userId: "user-1",
  integration,
  q: "",
  deps: { audience_id: "aud-1" },
  ...o,
});

beforeEach(() => mockRefreshAndRetry.mockReset());

describe("mailchimpMembersResolver", () => {
  it("declares requiredDeps=[audience_id] and requires an integration", () => {
    expect(mailchimpMembersResolver.source).toBe("mailchimp:members");
    expect(mailchimpMembersResolver.provider).toBe("mailchimp");
    expect(mailchimpMembersResolver.requiresIntegration).toBe(true);
    expect(mailchimpMembersResolver.requiredDeps).toEqual(["audience_id"]);
  });

  it("maps email→value+label and status→description", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      members: [
        { id: "h1", email_address: "ada@x.com", status: "subscribed" },
        { id: "h2", email_address: "grace@x.com", status: "pending" },
        { id: "h3", email_address: "" }, // skipped (empty email)
      ],
      totalItems: 5,
    });
    const result = await mailchimpMembersResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "ada@x.com", label: "ada@x.com", description: "subscribed" },
      { value: "grace@x.com", label: "grace@x.com", description: "pending" },
    ]);
    expect(result.hasMore).toBe(true); // totalItems(5) > members(3)
  });

  it("passes the discovered audience_id dep through to refreshAndRetry's apiCall", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ members: [], total_items: 0 }), { status: 200 }));
    mockRefreshAndRetry.mockImplementationOnce(
      async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
    );
    await mailchimpMembersResolver.resolve(ctx({ deps: { audience_id: "AUD-XYZ" } }));
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("https://us21.api.mailchimp.com/3.0/lists/AUD-XYZ/members");
    fetchSpy.mockRestore();
  });

  it("requires the audience_id dep (MISSING_DEPENDENCY when absent)", async () => {
    await expect(mailchimpMembersResolver.resolve(ctx({ deps: {} }))).rejects.toMatchObject({
      code: "MISSING_DEPENDENCY",
    });
  });

  it("requires dc on accountMetadata (INTEGRATION_DISCONNECTED when missing)", async () => {
    await expect(
      mailchimpMembersResolver.resolve(ctx({ integration: { ...integration, accountMetadata: {} } })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps a 401 to INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(mailchimpMembersResolver.resolve(ctx())).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former segments.test.ts
// Tests for `integrations/mailchimp/options/segments.ts` — Slice 3.MAILCHIMP-2.
// Pin:
// - Shape: requiredDeps=["listId"], requiresIntegration=true.
// - Wrapper invocation via segmentsList with audienceId=ctx.deps.listId.
// - Mapping (id.toString() → value, name → label, type + member_count
// → description).
// - Numeric id stringified.
// - MISSING_DEPENDENCY when ctx.deps.listId empty / missing.
// - NotFoundError (parent audience gone) → empty items (NOT throw).
// - Missing dc → INTEGRATION_DISCONNECTED.
// - Error sanitization.
// ---------------------------------------------------------------------------
describe("segments (options)", () => {

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
  accountMetadata: { dc: "us21" },
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
    deps: { listId: "abc-list-id" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("mailchimpSegmentsResolver — shape", () => {
  it("declares requiredDeps=['listId'] and requires an integration", () => {
    expect(mailchimpSegmentsResolver.source).toBe("mailchimp:segments");
    expect(mailchimpSegmentsResolver.provider).toBe("mailchimp");
    expect(mailchimpSegmentsResolver.requiresIntegration).toBe(true);
    expect(mailchimpSegmentsResolver.requiredDeps).toEqual(["listId"]);
  });
});

describe("mailchimpSegmentsResolver — wrapper invocation", () => {
  it("threads dc + audienceId=listId into the segmentsList call", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ segments: [], total_items: 0 }),
          { status: 200 },
        ),
      );
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    await mailchimpSegmentsResolver.resolve(ctx());
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain(
      "https://us21.api.mailchimp.com/3.0/lists/abc-list-id/segments",
    );
    expect(new URL(url).searchParams.get("count")).toBe("100");
    fetchSpy.mockRestore();
  });
});

describe("mailchimpSegmentsResolver — mapping", () => {
  it("maps numeric id → string value, name → label, type+member_count → description", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      segments: [
        { id: 11, name: "VIPs", type: "saved", member_count: 42 },
        { id: 22, name: "Recent signups", type: "static", member_count: 1 },
      ],
      totalItems: 2,
    });
    const result = await mailchimpSegmentsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "11", label: "VIPs", description: "saved · 42 members" },
      {
        value: "22",
        label: "Recent signups",
        description: "static · 1 member",
      },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("omits description when type + member_count both missing", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      segments: [{ id: 7, name: "Bare" }],
      totalItems: 1,
    });
    const result = await mailchimpSegmentsResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "7", label: "Bare" }]);
  });

  it("falls back to stringified id when name missing", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      segments: [{ id: 99 }],
      totalItems: 1,
    });
    const result = await mailchimpSegmentsResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "99", label: "99" }]);
  });

  it("drops segments with non-numeric / missing id", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      segments: [
        { id: "not-a-number", name: "Bad" },
        { name: "No id" },
        { id: 11, name: "Good" },
      ],
      totalItems: 3,
    });
    const result = await mailchimpSegmentsResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual(["11"]);
  });

  it("returns empty items when segments is empty", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      segments: [],
      totalItems: 0,
    });
    const result = await mailchimpSegmentsResolver.resolve(ctx());
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it("case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      segments: [
        { id: 1, name: "Engaged users" },
        { id: 2, name: "Inactive users" },
        { id: 3, name: "VIP list" },
      ],
      totalItems: 3,
    });
    const result = await mailchimpSegmentsResolver.resolve(ctx({ q: "USERS" }));
    expect(result.items.map((i) => i.value)).toEqual(["1", "2"]);
  });

  it("hasMore=true when totalItems exceeds segments.length", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      segments: [{ id: 1, name: "One" }],
      totalItems: 250,
    });
    const result = await mailchimpSegmentsResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });
});

describe("mailchimpSegmentsResolver — dependency + cascade-fallback handling", () => {
  it("throws MISSING_DEPENDENCY when ctx.deps.listId is empty", async () => {
    await expect(
      mailchimpSegmentsResolver.resolve(ctx({ deps: { listId: "" } })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws MISSING_DEPENDENCY when ctx.deps.listId is missing", async () => {
    await expect(
      mailchimpSegmentsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT throw) when parent audience id no longer exists (404 → NotFoundError)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("segments (audience ghost)", "audience not found"),
    );
    const result = await mailchimpSegmentsResolver.resolve(
      ctx({ deps: { listId: "ghost" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("mailchimpSegmentsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when ctx.integration is null", async () => {
    await expect(
      mailchimpSegmentsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws INTEGRATION_DISCONNECTED when accountMetadata.dc is missing", async () => {
    const noDc: IntegrationRecord = {
      ...integration,
      accountMetadata: {},
    };
    await expect(
      mailchimpSegmentsResolver.resolve(ctx({ integration: noDc })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps IntegrationActionRequiredError → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "mailchimp",
        providerAccountId: "mc-account-9001",
        reason: "refresh_not_supported",
      }),
    );
    await expect(
      mailchimpSegmentsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps Unauthorized401Error → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      mailchimpSegmentsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR with sanitized message", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('Mailchimp GET failed: {"raw":"segments-secret-leak"}'),
    );
    try {
      await mailchimpSegmentsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      expect((err as Error).message).not.toContain("segments-secret-leak");
    }
  });
});

});
