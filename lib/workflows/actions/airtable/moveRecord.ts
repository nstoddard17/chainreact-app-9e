import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'

/**
 * Moves a record from one table to another in Airtable
 * This is implemented by copying the record to the destination table and then deleting it from the source table
 */
export async function moveAirtableRecord(
  config: any, 
  userId: string, 
  input: Record<string, any>
): Promise<ActionResult> {
  try {

    
    const accessToken = await getDecryptedAccessToken(userId, "airtable")

    const baseId = resolveValue(config.baseId, input)
    const sourceTableName = resolveValue(config.sourceTableName, input)
    const recordId = resolveValue(config.recordId, input)
    const destinationTableName = resolveValue(config.destinationTableName, input)
    const preserveRecordId = config.preserveRecordId || false


    if (!baseId || !sourceTableName || !recordId || !destinationTableName) {
      const missingFields = []
      if (!baseId) missingFields.push("Base ID")
      if (!sourceTableName) missingFields.push("Source Table Name")
      if (!recordId) missingFields.push("Record ID")
      if (!destinationTableName) missingFields.push("Destination Table Name")
      
      const message = `Missing required fields for moving record: ${missingFields.join(", ")}`
      console.error(message)
      return { success: false, message }
    }

    // Step 1: Get the record from the source table
    const getRecordResponse = await fetch(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(sourceTableName)}/${recordId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    )

    if (!getRecordResponse.ok) {
      const errorData = await getRecordResponse.json().catch(() => ({}))
      throw new Error(`Failed to get record from source table: ${getRecordResponse.status} - ${errorData.error?.message || getRecordResponse.statusText}`)
    }

    const sourceRecord = await getRecordResponse.json()

    // Step 2: Create the record in the destination table
    const createRecordData = {
      fields: sourceRecord.fields
    }

    // If preserveRecordId is true, we need to use a different approach
    // Airtable doesn't allow setting custom record IDs directly, so we'll use the record ID as a field
    if (preserveRecordId) {
      createRecordData.fields = {
        ...sourceRecord.fields,
        // Add the original record ID as a field for reference
        originalRecordId: recordId
      }
    }

    const createRecordResponse = await fetch(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(destinationTableName)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(createRecordData),
      }
    )

    if (!createRecordResponse.ok) {
      const errorData = await createRecordResponse.json().catch(() => ({}))
      throw new Error(`Failed to create record in destination table: ${createRecordResponse.status} - ${errorData.error?.message || createRecordResponse.statusText}`)
    }

    const createdRecord = await createRecordResponse.json()

    // Step 3: Delete the record from the source table
    const deleteRecordResponse = await fetch(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(sourceTableName)}/${recordId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    )

    if (!deleteRecordResponse.ok) {
      const errorData = await deleteRecordResponse.json().catch(() => ({}))
      throw new Error(`Failed to delete record from source table: ${deleteRecordResponse.status} - ${errorData.error?.message || deleteRecordResponse.statusText}`)
    }

    const deleteResult = await deleteRecordResponse.json()

    return {
      success: true,
      output: {
        originalRecordId: recordId,
        newRecordId: createdRecord.id,
        sourceTable: sourceTableName,
        destinationTable: destinationTableName,
        movedAt: new Date().toISOString(),
        preservedRecordId: preserveRecordId,
        fieldsMoved: Object.keys(sourceRecord.fields).length
      },
      message: `Successfully moved record from ${sourceTableName} to ${destinationTableName}`
    }

  } catch (error: any) {
    console.error("Airtable move record error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while moving the record"
    }
  }
} 