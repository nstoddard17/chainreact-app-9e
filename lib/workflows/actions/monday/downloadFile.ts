import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Download/get file URLs from a Monday.com item
 */
export async function downloadMondayFile(
  config: Record<string, any>,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve configuration values
    const itemId = await resolveValue(config.itemId, input)
    const columnId = await resolveValue(config.columnId, input)

    // Validate required fields
    if (!itemId) {
      throw new Error('Item ID is required')
    }
    if (!columnId) {
      throw new Error('Column ID is required')
    }

    // Get access token
    const accessToken = await getDecryptedAccessToken(userId, 'monday')

    // Build GraphQL query to get file column value
    const query = `
      query($itemId: [ID!]) {
        items(ids: $itemId) {
          id
          name
          column_values {
            id
            type
            text
            value
          }
        }
      }
    `

    const variables = {
      itemId: [itemId.toString()]
    }

    // Make API request
    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'API-Version': '2024-01'
      },
      body: JSON.stringify({ query, variables })
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

    const items = data.data?.items

    if (!items || items.length === 0) {
      throw new Error('Item not found')
    }

    const item = items[0]
    const fileColumn = item.column_values?.find((col: any) => col.id === columnId.toString())

    if (!fileColumn) {
      throw new Error(`Column ${columnId} not found on item`)
    }

    if (fileColumn.type !== 'file') {
      throw new Error(`Column ${columnId} is not a file column (type: ${fileColumn.type})`)
    }

    // Parse file value
    let files = []
    if (fileColumn.value) {
      try {
        const parsedValue = JSON.parse(fileColumn.value)
        files = parsedValue.files || []
      } catch (e) {
        logger.warn('Failed to parse file column value')
      }
    }

    logger.info('✅ Monday.com file URLs retrieved successfully', { itemId, columnId, fileCount: files.length, userId })

    return {
      success: true,
      output: {
        itemId: item.id,
        itemName: item.name,
        columnId: columnId,
        files: files,
        fileCount: files.length,
        fileUrls: files.map((f: any) => f.url || f.publicUrl).filter(Boolean)
      },
      message: `Retrieved ${files.length} file(s) from item ${itemId}`
    }

  } catch (error: any) {
    logger.error('❌ Monday.com download file error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to download Monday.com file'
    }
  }
}
