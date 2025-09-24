export function normalizeTableName(name?: string | null): string

export function matchesAirtableTable(
  tableId: string,
  tableData: Record<string, any>,
  triggerConfig: Record<string, any>,
  webhookMetadata?: Record<string, any> | null
): boolean
