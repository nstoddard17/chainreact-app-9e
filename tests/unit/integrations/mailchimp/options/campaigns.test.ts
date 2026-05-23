/**
 * @jest-environment node
 *
 * Tests for `integrations/mailchimp/options/campaigns.ts` — Slice 3.MAILCHIMP-2.
 *
 * Pin:
 *   - Shape: no requiredDeps, requiresIntegration=true.
 *   - Wrapper invocation via campaignsList sorted create_time DESC.
 *   - Mapping (id → value, settings.title → label, fallback chain to
 *     subject_line then id; status + type joined as description).
 *   - Description excludes content/html/preview_text/archive_url.
 *   - Empty response → empty items.
 *   - Missing dc → INTEGRATION_DISCONNECTED.
 *   - Error sanitization.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { mailchimpCampaignsResolver } from "@/integrations/mailchimp/options/campaigns";
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
  userId: "user-1",
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
    expect(args.accountId).toBe("mc-account-9001");
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
        userId: "user-1",
        provider: "mailchimp",
        accountId: "mc-account-9001",
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
