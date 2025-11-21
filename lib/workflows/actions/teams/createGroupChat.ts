import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/security/encryption'
import { ActionResult } from '../index'
import { logger } from '@/lib/utils/logger'

/**
 * Create a new group chat in Microsoft Teams
 *
 * API Reference: https://learn.microsoft.com/en-us/graph/api/chat-post
 */
export async function createTeamsGroupChat(
  config: Record<string, any>,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const { topic, members, initialMessage } = input

    if (!members || members.length === 0) {
      return {
        success: false,
        error: 'At least one member is required to create a group chat'
      }
    }

    const supabase = createAdminClient()

    // Get Teams integration
    const { data: integration } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'teams')
      .eq('status', 'connected')
      .single()

    if (!integration || !integration.access_token) {
      return {
        success: false,
        error: 'Teams integration not found or not connected'
      }
    }

    const accessToken = await decrypt(integration.access_token)

    // First, get the current user's ID
    const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    if (!userResponse.ok) {
      return {
        success: false,
        error: 'Failed to get current user information'
      }
    }

    const currentUser = await userResponse.json()

    // Format members array - needs to be array of user IDs or email addresses
    const memberEmails = Array.isArray(members) ? members : [members]

    // Build members list
    const chatMembers: any[] = [
      {
        "@odata.type": "#microsoft.graph.aadUserConversationMember",
        "roles": ["owner"],
        "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${currentUser.id}')`
      }
    ]

    // Add other members
    for (const memberEmail of memberEmails) {
      // Get user ID from email
      const memberResponse = await fetch(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(memberEmail)}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      )

      if (memberResponse.ok) {
        const member = await memberResponse.json()
        chatMembers.push({
          "@odata.type": "#microsoft.graph.aadUserConversationMember",
          "roles": ["owner"],
          "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${member.id}')`
        })
      }
    }

    // Create the group chat
    const chatPayload: any = {
      chatType: "group",
      members: chatMembers
    }

    if (topic) {
      chatPayload.topic = topic
    }

    const response = await fetch('https://graph.microsoft.com/v1.0/chats', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(chatPayload)
    })

    if (!response.ok) {
      const errorData = await response.json()
      logger.error('[Teams] Failed to create group chat:', errorData)
      return {
        success: false,
        error: `Failed to create group chat: ${errorData.error?.message || response.statusText}`
      }
    }

    const chat = await response.json()

    // Send initial message if provided
    if (initialMessage && chat.id) {
      await fetch(`https://graph.microsoft.com/v1.0/chats/${chat.id}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          body: {
            content: initialMessage
          }
        })
      })
    }

    return {
      success: true,
      data: {
        chatId: chat.id,
        chatType: chat.chatType,
        topic: chat.topic || '',
        createdDateTime: chat.createdDateTime,
        success: true
      }
    }
  } catch (error: any) {
    logger.error('[Teams] Error creating group chat:', error)
    return {
      success: false,
      error: error.message || 'Failed to create Teams group chat'
    }
  }
}
