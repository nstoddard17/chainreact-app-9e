/**
 * @jest-environment node
 *
 * Tests for `integrations/airtable/options/fields.ts` — Slice
 * 4.AIRTABLE-META-2. Multi-parent (baseId + tableIdOrName); value =
 * field NAME (runtime keys the fields map / list_records.fields /
 * formulas by name).
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { airtableFieldsResolver } from "@/integrations/airtable/options/fields";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/airtable/errors";
import {
  OptionsResolverError,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
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

const SCHEMA = {
  tables: [
    {
      id: "tbl1",
      name: "Tasks",
      primaryFieldId: "fld1",
      fields: [
        { id: "fld1", name: "Name", type: "singleLineText" },
        { id: "fld2", name: "Done", type: "checkbox" },
        { id: "fld3", name: "Cover", type: "multipleAttachments" },
      ],
    },
    {
      id: "tbl2",
      name: "Users",
      primaryFieldId: "fld9",
      fields: [{ id: "fld9", name: "Email", type: "email" }],
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

describe("airtableFieldsResolver — shape (multi-parent)", () => {
  it("declares requiredDeps=['baseId','tableIdOrName'] (schema-verbatim) and requires an integration", () => {
    expect(airtableFieldsResolver.source).toBe("airtable:fields");
    expect(airtableFieldsResolver.provider).toBe("airtable");
    expect(airtableFieldsResolver.requiresIntegration).toBe(true);
    expect(airtableFieldsResolver.requiredDeps).toEqual([
      "baseId",
      "tableIdOrName",
    ]);
  });
});

describe("airtableFieldsResolver — mapping (value = field NAME) + table lookup", () => {
  it("maps field name → value AND label, type → description; preserves field order", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(SCHEMA);
    const result = await airtableFieldsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "Name", label: "Name", description: "singleLineText" },
      { value: "Done", label: "Done", description: "checkbox" },
      { value: "Cover", label: "Cover", description: "multipleAttachments" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("value is the field NAME (not the field id) — runtime references fields by name", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(SCHEMA);
    const result = await airtableFieldsResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual(["Name", "Done", "Cover"]);
    expect(result.items.map((i) => i.value)).not.toContain("fld1");
  });

  it("resolves the table by NAME as well as by id", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(SCHEMA);
    const result = await airtableFieldsResolver.resolve(
      ctx({ deps: { baseId: "appBASE", tableIdOrName: "Users" } }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["Email"]);
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(SCHEMA);
    const result = await airtableFieldsResolver.resolve(ctx({ q: "co" }));
    // "Cover" matches; "Name"/"Done" do not.
    expect(result.items.map((i) => i.value)).toEqual(["Cover"]);
  });

  it("drops fields with empty/missing name", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      tables: [
        {
          id: "tbl1",
          name: "T",
          primaryFieldId: "f1",
          fields: [
            { id: "f1", name: "", type: "singleLineText" },
            { id: "f2", name: "Good", type: "number" },
          ],
        },
      ],
    });
    const result = await airtableFieldsResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual(["Good"]);
  });
});

describe("airtableFieldsResolver — dependency + cascade fallback", () => {
  it("throws MISSING_DEPENDENCY when baseId is absent, no API call", async () => {
    await expect(
      airtableFieldsResolver.resolve(ctx({ deps: { tableIdOrName: "tbl1" } })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws MISSING_DEPENDENCY when tableIdOrName is absent, no API call", async () => {
    await expect(
      airtableFieldsResolver.resolve(ctx({ deps: { baseId: "appBASE" } })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items when the parent base is gone (NotFoundError)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("base appGHOST", "no base"),
    );
    const result = await airtableFieldsResolver.resolve(
      ctx({ deps: { baseId: "appGHOST", tableIdOrName: "tbl1" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });

  it("returns empty items when the table no longer exists in the base", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(SCHEMA);
    const result = await airtableFieldsResolver.resolve(
      ctx({ deps: { baseId: "appBASE", tableIdOrName: "tblMYSTERY" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("airtableFieldsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      airtableFieldsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("maps auth errors → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(airtableFieldsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw body / tokens / field values", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('schema GET failed: {"raw":"field-secret-leak"} Bearer xyz'),
    );
    try {
      await airtableFieldsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("field-secret-leak");
      expect(msg).not.toContain("Bearer");
    }
  });
});
