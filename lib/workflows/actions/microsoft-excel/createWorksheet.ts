/**
 * Create Worksheet in Excel Action
 * Creates a new worksheet (tab) in an Excel workbook
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/security/encryption'
import { logger } from '@/lib/utils/logger'

const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0'

interface CreateWorksheetConfig {
  workbookId: string
  worksheetName: string
}

interface CreateWorksheetOutput {
  worksheetId: string
  worksheetName: string
  position: number
  visibility: string
  workbookId: string
  timestamp: string
}

/**
 * Create a new worksheet in an Excel workbook
 */
export async function createMicrosoftExcelWorksheet(
  config: CreateWorksheetConfig,
  context: { userId: string }
): Promise<CreateWorksheetOutput> {
  const { workbookId, worksheetName } = config
  const { userId } = context

  logger.debug('[Microsoft Excel] Creating worksheet:', { workbookId, worksheetName })

  // Get OneDrive integration
  const supabase = createAdminClient()
  const { data: integration, error } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'onedrive')
    .eq('status', 'connected')
    .single()

  if (error || !integration) {
    throw new Error('OneDrive integration not found or not connected')
  }

  // Decrypt access token
  const accessToken = await decrypt(integration.access_token)

  try {
    // Create the worksheet using Microsoft Graph API
    const createUrl = `${GRAPH_API_BASE}/me/drive/items/${workbookId}/workbook/worksheets`

    const createResponse = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: worksheetName
      })
    })

    if (!createResponse.ok) {
      const error = await createResponse.text()
      throw new Error(`Failed to create worksheet: ${error}`)
    }

    const result = await createResponse.json()

    logger.debug('[Microsoft Excel] Successfully created worksheet')

    return {
      worksheetId: result.id,
      worksheetName: result.name,
      position: result.position,
      visibility: result.visibility,
      workbookId,
      timestamp: new Date().toISOString()
    }

  } catch (error: any) {
    logger.error('[Microsoft Excel] Error creating worksheet:', error)
    throw new Error(`Failed to create worksheet: ${error.message}`)
  }
}
