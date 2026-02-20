import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import crypto from 'crypto'
import { verifyWebhookSignature } from '@/lib/webhooks/verification'
import { processWebhookEvent } from '@/lib/webhooks/processor'
import { handleDropboxWebhookEvent } from '@/lib/webhooks/dropboxTriggerHandler'
import { logWebhookEvent } from '@/lib/webhooks/event-logger'

import { logger } from '@/lib/utils/logger'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await params
    const startTime = Date.now()
    const requestId = crypto.randomUUID()
    
    // Log incoming webhook
    await logWebhookEvent({
      provider,
      requestId,
      method: 'POST',
      headers: Object.fromEntries(request.headers.entries()),
      timestamp: new Date().toISOString()
    })

    // Verify webhook signature based on provider
    const requestForVerification = request.clone()
    const isValid = await verifyWebhookSignature(requestForVerification, provider)
    if (!isValid) {
      logger.error(`[${requestId}] Invalid ${provider} webhook signature`)
      return errorResponse('Unauthorized' , 401)
    }

    // Parse the request body
    const body = await request.text()
    let eventData: any

    try {
      eventData = JSON.parse(body)
    } catch (parseError) {
      logger.error(`[${requestId}] Failed to parse ${provider} webhook body:`, parseError)
      return errorResponse('Invalid payload' , 400)
    }

    // Log the parsed event
    await logWebhookEvent({
      provider,
      requestId,
      eventType: eventData.type || eventData.event_type || 'unknown',
      eventData: eventData,
      timestamp: new Date().toISOString()
    })

    if (provider === 'slack' && eventData?.type === 'url_verification' && eventData?.challenge) {
      logger.debug(`[${requestId}] Responding to Slack URL verification challenge`);
      return jsonResponse({ challenge: eventData.challenge })
    }

    // Process Dropbox directly through trigger handler
    if (provider === 'dropbox') {
      const dropboxResults = await handleDropboxWebhookEvent(
        eventData,
        Object.fromEntries(request.headers.entries()),
        requestId
      )

      const processingTime = Date.now() - startTime

      await logWebhookEvent({
        provider,
        requestId,
        status: 'success',
        processingTime,
        result: {
          workflowsTriggered: dropboxResults.length,
          results: dropboxResults
        },
        timestamp: new Date().toISOString()
      })

      return jsonResponse({
        success: true,
        provider,
        requestId,
        processingTime,
        workflowsTriggered: dropboxResults.length,
        results: dropboxResults
      })
    }

    // Process the event based on provider
    const { eventType, normalizedData, eventId, ignore } = normalizeWebhookEvent(provider, eventData, requestId)

    // INFO-level logging to trace webhook processing
    if (provider === 'slack') {
      logger.info(`[${requestId}] 🔵 SLACK WEBHOOK: eventType=${eventType}, channel=${normalizedData?.message?.channel}, channelType=${normalizedData?.message?.channelType}, team=${normalizedData?.message?.team}`)
    }

    if (ignore) {
      logger.debug(`[${requestId}] Ignoring ${provider} event based on normalization rules`, {
        provider,
        eventType,
        eventId
      })
      return jsonResponse({ success: true, ignored: true })
    }

    logger.debug(`[${requestId}] Normalized ${provider} webhook event`, {
      eventType,
      eventId,
      summary: normalizedData && typeof normalizedData === 'object' ? {
        channel: normalizedData.message?.channel,
        user: normalizedData.message?.user,
        subtype: normalizedData.message?.raw?.subtype
      } : undefined
    })

    const result = await processWebhookEvent({
      id: eventId || requestId,
      provider,
      eventType,
      eventData: normalizedData,
      requestId,
      timestamp: new Date()
    })

    const processingTime = Date.now() - startTime
    
    // Log successful processing
    await logWebhookEvent({
      provider,
      requestId,
      status: 'success',
      processingTime,
      result,
      timestamp: new Date().toISOString()
    })

    return jsonResponse({ 
      success: true, 
      provider,
      requestId,
      processingTime 
    })

  } catch (error) {
    logger.error('Webhook error:', error)
    
    // Log error
    await logWebhookEvent({
      provider: 'unknown',
      requestId: crypto.randomUUID(),
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    })

    return errorResponse('Internal server error' , 500)
  }
}



