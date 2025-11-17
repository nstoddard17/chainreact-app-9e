import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Deletes one or multiple records from an Airtable table
 */
export async function deleteAirtableRecord(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "airtable")

    const baseId = resolveValue(config.baseId, input)
    const tableName = resolveValue(config.tableName, input)
    const deleteMode = resolveValue(config.deleteMode, input) || 'single_record'

    if (!baseId || !tableName) {
      const missingFields = []
      if (!baseId) missingFields.push("Base ID")
      if (!tableName) missingFields.push("Table Name")

      const message = `Missing required fields for deleting record: ${missingFields.join(", ")}`
      logger.error(message)
      return { success: false, message }
    }

    // Single record deletion by ID
    if (deleteMode === 'single_record') {
      const recordId = resolveValue(config.recordId, input)

      if (!recordId) {
        return { success: false, message: "Record ID is required for single record deletion" }
      }

      logger.debug('[deleteAirtableRecord] Deleting single record:', {
        baseId,
        tableName,
        recordId
      })

      const response = await fetch(
        `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${recordId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to delete record: ${response.status} - ${errorData.error?.message || response.statusText}`)
      }

      const result = await response.json()

      return {
        success: true,
        output: {
          recordId: result.id || recordId,
          deleted: true,
          deletedAt: new Date().toISOString(),
          deletedCount: 1,
          deletedRecordIds: [result.id || recordId]
        },
        message: `Successfully deleted record ${recordId}`
      }
    }

    // Bulk deletion by matching criteria
    if (deleteMode === 'matching_records') {
      const searchMode = resolveValue(config.searchMode, input) || 'field_match'
      const searchField = resolveValue(config.searchField, input)
      const searchValue = resolveValue(config.searchValue, input)
      const matchType = resolveValue(config.matchType, input) || 'any'
      const caseSensitive = resolveValue(config.caseSensitive, input) || false
      const filterFormula = resolveValue(config.filterFormula, input)
      const maxRecords = resolveValue(config.maxRecords, input) || 10

      // Build filter formula based on search mode
      let finalFormula = ''

      if (searchMode === 'formula') {
        // Use the provided filter formula directly
        if (!filterFormula || !filterFormula.trim()) {
          return { success: false, message: "Filter formula is required when using formula search mode" }
        }
        finalFormula = filterFormula.trim()
      } else if (searchMode === 'field_match') {
        // Build formula based on field value match
        if (!searchField) {
          return { success: false, message: "Search field is required when using field match mode" }
        }
        if (!searchValue || (Array.isArray(searchValue) && searchValue.length === 0)) {
          return { success: false, message: "Search value is required when using field match mode" }
        }

        // Handle search value as array (from tags input) or single value
        const keywords = Array.isArray(searchValue) ? searchValue : [searchValue]

        if (keywords.length === 0) {
          return { success: false, message: "At least one search keyword is required" }
        }

        // Build search conditions based on match type
        const searchConditions: string[] = []

        if (matchType === 'exact') {
          // Exact phrase match - join all keywords into one phrase
          const phrase = keywords.join(' ')
          const searchFunc = caseSensitive ? '' : 'LOWER'
          const fieldRef = caseSensitive ? `{${searchField}}` : `${searchFunc}({${searchField}})`
          const value = caseSensitive ? phrase : phrase.toLowerCase()
          searchConditions.push(`${fieldRef} = "${value}"`)
        } else {
          // For 'any' or 'all' - search for each keyword
          // Use FIND() which returns position (>0) when found, 0 when not found
          // We need to explicitly check > 0 for proper boolean evaluation
          keywords.forEach(keyword => {
            if (caseSensitive) {
              // Case-sensitive: use FIND directly and check > 0
              searchConditions.push(`FIND("${keyword}", {${searchField}}) > 0`)
            } else {
              // Case-insensitive: convert both to lowercase, use FIND, and check > 0
              const lowerKeyword = keyword.toLowerCase()
              searchConditions.push(`FIND("${lowerKeyword}", LOWER({${searchField}})) > 0`)
            }
          })
        }

        // Combine conditions based on match type
        if (matchType === 'all' || matchType === 'exact') {
          finalFormula = searchConditions.length === 1
            ? searchConditions[0]
            : `AND(${searchConditions.join(', ')})`
        } else { // 'any'
          finalFormula = searchConditions.length === 1
            ? searchConditions[0]
            : `OR(${searchConditions.join(', ')})`
        }
      } else {
        return { success: false, message: `Unknown search mode: ${searchMode}` }
      }

      // First, fetch records that match the criteria
      const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`)
      url.searchParams.append('maxRecords', maxRecords.toString())

      if (finalFormula) {
        url.searchParams.append('filterByFormula', finalFormula)
      }

      logger.debug('[deleteAirtableRecord] Finding records to delete:', {
        baseId,
        tableName,
        formula: finalFormula,
        maxRecords
      })

      const listResponse = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      })

      if (!listResponse.ok) {
        const errorData = await listResponse.json().catch(() => ({}))
        throw new Error(`Failed to find records: ${listResponse.status} - ${errorData.error?.message || listResponse.statusText}`)
      }

      const listResult = await listResponse.json()
      const recordsToDelete = listResult.records || []

      if (recordsToDelete.length === 0) {
        return {
          success: true,
          output: {
            recordId: null,
            deleted: false,
            deletedAt: new Date().toISOString(),
            deletedCount: 0,
            deletedRecordIds: []
          },
          message: `No records found matching the criteria`
        }
      }

      // Check safety limit
      if (recordsToDelete.length > maxRecords) {
        return {
          success: false,
          message: `Found ${recordsToDelete.length} records to delete, but safety limit is ${maxRecords}. Increase the safety limit to proceed.`
        }
      }

      // Delete records in batches of 10 (Airtable API limit)
      const deletedRecordIds: string[] = []
      const batchSize = 10

      for (let i = 0; i < recordsToDelete.length; i += batchSize) {
        const batch = recordsToDelete.slice(i, i + batchSize)
        const recordIds = batch.map((r: any) => r.id)

        // Build delete URL with record IDs as query parameters
        const deleteUrl = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`)
        recordIds.forEach((id: string) => deleteUrl.searchParams.append('records[]', id))

        logger.debug('[deleteAirtableRecord] Deleting batch:', {
          batchNumber: Math.floor(i / batchSize) + 1,
          recordIds
        })

        const deleteResponse = await fetch(deleteUrl.toString(), {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })

        if (!deleteResponse.ok) {
          const errorData = await deleteResponse.json().catch(() => ({}))
          logger.error('[deleteAirtableRecord] Batch deletion failed:', errorData)

          // Return partial success if some records were deleted
          if (deletedRecordIds.length > 0) {
            return {
              success: false,
              output: {
                recordId: deletedRecordIds[0],
                deleted: true,
                deletedAt: new Date().toISOString(),
                deletedCount: deletedRecordIds.length,
                deletedRecordIds
              },
              error: `Partially deleted ${deletedRecordIds.length} records before error: ${errorData.error?.message || deleteResponse.statusText}`
            }
          }

          throw new Error(`Failed to delete records: ${deleteResponse.status} - ${errorData.error?.message || deleteResponse.statusText}`)
        }

        const deleteResult = await deleteResponse.json()
        const batchDeletedIds = deleteResult.records?.map((r: any) => r.id) || recordIds
        deletedRecordIds.push(...batchDeletedIds)
      }

      return {
        success: true,
        output: {
          recordId: deletedRecordIds[0],
          deleted: true,
          deletedAt: new Date().toISOString(),
          deletedCount: deletedRecordIds.length,
          deletedRecordIds
        },
        message: `Successfully deleted ${deletedRecordIds.length} record${deletedRecordIds.length === 1 ? '' : 's'}`
      }
    }

    return { success: false, message: `Unknown delete mode: ${deleteMode}` }

  } catch (error: any) {
    logger.error("Airtable delete record error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while deleting record(s)"
    }
  }
}
