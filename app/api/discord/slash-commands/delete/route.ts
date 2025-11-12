/**
 * Discord Slash Command Deletion API
 * Deletes guild-specific slash commands
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server';

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { guildId, commandName, integrationId } = body;

    // Validate required fields
    if (!guildId || !commandName || !integrationId) {
      return NextResponse.json(
        { error: 'Missing required fields: guildId, commandName, integrationId' },
        { status: 400 }
      );
    }

    logger.info('[Discord Slash Commands] Deleting guild-specific command', {
      guildId,
      commandName
    });

    // Get user from session
    const supabase = await createSupabaseRouteHandlerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      logger.error('[Discord Slash Commands] Unauthorized - no user session', { error: userError });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get integration to verify ownership
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .eq('user_id', user.id)
      .eq('provider', 'discord')
      .single();

    if (integrationError || !integration) {
      logger.error('[Discord Slash Commands] Integration not found or unauthorized', {
        integrationId,
        userId: user.id,
        error: integrationError
      });
      return NextResponse.json(
        { error: 'Discord integration not found or you do not have permission' },
        { status: 404 }
      );
    }

    // Get Discord application ID and bot token
    const clientId = process.env.DISCORD_CLIENT_ID;
    const botToken = process.env.DISCORD_BOT_TOKEN;

    if (!clientId || !botToken) {
      logger.error('[Discord Slash Commands] Missing Discord credentials in environment');
      return NextResponse.json(
        { error: 'Discord bot configuration missing' },
        { status: 500 }
      );
    }

    // First, fetch all commands for this guild to find the command ID
    const listUrl = `https://discord.com/api/v10/applications/${clientId}/guilds/${guildId}/commands`;

    logger.debug('[Discord Slash Commands] Fetching commands to find command ID', {
      url: listUrl,
      commandName
    });

    const listResponse = await fetch(listUrl, {
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json',
      }
    });

    if (!listResponse.ok) {
      const errorData = await listResponse.json();
      logger.error('[Discord Slash Commands] Failed to fetch commands', {
        status: listResponse.status,
        error: errorData
      });

      return NextResponse.json(
        { error: `Failed to fetch commands: ${errorData.message || 'Unknown error'}` },
        { status: listResponse.status }
      );
    }

    const commands = await listResponse.json();
    const commandToDelete = commands.find((cmd: any) => cmd.name === commandName);

    if (!commandToDelete) {
      logger.warn('[Discord Slash Commands] Command not found', {
        commandName,
        guildId,
        availableCommands: commands.map((c: any) => c.name)
      });

      return NextResponse.json(
        { error: `Command "${commandName}" not found in this server` },
        { status: 404 }
      );
    }

    // Delete the command
    const deleteUrl = `https://discord.com/api/v10/applications/${clientId}/guilds/${guildId}/commands/${commandToDelete.id}`;

    logger.debug('[Discord Slash Commands] Deleting command', {
      url: deleteUrl,
      commandId: commandToDelete.id,
      commandName
    });

    const deleteResponse = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json',
      }
    });

    if (!deleteResponse.ok) {
      const errorData = await deleteResponse.json();
      logger.error('[Discord Slash Commands] Discord API error deleting command', {
        status: deleteResponse.status,
        error: errorData
      });

      if (deleteResponse.status === 403) {
        return NextResponse.json(
          { error: 'Bot does not have permission to delete commands in this server' },
          { status: 403 }
        );
      }

      return NextResponse.json(
        { error: `Discord API error: ${errorData.message || 'Unknown error'}` },
        { status: deleteResponse.status }
      );
    }

    logger.info('[Discord Slash Commands] Command deleted successfully', {
      commandId: commandToDelete.id,
      commandName,
      guildId
    });

    return NextResponse.json({
      success: true,
      message: `Command "${commandName}" deleted successfully`
    });

  } catch (error: any) {
    logger.error('[Discord Slash Commands] Unexpected error deleting command', {
      message: error?.message,
      stack: error?.stack
    });

    return NextResponse.json(
      { error: 'Failed to delete slash command' },
      { status: 500 }
    );
  }
}