export async function HEAD(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params
  logger.debug(`[Webhook HEAD] Provider: ${provider}`)
  return new Response(null, {
    status: 200,
    headers: {
      'X-Webhook-Provider': provider,
      'X-Webhook-Status': 'ready'
    }
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params
  
  // Handle webhook verification challenges
  const url = new URL(request.url)
  const challenge = url.searchParams.get('challenge')
  
  logger.debug(`[Webhook GET] Provider: ${provider}, Challenge: ${challenge}`)
  
  // Dropbox webhook verification
  if (provider === 'dropbox' && challenge) {
    logger.debug(`[Dropbox] Responding to challenge: ${challenge}`)
    // Return ONLY the challenge string as plain text, nothing else
    return new Response(challenge, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'X-Content-Type-Options': 'nosniff'
      }
    })
  }
  
  // Slack webhook verification
  if (provider === 'slack' && challenge) {
    logger.debug(`[Slack] Responding to challenge: ${challenge}`)
    return jsonResponse({ challenge })
  }

  // Trello webhook verification - echo the challenge string
  if (provider === 'trello' && challenge) {
    logger.debug(`[Trello] Responding to challenge: ${challenge}`)
    return new Response(challenge, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'X-Webhook-Provider': 'trello'
      }
    })
  }

  if (provider === 'trello') {
    // Trello expects a 200 even without challenge to keep webhook alive
    return new Response('OK', {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'X-Webhook-Provider': 'trello'
      }
    })
  }
  
  // Other webhook verification patterns can be added here
  
  // Default health check endpoint
  return jsonResponse({
    status: 'healthy', 
    provider,
    timestamp: new Date().toISOString()
  })
} 


