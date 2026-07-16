/**
 * @jest-environment node
 *
 * Tests for `integrations/airtable/options/records.ts` — RESOLVERS-1.
 * Multi-parent (baseId + tableIdOrName); value = record id; label =
 * PRIMARY field value only (id fallback); ONLY the primary field is
 * requested from Airtable (`fields[]`), one bounded page (pageSize
 * 100), honest hasMore from the pagination offset, and no cell-data /
 * token leakage in results or errors.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

const mockBasesGetSchema = jest.fn();
jest.mock("@/integrations/airtable/api/bases", () => ({
  basesGetSchema: (...args: unknown[]) => mockBasesGetSchema(...args),
}));

const mockRecordsList = jest.fn();
jest.mock("@/integrations/airtable/api/records", () => ({
  recordsList: (...args: unknown[]) => mockRecordsList(...args),
}));

import { airtableRecordsResolver } from "@/integrations/airtable/options/records";
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
  accessTokenExpiresAt: "2026-07-16T12:00:00Z",
  scopes: ["data.records:read", "schema.bases:read"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
};

const SCHEMA = {
  tables: [
    {
      id: "tbl1",
      name: "Tasks",
      primaryFieldId: "fld1",
      fields: [
        { id: "fld1", name: "Name", type: "singleLineText" },
        { id: "fld2", name: "Notes", type: "longText" },
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
  jest.clearAllMocks();
  // Pass-through so the mocked api wrappers see the real call params.
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

describe("airtableRecordsResolver — shape (multi-parent)", () => {
  it("declares requiredDeps=['baseId','tableIdOrName'] (schema-verbatim) and requires an integration", () => {
    expect(airtableRecordsResolver.source).toBe("airtable:records");
    expect(airtableRecordsResolver.provider).toBe("airtable");
    expect(airtableRecordsResolver.requiresIntegration).toBe(true);
    expect(airtableRecordsResolver.requiredDeps).toEqual([
      "baseId",
      "tableIdOrName",
    ]);
  });
});

describe("airtableRecordsResolver — mapping (value = record id, label = PRIMARY field)", () => {
  it("labels come from the primary field; record id in description; order preserved", async () => {
    mockBasesGetSchema.mockResolvedValueOnce(SCHEMA);
    mockRecordsList.mockResolvedValueOnce({
      records: [
        { id: "recAAA", fields: { Name: "Write launch email" } },
        { id: "recBBB", fields: { Name: "Ship RESOLVERS-1" } },
      ],
    });
    const result = await airtableRecordsResolver.resolve(ctx());
    expect(result.items).toEqual([
      {
        value: "recAAA",
        label: "Write launch email",
        description: "recAAA",
      },
      { value: "recBBB", label: "Ship RESOLVERS-1", description: "recBBB" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("requests ONLY the primary field (fields[]=<primary name>) with pageSize 100", async () => {
    mockBasesGetSchema.mockResolvedValueOnce(SCHEMA);
    mockRecordsList.mockResolvedValueOnce({ records: [] });
    await airtableRecordsResolver.resolve(ctx());
    expect(mockBasesGetSchema).toHaveBeenCalledWith(
      expect.objectContaining({ baseId: "appBASE", includeViews: false }),
    );
    expect(mockRecordsList).toHaveBeenCalledWith(
      expect.objectContaining({
        baseId: "appBASE",
        tableIdOrName: "tbl1",
        pageSize: 100,
        fields: ["Name"],
      }),
    );
  });

  it("coerces numeric primary values to strings", async () => {
    mockBasesGetSchema.mockResolvedValueOnce({
      tables: [
        {
          id: "tbl1",
          name: "Orders",
          primaryFieldId: "fldN",
          fields: [{ id: "fldN", name: "Order #", type: "autoNumber" }],
        },
      ],
    });
    mockRecordsList.mockResolvedValueOnce({
      records: [{ id: "recNUM", fields: { "Order #": 42 } }],
    });
    const result = await airtableRecordsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "recNUM", label: "42", description: "recNUM" },
    ]);
  });

  it("falls back to the record id when the primary cell is empty / non-text (no description echo)", async () => {
    mockBasesGetSchema.mockResolvedValueOnce(SCHEMA);
    mockRecordsList.mockResolvedValueOnce({
      records: [
        { id: "recEMPTY", fields: {} },
        { id: "recBLANK", fields: { Name: "   " } },
        { id: "recOBJ", fields: { Name: { weird: true } } },
      ],
    });
    const result = await airtableRecordsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "recEMPTY", label: "recEMPTY" },
      { value: "recBLANK", label: "recBLANK" },
      { value: "recOBJ", label: "recOBJ" },
    ]);
  });

  it("resolves the table by NAME as well as by id (primary field still honored)", async () => {
    mockBasesGetSchema.mockResolvedValueOnce(SCHEMA);
    mockRecordsList.mockResolvedValueOnce({
      records: [{ id: "recAAA", fields: { Name: "Alpha" } }],
    });
    const result = await airtableRecordsResolver.resolve(
      ctx({ deps: { baseId: "appBASE", tableIdOrName: "Tasks" } }),
    );
    expect(result.items.map((i) => i.label)).toEqual(["Alpha"]);
  });

  it("applies case-insensitive q filter against labels", async () => {
    mockBasesGetSchema.mockResolvedValueOnce(SCHEMA);
    mockRecordsList.mockResolvedValueOnce({
      records: [
        { id: "rec1", fields: { Name: "Alpha task" } },
        { id: "rec2", fields: { Name: "Beta task" } },
      ],
    });
    const result = await airtableRecordsResolver.resolve(ctx({ q: "beta" }));
    expect(result.items.map((i) => i.value)).toEqual(["rec2"]);
  });

  it("hasMore is honest — true only when Airtable returns a pagination offset", async () => {
    mockBasesGetSchema.mockResolvedValueOnce(SCHEMA);
    mockRecordsList.mockResolvedValueOnce({
      records: [{ id: "rec1", fields: { Name: "Alpha" } }],
      offset: "itrNEXT/rec1",
    });
    const result = await airtableRecordsResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });
});

describe("airtableRecordsResolver — dependency + cascade fallback", () => {
  it("throws MISSING_DEPENDENCY when baseId is absent, no API call", async () => {
    await expect(
      airtableRecordsResolver.resolve(ctx({ deps: { tableIdOrName: "tbl1" } })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockBasesGetSchema).not.toHaveBeenCalled();
    expect(mockRecordsList).not.toHaveBeenCalled();
  });

  it("throws MISSING_DEPENDENCY when tableIdOrName is absent, no API call", async () => {
    await expect(
      airtableRecordsResolver.resolve(ctx({ deps: { baseId: "appBASE" } })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockBasesGetSchema).not.toHaveBeenCalled();
    expect(mockRecordsList).not.toHaveBeenCalled();
  });

  it("returns empty items when the parent base is gone (schema NotFoundError); records never fetched", async () => {
    mockBasesGetSchema.mockRejectedValueOnce(
      new NotFoundError("base appGHOST", "no base"),
    );
    const result = await airtableRecordsResolver.resolve(
      ctx({ deps: { baseId: "appGHOST", tableIdOrName: "tbl1" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
    expect(mockRecordsList).not.toHaveBeenCalled();
  });

  it("returns empty items when the table no longer exists in the base; records never fetched", async () => {
    mockBasesGetSchema.mockResolvedValueOnce(SCHEMA);
    const result = await airtableRecordsResolver.resolve(
      ctx({ deps: { baseId: "appBASE", tableIdOrName: "tblMYSTERY" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
    expect(mockRecordsList).not.toHaveBeenCalled();
  });

  it("returns empty items when the records list itself 404s (table deleted mid-cascade)", async () => {
    mockBasesGetSchema.mockResolvedValueOnce(SCHEMA);
    mockRecordsList.mockRejectedValueOnce(
      new NotFoundError("table appBASE/tbl1", "gone"),
    );
    const result = await airtableRecordsResolver.resolve(ctx());
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("airtableRecordsResolver — error sanitization + no-PII pins", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      airtableRecordsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockBasesGetSchema).not.toHaveBeenCalled();
    expect(mockRecordsList).not.toHaveBeenCalled();
  });

  it("maps auth errors (401) → INTEGRATION_DISCONNECTED", async () => {
    mockBasesGetSchema.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(airtableRecordsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw body / tokens / cell values", async () => {
    mockBasesGetSchema.mockResolvedValueOnce(SCHEMA);
    mockRecordsList.mockRejectedValueOnce(
      new Error('records GET failed: {"raw":"cell-secret-leak"} Bearer xyz'),
    );
    try {
      await airtableRecordsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("cell-secret-leak");
      expect(msg).not.toContain("Bearer");
    }
  });

  it("NO cell data beyond the primary-field label ever reaches the result (no-PII pin)", async () => {
    mockBasesGetSchema.mockResolvedValueOnce(SCHEMA);
    // Simulate a response that carries extra cell data anyway (defense
    // in depth — the resolver must not spread record.fields).
    mockRecordsList.mockResolvedValueOnce({
      records: [
        {
          id: "recPII",
          fields: {
            Name: "Alice record",
            Notes: "SSN 000-00-0000",
            Email: "leak@example.test",
          },
          createdTime: "2026-07-01T00:00:00Z",
        },
      ],
    });
    const result = await airtableRecordsResolver.resolve(ctx());
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("SSN");
    expect(serialized).not.toContain("leak@example.test");
    expect(serialized).not.toContain("createdTime");
    expect(result.items[0]).toEqual({
      value: "recPII",
      label: "Alice record",
      description: "recPII",
    });
    // Every item is exactly {value, label, description?} — nothing else.
    for (const item of result.items) {
      expect(
        Object.keys(item).every((k) =>
          ["value", "label", "description"].includes(k),
        ),
      ).toBe(true);
    }
  });
});

describe("airtable meta wiring — recordId pickers (RESOLVERS-1)", () => {
  it("get/update/delete_record recordId → airtable:records combobox (multi-parent + manual entry)", async () => {
    const { airtableGetRecordMeta } = await import(
      "@/integrations/airtable/actions/getRecord.meta"
    );
    const { airtableUpdateRecordMeta } = await import(
      "@/integrations/airtable/actions/updateRecord.meta"
    );
    const { airtableDeleteRecordMeta } = await import(
      "@/integrations/airtable/actions/deleteRecord.meta"
    );
    for (const meta of [
      airtableGetRecordMeta,
      airtableUpdateRecordMeta,
      airtableDeleteRecordMeta,
    ]) {
      const f = meta.fields.find((x) => x.name === "recordId")!;
      expect(f.type).toBe("combobox");
      expect(f.optionsSource).toBe("airtable:records");
      expect(f.dependsOn).toEqual(["baseId", "tableIdOrName"]);
      expect(f.allowManualEntry).toBe(true);
      expect(f.required).toBe(true);
    }
  });
});
