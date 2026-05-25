/**
 * @jest-environment node
 *
 * Tests for `integrations/airtable/options/views.ts` — Slice
 * 4.AIRTABLE-META-2. Multi-parent (baseId + tableIdOrName); value = view
 * NAME; requires includeViews:true so views survive the schema fetch.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { airtableViewsResolver } from "@/integrations/airtable/options/views";
import {
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/airtable/errors";
import {
  OptionsResolverError,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

const integration: IntegrationRecord = {
  id: "int-1",
  userId: "user-1",
  provider: "airtable",
  providerAccountId: "usrAIRTABLEUSER",
  displayName: "Alice (Airtable)",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: "enc:refresh",
  accessTokenExpiresAt: "2026-05-25T12:00:00Z",
  scopes: ["schema.bases:read"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-22T00:00:00Z",
  updatedAt: "2026-05-22T00:00:00Z",
};

// Raw schema-with-views as Airtable returns it from
// /v0/meta/bases/{baseId}/tables. Used in the passthrough mapping test
// to prove the resolver requests includeViews:true (otherwise
// basesGetSchema would strip `views` and the resolver would map nothing).
const RAW_SCHEMA = {
  tables: [
    {
      id: "tbl1",
      name: "Tasks",
      primaryFieldId: "fld1",
      fields: [{ id: "fld1", name: "Name", type: "singleLineText" }],
      views: [
        { id: "viwGrid", name: "All Tasks", type: "grid" },
        { id: "viwCal", name: "Calendar", type: "calendar" },
      ],
    },
  ],
};

function ctx(
  overrides: Partial<OptionsResolverContext> = {},
): OptionsResolverContext {
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: { baseId: "appBASE", tableIdOrName: "tbl1" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("airtableViewsResolver — shape (multi-parent)", () => {
  it("declares requiredDeps=['baseId','tableIdOrName'] and requires an integration", () => {
    expect(airtableViewsResolver.source).toBe("airtable:views");
    expect(airtableViewsResolver.provider).toBe("airtable");
    expect(airtableViewsResolver.requiresIntegration).toBe(true);
    expect(airtableViewsResolver.requiredDeps).toEqual([
      "baseId",
      "tableIdOrName",
    ]);
  });
});

describe("airtableViewsResolver — mapping (value = view NAME, includeViews:true)", () => {
  it("maps view name → value AND label, type → description; preserves view order", async () => {
    // Passthrough so the real basesGetSchema(includeViews:true) runs —
    // proves views survive (a false flag would strip them).
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(RAW_SCHEMA), { status: 200 }),
      );
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );

    const result = await airtableViewsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "All Tasks", label: "All Tasks", description: "grid" },
      { value: "Calendar", label: "Calendar", description: "calendar" },
    ]);
    expect(result.hasMore).toBe(false);
    fetchSpy.mockRestore();
  });

  it("value is the view NAME (not the view id)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(RAW_SCHEMA);
    const result = await airtableViewsResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual(["All Tasks", "Calendar"]);
    expect(result.items.map((i) => i.value)).not.toContain("viwGrid");
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(RAW_SCHEMA);
    const result = await airtableViewsResolver.resolve(ctx({ q: "cal" }));
    expect(result.items.map((i) => i.value)).toEqual(["Calendar"]);
  });

  it("returns empty items when the table has no views", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      tables: [{ id: "tbl1", name: "Tasks", primaryFieldId: "f1", fields: [] }],
    });
    const result = await airtableViewsResolver.resolve(ctx());
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("airtableViewsResolver — dependency + fallback + errors", () => {
  it("throws MISSING_DEPENDENCY when a parent dep is absent, no API call", async () => {
    await expect(
      airtableViewsResolver.resolve(ctx({ deps: { baseId: "appBASE" } })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items when base gone (NotFoundError) or table missing", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("base appGHOST", "no base"),
    );
    expect(
      await airtableViewsResolver.resolve(
        ctx({ deps: { baseId: "appGHOST", tableIdOrName: "tbl1" } }),
      ),
    ).toEqual({ items: [], hasMore: false });

    mockRefreshAndRetry.mockResolvedValueOnce(RAW_SCHEMA);
    expect(
      await airtableViewsResolver.resolve(
        ctx({ deps: { baseId: "appBASE", tableIdOrName: "tblMYSTERY" } }),
      ),
    ).toEqual({ items: [], hasMore: false });
  });

  it("maps auth → INTEGRATION_DISCONNECTED and other → PROVIDER_ERROR (no leak)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(airtableViewsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });

    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('schema GET failed: {"raw":"view-secret-leak"} Bearer xyz'),
    );
    try {
      await airtableViewsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      expect((err as Error).message).not.toContain("view-secret-leak");
      expect((err as Error).message).not.toContain("Bearer");
    }
  });
});