function normalizeWebhookEvent(provider: string, rawEvent: any, requestId: string) {
  switch (provider) {
    case 'slack': {
      const envelope = rawEvent || {}
      const slackEvent = envelope.event || rawEvent || {}
      const eventTypeFromSlack = slackEvent.type
      const subtype = slackEvent.subtype

      // Handle message deleted events
      if (subtype === 'message_deleted') {
        return {
          eventType: 'slack_trigger_message_deleted',
          normalizedData: slackEvent,
          eventId: slackEvent.deleted_ts || slackEvent.event_ts || envelope.event_id,
          ignore: true
        }
      }

      // Handle reaction_added events
      if (eventTypeFromSlack === 'reaction_added') {
        logger.debug(`[${requestId}] Processing Slack reaction_added event`, {
          reaction: slackEvent.reaction,
          user: slackEvent.user,
          item: slackEvent.item
        })

        const normalizedData = {
          reaction: slackEvent.reaction,
          user: slackEvent.user || slackEvent.user_id,
          item: slackEvent.item || {},
          eventTs: slackEvent.event_ts || envelope.event_ts,
          team: slackEvent.team || envelope.team_id || slackEvent.team_id,
          raw: slackEvent
        }

        return {
          eventType: 'slack_trigger_reaction_added',
          normalizedData,
          eventId: slackEvent.event_ts || envelope.event_id || requestId
        }
      }

      // Handle reaction_removed events
      if (eventTypeFromSlack === 'reaction_removed') {
        logger.debug(`[${requestId}] Processing Slack reaction_removed event`, {
          reaction: slackEvent.reaction,
          user: slackEvent.user,
          item: slackEvent.item
        })

        const normalizedData = {
          reaction: slackEvent.reaction,
          user: slackEvent.user || slackEvent.user_id,
          item: slackEvent.item || {},
          eventTs: slackEvent.event_ts || envelope.event_ts,
          team: slackEvent.team || envelope.team_id || slackEvent.team_id,
          raw: slackEvent
        }

        return {
          eventType: 'slack_trigger_reaction_removed',
          normalizedData,
          eventId: slackEvent.event_ts || envelope.event_id || requestId
        }
      }

      // Handle channel created events
      if (eventTypeFromSlack === 'channel_created') {
        const normalizedData = {
          channel: slackEvent.channel || {},
          eventTs: slackEvent.event_ts || envelope.event_ts,
          team: slackEvent.team || envelope.team_id || slackEvent.team_id,
          raw: slackEvent
        }

        return {
          eventType: 'slack_trigger_channel_created',
          normalizedData,
          eventId: slackEvent.event_ts || envelope.event_id || requestId
        }
      }

      // Handle member joined events
      if (eventTypeFromSlack === 'member_joined_channel' || eventTypeFromSlack === 'user_joined') {
        const normalizedData = {
          user: slackEvent.user || slackEvent.user_id,
          channel: slackEvent.channel || slackEvent.channel_id,
          eventTs: slackEvent.event_ts || envelope.event_ts,
          team: slackEvent.team || envelope.team_id || slackEvent.team_id,
          raw: slackEvent
        }

        return {
          eventType: 'slack_trigger_member_joined_channel',
          normalizedData,
          eventId: slackEvent.event_ts || envelope.event_id || requestId
        }
      }

      // Handle member left events
      if (eventTypeFromSlack === 'member_left_channel') {
        const normalizedData = {
          user: slackEvent.user || slackEvent.user_id,
          channel: slackEvent.channel || slackEvent.channel_id,
          eventTs: slackEvent.event_ts || envelope.event_ts,
          team: slackEvent.team || envelope.team_id || slackEvent.team_id,
          raw: slackEvent
        }

        return {
          eventType: 'slack_trigger_member_left_channel',
          normalizedData,
          eventId: slackEvent.event_ts || envelope.event_id || requestId
        }
      }

      // Handle file shared events
      if (eventTypeFromSlack === 'file_shared') {
        const normalizedData = {
          file: slackEvent.file || slackEvent.file_id,
          user: slackEvent.user_id || slackEvent.user,
          channel: slackEvent.channel_id || slackEvent.channel,
          eventTs: slackEvent.event_ts || envelope.event_ts,
          team: slackEvent.team || envelope.team_id || slackEvent.team_id,
          raw: slackEvent
        }

        return {
          eventType: 'slack_trigger_file_uploaded',
          normalizedData,
          eventId: slackEvent.event_ts || envelope.event_id || requestId
        }
      }

      // Handle user joined workspace (team_join) events
      if (eventTypeFromSlack === 'team_join') {
        const normalizedData = {
          user: slackEvent.user || {},
          eventTs: slackEvent.event_ts || envelope.event_ts,
          team: slackEvent.team || envelope.team_id || slackEvent.team_id,
          raw: slackEvent
        }

        return {
          eventType: 'slack_trigger_user_joined_workspace',
          normalizedData,
          eventId: slackEvent.event_ts || envelope.event_id || requestId
        }
      }

      // Default to message events
      let eventType = 'slack_trigger_new_message'
      const channel = slackEvent.channel || slackEvent.channel_id
      const channelType = slackEvent.channel_type

      // Prioritize channelType when available (authoritative), fall back to channel ID prefix
      let isPublicChannel = false
      let isDirectMessage = false
      let isGroupDM = false

      if (channelType) {
        // channelType is authoritative when present - don't use channel prefix fallback
        isPublicChannel = channelType === 'channel'
        isDirectMessage = channelType === 'im'
        isGroupDM = channelType === 'mpim'
      } else {
        // Fallback to channel ID prefix when channelType is not available
        isPublicChannel = typeof channel === 'string' && channel.startsWith('C')
        isDirectMessage = typeof channel === 'string' && channel.startsWith('D')
        isGroupDM = typeof channel === 'string' && channel.startsWith('G')
      }

      if (slackEvent.type === 'message') {
        if (isPublicChannel) {
          eventType = 'slack_trigger_message_channels'
        } else if (isDirectMessage) {
          eventType = 'slack_trigger_message_im'
        } else if (isGroupDM) {
          eventType = 'slack_trigger_message_mpim'
        }
      }

      const normalizedData = {
        message: {
          id: slackEvent.client_msg_id || slackEvent.ts || envelope.event_id || requestId,
          text: slackEvent.text || '',
          user: slackEvent.user || slackEvent.user_id,
          channel,
          channelType,
          team: slackEvent.team || envelope.team_id || slackEvent.team_id,
          timestamp: slackEvent.ts || envelope.event_ts,
          threadTs: slackEvent.thread_ts,
          raw: slackEvent
        }
      }

      return {
        eventType,
        normalizedData,
        eventId: normalizedData.message.id
      }
    }

    case 'trello': {
      const envelope = rawEvent || {}
      const action = envelope.action || {}
      const data = action.data || {}
      const actionType = action.type || 'unknown'

      const movedByUpdate = Boolean(data.listBefore?.id && data.listAfter?.id && data.listBefore.id !== data.listAfter.id)
      const hasCard = Boolean(data.card?.id)
      const isArchiveChange = actionType === 'updateCard' && data.old && 'closed' in data.old

      let eventType = 'trello_trigger_event'

      // Detect archive/unarchive before generic updateCard
      if (isArchiveChange) {
        eventType = 'trello_trigger_card_archived'
      } else {
        switch (actionType) {
          case 'createCard':
          case 'copyCard':
            eventType = 'trello_trigger_new_card'
            break
          case 'moveCardToBoard':
          case 'moveCardFromBoard':
            eventType = 'trello_trigger_card_moved'
            break
          case 'updateCard':
            eventType = movedByUpdate ? 'trello_trigger_card_moved' : 'trello_trigger_card_updated'
            break
          case 'commentCard':
            eventType = 'trello_trigger_comment_added'
            break
          case 'addMemberToCard':
          case 'removeMemberFromCard':
            eventType = 'trello_trigger_member_changed'
            break
          default:
            if (hasCard) {
              eventType = 'trello_trigger_card_updated'
            }
            break
        }
      }

      const cardShortLink = data.card?.shortLink || null
      const cardUrl = data.card?.url || (cardShortLink ? `https://trello.com/c/${cardShortLink}` : null)

      // Underscore-prefixed metadata for filter logic in processor.ts
      const filterMeta = {
        _raw: envelope,
        _actionType: actionType,
        _listId: data.list?.id || data.listAfter?.id || data.listBefore?.id || null,
        _listBeforeId: data.listBefore?.id || null,
        _listAfterId: data.listAfter?.id || null,
        _oldData: data.old || null,
      }

      // Per-eventType normalization — keys MUST match each trigger's outputSchema field names
      let normalizedData: any
      switch (eventType) {
        case 'trello_trigger_new_card':
          normalizedData = {
            ...filterMeta,
            boardId: data.board?.id || null,
            listId: data.list?.id || null,
            cardId: data.card?.id || null,
            name: data.card?.name || null,
            desc: data.card?.desc || '',
            url: cardUrl,
            createdAt: action.date || new Date().toISOString(),
          }
          break
        case 'trello_trigger_card_updated':
          normalizedData = {
            ...filterMeta,
            boardId: data.board?.id || null,
            listId: data.list?.id || data.card?.idList || null,
            cardId: data.card?.id || null,
            name: data.card?.name || null,
            desc: data.card?.desc || '',
            changedFields: data.old ? Object.keys(data.old) : [],
            oldValues: data.old || {},
            updatedAt: action.date || new Date().toISOString(),
          }
          break
        case 'trello_trigger_card_moved':
          normalizedData = {
            ...filterMeta,
            boardId: data.board?.id || null,
            fromListId: data.listBefore?.id || null,
            fromListName: data.listBefore?.name || null,
            toListId: data.listAfter?.id || null,
            toListName: data.listAfter?.name || null,
            cardId: data.card?.id || null,
            name: data.card?.name || null,
            movedAt: action.date || new Date().toISOString(),
          }
          break
        case 'trello_trigger_comment_added':
          normalizedData = {
            ...filterMeta,
            boardId: data.board?.id || null,
            cardId: data.card?.id || null,
            commentId: action.id || null,
            commentText: data.text || null,
            authorId: action.memberCreator?.id || null,
            authorName: action.memberCreator?.fullName || null,
            createdAt: action.date || new Date().toISOString(),
          }
          break
        case 'trello_trigger_member_changed':
          normalizedData = {
            ...filterMeta,
            boardId: data.board?.id || null,
            cardId: data.card?.id || null,
            action: actionType === 'addMemberToCard' ? 'added' : 'removed',
            memberId: data.idMember || data.idMemberAdded || data.idMemberRemoved || data.member?.id || null,
            memberName: action.member?.fullName || action.memberCreator?.fullName || null,
            changedAt: action.date || new Date().toISOString(),
          }
          break
        case 'trello_trigger_card_archived':
          normalizedData = {
            ...filterMeta,
            boardId: data.board?.id || null,
            cardId: data.card?.id || null,
            name: data.card?.name || null,
            closed: data.card?.closed ?? true,
            archivedAt: action.date || new Date().toISOString(),
          }
          break
        default:
          normalizedData = {
            ...filterMeta,
            boardId: data.board?.id || null,
            cardId: data.card?.id || null,
            actionType,
          }
          break
      }

      const eventId = action.id || envelope.id || requestId

      return {
        eventType,
        normalizedData,
        eventId,
        ignore: false
      }
    }


    default:
      return {
        eventType: `${provider}_trigger_event`,
        normalizedData: rawEvent,
        eventId: (rawEvent && (rawEvent.id || rawEvent.event_id)) || requestId
      }
  }
}
