/**
 * Discord Slash Command Check API
 * Checks if a slash command exists in a guild
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const guildId = searchParams.get('guildId');
    const commandName = searchParams.get('commandName');
    const integrationId = searchParams.get('integrationId');

    // Validate required fields
    if (!guildId || !commandName || !integrationId) {
      return NextResponse.json(
        { error: 'Missing required parameters: guildId, commandName, integrationId' },
        { status: 400 }
      );
    }

    logger.debug('[Discord Slash Commands] Checking if command exists', {
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

    // Fetch all commands for this guild
    const listUrl = `https://discord.com/api/v10/applications/${clientId}/guilds/${guildId}/commands`;

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

      // Don't throw error - return exists: false for permission issues
      if (listResponse.status === 403) {
        logger.warn('[Discord Slash Commands] Bot lacks permission to view commands in guild', {
          guildId
        });
        return NextResponse.json({
          exists: false,
          reason: 'permission_denied'
        });
      }

      return NextResponse.json(
        { error: `Failed to fetch commands: ${errorData.message || 'Unknown error'}` },
        { status: listResponse.status }
      );
    }

    const commands = await listResponse.json();
    const commandExists = commands.some((cmd: any) => cmd.name === commandName);

    logger.debug('[Discord Slash Commands] Check result', {
      commandName,
      guildId,
      exists: commandExists,
      totalCommands: commands.length
    });

    return NextResponse.json({
      exists: commandExists,
      command: commandExists ? commands.find((cmd: any) => cmd.name === commandName) : null
    });

  } catch (error: any) {
    logger.error('[Discord Slash Commands] Unexpected error checking command', {
      message: error?.message,
      stack: error?.stack
    });

    return NextResponse.json(
      { error: 'Failed to check slash command' },
      { status: 500 }
    );
  }
}
