import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'

/**
 * Unified Microsoft Excel action that handles create, update, and delete operations
 * Uses Microsoft Graph API to interact with Excel files stored in OneDrive
 */
export async function executeMicrosoftExcelUnifiedAction(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const action = resolveValue(config.action, input)

    console.log('🔄 [Microsoft Excel Unified Action] Received config:', {
      action,
      configKeys: Object.keys(config),
      deleteSpecific: {
        deleteRowBy: config.deleteRowBy,
        deleteColumn: config.deleteColumn,
        deleteValue: config.deleteValue,
        deleteRowNumber: config.deleteRowNumber,
        deleteAll: config.deleteAll,
        confirmDelete: config.confirmDelete
      }
    })

    // Import the specific action handlers dynamically to avoid circular dependencies
    const { createMicrosoftExcelRow } = await import('./createRow')
    const { updateMicrosoftExcelRow } = await import('./updateRow')
    const { deleteMicrosoftExcelRow } = await import('./deleteRow')

    // Route to the appropriate handler based on the action
    switch (action) {
      case 'add':
        // Map unified config to create-specific config
        const createConfig = {
          workbookId: config.workbookId,
          worksheetName: config.worksheetName,
          insertPosition: config.insertPosition,
          specificRow: config.specificRow,
          fieldMapping: config.columnMapping // Note: columnMapping -> fieldMapping
        }
        const createResult = await createMicrosoftExcelRow(createConfig, userId, input)

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
          workbookId: config.workbookId,
          worksheetName: config.worksheetName,
          findRowBy: config.findRowBy,
          rowNumber: config.rowNumber || config.updateRowNumber,  // Support both field names
          matchColumn: config.updateColumn,
          matchValue: config.updateValue,
          conditions: config.conditions,
          updateMapping: config.updateMapping,
          updateMultiple: config.updateMultiple
        }

        console.log('🔄 Microsoft Excel Update - Unified Action Config:', {
          originalConfig: config,
          mappedConfig: updateConfig
        })
        const updateResult = await updateMicrosoftExcelRow(updateConfig, userId, input)

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
          workbookId: config.workbookId,
          worksheetName: config.worksheetName,
          // Support both old and new field names for backwards compatibility
          deleteBy: config.deleteBy || config.deleteRowBy,
          rowNumber: config.rowNumber || config.deleteRowNumber,
          startRow: config.startRow,
          endRow: config.endRow,
          // Support both deleteSearchColumn and deleteColumn for backwards compatibility
          matchColumn: config.matchColumn || config.deleteSearchColumn || config.deleteColumn,
          matchValue: config.matchValue || config.deleteSearchValue || config.deleteValue,
          deleteAll: config.deleteAll,
          confirmDelete: config.confirmDelete
        }

        console.log('🗑️ [Excel Unified Action] Delete config being passed:', deleteConfig)
        const deleteResult = await deleteMicrosoftExcelRow(deleteConfig, userId, input)

        // Add action type to the output
        if (deleteResult.success && deleteResult.output) {
          deleteResult.output.action = 'delete'
          deleteResult.output.rowsAffected = deleteResult.output.rowsDeleted || 0
          deleteResult.output.rangeModified = deleteResult.output.range || ''
          deleteResult.output.message = deleteResult.message
        }
        return deleteResult

      default:
        return {
          success: false,
          output: {},
          message: `Unknown action: ${action}`
        }
    }
  } catch (error: any) {
    console.error('❌ [Microsoft Excel Unified Action] Error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to execute Microsoft Excel action'
    }
  }
}