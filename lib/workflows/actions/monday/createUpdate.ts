import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'
import { createClient } from '@supabase/supabase-js'

// Helper to create supabase client inside handlers
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

/**
 * Create an update (comment) on a Monday.com item
 */
export async function createMondayUpdate(
  config: Record<string, any>,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve configuration values
    const itemId = await resolveValue(config.itemId, input)
    const text = await resolveValue(config.text, input)

    // Validate required fields
    if (!itemId) {
      throw new Error('Item ID is required')
    }
    if (!text) {
      throw new Error('Update text is required')
    }

    // Get Monday.com integration
    const { data: integration, error: integrationError } = await getSupabase()
      .from('integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'monday')
      .eq('status', 'connected')
      .single()

    if (integrationError || !integration) {
      throw new Error('Monday.com integration not found. Please connect your Monday.com account.')
    }

    // Get access token
    const accessToken = getDecryptedAccessToken(integration)

    // Build GraphQL mutation
    const mutation = `
      mutation($itemId: ID!, $text: String!) {
        create_update(
          item_id: $itemId
          body: $text
        ) {
          id
          text_body
          creator {
            id
          }
          created_at
        }
      }
    `

    const variables = {
      itemId: itemId.toString(),
      text: text.toString()
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

    const update = data.data?.create_update

    if (!update) {
      throw new Error('Failed to create update: No data returned')
    }

    logger.info('✅ Monday.com update created successfully', { updateId: update.id, itemId, userId })

    return {
      success: true,
      output: {
        updateId: update.id,
        itemId: itemId,
        text: update.text_body || text,
        creatorId: update.creator?.id,
        createdAt: update.created_at
      },
      message: `Update posted successfully to item ${itemId}`
    }

  } catch (error: any) {
    logger.error('❌ Monday.com create update error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create Monday.com update'
    }
  }
}
