import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseServerClient } from '@/utils/supabase/server'

import { logger } from '@/lib/utils/logger'

/**
 * Verify that the Discord bot is actually a member of the specified guild
 */
async function verifyBotInGuild(guildId: string): Promise<{ isInGuild: boolean; hasPermissions: boolean; error?: string }> {
  try {
    const botToken = process.env.DISCORD_BOT_TOKEN;
    const botClientId = process.env.DISCORD_CLIENT_ID || process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
    
    if (!botToken || !botClientId) {
      return {
        isInGuild: false,
        hasPermissions: false,
        error: "Discord bot not configured"
      };
    }

    logger.debug('🔍 Checking bot status for guild:', guildId, 'with bot client ID:', botClientId);
    
    let channelsStatus = null;
    
    // First, try to fetch channels (more reliable than member check)
    try {
      logger.debug('🔍 Trying to fetch guild channels...');
      const channelsResponse = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
        headers: {
          'Authorization': `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
      });
      
      channelsStatus = channelsResponse.status;
      logger.debug('🔍 Channels API response status:', channelsStatus);
      
      if (channelsResponse.ok) {
        const channels = await channelsjsonResponse();
        logger.debug('🔍 Successfully fetched channels:', channels.length, 'channels found');
        
        // Bot can access channels, so it's in the guild with proper permissions
        return {
          isInGuild: true,
          hasPermissions: true
        };
      } else if (channelsResponse.status === 403) {
        logger.debug('🔍 403 error - could be bot not in guild or missing permissions, checking membership...');
        // Don't assume bot is in guild on 403 - need to check membership first
      }
    } catch (channelsError) {
      logger.debug('🔍 Channels check failed, trying member check...', channelsError.message);
    }
    
    // Fallback to member check
    logger.debug('🔍 Trying to check bot membership...');
    const memberResponse = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${botClientId}`, {
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    logger.debug('🔍 Member API response status:', memberResponse.status);

    if (memberResponse.ok) {
      logger.debug('🔍 Bot is a member of the guild');
      // Bot is in the guild - now check if we had a 403 on channels earlier
      if (channelsStatus === 403) {
        logger.debug('🔍 Bot is in guild but lacks channel view permissions');
        return {
          isInGuild: true,
          hasPermissions: false,
          error: "Bot in guild but missing channel permissions"
        };
      } 
        // Bot is in guild and should have permissions (channels check would have succeeded if it had proper perms)
        return {
          isInGuild: true,
          hasPermissions: true
        };
      
    } else if (memberResponse.status === 404) {
      logger.debug('🔍 Bot is not a member of the guild');
      // Bot is not in the guild
      return {
        isInGuild: false,
        hasPermissions: false,
        error: "Bot not added to this server"
      };
    } else if (memberResponse.status === 403) {
      logger.debug('🔍 Bot lacks permissions to check membership - probably not in guild');
      // Bot doesn't have permission to check membership, likely not in guild
      return {
        isInGuild: false,
        hasPermissions: false,
        error: "Bot not in server or missing permissions"
      };
    } 
      logger.debug('🔍 Unknown error checking bot status');
      return {
        isInGuild: false,
        hasPermissions: false,
        error: `Discord API error: ${memberResponse.status}`
      };
    
  } catch (error: any) {
    logger.error('Error verifying bot in guild:', error);
    return {
      isInGuild: false,
      hasPermissions: false,
      error: error.message || "Failed to verify bot status"
    };
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const guildId = searchParams.get('guildId')

    if (!guildId) {
      return errorResponse('Guild ID is required' , 400)
    }

    // Verify user is authenticated
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse('Unauthorized' , 401)
    }

    // Check if user has Discord integration
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "discord")
      .eq("status", "connected")
      .single()

    if (!integration) {
      return errorResponse('Discord integration not connected' , 400)
    }

    // Check if bot is actually in the guild
    const botStatus = await verifyBotInGuild(guildId);
    
    logger.debug("🔍 Bot status check result for guild:", guildId, botStatus);

    return jsonResponse(botStatus)
  } catch (error) {
    logger.error('Error checking Discord bot status:', error)
    return errorResponse('Internal server error' , 500)
  }
} 