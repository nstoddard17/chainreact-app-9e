/**
 * @jest-environment node
 *
 * Tests for `integrations/notion/options/databases.ts` — RESOLVERS-1.
 *
 * Pin: shape, search invocation (database filter + q forwarded), mapping
 * (id→value, title→label with url/id fallback), non-database hits skipped,
 * errors, and no property/content leakage into labels.
 */
const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (...a: unknown[]) => mockRefreshAndRetry(...a) };
});

import { notionDatabasesResolver } from "@/integrations/notion/options/databases";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolverContext,
} from "@/services/options/types";
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
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
};

const ctx = (o: Partial<OptionsResolverContext> = {}): OptionsResolverContext => ({
  userId: "user-1",
  integration,
  q: "",
  deps: {},
  ...o,
});

beforeEach(() => mockRefreshAndRetry.mockReset());

describe("notionDatabasesResolver", () => {
  it("declares no requiredDeps and requires an integration", () => {
    expect(notionDatabasesResolver.source).toBe("notion:databases");
    expect(notionDatabasesResolver.provider).toBe("notion");
    expect(notionDatabasesResolver.requiresIntegration).toBe(true);
    expect(notionDatabasesResolver.requiredDeps).toBeUndefined();
  });

  it("invokes search with the database filter and forwards q", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ object: "list", results: [], has_more: false, next_cursor: null }),
          { status: 200 },
        ),
      );
    mockRefreshAndRetry.mockImplementationOnce(
      async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
    );
    await notionDatabasesResolver.resolve(ctx({ q: "tasks" }));
    const body = JSON.parse(String(fetchSpy.mock.calls[0]![1]!.body));
    expect(body.query).toBe("tasks");
    expect(body.filter).toEqual({ value: "database", property: "object" });
    expect(body.page_size).toBe(100);
    fetchSpy.mockRestore();
  });

  it("maps database id→value and joins the title rich-text as label (url/id fallback)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      results: [
        {
          object: "database",
          id: "db1",
          title: [{ plain_text: "Task " }, { plain_text: "Tracker" }],
        },
        // page hits are skipped
        { object: "page", id: "p1" },
        // database with no title → url fallback
        { object: "database", id: "db2", url: "https://notion.so/db2" },
        // database with neither → id fallback
        { object: "database", id: "db3" },
      ],
      has_more: true,
      next_cursor: "cur",
    });
    const result = await notionDatabasesResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "db1", label: "Task Tracker" },
      { value: "db2", label: "https://notion.so/db2" },
      { value: "db3", label: "db3" },
    ]);
    expect(result.hasMore).toBe(true);
  });

  it("never leaks property maps or content into the result", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      results: [
        {
          object: "database",
          id: "db1",
          title: [{ plain_text: "CRM" }],
          properties: { Email: { type: "email", email: "leak@example.test" } },
        },
      ],
      has_more: false,
      next_cursor: null,
    });
    const result = await notionDatabasesResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "db1", label: "CRM" }]);
    expect(JSON.stringify(result)).not.toContain("leak@example.test");
  });

  it("maps a 401 to INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(notionDatabasesResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("sanitizes provider failures to PROVIDER_ERROR (static copy)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error("raw provider stack trace with ids"),
    );
    const err = await notionDatabasesResolver
      .resolve(ctx())
      .catch((e) => e as OptionsResolverError);
    expect(err).toBeInstanceOf(OptionsResolverError);
    expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((err as OptionsResolverError).message).not.toContain("stack trace");
    expect((err as OptionsResolverError).message).toMatch(
      /couldn't load notion databases/i,
    );
  });

  it("throws INTEGRATION_DISCONNECTED without an integration (no call)", async () => {
    await expect(
      notionDatabasesResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });
});
