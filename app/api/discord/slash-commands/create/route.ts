/**
 * Discord Slash Command Creation API
 * Creates guild-specific slash commands for Discord workflows
 * IMPORTANT: Only creates GUILD-SPECIFIC commands, never global commands
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { guildId, commandName, description, options = [], integrationId } = body;

    // Validate required fields
    if (!guildId || !commandName || !description || !integrationId) {
      return NextResponse.json(
        { error: 'Missing required fields: guildId, commandName, description, integrationId' },
        { status: 400 }
      );
    }

    // Validate command name (Discord rules)
    if (!/^[a-z0-9_-]{1,32}$/.test(commandName)) {
      return NextResponse.json(
        { error: 'Command name must be 1-32 characters, lowercase, alphanumeric, hyphens, or underscores only' },
        { status: 400 }
      );
    }

    // Validate description
    if (!description || description.length > 100) {
      return NextResponse.json(
        { error: 'Description is required and must be 100 characters or less' },
        { status: 400 }
      );
    }

    logger.info('[Discord Slash Commands] Creating guild-specific command', {
      guildId,
      commandName,
      descriptionLength: description.length,
      optionsCount: options.length
    });

    // Get user from session
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      logger.error('[Discord Slash Commands] Unauthorized - no user session', { error: userError });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get integration to verify ownership and get bot credentials
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

    // Get Discord application ID and bot token from environment
    const clientId = process.env.DISCORD_CLIENT_ID;
    const botToken = process.env.DISCORD_BOT_TOKEN;

    if (!clientId || !botToken) {
      logger.error('[Discord Slash Commands] Missing Discord credentials in environment');
      return NextResponse.json(
        { error: 'Discord bot configuration missing' },
        { status: 500 }
      );
    }

    // Create the slash command in Discord (GUILD-SPECIFIC ONLY)
    const discordApiUrl = `https://discord.com/api/v10/applications/${clientId}/guilds/${guildId}/commands`;

    const commandData = {
      name: commandName,
      description: description,
      options: options.length > 0 ? options : undefined,
      type: 1 // CHAT_INPUT type
    };

    logger.debug('[Discord Slash Commands] Sending request to Discord API', {
      url: discordApiUrl,
      commandData
    });

    const response = await fetch(discordApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commandData)
    });

    if (!response.ok) {
      const errorData = await response.json();
      logger.error('[Discord Slash Commands] Discord API error', {
        status: response.status,
        error: errorData
      });

      // Handle specific Discord API errors
      if (response.status === 403) {
        return NextResponse.json(
          { error: 'Bot does not have permission to create commands in this server. Ensure the bot is added with the "applications.commands" scope.' },
          { status: 403 }
        );
      }

      if (response.status === 400) {
        return NextResponse.json(
          { error: errorData.message || 'Invalid command data. Check command name and description.' },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: `Discord API error: ${errorData.message || 'Unknown error'}` },
        { status: response.status }
      );
    }

    const createdCommand = await response.json();

    logger.info('[Discord Slash Commands] Command created successfully', {
      commandId: createdCommand.id,
      commandName: createdCommand.name,
      guildId
    });

    return NextResponse.json({
      success: true,
      command: {
        id: createdCommand.id,
        name: createdCommand.name,
        description: createdCommand.description,
        guildId: guildId
      }
    });

  } catch (error: any) {
    logger.error('[Discord Slash Commands] Unexpected error creating command', {
      message: error?.message,
      stack: error?.stack
    });

    return NextResponse.json(
      { error: 'Failed to create slash command' },
      { status: 500 }
    );
  }
}
