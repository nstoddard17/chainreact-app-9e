import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Add a new column to a Monday.com board
 */
export async function addMondayColumn(
  config: Record<string, any>,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve configuration values
    const boardId = await resolveValue(config.boardId, input)
    const columnTitle = await resolveValue(config.columnTitle, input)
    const columnType = await resolveValue(config.columnType, input)

    // Validate required fields
    if (!boardId) {
      throw new Error('Board ID is required')
    }
    if (!columnTitle) {
      throw new Error('Column title is required')
    }
    if (!columnType) {
      throw new Error('Column type is required')
    }

    // Get access token
    const accessToken = await getDecryptedAccessToken(userId, 'monday')

    // Build column defaults based on type
    const defaults = await buildColumnDefaults(config, input, columnType)

    // Build mutation - conditionally include defaults
    let mutation = ''
    const variables: Record<string, any> = {
      boardId: boardId.toString(),
      title: columnTitle.toString(),
      columnType: columnType
    }

    if (defaults) {
      mutation = `
        mutation($boardId: ID!, $title: String!, $columnType: ColumnType!, $defaults: JSON) {
          create_column(
            board_id: $boardId
            title: $title
            column_type: $columnType
            defaults: $defaults
          ) {
            id
            title
            type
          }
        }
      `
      variables.defaults = JSON.stringify(defaults)
    } else {
      mutation = `
        mutation($boardId: ID!, $title: String!, $columnType: ColumnType!) {
          create_column(
            board_id: $boardId
            title: $title
            column_type: $columnType
          ) {
            id
            title
            type
          }
        }
      `
    }

    // Log the request for debugging
    logger.debug('[Monday.com] Creating column', {
      boardId,
      columnTitle,
      columnType,
      defaults,
      variables
    })

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

    const column = data.data?.create_column

    if (!column) {
      throw new Error('Failed to create column: No data returned')
    }

    logger.info('✅ Monday.com column created successfully', { columnId: column.id, boardId, userId })

    return {
      success: true,
      output: {
        columnId: column.id,
        columnTitle: column.title,
        columnType: column.type || columnType,
        boardId: boardId,
        createdAt: new Date().toISOString()
      },
      message: `Column "${columnTitle}" created successfully in Monday.com`
    }

  } catch (error: any) {
    logger.error('❌ Monday.com add column error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to add Monday.com column'
    }
  }
}

/**
 * Build column defaults based on column type and user-friendly inputs
 */
async function buildColumnDefaults(
  config: Record<string, any>,
  input: Record<string, any>,
  columnType: string
): Promise<any> {
  if (columnType === 'status') {
    const statusLabels = await resolveValue(config.statusLabels, input)

    if (!statusLabels) return null

    // Parse comma-separated labels
    const labels = statusLabels.split(',').map((l: string) => l.trim()).filter((l: string) => l)

    // Build simple labels object - Monday.com will assign default colors
    const labelsObj: Record<string, string> = {}
    labels.forEach((label: string, index: number) => {
      labelsObj[(index + 1).toString()] = label
    })

    return { labels: labelsObj }
  } else if (columnType === 'dropdown') {
    const dropdownLabels = await resolveValue(config.dropdownLabels, input)
    const allowMultiple = await resolveValue(config.allowMultipleSelection, input)

    if (!dropdownLabels) return null

    // Parse comma-separated labels
    const labels = dropdownLabels.split(',').map((l: string) => l.trim()).filter((l: string) => l)

    return {
      labels: labels.map((label: string) => ({ label })),
      limit_select: allowMultiple === 'false' || !allowMultiple,
      label_limit_count: allowMultiple === 'true' ? labels.length : 1
    }
  } else if (columnType === 'rating') {
    const defaultRating = await resolveValue(config.defaultRating, input)
    if (!defaultRating) return null

    return {
      max: parseInt(defaultRating) || 5
    }
  } else if (columnType === 'tag') {
    const tagLabels = await resolveValue(config.tagLabels, input)
    if (!tagLabels) return null

    // Parse comma-separated labels
    const labels = tagLabels.split(',').map((l: string) => l.trim()).filter((l: string) => l)

    return {
      labels: labels.map((label: string) => ({ label }))
    }
  }

  return null
}

