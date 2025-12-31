import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOAuthConfig, getOAuthClientCredentials } from '@/lib/integrations/oauthConfig';
import { jsonResponse, errorResponse } from '@/lib/utils/api-response';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const integrationId = searchParams.get('integrationId');
    const type = searchParams.get('type');
    const teamId = searchParams.get('teamId');

    if (!integrationId) {
      return errorResponse('Integration ID is required', 400);
    }

    if (!type) {
      return errorResponse('Type is required', 400);
    }

    const supabase = createAdminClient();

    // Fetch the integration
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .single();

    if (integrationError || !integration) {
      return errorResponse('Integration not found', 404);
    }

    // Validate integration status
    if (integration.status !== 'connected') {
      return errorResponse('Teams integration is not connected. Please reconnect your account.', 400, {
        needsReconnection: true,
        currentStatus: integration.status
      });
    }

    // Decrypt access token
    const { decrypt } = await import('@/lib/security/encryption');
    const accessToken = integration.access_token ? await decrypt(integration.access_token) : null;

    if (!accessToken) {
      return errorResponse('No access token available', 401);
    }

    let responseData: any[] = [];

    switch (type) {
      case 'teams_teams':
        // Fetch all teams the user is a member of
        const teamsResponse = await fetch('https://graph.microsoft.com/v1.0/me/joinedTeams', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (!teamsResponse.ok) {
          throw new Error(`Failed to fetch teams: ${teamsResponse.statusText}`);
        }

        const teamsData = await teamsResponse.json();
        responseData = (teamsData.value || []).map((team: any) => ({
          value: team.id,
          label: team.displayName,
          description: team.description
        }));
        break;

      case 'teams_channels':
        // Fetch channels for a specific team
        if (!teamId) {
          return errorResponse('Team ID is required for fetching channels', 400);
        }

        const channelsResponse = await fetch(`https://graph.microsoft.com/v1.0/teams/${teamId}/channels`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (!channelsResponse.ok) {
          throw new Error(`Failed to fetch channels: ${channelsResponse.statusText}`);
        }

        const channelsData = await channelsResponse.json();
        responseData = (channelsData.value || []).map((channel: any) => ({
          value: channel.id,
          label: channel.displayName,
          description: channel.description
        }));
        break;

      case 'teams_chats':
        // Fetch all chats with members expanded to get participant names
        const chatsResponse = await fetch('https://graph.microsoft.com/v1.0/me/chats?$expand=members&$top=50', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (!chatsResponse.ok) {
          throw new Error(`Failed to fetch chats: ${chatsResponse.statusText}`);
        }

        // Get current user to filter them out of member lists
        const meResponseForChats = await fetch('https://graph.microsoft.com/v1.0/me', {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        const currentUserForChats = meResponseForChats.ok ? await meResponseForChats.json() : null;
        const currentUserIdForChats = currentUserForChats?.id;

        const chatsData = await chatsResponse.json();
        responseData = (chatsData.value || []).map((chat: any) => {
          // For 1:1 chats, show the other person's name
          // For group chats, show the topic or list of members
          let label = chat.topic;

          if (!label && chat.members && chat.members.length > 0) {
            // Filter out current user and get other members' names
            const otherMembers = chat.members
              .filter((m: any) => m.userId !== currentUserIdForChats)
              .map((m: any) => m.displayName)
              .filter(Boolean);

            if (otherMembers.length > 0) {
              label = otherMembers.join(', ');
            } else {
              label = chat.chatType === 'oneOnOne' ? 'Direct Message' : 'Group Chat';
            }
          }

          if (!label) {
            label = chat.chatType === 'oneOnOne' ? 'Direct Message' : 'Group Chat';
          }

          return {
            value: chat.id,
            label: label,
            description: `Type: ${chat.chatType}`
          };
        });
        break;

      default:
        return errorResponse(`Unknown data type: ${type}`, 400);
    }

    return jsonResponse(responseData);
  } catch (error: any) {
    return errorResponse(
      error.message || 'Failed to load Teams data',
      500,
      { details: error.toString() }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Accept both 'params' and 'options' for compatibility with different callers
    const { integrationId, dataType, params = {}, options = {} } = body;
    const mergedParams = { ...params, ...options };

    console.log('[Teams Data API] POST request received:', { integrationId, dataType, params: mergedParams, fullBody: body });

    if (!integrationId) {
      return errorResponse('Integration ID is required', 400);
    }

    if (!dataType) {
      return errorResponse('Data type is required', 400);
    }

    const supabase = createAdminClient();

    // Fetch the integration
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .single();

    if (integrationError || !integration) {
      return errorResponse('Integration not found', 404);
    }

    // Validate integration status
    if (integration.status !== 'connected') {
      return errorResponse('Teams integration is not connected. Please reconnect your account.', 400, {
        needsReconnection: true,
        currentStatus: integration.status
      });
    }

    // Decrypt access token
    const { decrypt } = await import('@/lib/security/encryption');
    const accessToken = integration.access_token ? await decrypt(integration.access_token) : null;

    if (!accessToken) {
      return errorResponse('No access token available', 401);
    }

    let responseData: any[] = [];

    switch (dataType) {
      case 'teams_teams':
        // Fetch all teams the user is a member of
        const teamsResponse = await fetch('https://graph.microsoft.com/v1.0/me/joinedTeams', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (!teamsResponse.ok) {
          throw new Error(`Failed to fetch teams: ${teamsResponse.statusText}`);
        }

        const teamsData = await teamsResponse.json();
        responseData = (teamsData.value || []).map((team: any) => ({
          value: team.id,
          label: team.displayName,
          description: team.description
        }));
        break;

      case 'teams_channels':
        // Fetch channels for a specific team
        const { teamId } = mergedParams;
        if (!teamId) {
          return errorResponse('Team ID is required for fetching channels', 400);
        }

        const channelsResponse = await fetch(`https://graph.microsoft.com/v1.0/teams/${teamId}/channels`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (!channelsResponse.ok) {
          throw new Error(`Failed to fetch channels: ${channelsResponse.statusText}`);
        }

        const channelsData = await channelsResponse.json();
        responseData = (channelsData.value || []).map((channel: any) => ({
          value: channel.id,
          label: channel.displayName,
          description: channel.description
        }));
        break;

      case 'teams_chats':
        // Fetch all chats with members expanded to get participant names
        const postChatsResponse = await fetch('https://graph.microsoft.com/v1.0/me/chats?$expand=members&$top=50', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (!postChatsResponse.ok) {
          throw new Error(`Failed to fetch chats: ${postChatsResponse.statusText}`);
        }

        // Get current user to filter them out of member lists
        const postMeResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        const postCurrentUser = postMeResponse.ok ? await postMeResponse.json() : null;
        const postCurrentUserId = postCurrentUser?.id;

        const postChatsData = await postChatsResponse.json();
        responseData = (postChatsData.value || []).map((chat: any) => {
          // For 1:1 chats, show the other person's name
          // For group chats, show the topic or list of members
          let label = chat.topic;

          if (!label && chat.members && chat.members.length > 0) {
            // Filter out current user and get other members' names
            const otherMembers = chat.members
              .filter((m: any) => m.userId !== postCurrentUserId)
              .map((m: any) => m.displayName)
              .filter(Boolean);

            if (otherMembers.length > 0) {
              label = otherMembers.join(', ');
            } else {
              label = chat.chatType === 'oneOnOne' ? 'Direct Message' : 'Group Chat';
            }
          }

          if (!label) {
            label = chat.chatType === 'oneOnOne' ? 'Direct Message' : 'Group Chat';
          }

          return {
            value: chat.id,
            label: label,
            description: `Type: ${chat.chatType}`
          };
        });
        break;

      case 'teams_members':
        // Fetch members of a specific team
        const { teamId: memberTeamId } = mergedParams;
        if (!memberTeamId) {
          return errorResponse('Team ID is required for fetching members', 400);
        }

        const membersResponse = await fetch(`https://graph.microsoft.com/v1.0/teams/${memberTeamId}/members`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (!membersResponse.ok) {
          throw new Error(`Failed to fetch team members: ${membersResponse.statusText}`);
        }

        const membersData = await membersResponse.json();
        responseData = (membersData.value || []).map((member: any) => ({
          value: member.userId,
          label: member.displayName,
          description: member.email
        }));
        break;

      case 'teams_users':
        // Fetch users in the organization
        const usersResponse = await fetch('https://graph.microsoft.com/v1.0/users?$top=100', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (!usersResponse.ok) {
          throw new Error(`Failed to fetch users: ${usersResponse.statusText}`);
        }

        const usersData = await usersResponse.json();
        responseData = (usersData.value || []).map((user: any) => ({
          value: user.id,
          label: user.displayName,
          description: user.mail || user.userPrincipalName
        }));
        break;

      case 'teams_messages':
        // Fetch recent messages from a chat or channel
        const { chatId: msgChatId, teamId: msgTeamId, channelId: msgChannelId, ownMessagesOnly } = mergedParams;

        let messagesEndpoint: string;
        if (msgChatId) {
          // Fetch messages from a chat
          messagesEndpoint = `https://graph.microsoft.com/v1.0/chats/${msgChatId}/messages?$top=25&$orderby=createdDateTime desc`;
        } else if (msgTeamId && msgChannelId) {
          // Fetch messages from a channel
          messagesEndpoint = `https://graph.microsoft.com/v1.0/teams/${msgTeamId}/channels/${msgChannelId}/messages?$top=25`;
        } else {
          return errorResponse('Either chatId or both teamId and channelId are required for fetching messages', 400);
        }

        // Get current user ID if we need to filter to own messages only
        let currentUserId: string | null = null;
        if (ownMessagesOnly) {
          const meResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });
          if (meResponse.ok) {
            const meData = await meResponse.json();
            currentUserId = meData.id;
          }
        }

        const messagesResponse = await fetch(messagesEndpoint, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (!messagesResponse.ok) {
          const errorText = await messagesResponse.text();
          console.error('[Teams Data API] Failed to fetch messages:', errorText);
          throw new Error(`Failed to fetch messages: ${messagesResponse.statusText}`);
        }

        const messagesData = await messagesResponse.json();
        responseData = (messagesData.value || [])
          .filter((msg: any) => {
            // Filter out system messages
            if (msg.messageType !== 'message') return false;
            // Filter out deleted messages
            if (msg.deletedDateTime) return false;
            // If ownMessagesOnly is set, filter to only current user's messages
            if (ownMessagesOnly && currentUserId && msg.from?.user?.id !== currentUserId) return false;
            return true;
          })
          .map((msg: any) => {
            // Extract plain text from HTML content
            let content = msg.body?.content || '';
            // Remove HTML tags for display
            content = content.replace(/<[^>]*>/g, '').trim();
            // Truncate long messages
            if (content.length > 50) {
              content = content.substring(0, 50) + '...';
            }

            const senderName = msg.from?.user?.displayName || msg.from?.application?.displayName || 'Unknown';
            const timestamp = msg.createdDateTime ? new Date(msg.createdDateTime).toLocaleString() : '';

            return {
              value: msg.id,
              label: content || '[No text content]',
              description: `From: ${senderName} • ${timestamp}`
            };
          });
        break;

      case 'outlook-enhanced-recipients':
        // Support for email autocomplete in Teams meetings
        // Fetches organization users and contacts for attendee selection
        const { search: recipientSearch } = mergedParams;
        const recipients: any[] = [];

        // Fetch organization users - don't use $filter as it requires specific permissions
        // Instead fetch all and filter client-side
        try {
          const orgUsersResponse = await fetch(
            'https://graph.microsoft.com/v1.0/users?$top=100&$select=id,displayName,mail,userPrincipalName',
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            }
          );

          if (orgUsersResponse.ok) {
            const orgUsersData = await orgUsersResponse.json();
            for (const user of orgUsersData.value || []) {
              const email = user.mail || user.userPrincipalName;
              if (email) {
                recipients.push({
                  value: email,
                  label: user.displayName || email,
                  email: email,
                  description: email
                });
              }
            }
          } else {
            const errorText = await orgUsersResponse.text();
            console.error('[Teams Data API] Error fetching organization users:', orgUsersResponse.status, errorText);
          }
        } catch (e) {
          console.error('[Teams Data API] Exception fetching organization users:', e);
        }

        // Fetch contacts - don't use $filter to avoid permission issues
        try {
          const contactsResponse = await fetch(
            'https://graph.microsoft.com/v1.0/me/contacts?$top=100&$select=id,displayName,emailAddresses',
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            }
          );

          if (contactsResponse.ok) {
            const contactsData = await contactsResponse.json();
            for (const contact of contactsData.value || []) {
              if (contact.emailAddresses && contact.emailAddresses.length > 0) {
                const email = contact.emailAddresses[0].address;
                if (email && !recipients.find(r => r.email === email)) {
                  recipients.push({
                    value: email,
                    label: contact.displayName || email,
                    email: email,
                    description: email
                  });
                }
              }
            }
          } else {
            // Contacts API might fail if user doesn't have Contacts.Read permission - that's OK
            console.log('[Teams Data API] Could not fetch contacts (may not have permission)');
          }
        } catch (e) {
          console.error('[Teams Data API] Exception fetching contacts:', e);
        }

        // Filter by search if provided (client-side filtering)
        if (recipientSearch) {
          const searchLower = recipientSearch.toLowerCase();
          responseData = recipients.filter(r =>
            r.label.toLowerCase().includes(searchLower) ||
            r.email.toLowerCase().includes(searchLower)
          );
        } else {
          responseData = recipients;
        }
        break;

      case 'teams_messages_own':
        // Fetch only the current user's messages (for edit/delete actions)
        // This is the same as teams_messages but with ownMessagesOnly=true
        const { chatId: ownMsgChatId, teamId: ownMsgTeamId, channelId: ownMsgChannelId } = mergedParams;

        let ownMessagesEndpoint: string;
        if (ownMsgChatId) {
          ownMessagesEndpoint = `https://graph.microsoft.com/v1.0/chats/${ownMsgChatId}/messages?$top=25&$orderby=createdDateTime desc`;
        } else if (ownMsgTeamId && ownMsgChannelId) {
          ownMessagesEndpoint = `https://graph.microsoft.com/v1.0/teams/${ownMsgTeamId}/channels/${ownMsgChannelId}/messages?$top=25`;
        } else {
          return errorResponse('Either chatId or both teamId and channelId are required for fetching messages', 400);
        }

        // Get current user ID to filter to own messages only
        const ownMeResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        let ownCurrentUserId: string | null = null;
        if (ownMeResponse.ok) {
          const ownMeData = await ownMeResponse.json();
          ownCurrentUserId = ownMeData.id;
        }

        const ownMessagesResponse = await fetch(ownMessagesEndpoint, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (!ownMessagesResponse.ok) {
          const errorText = await ownMessagesResponse.text();
          console.error('[Teams Data API] Failed to fetch own messages:', errorText);
          throw new Error(`Failed to fetch messages: ${ownMessagesResponse.statusText}`);
        }

        const ownMessagesData = await ownMessagesResponse.json();
        responseData = (ownMessagesData.value || [])
          .filter((msg: any) => {
            // Filter out system messages
            if (msg.messageType !== 'message') return false;
            // Filter out deleted messages
            if (msg.deletedDateTime) return false;
            // Only include messages sent by the current user
            if (ownCurrentUserId && msg.from?.user?.id !== ownCurrentUserId) return false;
            return true;
          })
          .map((msg: any) => {
            let content = msg.body?.content || '';
            content = content.replace(/<[^>]*>/g, '').trim();
            if (content.length > 50) {
              content = content.substring(0, 50) + '...';
            }

            const timestamp = msg.createdDateTime ? new Date(msg.createdDateTime).toLocaleString() : '';

            return {
              value: msg.id,
              label: content || '[No text content]',
              description: `Sent: ${timestamp}`
            };
          });
        break;

      case 'teams_online_meetings':
        // Fetch online meetings that the user organized (can end/update these)
        // Use calendarView endpoint which properly supports date range queries
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfFuture = new Date(now.getFullYear(), now.getMonth() + 3, now.getDate()); // 3 months out

        // Get current user email to check organizer
        const meetingMeResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        let meetingCurrentUserEmail: string | null = null;
        if (meetingMeResponse.ok) {
          const meetingMeData = await meetingMeResponse.json();
          meetingCurrentUserEmail = meetingMeData.mail || meetingMeData.userPrincipalName;
          console.log('[Teams Data API] Current user email:', meetingCurrentUserEmail);
        }

        // Use calendarView endpoint which supports startDateTime and endDateTime as query params
        const calendarViewEndpoint = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${startOfToday.toISOString()}&endDateTime=${endOfFuture.toISOString()}&$top=100&$select=id,subject,start,end,organizer,onlineMeeting,isOnlineMeeting&$orderby=start/dateTime`;

        console.log('[Teams Data API] Fetching calendar events:', calendarViewEndpoint);

        const eventsResponse = await fetch(calendarViewEndpoint, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'outlook.timezone="UTC"'
          }
        });

        if (!eventsResponse.ok) {
          const errorText = await eventsResponse.text();
          console.error('[Teams Data API] Failed to fetch online meetings:', errorText);
          throw new Error(`Failed to fetch online meetings: ${eventsResponse.statusText}`);
        }

        const eventsData = await eventsResponse.json();
        console.log('[Teams Data API] Total events found:', eventsData.value?.length || 0);

        // Log first few events for debugging
        if (eventsData.value?.length > 0) {
          eventsData.value.slice(0, 3).forEach((evt: any, idx: number) => {
            console.log(`[Teams Data API] Event ${idx}:`, {
              subject: evt.subject,
              isOnlineMeeting: evt.isOnlineMeeting,
              hasJoinUrl: !!evt.onlineMeeting?.joinWebUrl,
              organizer: evt.organizer?.emailAddress?.address
            });
          });
        }

        // Filter to online meetings - be more lenient with the filter
        // Include meetings where:
        // 1. isOnlineMeeting is true OR onlineMeeting.joinWebUrl exists
        // 2. User is the organizer (they can modify/cancel)
        responseData = [];
        for (const event of eventsData.value || []) {
          // Check if it's an online meeting (either flag is set or join URL exists)
          const hasOnlineMeeting = event.isOnlineMeeting || event.onlineMeeting?.joinWebUrl;
          if (!hasOnlineMeeting) continue;

          // Check if user is the organizer
          const organizerEmail = event.organizer?.emailAddress?.address?.toLowerCase();
          const isOrganizer = organizerEmail === meetingCurrentUserEmail?.toLowerCase();

          // For now, show all online meetings the user has access to (not just organized)
          // The API will reject operations they don't have permission for
          const startTime = event.start?.dateTime ? new Date(event.start.dateTime).toLocaleString() : '';
          const organizerInfo = isOrganizer ? '(You organized)' : `(Org: ${event.organizer?.emailAddress?.name || organizerEmail || 'Unknown'})`;

          responseData.push({
            value: JSON.stringify({
              eventId: event.id,
              joinWebUrl: event.onlineMeeting?.joinWebUrl || '',
              subject: event.subject,
              isOrganizer
            }),
            label: event.subject || 'Untitled Meeting',
            description: `${startTime} ${organizerInfo}`
          });
        }

        console.log('[Teams Data API] Online meetings found:', responseData.length);
        break;

      default:
        console.error('[Teams Data API] Unknown data type:', dataType);
        return errorResponse(
          `Unknown data type: ${dataType}`,
          400,
          { validTypes: ['teams_teams', 'teams_channels', 'teams_chats', 'teams_members', 'teams_users', 'teams_messages', 'teams_messages_own', 'teams_online_meetings', 'outlook-enhanced-recipients'] }
        );
    }

    return jsonResponse({ data: responseData });
  } catch (error: any) {
    console.error('[Teams Data API] Error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to load Teams data',
      details: error.toString()
    }, { status: 500 });
  }
}