import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * List users from Monday.com workspace
 */
export async function listMondayUsers(
  config: Record<string, any>,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve configuration values
    const limit = config.limit
      ? await resolveValue(config.limit, input)
      : 50
    const kind = config.kind
      ? await resolveValue(config.kind, input)
      : 'all' // all, non_guests, guests, non_pending

    // Get access token
    const accessToken = await getDecryptedAccessToken(userId, 'monday')

    // Build GraphQL query
    let query = `
      query($limit: Int!) {
        users(limit: $limit) {
          id
          name
          email
          title
          photo_original
          enabled
          created_at
        }
      }
    `

    const variables: Record<string, any> = {
      limit: parseInt(limit.toString()) || 50
    }

    // Add kind filter if specified
    if (kind && kind !== 'all') {
      query = `
        query($limit: Int!, $kind: UserKind!) {
          users(limit: $limit, kind: $kind) {
            id
            name
            email
            title
            photo_original
            enabled
            created_at
          }
        }
      `
      variables.kind = kind
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

    const users = data.data?.users || []

    logger.info('✅ Monday.com users listed successfully', { userCount: users.length, userId })

    return {
      success: true,
      output: {
        users: users,
        count: users.length,
        kind: kind
      },
      message: `Retrieved ${users.length} users from Monday.com`
    }

  } catch (error: any) {
    logger.error('❌ Monday.com list users error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to list Monday.com users'
    }
  }
}
