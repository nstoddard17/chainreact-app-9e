/**
 * @jest-environment node
 *
 * Tests for the Microsoft Excel provider manifest. Validation against
 * ProviderManifestSchema happens at module load (it would throw on
 * import if malformed); these tests assert the specific manifest values
 * that downstream code depends on.
 */
import { microsoftExcelManifest } from "@/integrations/microsoft-excel/manifest";
import { getProvider, providerSupports } from "@/integrations/_registry";
import { listRegisteredHandlers } from "@/services/execution/handlers/_registry";

describe("microsoft-excel manifest", () => {
  it("is registered in the provider registry under id 'microsoft-excel'", () => {
    expect(getProvider("microsoft-excel")).toBe(microsoftExcelManifest);
  });

  it("declares Excel scopes — offline_access + Files.ReadWrite", () => {
    // Slice 15 confirmed scope decision #3: same scope set as OneDrive.
    // Files.ReadWrite covers /me/drive/items/{workbookId}/workbook/...
    // for both reads (usedRange, tables, worksheets) and writes (range
    // patch, table row appends, worksheet creation). Hierarchical:
    // includes Files.Read.
    expect(microsoftExcelManifest.scopes.required).toEqual([
      "offline_access",
      "Files.ReadWrite",
    ]);
    expect(microsoftExcelManifest.scopes.optional).toEqual([]);
    expect(microsoftExcelManifest.scopes.deprecated).toEqual([]);
  });

  it("does NOT include Files.ReadWrite.All — Slice 15 stays scoped to personal drive", () => {
    // Explicit anti-test. V1 used the broader .All scope; Slice 15
    // narrows to personal-drive only. Shared / SharePoint workbooks
    // are deferred to a follow-up — V1 rot per slice 15 doc.
    expect(microsoftExcelManifest.scopes.required).not.toContain(
      "Files.ReadWrite.All",
    );
    expect(microsoftExcelManifest.scopes.required).not.toContain(
      "Files.Read.All",
    );
    expect(microsoftExcelManifest.scopes.required).not.toContain(
      "Sites.ReadWrite.All",
    );
  });

  it("does NOT include Mail or Calendars scopes — those belong to sibling Microsoft providers", () => {
    for (const wrongScope of [
      "Mail.Send",
      "Mail.Read",
      "Mail.ReadWrite",
      "Calendars.Read",
      "Calendars.ReadWrite",
    ]) {
      expect(microsoftExcelManifest.scopes.required).not.toContain(wrongScope);
    }
  });

  it("is refreshable: true (Microsoft v2 + offline_access issues refresh tokens)", () => {
    expect(microsoftExcelManifest.refreshable).toBe(true);
  });

  it("uses tokenScope: user with accountIdField: email (matches sibling Microsoft providers)", () => {
    expect(microsoftExcelManifest.tokenScope).toBe("user");
    expect(microsoftExcelManifest.accountIdField).toBe("email");
  });

  it("declares honest capabilities for Slice 15 Commit 4 (oauth + actions + pollingTrigger)", () => {
    // Slice 15 Commit 2 landed manifest + OAuth + dispatcher (oauth only).
    // Commit 3 landed 6 actions + flipped actions: true. Commit 4 (this)
    // lands 2 polling triggers + flips pollingTrigger: true.
    // Honest-state convention.
    expect(microsoftExcelManifest.capabilities).toEqual({
      oauth: true,
      webhookTrigger: false,
      pollingTrigger: true,
      actions: true,
    });
    expect(providerSupports("microsoft-excel", "oauth")).toBe(true);
    expect(providerSupports("microsoft-excel", "actions")).toBe(true);
    expect(providerSupports("microsoft-excel", "webhookTrigger")).toBe(false);
    expect(providerSupports("microsoft-excel", "pollingTrigger")).toBe(true);
  });

  it("when actions: true, the action-handler registry contains all 10 Excel actions (slice 15 + Microsoft Excel parity Commits 1+2)", () => {
    if (microsoftExcelManifest.capabilities.actions) {
      const registered = listRegisteredHandlers().filter(
        (h) => h.provider === "microsoft-excel",
      );
      expect(registered.map((r) => r.type).sort()).toEqual([
        "add_row",
        "add_table_row",
        "create_worksheet",
        "delete_row",
        "delete_worksheet",
        "export_sheet",
        "get_workbooks",
        "get_worksheets",
        "rename_worksheet",
        "update_row",
      ]);
    }
  });

  it("uses 6h health-check interval matching Microsoft cadence (CLAUDE.md)", () => {
    expect(microsoftExcelManifest.healthCheckIntervalMs).toBe(
      6 * 60 * 60 * 1000,
    );
  });

  it("declares apiVersion v1.0 (Graph API stable, same as sibling providers)", () => {
    expect(microsoftExcelManifest.apiVersion).toBe("v1.0");
  });

  it("declares oauthFlows: ['v2'] (Microsoft identity platform v2.0)", () => {
    expect(microsoftExcelManifest.oauthFlows).toEqual(["v2"]);
  });

  it("isEnabled: true (no experimental flag)", () => {
    expect(microsoftExcelManifest.isEnabled).toBe(true);
    expect(microsoftExcelManifest.isExperimental).toBe(false);
  });

  it("uses a distinct provider id from sibling Microsoft providers", () => {
    expect(microsoftExcelManifest.id).toBe("microsoft-excel");
    expect(getProvider("microsoft-outlook")).not.toBe(microsoftExcelManifest);
    expect(getProvider("microsoft-outlook-calendar")).not.toBe(
      microsoftExcelManifest,
    );
    expect(getProvider("microsoft-onedrive")).not.toBe(microsoftExcelManifest);
  });
});
