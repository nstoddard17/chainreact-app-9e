import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'

/**
 * Lists records from an Airtable table
 */
export async function listAirtableRecords(
  config: any, 
  userId: string, 
  input: Record<string, any>
): Promise<ActionResult> {
  try {

    
    const accessToken = await getDecryptedAccessToken(userId, "airtable")

    const baseId = resolveValue(config.baseId, input)
    const tableName = resolveValue(config.tableName, input)
    const maxRecords = resolveValue(config.maxRecords, input) || 100
    const filterByFormula = resolveValue(config.filterByFormula, input)

    console.log("Resolved list records values:", { 
      baseId, 
      tableName, 
      maxRecords,
      filterByFormula
    })

    if (!baseId || !tableName) {
      const missingFields = []
      if (!baseId) missingFields.push("Base ID")
      if (!tableName) missingFields.push("Table Name")
      
      const message = `Missing required fields for listing records: ${missingFields.join(", ")}`
      console.error(message)
      return { success: false, message }
    }

    // Build the URL with query parameters
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`)
    url.searchParams.append('maxRecords', maxRecords.toString())
    
    if (filterByFormula) {
      url.searchParams.append('filterByFormula', filterByFormula)
    }

    console.log("Fetching records from URL:", url.toString())

    // Fetch the records from Airtable
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to list records: ${response.status} - ${errorData.error?.message || response.statusText}`)
    }

    const result = await response.json()


    return {
      success: true,
      output: {
        records: result.records || [],
        count: result.records?.length || 0,
        offset: result.offset,
        tableName: tableName,
        baseId: baseId,
        maxRecords: maxRecords,
        filterByFormula: filterByFormula,
      },
      message: `Successfully listed ${result.records?.length || 0} records from ${tableName}`
    }

  } catch (error: any) {
    console.error("Airtable list records error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while listing records"
    }
  }
} 