import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Get a specific user from Monday.com
 */
export async function getMondayUser(
  config: Record<string, any>,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve configuration values
    const mondayUserId = await resolveValue(config.userId, input)

    // Validate required fields
    if (!mondayUserId) {
      throw new Error('User ID is required')
    }

    // Get access token
    const accessToken = await getDecryptedAccessToken(userId, 'monday')

    // Build GraphQL query
    const query = `
      query($userId: [ID!]) {
        users(ids: $userId) {
          id
          name
          email
          title
          photo_original
          enabled
          created_at
          account {
            id
            name
          }
        }
      }
    `

    const variables = {
      userId: [mondayUserId.toString()]
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

    const users = data.data?.users

    if (!users || users.length === 0) {
      throw new Error('User not found')
    }

    const user = users[0]

    logger.info('✅ Monday.com user retrieved successfully', { mondayUserId, userId })

    return {
      success: true,
      output: {
        userId: user.id,
        name: user.name,
        email: user.email,
        title: user.title,
        photoUrl: user.photo_original,
        enabled: user.enabled,
        createdAt: user.created_at,
        accountId: user.account?.id,
        accountName: user.account?.name
      },
      message: `User ${user.name} retrieved successfully from Monday.com`
    }

  } catch (error: any) {
    logger.error('❌ Monday.com get user error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to get Monday.com user'
    }
  }
}
