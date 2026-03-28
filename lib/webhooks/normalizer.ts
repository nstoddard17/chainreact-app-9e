import { logger } from '@/lib/utils/logger'

export interface NormalizedEvent {
  eventType: string
  normalizedData: any
  eventId: string
  ignore?: boolean
}

export function normalizeWebhookEvent(provider: string, rawEvent: any, requestId: string): NormalizedEvent {
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
        logger.info(`[${requestId}] Processing Slack reaction_added event`, {
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
        logger.info(`[${requestId}] Processing Slack reaction_removed event`, {
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


    case 'discord': {
      const envelope = rawEvent || {}
      // Discord gateway sends { t: 'MESSAGE_CREATE', d: { ... } }
      // Or raw message data directly (from bot forwarding)
      const eventName = envelope.t || envelope.type || ''
      const eventPayload = envelope.d || envelope

      // MESSAGE_CREATE → discord_trigger_new_message
      if (eventName === 'MESSAGE_CREATE' || eventPayload.content !== undefined) {
        const normalizedData = {
          messageId: eventPayload.id || null,
          content: eventPayload.content || '',
          authorId: eventPayload.author?.id || null,
          authorName: eventPayload.author?.username || null,
          channelId: eventPayload.channel_id || null,
          channelName: eventPayload.channel_name || null,
          guildId: eventPayload.guild_id || null,
          guildName: eventPayload.guild_name || null,
          timestamp: eventPayload.timestamp || new Date().toISOString(),
          attachments: eventPayload.attachments || [],
          mentions: eventPayload.mentions || [],
          // Preserve for trigger filter matching
          channel_id: eventPayload.channel_id || null,
          author: eventPayload.author || null,
          _raw: envelope,
        }

        return {
          eventType: 'discord_trigger_new_message',
          normalizedData,
          eventId: eventPayload.id || requestId,
        }
      }

      // GUILD_MEMBER_ADD → discord_trigger_member_join
      if (eventName === 'GUILD_MEMBER_ADD') {
        const normalizedData = {
          memberId: eventPayload.user?.id || null,
          memberTag: eventPayload.user ? `${eventPayload.user.username}#${eventPayload.user.discriminator || '0'}` : null,
          memberUsername: eventPayload.user?.username || null,
          memberDiscriminator: eventPayload.user?.discriminator || null,
          memberAvatar: eventPayload.user?.avatar || null,
          guildId: eventPayload.guild_id || null,
          guildName: null,
          joinedAt: eventPayload.joined_at || new Date().toISOString(),
          _raw: envelope,
        }

        return {
          eventType: 'discord_trigger_member_join',
          normalizedData,
          eventId: eventPayload.user?.id || requestId,
        }
      }

      // INTERACTION_CREATE → discord_trigger_slash_command
      if (eventName === 'INTERACTION_CREATE' && eventPayload.type === 2) {
        const normalizedData = {
          commandName: eventPayload.data?.name || null,
          commandId: eventPayload.data?.id || null,
          userId: eventPayload.member?.user?.id || eventPayload.user?.id || null,
          userName: eventPayload.member?.user?.username || eventPayload.user?.username || null,
          channelId: eventPayload.channel_id || null,
          guildId: eventPayload.guild_id || null,
          options: eventPayload.data?.options || [],
          _raw: envelope,
        }

        return {
          eventType: 'discord_trigger_slash_command',
          normalizedData,
          eventId: eventPayload.id || requestId,
        }
      }

      // Fallback for unknown Discord events
      return {
        eventType: 'discord_trigger_event',
        normalizedData: rawEvent,
        eventId: (rawEvent && (rawEvent.id || rawEvent.event_id)) || requestId,
      }
    }

    case 'facebook': {
      const fbEvent = rawEvent || {}
      // Facebook sends: { object: 'page', entry: [{ id, changes: [{ field, value }] }] }
      const entries = fbEvent.entry || []
      if (entries.length === 0) {
        return {
          eventType: 'facebook_trigger_event',
          normalizedData: fbEvent,
          eventId: requestId,
        }
      }

      const firstEntry = entries[0]
      const firstChange = (firstEntry.changes || [])[0] || {}
      const item = firstChange.value?.item || ''
      const pageId = firstEntry.id

      let eventType = 'facebook_trigger_event'
      if (item === 'post' || item === 'status' || item === 'photo' || item === 'video' || item === 'share') {
        eventType = 'facebook_trigger_new_post'
      } else if (item === 'comment') {
        eventType = 'facebook_trigger_new_comment'
      }

      const normalizedData = {
        pageId,
        postId: firstChange.value?.post_id || null,
        message: firstChange.value?.message || null,
        from: firstChange.value?.from || null,
        createdTime: firstChange.value?.created_time || new Date().toISOString(),
        item,
        commentId: firstChange.value?.comment_id || null,
        _raw: fbEvent,
      }

      return {
        eventType,
        normalizedData,
        eventId: firstChange.value?.post_id || firstChange.value?.comment_id || requestId,
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
