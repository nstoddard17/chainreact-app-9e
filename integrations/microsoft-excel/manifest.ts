import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";

/**
 * Microsoft Excel provider manifest.
 *
 * Fourth Microsoft consumer of `_shared/microsoft/` after Outlook Mail
 * (slice 6), Outlook Calendar (slice 7), and OneDrive (slice 8). Reuses
 * the same Azure AD app (`MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET`)
 * — Slice 15 deliberately does NOT introduce V1's `EXCEL_CLIENT_ID/SECRET`
 * separate-app rot. See `docs/slices/slice-15-microsoft-excel.md`
 * §"V1 rot to fix during port".
 *
 * Capability flags follow the honest-state convention — they flip true
 * only when handlers/triggers actually register. Slice 15 Commit 2
 * (manifest + OAuth + dispatcher registration) flips `oauth` only.
 * Commit 3 flips `actions` (6 handlers). Commit 4 flips `pollingTrigger`
 * (new_row + new_table_row). Webhook triggers stay false — Excel polls.
 *
 * Scopes — exactly two:
 *   - `offline_access` — required for the Microsoft v2 endpoint to
 *     issue a refresh_token. Without it tokens last 60-90 minutes and
 *     the integration goes cold.
 *   - `Files.ReadWrite` — covers `/me/drive/items/{workbookId}/workbook/...`
 *     for both reads (usedRange, tables, worksheets) and writes (range
 *     patch, row appends, worksheet creation). Hierarchical: includes
 *     `Files.Read`. Slice 15 deliberately uses the narrower
 *     `Files.ReadWrite` instead of V1's `Files.ReadWrite.All` —
 *     SharePoint and shared-with-me workbooks are deferred to a
 *     follow-up. Workbooks-in-user's-own-OneDrive is the common case.
 *
 * Mail-specific scopes (`Mail.Send`, `Mail.Read`) and Calendar-specific
 * (`Calendars.ReadWrite`) are NOT here — each Microsoft provider
 * declares only what its own actions/triggers need.
 *
 * tokenScope: "user" matches every Microsoft sibling. One Excel
 * integration per (user, email).
 *
 * accountIdField: "email" — resolved from Graph `/me` (`mail` field
 * with `userPrincipalName` fallback for consumer accounts). Same as
 * OneDrive / Outlook Mail / Outlook Calendar.
 *
 * Health-check interval: 6h matches every Microsoft + Google provider
 * (CLAUDE.md "Google/Microsoft: 6h").
 *
 * apiVersion: "v1.0" pins the Graph API version.
 *
 * refreshable: true — Microsoft's v2 OAuth issues refresh tokens when
 * `offline_access` is granted. Preserve-old policy on rotation (shared
 * via `_shared/microsoft/oauth.ts`).
 */
export const microsoftExcelManifest: ProviderManifest =
  ProviderManifestSchema.parse({
    id: "microsoft-excel",
    displayName: "Microsoft Excel",
    isEnabled: true,
    apiVersion: "v1.0",
    tokenScope: "user",
    oauthFlows: ["v2"],
    accountIdField: "email",
    scopes: {
      required: ["offline_access", "Files.ReadWrite"],
      optional: [],
      deprecated: [],
    },
    capabilities: {
      oauth: true,
      webhookTrigger: false,
      // True: 5 polling triggers (new_row + new_table_row +
      // new_worksheet + updated_row + updated_table_row) registered
      // in integrations/microsoft-excel/triggers/{newRow,newTableRow,
      // newWorksheet,updatedRow,updatedTableRow}. Single shared
      // PollingHandler covers all five event types via canHandle
      // predicate. Snapshot baseline seeded at activation time
      // (closes V1's first-poll-miss bug).
      pollingTrigger: true,
      // True: 6 action handlers (add_row, add_table_row,
      // create_worksheet, export_sheet, get_workbooks, get_worksheets)
      // are registered in services/execution/handlers/_registry.ts.
      actions: true,
    },
    healthCheckIntervalMs: 6 * 60 * 60 * 1000,
    refreshable: true,
  });
