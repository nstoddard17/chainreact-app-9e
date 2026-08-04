/**
 * @jest-environment node
 *
 * airtable options-resolver contract suite — one provider-level suite
 * consolidating the former per-resolver files (PROVIDER-CONTRACT-CONSOLIDATION-1C).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { airtableAttachmentFieldsResolver } from "@/integrations/airtable/options/attachmentFields";
import { Unauthorized401Error, IntegrationActionRequiredError } from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/airtable/errors";
import { OptionsResolverError, type OptionsResolverContext } from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";
import { airtableBasesResolver } from "@/integrations/airtable/options/bases";
import { airtableFieldsResolver } from "@/integrations/airtable/options/fields";
import { airtableTablesResolver } from "@/integrations/airtable/options/tables";
import { airtableViewsResolver } from "@/integrations/airtable/options/views";

// ---------------------------------------------------------------------------
// Merged from the former attachmentFields.test.ts
// Tests for `integrations/airtable/options/attachmentFields.ts` — Slice
// 4.AIRTABLE-META-2. Multi-parent (baseId + tableIdOrName); value =
// field NAME; filters to attachment-type fields only. Backs
// `add_attachment.fieldName`.
// ---------------------------------------------------------------------------
describe("attachmentFields (options)", () => {

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

// Mixed field types — only the two attachment-typed fields should surface.
const SCHEMA = {
  tables: [
    {
      id: "tbl1",
      name: "Tasks",
      primaryFieldId: "fld1",
      fields: [
        { id: "fld1", name: "Name", type: "singleLineText" },
        { id: "fld2", name: "Cover", type: "multipleAttachments" },
        { id: "fld3", name: "Done", type: "checkbox" },
        { id: "fld4", name: "Docs", type: "attachment" },
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

describe("airtableAttachmentFieldsResolver — shape (multi-parent)", () => {
  it("declares requiredDeps=['baseId','tableIdOrName'] and requires an integration", () => {
    expect(airtableAttachmentFieldsResolver.source).toBe(
      "airtable:attachment_fields",
    );
    expect(airtableAttachmentFieldsResolver.provider).toBe("airtable");
    expect(airtableAttachmentFieldsResolver.requiresIntegration).toBe(true);
    expect(airtableAttachmentFieldsResolver.requiredDeps).toEqual([
      "baseId",
      "tableIdOrName",
    ]);
  });
});

describe("airtableAttachmentFieldsResolver — filters to attachment fields only", () => {
  it("keeps only multipleAttachments + attachment typed fields; value = field NAME", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(SCHEMA);
    const result = await airtableAttachmentFieldsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "Cover", label: "Cover", description: "Attachment field" },
      { value: "Docs", label: "Docs", description: "Attachment field" },
    ]);
    expect(result.hasMore).toBe(false);
    // Non-attachment fields are excluded.
    expect(result.items.map((i) => i.value)).not.toContain("Name");
    expect(result.items.map((i) => i.value)).not.toContain("Done");
  });

  it("returns empty items when the table has no attachment fields", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      tables: [
        {
          id: "tbl1",
          name: "T",
          primaryFieldId: "f1",
          fields: [{ id: "f1", name: "Name", type: "singleLineText" }],
        },
      ],
    });
    const result = await airtableAttachmentFieldsResolver.resolve(ctx());
    expect(result).toEqual({ items: [], hasMore: false });
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(SCHEMA);
    const result = await airtableAttachmentFieldsResolver.resolve(
      ctx({ q: "cover" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["Cover"]);
  });
});

describe("airtableAttachmentFieldsResolver — dependency + fallback + errors", () => {
  it("throws MISSING_DEPENDENCY when a parent dep is absent, no API call", async () => {
    await expect(
      airtableAttachmentFieldsResolver.resolve(
        ctx({ deps: { tableIdOrName: "tbl1" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items when base gone (NotFoundError) or table missing", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("base appGHOST", "no base"),
    );
    expect(
      await airtableAttachmentFieldsResolver.resolve(
        ctx({ deps: { baseId: "appGHOST", tableIdOrName: "tbl1" } }),
      ),
    ).toEqual({ items: [], hasMore: false });

    mockRefreshAndRetry.mockResolvedValueOnce(SCHEMA);
    expect(
      await airtableAttachmentFieldsResolver.resolve(
        ctx({ deps: { baseId: "appBASE", tableIdOrName: "tblMYSTERY" } }),
      ),
    ).toEqual({ items: [], hasMore: false });
  });

  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      airtableAttachmentFieldsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("maps auth → INTEGRATION_DISCONNECTED and other → PROVIDER_ERROR (no leak)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      airtableAttachmentFieldsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('schema GET failed: {"raw":"att-secret-leak"} Bearer xyz'),
    );
    try {
      await airtableAttachmentFieldsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      expect((err as Error).message).not.toContain("att-secret-leak");
      expect((err as Error).message).not.toContain("Bearer");
    }
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former bases.test.ts
// Tests for `integrations/airtable/options/bases.ts` — Slice
// 4.AIRTABLE-META-2. Account-scoped root picker (no deps); value = base
// id; backed by the new `basesList` helper.
// ---------------------------------------------------------------------------
describe("bases (options)", () => {

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
  scopes: ["data.records:read", "schema.bases:read"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-22T00:00:00Z",
  updatedAt: "2026-05-22T00:00:00Z",
};

function ctx(
  overrides: Partial<OptionsResolverContext> = {},
): OptionsResolverContext {
  return { userId: "user-1", integration, q: "", deps: {}, ...overrides };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("airtableBasesResolver — shape", () => {
  it("is an account-scoped root picker (no requiredDeps) requiring an integration", () => {
    expect(airtableBasesResolver.source).toBe("airtable:bases");
    expect(airtableBasesResolver.provider).toBe("airtable");
    expect(airtableBasesResolver.requiresIntegration).toBe(true);
    expect(airtableBasesResolver.requiredDeps).toBeUndefined();
  });
});

describe("airtableBasesResolver — wrapper invocation", () => {
  it("calls basesList (GET /v0/meta/bases) via refreshAndRetry pinned to providerAccountId", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ bases: [] }), { status: 200 }),
      );
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );

    await airtableBasesResolver.resolve(ctx());

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://api.airtable.com/v0/meta/bases",
    );
    fetchSpy.mockRestore();

    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.provider).toBe("airtable");
    expect(args.providerAccountId).toBe("usrAIRTABLEUSER");
  });
});

describe("airtableBasesResolver — mapping + ordering", () => {
  it("maps base id → value, name → label, permissionLevel → description; sorted by label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      bases: [
        { id: "appB", name: "Zebra", permissionLevel: "edit" },
        { id: "appA", name: "Apple", permissionLevel: "create" },
      ],
    });
    const result = await airtableBasesResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "appA", label: "Apple", description: "create" },
      { value: "appB", label: "Zebra", description: "edit" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("falls back label → id when name is empty; omits description when permissionLevel absent", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      bases: [{ id: "appX", name: "" }],
    });
    const result = await airtableBasesResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "appX", label: "appX" }]);
  });

  it("drops bases with empty/missing id", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      bases: [
        { id: "", name: "Ghost" },
        { id: "appReal", name: "Real" },
      ],
    });
    const result = await airtableBasesResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual(["appReal"]);
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      bases: [
        { id: "app1", name: "Sales CRM" },
        { id: "app2", name: "Marketing" },
        { id: "app3", name: "Support crm" },
      ],
    });
    const result = await airtableBasesResolver.resolve(ctx({ q: "CRM" }));
    expect(result.items.map((i) => i.value).sort()).toEqual(["app1", "app3"]);
  });

  it("advertises hasMore=true when Airtable returns a pagination offset", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      bases: [{ id: "app1", name: "One" }],
      offset: "next-cursor",
    });
    const result = await airtableBasesResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });
});

describe("airtableBasesResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      airtableBasesResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("maps IntegrationActionRequiredError + Unauthorized401Error → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "airtable",
        providerAccountId: "usrAIRTABLEUSER",
        reason: "refresh_failed",
      }),
    );
    await expect(airtableBasesResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(airtableBasesResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw body or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('bases GET failed: {"raw":"base-secret-leak"} Bearer xyz'),
    );
    try {
      await airtableBasesResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("base-secret-leak");
      expect(msg).not.toContain("Bearer");
    }
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former fields.test.ts
// Tests for `integrations/airtable/options/fields.ts` — Slice
// 4.AIRTABLE-META-2. Multi-parent (baseId + tableIdOrName); value =
// field NAME (runtime keys the fields map / list_records.fields /
// formulas by name).
// ---------------------------------------------------------------------------
describe("fields (options)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former tables.test.ts
// Tests for `integrations/airtable/options/tables.ts` — Slice
// 4.AIRTABLE-META-2. Depends on `baseId`; value = table id (trigger
// recordChangeScope needs an id; actions accept id|name).
// ---------------------------------------------------------------------------
describe("tables (options)", () => {

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
      ],
    },
    {
      id: "tbl2",
      name: "Users",
      primaryFieldId: "fld3",
      fields: [{ id: "fld3", name: "Email", type: "email" }],
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
    deps: { baseId: "appBASE" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("airtableTablesResolver — shape", () => {
  it("declares requiredDeps=['baseId'] (schema-verbatim) and requires an integration", () => {
    expect(airtableTablesResolver.source).toBe("airtable:tables");
    expect(airtableTablesResolver.provider).toBe("airtable");
    expect(airtableTablesResolver.requiresIntegration).toBe(true);
    expect(airtableTablesResolver.requiredDeps).toEqual(["baseId"]);
  });
});

describe("airtableTablesResolver — wrapper invocation", () => {
  it("calls basesGetSchema with the baseId via refreshAndRetry pinned to providerAccountId", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ tables: [] }), { status: 200 }),
      );
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );

    await airtableTablesResolver.resolve(ctx());

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://api.airtable.com/v0/meta/bases/appBASE/tables",
    );
    fetchSpy.mockRestore();

    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.provider).toBe("airtable");
    expect(args.providerAccountId).toBe("usrAIRTABLEUSER");
  });
});

describe("airtableTablesResolver — mapping (value = table ID)", () => {
  it("maps table id → value (NOT name), name → label, field count → description; preserves schema order", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(SCHEMA);
    const result = await airtableTablesResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "tbl1", label: "Tasks", description: "2 fields" },
      { value: "tbl2", label: "Users", description: "1 field" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("value is the table id so the trigger recordChangeScope + id-or-name actions both work", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(SCHEMA);
    const result = await airtableTablesResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual(["tbl1", "tbl2"]);
    // Explicitly NOT the names.
    expect(result.items.map((i) => i.value)).not.toContain("Tasks");
  });

  it("drops tables with empty/missing id", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      tables: [
        { id: "", name: "Ghost", fields: [] },
        { id: "tblReal", name: "Real", fields: [] },
      ],
    });
    const result = await airtableTablesResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual(["tblReal"]);
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(SCHEMA);
    const result = await airtableTablesResolver.resolve(ctx({ q: "user" }));
    expect(result.items.map((i) => i.value)).toEqual(["tbl2"]);
  });
});

describe("airtableTablesResolver — dependency + cascade fallback", () => {
  it("throws MISSING_DEPENDENCY when baseId is empty, no API call", async () => {
    await expect(
      airtableTablesResolver.resolve(ctx({ deps: { baseId: "" } })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws MISSING_DEPENDENCY when baseId is missing, no API call", async () => {
    await expect(
      airtableTablesResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT throw) when parent base is gone (NotFoundError)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("base appGHOST", "no base"),
    );
    const result = await airtableTablesResolver.resolve(
      ctx({ deps: { baseId: "appGHOST" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("airtableTablesResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      airtableTablesResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("maps auth errors → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "airtable",
        providerAccountId: "usrAIRTABLEUSER",
        reason: "refresh_failed",
      }),
    );
    await expect(airtableTablesResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(airtableTablesResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw body or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('schema GET failed: {"raw":"tbl-secret-leak"} Bearer xyz'),
    );
    try {
      await airtableTablesResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("tbl-secret-leak");
      expect(msg).not.toContain("Bearer");
    }
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former views.test.ts
// Tests for `integrations/airtable/options/views.ts` — Slice
// 4.AIRTABLE-META-2. Multi-parent (baseId + tableIdOrName); value = view
// NAME; requires includeViews:true so views survive the schema fetch.
// ---------------------------------------------------------------------------
describe("views (options)", () => {

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

});
