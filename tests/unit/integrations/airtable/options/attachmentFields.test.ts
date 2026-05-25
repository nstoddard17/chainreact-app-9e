/**
 * @jest-environment node
 *
 * Tests for `integrations/airtable/options/attachmentFields.ts` — Slice
 * 4.AIRTABLE-META-2. Multi-parent (baseId + tableIdOrName); value =
 * field NAME; filters to attachment-type fields only. Backs
 * `add_attachment.fieldName`.
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
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
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
