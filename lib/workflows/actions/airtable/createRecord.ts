import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'

/**
 * Creates a new record in an Airtable table
 */
export async function createAirtableRecord(
  config: any, 
  userId: string, 
  input: Record<string, any>
): Promise<ActionResult> {
  try {

    
    const accessToken = await getDecryptedAccessToken(userId, "airtable")

    const baseId = resolveValue(config.baseId, input)
    const tableName = resolveValue(config.tableName, input)
    const fields = config.fields || {}

    console.log("Resolved create record values:", { 
      baseId, 
      tableName, 
      fields: Object.keys(fields)
    })

    if (!baseId || !tableName) {
      const missingFields = []
      if (!baseId) missingFields.push("Base ID")
      if (!tableName) missingFields.push("Table Name")
      
      const message = `Missing required fields for creating record: ${missingFields.join(", ")}`
      console.error(message)
      return { success: false, message }
    }

    // Resolve field values using template variables
    const resolvedFields: Record<string, any> = {}
    for (const [fieldName, fieldValue] of Object.entries(fields)) {
      if (fieldValue !== undefined && fieldValue !== null && fieldValue !== '') {
        resolvedFields[fieldName] = resolveValue(fieldValue, input)
      }
    }

    console.log("Resolved field values:", resolvedFields)

    // Create the record in Airtable
    const response = await fetch(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: resolvedFields,
        }),
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to create record: ${response.status} - ${errorData.error?.message || response.statusText}`)
    }

    const result = await response.json()


    return {
      success: true,
      output: {
        recordId: result.id,
        fields: result.fields,
        createdTime: result.createdTime,
        tableName: tableName,
        baseId: baseId
      },
      message: `Successfully created record in ${tableName}`
    }

  } catch (error: any) {
    console.error("Airtable create record error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while creating the record"
    }
  }
} 