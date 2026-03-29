/**
 * Microsoft Teams data handler map for the dynamic data route registry.
 *
 * All handlers receive pre-decrypted tokens (tokenDecryption: 'decrypt-with-key').
 * Handlers must NOT import or call decryption utilities.
 *
 * Extracted from the legacy teams/data/route.ts inline switch statement.
 */

import type { DataHandler } from '@/lib/integrations/data-handler-registry'
import { logger } from '@/lib/utils/logger'

async function graphFetch(url: string, accessToken: string, options?: RequestInit) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!response.ok) {
    throw new Error(`Microsoft Graph API error: ${response.statusText}`)
  }
  return response.json()
}

async function getCurrentUserId(accessToken: string): Promise<string | null> {
  try {
    const data = await graphFetch('https://graph.microsoft.com/v1.0/me', accessToken)
    return data.id ?? null
  } catch {
    return null
  }
}

async function getCurrentUserEmail(accessToken: string): Promise<string | null> {
  try {
    const data = await graphFetch('https://graph.microsoft.com/v1.0/me', accessToken)
    return data.mail || data.userPrincipalName || null
  } catch {
    return null
  }
}

export const teamsHandlers: Record<string, DataHandler> = {
  'teams_teams': async (integration) => {
    const data = await graphFetch(
      'https://graph.microsoft.com/v1.0/me/joinedTeams',
      integration.access_token
    )
    return (data.value || []).map((team: any) => ({
      value: team.id,
      label: team.displayName,
      description: team.description,
    }))
  },

  'teams_channels': async (integration, options) => {
    const teamId = options?.teamId
    if (!teamId) {
      throw new Error('Team ID is required for fetching channels')
    }
    const data = await graphFetch(
      `https://graph.microsoft.com/v1.0/teams/${teamId}/channels`,
      integration.access_token
    )
    return (data.value || []).map((channel: any) => ({
      value: channel.id,
      label: channel.displayName,
      description: channel.description,
    }))
  },

  'teams_chats': async (integration) => {
    const data = await graphFetch(
      'https://graph.microsoft.com/v1.0/me/chats?$expand=members&$top=50',
      integration.access_token
    )
    const currentUserId = await getCurrentUserId(integration.access_token)

    return (data.value || []).map((chat: any) => {
      let label = chat.topic
      if (!label && chat.members?.length > 0) {
        const otherMembers = chat.members
          .filter((m: any) => m.userId !== currentUserId)
          .map((m: any) => m.displayName)
          .filter(Boolean)
        label = otherMembers.length > 0
          ? otherMembers.join(', ')
          : (chat.chatType === 'oneOnOne' ? 'Direct Message' : 'Group Chat')
      }
      if (!label) {
        label = chat.chatType === 'oneOnOne' ? 'Direct Message' : 'Group Chat'
      }
      return { value: chat.id, label, description: `Type: ${chat.chatType}` }
    })
  },

  'teams_members': async (integration, options) => {
    const teamId = options?.teamId
    if (!teamId) {
      throw new Error('Team ID is required for fetching members')
    }
    const data = await graphFetch(
      `https://graph.microsoft.com/v1.0/teams/${teamId}/members`,
      integration.access_token
    )
    return (data.value || []).map((member: any) => ({
      value: member.userId,
      label: member.displayName,
      description: member.email,
    }))
  },

  'teams_users': async (integration) => {
    const data = await graphFetch(
      'https://graph.microsoft.com/v1.0/users?$top=100',
      integration.access_token
    )
    return (data.value || []).map((user: any) => ({
      value: user.id,
      label: user.displayName,
      description: user.mail || user.userPrincipalName,
    }))
  },

  'teams_messages': async (integration, options) => {
    const { chatId, teamId, channelId, ownMessagesOnly } = options || {}

    let endpoint: string
    if (chatId) {
      endpoint = `https://graph.microsoft.com/v1.0/chats/${chatId}/messages?$top=25&$orderby=createdDateTime desc`
    } else if (teamId && channelId) {
      endpoint = `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/messages?$top=25`
    } else {
      throw new Error('Either chatId or both teamId and channelId are required for fetching messages')
    }

    let currentUserId: string | null = null
    if (ownMessagesOnly) {
      currentUserId = await getCurrentUserId(integration.access_token)
    }

    const data = await graphFetch(endpoint, integration.access_token)

    return (data.value || [])
      .filter((msg: any) => {
        if (msg.messageType !== 'message') return false
        if (msg.deletedDateTime) return false
        if (ownMessagesOnly && currentUserId && msg.from?.user?.id !== currentUserId) return false
        return true
      })
      .map((msg: any) => {
        let content = msg.body?.content || ''
        content = content.replace(/<[^>]*>/g, '').trim()
        if (content.length > 50) content = content.substring(0, 50) + '...'

        const senderName = msg.from?.user?.displayName || msg.from?.application?.displayName || 'Unknown'
        const timestamp = msg.createdDateTime ? new Date(msg.createdDateTime).toLocaleString() : ''

        return {
          value: msg.id,
          label: content || '[No text content]',
          description: `From: ${senderName} • ${timestamp}`,
        }
      })
  },

  'teams_messages_own': async (integration, options) => {
    const { chatId, teamId, channelId } = options || {}

    let endpoint: string
    if (chatId) {
      endpoint = `https://graph.microsoft.com/v1.0/chats/${chatId}/messages?$top=25&$orderby=createdDateTime desc`
    } else if (teamId && channelId) {
      endpoint = `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/messages?$top=25`
    } else {
      throw new Error('Either chatId or both teamId and channelId are required for fetching messages')
    }

    const currentUserId = await getCurrentUserId(integration.access_token)
    const data = await graphFetch(endpoint, integration.access_token)

    return (data.value || [])
      .filter((msg: any) => {
        if (msg.messageType !== 'message') return false
        if (msg.deletedDateTime) return false
        if (currentUserId && msg.from?.user?.id !== currentUserId) return false
        return true
      })
      .map((msg: any) => {
        let content = msg.body?.content || ''
        content = content.replace(/<[^>]*>/g, '').trim()
        if (content.length > 50) content = content.substring(0, 50) + '...'

        const timestamp = msg.createdDateTime ? new Date(msg.createdDateTime).toLocaleString() : ''

        return {
          value: msg.id,
          label: content || '[No text content]',
          description: `Sent: ${timestamp}`,
        }
      })
  },

  'teams_online_meetings': async (integration) => {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const endOfFuture = new Date(now.getFullYear(), now.getMonth() + 3, now.getDate())

    const currentUserEmail = await getCurrentUserEmail(integration.access_token)

    const endpoint = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${startOfToday.toISOString()}&endDateTime=${endOfFuture.toISOString()}&$top=100&$select=id,subject,start,end,organizer,onlineMeeting,isOnlineMeeting&$orderby=start/dateTime`

    const data = await graphFetch(endpoint, integration.access_token, {
      headers: { 'Prefer': 'outlook.timezone="UTC"' },
    })

    const results: any[] = []
    for (const event of data.value || []) {
      const hasOnlineMeeting = event.isOnlineMeeting || event.onlineMeeting?.joinWebUrl
      if (!hasOnlineMeeting) continue

      const organizerEmail = event.organizer?.emailAddress?.address?.toLowerCase()
      const isOrganizer = organizerEmail === currentUserEmail?.toLowerCase()
      const startTime = event.start?.dateTime ? new Date(event.start.dateTime).toLocaleString() : ''
      const organizerInfo = isOrganizer
        ? '(You organized)'
        : `(Org: ${event.organizer?.emailAddress?.name || organizerEmail || 'Unknown'})`

      results.push({
        value: JSON.stringify({
          eventId: event.id,
          joinWebUrl: event.onlineMeeting?.joinWebUrl || '',
          subject: event.subject,
          isOrganizer,
        }),
        label: event.subject || 'Untitled Meeting',
        description: `${startTime} ${organizerInfo}`,
      })
    }
    return results
  },

  'outlook-enhanced-recipients': async (integration, options) => {
    const recipients: any[] = []

    // Fetch organization users
    try {
      const orgData = await graphFetch(
        'https://graph.microsoft.com/v1.0/users?$top=100&$select=id,displayName,mail,userPrincipalName',
        integration.access_token
      )
      for (const user of orgData.value || []) {
        const email = user.mail || user.userPrincipalName
        if (email) {
          recipients.push({ value: email, label: user.displayName || email, email, description: email })
        }
      }
    } catch (e) {
      logger.debug('[Teams] Error fetching organization users:', e)
    }

    // Fetch contacts
    try {
      const contactsData = await graphFetch(
        'https://graph.microsoft.com/v1.0/me/contacts?$top=100&$select=id,displayName,emailAddresses',
        integration.access_token
      )
      for (const contact of contactsData.value || []) {
        if (contact.emailAddresses?.length > 0) {
          const email = contact.emailAddresses[0].address
          if (email && !recipients.find((r: any) => r.email === email)) {
            recipients.push({ value: email, label: contact.displayName || email, email, description: email })
          }
        }
      }
    } catch {
      // Contacts API may fail without permission — acceptable
    }

    // Client-side search filter
    if (options?.search) {
      const searchLower = options.search.toLowerCase()
      return recipients.filter((r: any) =>
        r.label.toLowerCase().includes(searchLower) ||
        r.email.toLowerCase().includes(searchLower)
      )
    }
    return recipients
  },
}
