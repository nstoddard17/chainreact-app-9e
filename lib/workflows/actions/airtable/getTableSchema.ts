import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Gets the schema for a specific Airtable table
 */
export async function getAirtableTableSchema(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "airtable")

    const baseId = resolveValue(config.baseId, input)
    const tableName = resolveValue(config.tableName, input)
    const includeViews = resolveValue(config.includeViews, input) ?? true

    if (!baseId || !tableName) {
      const missingFields = []
      if (!baseId) missingFields.push("Base ID")
      if (!tableName) missingFields.push("Table Name")

      const message = `Missing required fields for getting table schema: ${missingFields.join(", ")}`
      logger.error(message)
      return { success: false, message }
    }

    // Fetch the base schema from Airtable
    const url = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to get table schema: ${response.status} - ${errorData.error?.message || response.statusText}`)
    }

    const result = await response.json()

    // Find the specific table by name
    const table = result.tables?.find((t: any) => t.name === tableName)

    if (!table) {
      return {
        success: false,
        message: `Table "${tableName}" not found in base`
      }
    }

    // Build output based on includeViews setting
    const output: any = {
      tableId: table.id,
      tableName: table.name,
      primaryFieldId: table.primaryFieldId,
      fields: table.fields || [],
      recordCount: 0 // Airtable API doesn't provide this in schema endpoint
    }

    if (includeViews) {
      output.views = table.views || []
    }

    return {
      success: true,
      output,
      message: `Successfully retrieved schema for table "${tableName}"`
    }

  } catch (error: any) {
    logger.error("Airtable get table schema error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while getting table schema"
    }
  }
}
