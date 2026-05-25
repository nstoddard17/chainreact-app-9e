import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Microsoft Excel discovery sub-registry — Slice 4.EXCEL-META-3.
 *
 * Per-provider extraction of the Excel meta imports so the central
 * `services/discovery/_registry.ts` stays under the 400-line lint cap
 * (same pattern as `providers/mailchimp.ts` / `providers/shopify.ts`).
 * The central registry spreads `MICROSOFT_EXCEL_ACTION_METAS` /
 * `MICROSOFT_EXCEL_TRIGGER_METAS`; module-load validation + duplicate-key
 * rejection happen centrally — this file is import grouping only.
 *
 * **Coverage:** 10 actions + 5 polling triggers. Field names are camelCase
 * to mirror the Excel runtime Zod schemas 1:1 (drift fails the
 * meta-coverage structural test once `microsoft-excel` is in
 * `COVERED_PROVIDERS`). `workbookId` fields use the `microsoft-excel:workbooks`
 * resolver; `worksheetName` / `tableName` use `microsoft-excel:worksheets`
 * / `:tables` (dependsOn `workbookId`) — all three shipped in EXCEL-META-2.
 * The `columns` resolver is deferred; column-header fields stay typed.
 *
 * All 5 triggers register their activation hook via
 * `registerActivation("microsoft-excel", <type>, ...)` in their
 * `triggers/<event>/index.ts`, satisfying the
 * trigger-meta-activation-invariant test without an exemption.
 */

import { microsoftExcelAddRowMeta } from "@/integrations/microsoft-excel/actions/addRow.meta";
import { microsoftExcelUpdateRowMeta } from "@/integrations/microsoft-excel/actions/updateRow.meta";
import { microsoftExcelDeleteRowMeta } from "@/integrations/microsoft-excel/actions/deleteRow.meta";
import { microsoftExcelExportSheetMeta } from "@/integrations/microsoft-excel/actions/exportSheet.meta";
import { microsoftExcelAddTableRowMeta } from "@/integrations/microsoft-excel/actions/addTableRow.meta";
import { microsoftExcelCreateWorksheetMeta } from "@/integrations/microsoft-excel/actions/createWorksheet.meta";
import { microsoftExcelRenameWorksheetMeta } from "@/integrations/microsoft-excel/actions/renameWorksheet.meta";
import { microsoftExcelDeleteWorksheetMeta } from "@/integrations/microsoft-excel/actions/deleteWorksheet.meta";
import { microsoftExcelGetWorkbooksMeta } from "@/integrations/microsoft-excel/actions/getWorkbooks.meta";
import { microsoftExcelGetWorksheetsMeta } from "@/integrations/microsoft-excel/actions/getWorksheets.meta";

import { microsoftExcelNewRowTriggerMeta } from "@/integrations/microsoft-excel/triggers/newRow/newRow.meta";
import { microsoftExcelUpdatedRowTriggerMeta } from "@/integrations/microsoft-excel/triggers/updatedRow/updatedRow.meta";
import { microsoftExcelNewTableRowTriggerMeta } from "@/integrations/microsoft-excel/triggers/newTableRow/newTableRow.meta";
import { microsoftExcelUpdatedTableRowTriggerMeta } from "@/integrations/microsoft-excel/triggers/updatedTableRow/updatedTableRow.meta";
import { microsoftExcelNewWorksheetTriggerMeta } from "@/integrations/microsoft-excel/triggers/newWorksheet/newWorksheet.meta";

/** Excel action metas in displayOrder (10..100). */
export const MICROSOFT_EXCEL_ACTION_METAS: ReadonlyArray<ActionMeta> = [
  microsoftExcelAddRowMeta,
  microsoftExcelUpdateRowMeta,
  microsoftExcelDeleteRowMeta,
  microsoftExcelExportSheetMeta,
  microsoftExcelAddTableRowMeta,
  microsoftExcelCreateWorksheetMeta,
  microsoftExcelRenameWorksheetMeta,
  microsoftExcelDeleteWorksheetMeta,
  microsoftExcelGetWorkbooksMeta,
  microsoftExcelGetWorksheetsMeta,
];

/** Excel trigger metas in displayOrder (10..50) — all polling. */
export const MICROSOFT_EXCEL_TRIGGER_METAS: ReadonlyArray<TriggerMeta> = [
  microsoftExcelNewRowTriggerMeta,
  microsoftExcelUpdatedRowTriggerMeta,
  microsoftExcelNewTableRowTriggerMeta,
  microsoftExcelUpdatedTableRowTriggerMeta,
  microsoftExcelNewWorksheetTriggerMeta,
];
