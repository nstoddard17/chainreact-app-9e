import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'

/**
 * Unified Google Sheets action that handles create, update, and delete operations
 */
export async function executeGoogleSheetsUnifiedAction(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const action = resolveValue(config.action, input)
    
    // Import the specific action handlers dynamically to avoid circular dependencies
    const { createGoogleSheetsRow } = await import('./createRow')
    const { updateGoogleSheetsRow } = await import('./updateRow')
    const { deleteGoogleSheetsRow } = await import('./deleteRow')

    // Route to the appropriate handler based on the action
    switch (action) {
      case 'add':
        // Map unified config to create-specific config
        const createConfig = {
          spreadsheetId: config.spreadsheetId,
          sheetName: config.sheetName,
          insertPosition: config.insertPosition,
          specificRow: config.specificRow,
          fieldMapping: config.columnMapping // Note: columnMapping -> fieldMapping
        }
        const createResult = await createGoogleSheetsRow(createConfig, userId, input)
        
        // Add action type to the output
        if (createResult.success && createResult.output) {
          createResult.output.action = 'add'
          createResult.output.rowsAffected = 1
          createResult.output.rangeModified = createResult.output.range
          createResult.output.message = createResult.message
        }
        return createResult

      case 'update':
        // Map unified config to update-specific config
        const updateConfig = {
          spreadsheetId: config.spreadsheetId,
          sheetName: config.sheetName,
          findRowBy: config.findRowBy,
          rowNumber: config.updateRowNumber,
          matchColumn: config.updateColumn,
          matchValue: config.updateValue,
          conditions: config.conditions,
          updateMapping: config.updateMapping,
          updateMultiple: config.updateMultiple
        }
        const updateResult = await updateGoogleSheetsRow(updateConfig, userId, input)
        
        // Add action type to the output
        if (updateResult.success && updateResult.output) {
          updateResult.output.action = 'update'
          updateResult.output.rowsAffected = updateResult.output.rowsUpdated
          updateResult.output.rangeModified = updateResult.output.ranges?.[0] || ''
          updateResult.output.message = updateResult.message
        }
        return updateResult

      case 'delete':
        // Map unified config to delete-specific config
        const deleteConfig = {
          spreadsheetId: config.spreadsheetId,
          sheetName: config.sheetName,
          deleteBy: config.deleteRowBy,
          rowNumber: config.deleteRowNumber,
          startRow: config.startRow,
          endRow: config.endRow,
          matchColumn: config.deleteColumn,
          matchValue: config.deleteValue,
          conditions: config.deleteConditions,
          deleteAll: config.deleteAll,
          confirmDelete: config.confirmDelete
        }
        const deleteResult = await deleteGoogleSheetsRow(deleteConfig, userId, input)
        
        // Add action type to the output
        if (deleteResult.success && deleteResult.output) {
          deleteResult.output.action = 'delete'
          deleteResult.output.rowsAffected = deleteResult.output.rowsDeleted
          deleteResult.output.rangeModified = `${config.sheetName}!Deleted`
          deleteResult.output.values = null // No values for delete
          deleteResult.output.message = deleteResult.message
        }
        return deleteResult

      default:
        return {
          success: false,
          error: `Invalid action: ${action}. Must be 'add', 'update', or 'delete'`
        }
    }
  } catch (error: any) {
    console.error("Google Sheets unified action error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while executing the Google Sheets action"
    }
  }
}