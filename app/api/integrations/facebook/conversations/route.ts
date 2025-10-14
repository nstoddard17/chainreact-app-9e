import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import crypto from 'crypto'

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { pageId, userId } = body

    if (!pageId) {
      return errorResponse('Missing pageId' , 400)
    }

    // Get user's Facebook integration
    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return errorResponse('Unauthorized' , 401)
    }

    // Get Facebook access token
    const { data: integration } = await supabase
      .from('integrations')
      .select('access_token, refresh_token, expires_at')
      .eq('user_id', user.id)
      .eq('provider', 'facebook')
      .single()

    if (!integration) {
      return errorResponse('Facebook integration not found' , 404)
    }

    // Check if token is expired and refresh if needed
    let accessToken = integration.access_token
    if (integration.expires_at && new Date(integration.expires_at) <= new Date()) {
      // Token is expired, need to refresh
      const refreshResponse = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'fb_exchange_token',
          client_id: process.env.FACEBOOK_APP_ID!,
          client_secret: process.env.FACEBOOK_APP_SECRET!,
          fb_exchange_token: integration.refresh_token || integration.access_token,
        }),
      })

      if (!refreshResponse.ok) {
        return errorResponse('Failed to refresh Facebook token' , 500)
      }

      const refreshData = await refreshResponse.json()
      accessToken = refreshData.access_token

      // Update the token in the database
      await supabase
        .from('integrations')
        .update({
          access_token: accessToken,
          expires_at: new Date(Date.now() + (refreshData.expires_in * 1000)).toISOString(),
        })
        .eq('user_id', user.id)
        .eq('provider', 'facebook')
    }

    // Get page access token
    const pageTokenResponse = await fetch(`https://graph.facebook.com/v18.0/${pageId}?fields=access_token&access_token=${accessToken}`)
    
    if (!pageTokenResponse.ok) {
      return errorResponse('Failed to get page access token' , 500)
    }

    const pageTokenData = await pageTokenResponse.json()
    const pageAccessToken = pageTokenData.access_token

    // Generate appsecret_proof for secure API calls
    const appsecretProof = crypto
      .createHmac('sha256', process.env.FACEBOOK_APP_SECRET!)
      .update(accessToken)
      .digest('hex')

    // Fetch conversations for the page
    const conversationsResponse = await fetch(
      `https://graph.facebook.com/v18.0/${pageId}/conversations?fields=participants,updated_time,message_count&limit=50&access_token=${pageAccessToken}&appsecret_proof=${appsecretProof}`
    )

    if (!conversationsResponse.ok) {
      const errorData = await conversationsResponse.text()
      logger.error('Facebook conversations API error:', errorData)
      return errorResponse('Failed to fetch conversations' , 500)
    }

    const conversationsData = await conversationsResponse.json()
    
    // Process conversations to get sender info and last messages
    const conversations = []
    
    for (const conversation of conversationsData.data || []) {
      try {
        // Get the last message in each conversation
        const messagesResponse = await fetch(
          `https://graph.facebook.com/v18.0/${conversation.id}/messages?fields=from,message,created_time&limit=1&access_token=${pageAccessToken}&appsecret_proof=${appsecretProof}`
        )

        if (messagesResponse.ok) {
          const messagesData = await messagesResponse.json()
          const lastMessage = messagesData.data?.[0]

          if (lastMessage) {
            // Get sender info (excluding the page itself)
            const sender = conversation.participants?.data?.find(
              (participant: any) => participant.id !== pageId
            )

            if (sender) {
              conversations.push({
                conversationId: conversation.id,
                senderId: sender.id,
                senderName: sender.name || `User ${sender.id}`,
                lastMessage: lastMessage.message || 'No text message',
                lastMessageTime: lastMessage.created_time,
                messageCount: conversation.message_count,
                updatedTime: conversation.updated_time
              })
            }
          }
        }
      } catch (error) {
        logger.error('Error processing conversation:', error)
        // Continue with other conversations
      }
    }

    // Sort by most recent activity
    conversations.sort((a, b) => new Date(b.updatedTime).getTime() - new Date(a.updatedTime).getTime())

    return jsonResponse({ data: conversations })

  } catch (error) {
    logger.error('Error fetching Facebook conversations:', error)
    return errorResponse('Internal server error' , 500)
  }
} 