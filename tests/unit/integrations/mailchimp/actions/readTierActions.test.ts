/**
 * @jest-environment node
 *
 * Consolidated tests for the Mailchimp 2.1 Commit 1 read-tier action
 * handlers: `get_subscribers`, `get_campaign`, `get_campaign_stats`.
 *
 * Each handler is shorter than the addSubscriber Q11 hot spot so
 * co-locating in one file keeps the test layout proportional to handler
 * complexity (mirrors `subscriberActions.test.ts`).
 *
 * Verifies, per handler:
 *   - Schema strict shape (rejects unknown fields, requires id).
 *   - resolveDc → refreshAndRetry → wrapper threading.
 *   - Wrapper call arguments match the schema's intent.
 *   - **Bounded output** — every field is named explicitly; no raw
 *     Mailchimp body spread leaks through.
 *   - Error propagation from the wrapper.
 *   - Zod parse rejects BEFORE the wrapper call (no resolveDc / API hit).
 *
 * `get_subscribers` additionally:
 *   - Pagination cursor — `nextOffset` math (null on empty page,
 *     null on cursor-at-end, otherwise `offset + members.length`).
 *   - Single-page list only — no auto-pagination call.
 *   - Query-param allowlist passes through unchanged.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockMembersList = jest.fn();
const mockCampaignGet = jest.fn();
const mockReportGet = jest.fn();
const mockResolveDc = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/mailchimp/api/members", () => ({
  membersList: (...a: unknown[]) => mockMembersList(...a),
}));

jest.mock("@/integrations/_shared/mailchimp/api/campaigns", () => ({
  campaignGet: (...a: unknown[]) => mockCampaignGet(...a),
}));

jest.mock("@/integrations/_shared/mailchimp/api/reports", () => ({
  reportGet: (...a: unknown[]) => mockReportGet(...a),
}));

jest.mock("@/integrations/mailchimp/actions/_resolveDc", () => ({
  resolveDc: (...a: unknown[]) => mockResolveDc(...a),
}));

import { getSubscribers } from "@/integrations/mailchimp/actions/getSubscribers";
import { GetSubscribersConfigSchema } from "@/integrations/mailchimp/actions/getSubscribers.schema";
import { getCampaign } from "@/integrations/mailchimp/actions/getCampaign";
import { GetCampaignConfigSchema } from "@/integrations/mailchimp/actions/getCampaign.schema";
import { getCampaignStats } from "@/integrations/mailchimp/actions/getCampaignStats";
import { GetCampaignStatsConfigSchema } from "@/integrations/mailchimp/actions/getCampaignStats.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockMembersList.mockReset();
  mockCampaignGet.mockReset();
  mockReportGet.mockReset();
  mockResolveDc.mockReset();
  mockResolveDc.mockResolvedValue({ dc: "us21", accountId: "mc_account_xyz" });
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "mailchimp",
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-05-10T12:00:00Z",
    providerAccountId: "mc_account_xyz",
    payload: {},
  };
}

function makeInput(config: Record<string, unknown>) {
  return {
    workflowId: "w1",
    userId: "u1",
    accountId: "acct-u1",
    runId: "r1",
    nodeId: "n1",
    config,
    triggerEvent: trigger(),
  };
}

// ─── get_subscribers ────────────────────────────────────────────────────────

describe("get_subscribers — schema", () => {
  it("accepts minimal valid config (listId only)", () => {
    expect(() =>
      GetSubscribersConfigSchema.parse({ listId: "list_1" }),
    ).not.toThrow();
  });

  it("accepts every documented optional query param", () => {
    expect(() =>
      GetSubscribersConfigSchema.parse({
        listId: "list_1",
        status: "subscribed",
        count: 50,
        offset: 100,
        sinceLastChanged: "2026-01-01T00:00:00Z",
        beforeLastChanged: "2026-02-01T00:00:00Z",
        sortField: "last_changed",
        sortDir: "DESC",
      }),
    ).not.toThrow();
  });

  it("rejects missing listId", () => {
    expect(() => GetSubscribersConfigSchema.parse({})).toThrow();
  });

  it("rejects empty-string listId", () => {
    expect(() =>
      GetSubscribersConfigSchema.parse({ listId: "" }),
    ).toThrow();
  });

  it("rejects unknown fields (strict)", () => {
    expect(() =>
      GetSubscribersConfigSchema.parse({
        listId: "list_1",
        zzz_extra: 1,
      }),
    ).toThrow();
  });

  it("rejects out-of-range count (> 100)", () => {
    expect(() =>
      GetSubscribersConfigSchema.parse({ listId: "list_1", count: 500 }),
    ).toThrow();
  });

  it("rejects negative offset", () => {
    expect(() =>
      GetSubscribersConfigSchema.parse({ listId: "list_1", offset: -1 }),
    ).toThrow();
  });

  it("rejects invalid status enum", () => {
    expect(() =>
      GetSubscribersConfigSchema.parse({
        listId: "list_1",
        status: "bogus",
      }),
    ).toThrow();
  });

  it("rejects invalid sortField enum (no arbitrary keys to Mailchimp)", () => {
    expect(() =>
      GetSubscribersConfigSchema.parse({
        listId: "list_1",
        sortField: "email_address",
      }),
    ).toThrow();
  });
});

describe("get_subscribers — handler", () => {
  function mockMembers(
    members: Array<Record<string, unknown>>,
    totalItems: number,
  ) {
    mockMembersList.mockResolvedValue({ members, totalItems });
  }

  it("calls membersList with all configured query params + DC routing", async () => {
    mockMembers([], 0);
    await getSubscribers(
      makeInput({
        listId: "list_1",
        status: "subscribed",
        count: 25,
        offset: 50,
        sinceLastChanged: "2026-01-01T00:00:00Z",
        beforeLastChanged: "2026-02-01T00:00:00Z",
        sortField: "last_changed",
        sortDir: "DESC",
      }),
    );
    expect(mockMembersList).toHaveBeenCalledWith({
      accessToken: "tok",
      dc: "us21",
      audienceId: "list_1",
      status: "subscribed",
      count: 25,
      offset: 50,
      sinceLastChanged: "2026-01-01T00:00:00Z",
      beforeLastChanged: "2026-02-01T00:00:00Z",
      sortField: "last_changed",
      sortDir: "DESC",
    });
  });

  it("defaults to count=50 + offset=0 when omitted", async () => {
    mockMembers([], 0);
    await getSubscribers(makeInput({ listId: "list_1" }));
    expect(mockMembersList).toHaveBeenCalledWith(
      expect.objectContaining({ count: 50, offset: 0 }),
    );
  });

  it("threads refreshAndRetry → membersList — wrapper called exactly once (single-page)", async () => {
    mockMembers([{ id: "a", email_address: "x@y.com", status: "subscribed" }], 1);
    await getSubscribers(makeInput({ listId: "list_1" }));
    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(1);
    expect(mockMembersList).toHaveBeenCalledTimes(1);
  });

  it("returns bounded per-subscriber projection (no raw spread)", async () => {
    mockMembers(
      [
        {
          id: "abc",
          email_address: "x@y.com",
          unique_email_id: "ueid1",
          contact_id: "contact-99",
          status: "subscribed",
          list_id: "list_1",
          merge_fields: { FNAME: "Urist" },
          tags: [{ id: 1, name: "vip" }],
          timestamp_signup: "2026-01-01T00:00:00+00:00",
          last_changed: "2026-01-02T00:00:00+00:00",
          email_type: "html",
          vip: true,
          // Wire surface includes extras that MUST NOT leak through:
          ip_signup: "192.0.2.10",
          ip_opt: "192.0.2.11",
          stats: { avg_open_rate: 0.5 },
        },
      ],
      1,
    );
    const result = await getSubscribers(makeInput({ listId: "list_1" }));
    expect(result.output).toEqual({
      listId: "list_1",
      subscribers: [
        {
          id: "abc",
          emailAddress: "x@y.com",
          uniqueEmailId: "ueid1",
          contactId: "contact-99",
          status: "subscribed",
          mergeFields: { FNAME: "Urist" },
          tags: ["vip"],
          timestampSignup: "2026-01-01T00:00:00+00:00",
          lastChanged: "2026-01-02T00:00:00+00:00",
          vip: true,
          emailType: "html",
        },
      ],
      count: 1,
      totalItems: 1,
      nextOffset: null,
    });
    // Anti-test: no raw wire fields leaked through.
    const sub = (result.output.subscribers as ReadonlyArray<Record<string, unknown>>)[0]!;
    expect(sub).not.toHaveProperty("ip_signup");
    expect(sub).not.toHaveProperty("stats");
    expect(sub).not.toHaveProperty("email_address");
  });

  it("flattens tag objects to bare names; empty tags → []", async () => {
    mockMembers(
      [
        {
          id: "abc",
          email_address: "x@y.com",
          status: "subscribed",
          list_id: "list_1",
          // tags omitted entirely.
        },
      ],
      1,
    );
    const result = await getSubscribers(makeInput({ listId: "list_1" }));
    const sub = (result.output.subscribers as ReadonlyArray<Record<string, unknown>>)[0]!;
    expect(sub.tags).toEqual([]);
    expect(sub.mergeFields).toEqual({});
    expect(sub.vip).toBe(false);
  });

  it("pagination: nextOffset = offset + count when more pages remain", async () => {
    mockMembers(
      Array.from({ length: 25 }, (_, i) => ({
        id: `m${i}`,
        email_address: `m${i}@y.com`,
        status: "subscribed",
        list_id: "list_1",
      })),
      247, // total far beyond what's on this page
    );
    const result = await getSubscribers(
      makeInput({ listId: "list_1", count: 25, offset: 50 }),
    );
    expect(result.output.totalItems).toBe(247);
    expect(result.output.nextOffset).toBe(75);
  });

  it("pagination: nextOffset = null when cursor reaches totalItems", async () => {
    mockMembers(
      [
        {
          id: "m1",
          email_address: "m1@y.com",
          status: "subscribed",
          list_id: "list_1",
        },
      ],
      11,
    );
    // offset 10 + 1 returned member = 11 cumulative = totalItems → no more pages.
    const result = await getSubscribers(
      makeInput({ listId: "list_1", offset: 10 }),
    );
    expect(result.output.nextOffset).toBeNull();
  });

  it("pagination: nextOffset = null on empty page", async () => {
    mockMembers([], 42);
    const result = await getSubscribers(
      makeInput({ listId: "list_1", offset: 100 }),
    );
    expect(result.output.count).toBe(0);
    expect(result.output.subscribers).toEqual([]);
    expect(result.output.nextOffset).toBeNull();
  });

  it("Zod parse rejects BEFORE resolveDc / wrapper call", async () => {
    await expect(
      getSubscribers(makeInput({ listId: "" })),
    ).rejects.toThrow();
    expect(mockResolveDc).not.toHaveBeenCalled();
    expect(mockMembersList).not.toHaveBeenCalled();
  });

  it("propagates MissingDataCenterError from resolveDc", async () => {
    mockResolveDc.mockRejectedValueOnce(new Error("MissingDataCenterError"));
    await expect(
      getSubscribers(makeInput({ listId: "list_1" })),
    ).rejects.toThrow(/MissingDataCenterError/);
    expect(mockMembersList).not.toHaveBeenCalled();
  });

  it("propagates wrapper errors (5xx / NotFound / etc.)", async () => {
    mockMembersList.mockRejectedValue(new Error("Mailchimp API 500"));
    await expect(
      getSubscribers(makeInput({ listId: "list_1" })),
    ).rejects.toThrow(/500/);
  });
});

// ─── get_campaign ───────────────────────────────────────────────────────────

describe("get_campaign — schema", () => {
  it("accepts campaignId", () => {
    expect(() =>
      GetCampaignConfigSchema.parse({ campaignId: "c1" }),
    ).not.toThrow();
  });

  it("rejects missing campaignId", () => {
    expect(() => GetCampaignConfigSchema.parse({})).toThrow();
  });

  it("rejects empty-string campaignId", () => {
    expect(() =>
      GetCampaignConfigSchema.parse({ campaignId: "" }),
    ).toThrow();
  });

  it("rejects unknown fields (strict)", () => {
    expect(() =>
      GetCampaignConfigSchema.parse({ campaignId: "c1", extra: 1 }),
    ).toThrow();
  });
});

describe("get_campaign — handler", () => {
  beforeEach(() => {
    mockCampaignGet.mockResolvedValue({
      id: "c1",
      web_id: 42,
      type: "regular",
      status: "sent",
      create_time: "2026-01-01T00:00:00+00:00",
      send_time: "2026-01-02T12:00:00+00:00",
      archive_url: "https://mailchi.mp/abc",
      long_archive_url: "https://mailchi.mp/abc/long",
      emails_sent: 1000,
      content_type: "template",
      settings: {
        title: "Internal Title",
        subject_line: "Hello",
        preview_text: "Preview text",
        from_name: "Acme",
        reply_to: "reply@acme.example",
      },
      recipients: {
        list_id: "list_1",
        list_name: "Acme Newsletter",
        recipient_count: 987,
      },
      // Wire-only extras that MUST NOT leak through:
      rss_opts: { feed_url: "..." },
      tracking: { html_clicks: true },
    });
  });

  it("calls campaignGet with the campaignId + DC routing", async () => {
    await getCampaign(makeInput({ campaignId: "c1" }));
    expect(mockCampaignGet).toHaveBeenCalledWith({
      accessToken: "tok",
      dc: "us21",
      campaignId: "c1",
    });
  });

  it("returns bounded output (no raw spread)", async () => {
    const result = await getCampaign(makeInput({ campaignId: "c1" }));
    expect(result.output).toEqual({
      campaignId: "c1",
      webId: 42,
      type: "regular",
      status: "sent",
      createTime: "2026-01-01T00:00:00+00:00",
      sendTime: "2026-01-02T12:00:00+00:00",
      archiveUrl: "https://mailchi.mp/abc",
      longArchiveUrl: "https://mailchi.mp/abc/long",
      emailsSent: 1000,
      contentType: "template",
      settings: {
        title: "Internal Title",
        subjectLine: "Hello",
        previewText: "Preview text",
        fromName: "Acme",
        replyTo: "reply@acme.example",
      },
      recipients: {
        listId: "list_1",
        listName: "Acme Newsletter",
        recipientCount: 987,
      },
    });
    expect(result.output).not.toHaveProperty("rss_opts");
    expect(result.output).not.toHaveProperty("tracking");
  });

  it("defaults nulls / zeros for absent optional fields", async () => {
    mockCampaignGet.mockResolvedValueOnce({ id: "c1" });
    const result = await getCampaign(makeInput({ campaignId: "c1" }));
    expect(result.output).toEqual({
      campaignId: "c1",
      webId: null,
      type: null,
      status: null,
      createTime: null,
      sendTime: null,
      archiveUrl: null,
      longArchiveUrl: null,
      emailsSent: 0,
      contentType: null,
      settings: {
        title: null,
        subjectLine: null,
        previewText: null,
        fromName: null,
        replyTo: null,
      },
      recipients: {
        listId: null,
        listName: null,
        recipientCount: 0,
      },
    });
  });

  it("Zod parse rejects BEFORE resolveDc / wrapper call", async () => {
    await expect(getCampaign(makeInput({}))).rejects.toThrow();
    expect(mockResolveDc).not.toHaveBeenCalled();
    expect(mockCampaignGet).not.toHaveBeenCalled();
  });

  it("propagates NotFoundError from wrapper", async () => {
    mockCampaignGet.mockRejectedValueOnce(new Error("NotFoundError: campaign missing"));
    await expect(
      getCampaign(makeInput({ campaignId: "missing" })),
    ).rejects.toThrow(/NotFoundError/);
  });
});

// ─── get_campaign_stats ─────────────────────────────────────────────────────

describe("get_campaign_stats — schema", () => {
  it("accepts campaignId", () => {
    expect(() =>
      GetCampaignStatsConfigSchema.parse({ campaignId: "c1" }),
    ).not.toThrow();
  });

  it("rejects missing campaignId", () => {
    expect(() => GetCampaignStatsConfigSchema.parse({})).toThrow();
  });

  it("rejects empty-string campaignId", () => {
    expect(() =>
      GetCampaignStatsConfigSchema.parse({ campaignId: "" }),
    ).toThrow();
  });

  it("rejects unknown fields (strict)", () => {
    expect(() =>
      GetCampaignStatsConfigSchema.parse({ campaignId: "c1", x: 1 }),
    ).toThrow();
  });
});

describe("get_campaign_stats — handler", () => {
  beforeEach(() => {
    mockReportGet.mockResolvedValue({
      id: "c1",
      emails_sent: 1000,
      send_time: "2026-01-02T12:00:00+00:00",
      abuse_reports: 0,
      unsubscribed: 3,
      opens: { opens_total: 200, unique_opens: 150 },
      clicks: { clicks_total: 50, unique_clicks: 40 },
      bounces: { hard_bounces: 5, soft_bounces: 7 },
      forwards: { forwards_count: 4, forwards_opens: 2 },
      industry_stats: {
        type: "Tech",
        open_rate: 0.22,
        click_rate: 0.05,
        bounce_rate: 0.01,
        unopen_rate: 0.78,
        unsub_rate: 0.003,
        abuse_rate: 0.0,
      },
      // Wire-only extras that MUST NOT leak through:
      list_stats: { sub_rate: 12 },
      delivery_status: { enabled: true },
    });
  });

  it("calls reportGet with the campaignId + DC routing", async () => {
    await getCampaignStats(makeInput({ campaignId: "c1" }));
    expect(mockReportGet).toHaveBeenCalledWith({
      accessToken: "tok",
      dc: "us21",
      campaignId: "c1",
    });
  });

  it("returns bounded output (no raw spread)", async () => {
    const result = await getCampaignStats(makeInput({ campaignId: "c1" }));
    expect(result.output).toEqual({
      campaignId: "c1",
      emailsSent: 1000,
      abuseReports: 0,
      unsubscribed: 3,
      sendTime: "2026-01-02T12:00:00+00:00",
      opens: { opensTotal: 200, uniqueOpens: 150 },
      clicks: { clicksTotal: 50, uniqueClicks: 40 },
      bounces: { hardBounces: 5, softBounces: 7 },
      forwards: { forwardsCount: 4, forwardsOpens: 2 },
      industryStats: {
        type: "Tech",
        openRate: 0.22,
        clickRate: 0.05,
        bounceRate: 0.01,
        unopenRate: 0.78,
        unsubRate: 0.003,
        abuseRate: 0.0,
      },
    });
    expect(result.output).not.toHaveProperty("list_stats");
    expect(result.output).not.toHaveProperty("delivery_status");
  });

  it("defaults zero / null for absent stats fields; industryStats omitted as null", async () => {
    mockReportGet.mockResolvedValueOnce({ id: "c1" });
    const result = await getCampaignStats(makeInput({ campaignId: "c1" }));
    expect(result.output).toEqual({
      campaignId: "c1",
      emailsSent: 0,
      abuseReports: 0,
      unsubscribed: 0,
      sendTime: null,
      opens: { opensTotal: 0, uniqueOpens: 0 },
      clicks: { clicksTotal: 0, uniqueClicks: 0 },
      bounces: { hardBounces: 0, softBounces: 0 },
      forwards: { forwardsCount: 0, forwardsOpens: 0 },
      industryStats: null,
    });
  });

  it("Zod parse rejects BEFORE resolveDc / wrapper call", async () => {
    await expect(
      getCampaignStats(makeInput({ campaignId: "" })),
    ).rejects.toThrow();
    expect(mockResolveDc).not.toHaveBeenCalled();
    expect(mockReportGet).not.toHaveBeenCalled();
  });

  it("propagates NotFoundError from wrapper (unsent campaigns)", async () => {
    mockReportGet.mockRejectedValueOnce(
      new Error("NotFoundError: report for campaign unsent"),
    );
    await expect(
      getCampaignStats(makeInput({ campaignId: "unsent" })),
    ).rejects.toThrow(/NotFoundError/);
  });
});
