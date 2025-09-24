/**
 * Normalize Airtable table names for comparison.
 * @param {string | null | undefined} name
 * @returns {string}
 */
export function normalizeTableName(name) {
  return (name || '').trim().toLowerCase()
}

/**
 * Determine whether the incoming table matches the trigger configuration.
 * @param {string} tableId
 * @param {Record<string, any>} tableData
 * @param {Record<string, any>} triggerConfig
 * @param {Record<string, any> | null | undefined} [webhookMetadata]
 * @returns {boolean}
 */
export function matchesAirtableTable(tableId, tableData, triggerConfig, webhookMetadata) {
  const configuredId = triggerConfig?.tableId || webhookMetadata?.tableId || webhookMetadata?.table_id
  const configuredNameRaw = triggerConfig?.tableName || webhookMetadata?.tableName || webhookMetadata?.table_name
  const configuredName = normalizeTableName(configuredNameRaw)

  if (configuredId) {
    if (tableId === configuredId) {
      return true
    }

    // If an explicit tableId is configured and it doesn't match, treat as non-match
    if (!configuredName) {
      return false
    }
  }

  if (configuredName) {
    const tableDataName = normalizeTableName(tableData?.name || tableData?.label || tableData?.displayName)
    if (tableDataName && tableDataName === configuredName) {
      return true
    }
    if (!tableDataName && configuredId) {
      return tableId === configuredId
    }
    return false
  }

  // No table filter configured -> match all tables
  return true
}
