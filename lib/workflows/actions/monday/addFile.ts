import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Add a file to a Monday.com item
 */
export async function addMondayFile(
  config: Record<string, any>,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve configuration values
    const itemId = await resolveValue(config.itemId, input)
    const columnId = await resolveValue(config.columnId, input)
    const fileUrl = await resolveValue(config.fileUrl, input)

    // Validate required fields
    if (!itemId) {
      throw new Error('Item ID is required')
    }
    if (!columnId) {
      throw new Error('Column ID is required')
    }
    if (!fileUrl) {
      throw new Error('File URL is required')
    }

    // Get access token
    const accessToken = await getDecryptedAccessToken(userId, 'monday')

    // Build GraphQL mutation
    const mutation = `
      mutation($itemId: ID!, $columnId: String!, $fileUrl: String!) {
        add_file_to_column(item_id: $itemId, column_id: $columnId, file_url: $fileUrl) {
          id
          name
        }
      }
    `

    const variables = {
      itemId: itemId.toString(),
      columnId: columnId.toString(),
      fileUrl: fileUrl.toString()
    }

    // Make API request
    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'API-Version': '2024-01'
      },
      body: JSON.stringify({ query: mutation, variables })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Monday.com API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()

    if (data.errors && data.errors.length > 0) {
      const errorMessages = data.errors.map((e: any) => e.message).join(', ')
      throw new Error(`Monday.com error: ${errorMessages}`)
    }

    const item = data.data?.add_file_to_column

    if (!item) {
      throw new Error('Failed to add file: No data returned')
    }

    logger.info('✅ Monday.com file added successfully', { itemId, columnId, userId })

    return {
      success: true,
      output: {
        itemId: item.id,
        itemName: item.name,
        columnId: columnId,
        fileUrl: fileUrl,
        addedAt: new Date().toISOString()
      },
      message: `File added successfully to item ${itemId}`
    }

  } catch (error: any) {
    logger.error('❌ Monday.com add file error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to add file to Monday.com item'
    }
  }
}
