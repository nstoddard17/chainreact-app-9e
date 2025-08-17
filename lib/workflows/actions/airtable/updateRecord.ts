import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'

/**
 * Updates an existing record in an Airtable table
 */
export async function updateAirtableRecord(
  config: any, 
  userId: string, 
  input: Record<string, any>
): Promise<ActionResult> {
  try {

    
    const accessToken = await getDecryptedAccessToken(userId, "airtable")

    const baseId = resolveValue(config.baseId, input)
    const tableName = resolveValue(config.tableName, input)
    const recordId = resolveValue(config.recordId, input)
    const status = resolveValue(config.status, input)
    const fields = config.fields || {}

    console.log("Resolved update record values:", { 
      baseId, 
      tableName, 
      recordId,
      status,
      fields: Object.keys(fields)
    })

    if (!baseId || !tableName || !recordId) {
      const missingFields = []
      if (!baseId) missingFields.push("Base ID")
      if (!tableName) missingFields.push("Table Name")
      if (!recordId) missingFields.push("Record ID")
      
      const message = `Missing required fields for updating record: ${missingFields.join(", ")}`
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
    
    // Add status field if provided
    if (status) {
      resolvedFields.Status = status
    }

    console.log("Resolved field values:", resolvedFields)

    // Update the record in Airtable
    const response = await fetch(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${recordId}`,
      {
        method: "PATCH",
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
      throw new Error(`Failed to update record: ${response.status} - ${errorData.error?.message || response.statusText}`)
    }

    const result = await response.json()


    return {
      success: true,
      output: {
        recordId: result.id,
        fields: result.fields,
        updatedTime: new Date().toISOString(),
        tableName: tableName,
        baseId: baseId,
        status: status,
      },
      message: `Successfully updated record in ${tableName}`
    }

  } catch (error: any) {
    console.error("Airtable update record error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while updating the record"
    }
  }
} 