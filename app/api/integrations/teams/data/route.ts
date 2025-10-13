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
        // Fetch all chats the user is part of
        const chatsResponse = await fetch('https://graph.microsoft.com/v1.0/me/chats', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (!chatsResponse.ok) {
          throw new Error(`Failed to fetch chats: ${chatsResponse.statusText}`);
        }

        const chatsData = await chatsResponse.json();
        responseData = (chatsData.value || []).map((chat: any) => ({
          value: chat.id,
          label: chat.topic || `Chat with ${chat.chatType}`,
          description: `Type: ${chat.chatType}`
        }));
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
    const { integrationId, dataType, params = {} } = body;

    console.log('[Teams Data API] POST request received:', { integrationId, dataType, params, fullBody: body });

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
        const { teamId } = params;
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
        // Fetch all chats the user is part of
        const chatsResponse = await fetch('https://graph.microsoft.com/v1.0/me/chats', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (!chatsResponse.ok) {
          throw new Error(`Failed to fetch chats: ${chatsResponse.statusText}`);
        }

        const chatsData = await chatsResponse.json();
        responseData = (chatsData.value || []).map((chat: any) => ({
          value: chat.id,
          label: chat.topic || `Chat with ${chat.chatType}`,
          description: `Type: ${chat.chatType}`
        }));
        break;

      case 'teams_members':
        // Fetch members of a specific team
        const { teamId: memberTeamId } = params;
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

      default:
        console.error('[Teams Data API] Unknown data type:', dataType);
        return errorResponse(
          `Unknown data type: ${dataType}`,
          400,
          { validTypes: ['teams_teams', 'teams_channels', 'teams_chats', 'teams_members', 'teams_users'] }
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