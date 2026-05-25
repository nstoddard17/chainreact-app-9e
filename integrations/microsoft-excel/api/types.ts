/**
 * Microsoft Graph Excel workbook resource types.
 *
 * Only the fields V2 wrappers + handlers actually consume — kept narrow
 * on purpose. Graph returns many more, but pinning a small surface
 * keeps the contract obvious and tests cheap.
 *
 * Endpoint family: `/v1.0/me/drive/items/{workbookId}/workbook/...`.
 * The workbook is itself a DriveItem; we use its id to address ranges,
 * worksheets, and tables under that workbook.
 *
 * Slice 15: shapes mirror V1's inline use in
 * `lib/workflows/actions/microsoft-excel/*.ts` and
 * `lib/triggers/pollers/microsoft-excel.ts`.
 */

/**
 * Worksheet metadata. Graph `Worksheet` resource.
 *
 * `position` is 0-based and orders worksheets within a workbook.
 * `visibility` is `Visible | Hidden | VeryHidden`.
 */
export interface ExcelWorksheet {
  id: string;
  name: string;
  position?: number;
  visibility?: string;
}

/**
 * Range resource. Returned by `/worksheets/{name}/usedRange` and
 * `/worksheets/{name}/range(address='...')`.
 *
 * `values` is the 2D array of cell values; outer = rows, inner = columns.
 * Graph returns `null` for empty cells (NOT empty string), so handlers
 * preserve that distinction.
 */
export interface ExcelRange {
  /**
   * A1-style address relative to the worksheet, e.g. `"Sheet1!A1:D10"`.
   * Graph emits the full sheet-qualified form here.
   */
  address: string;
  /** Row count of the range. */
  rowCount: number;
  /** Column count of the range. */
  columnCount: number;
  /**
   * 2D values array. Empty cells are `null`. Non-empty cells are
   * coerced into JS scalars by Graph (string / number / boolean).
   */
  values: ReadonlyArray<ReadonlyArray<unknown>>;
  /**
   * 2D formula array — parallel to `values`. Empty cells are `""`.
   * Optional because some endpoints omit it.
   */
  formulas?: ReadonlyArray<ReadonlyArray<unknown>>;
  /** Optional 2D number-format array. */
  numberFormat?: ReadonlyArray<ReadonlyArray<unknown>>;
}

/**
 * Table resource. Returned by `/tables/{name}`.
 *
 * Stable row ids (unlike worksheets, which are position-keyed) make
 * tables the safer surface for change-tracking triggers.
 */
export interface ExcelTable {
  id: string;
  name: string;
  /** When true, the first row contains column headers. */
  showHeaders?: boolean;
  /** When true, the table has a totals row. */
  showTotals?: boolean;
  style?: string;
}

/**
 * Table-column resource. Returned by `/tables/{name}/columns`.
 */
export interface ExcelTableColumn {
  id: string;
  name: string;
  index: number;
}

/**
 * Table row resource. Returned by `/tables/{name}/rows`.
 *
 * Stable across mid-table insertions — that's the property that makes
 * tables suitable for the `new_table_row` polling trigger.
 */
export interface ExcelTableRow {
  /** Graph-issued stable row id. */
  index: number;
  /** Single row's cell values; outer array always length 1. */
  values: ReadonlyArray<ReadonlyArray<unknown>>;
}
