/**
 * Delete Worksheet in Excel Action
 * Deletes an existing worksheet (tab) from an Excel workbook
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/security/encryption'
import { logger } from '@/lib/utils/logger'

const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0'

interface DeleteWorksheetConfig {
  workbookId: string
  worksheetName: string
}

interface DeleteWorksheetOutput {
  deleted: boolean
  worksheetName: string
  workbookId: string
  timestamp: string
}

/**
 * Delete a worksheet from an Excel workbook
 */
export async function deleteMicrosoftExcelWorksheet(
  config: DeleteWorksheetConfig,
  context: { userId: string }
): Promise<DeleteWorksheetOutput> {
  const { workbookId, worksheetName } = config
  const { userId } = context

  logger.debug('[Microsoft Excel] Deleting worksheet:', { workbookId, worksheetName })

  // Get Microsoft Excel integration
  const supabase = createAdminClient()
  const { data: integration, error } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'microsoft-excel')
    .eq('status', 'connected')
    .single()

  if (error || !integration) {
    throw new Error('Microsoft Excel integration not found or not connected')
  }

  // Decrypt access token
  const accessToken = await decrypt(integration.access_token)

  try {
    // Delete the worksheet using Microsoft Graph API
    const deleteUrl = `${GRAPH_API_BASE}/me/drive/items/${workbookId}/workbook/worksheets('${worksheetName}')`

    const deleteResponse = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!deleteResponse.ok) {
      const error = await deleteResponse.text()
      throw new Error(`Failed to delete worksheet: ${error}`)
    }

    logger.debug('[Microsoft Excel] Successfully deleted worksheet')

    return {
      deleted: true,
      worksheetName,
      workbookId,
      timestamp: new Date().toISOString()
    }

  } catch (error: any) {
    logger.error('[Microsoft Excel] Error deleting worksheet:', error)
    throw new Error(`Failed to delete worksheet: ${error.message}`)
  }
}
