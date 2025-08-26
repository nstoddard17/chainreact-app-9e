/**
 * Discord Guilds Handler
 */

import { DiscordIntegration, DiscordGuild, DiscordDataHandler } from '../types'
import { fetchDiscordWithRateLimit, validateDiscordToken } from '../utils'

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

    console.log('🔍 Checking bot status for guild:', guildId, 'with bot client ID:', botClientId);
    
    let channelsStatus = null;
    
    // First, try to fetch channels (more reliable than member check)
    try {
      console.log('🔍 Trying to fetch guild channels...');
      
      const channelsResponse = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
        headers: {
          'Authorization': `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
      });
      
      channelsStatus = channelsResponse.status;
      console.log('🔍 Channels API response status:', channelsStatus);
      
      if (channelsResponse.ok) {
        const channels = await channelsResponse.json();
        console.log('🔍 Successfully fetched channels:', channels.length, 'channels found');
        
        // Bot can access channels, so it's in the guild with proper permissions
        return {
          isInGuild: true,
          hasPermissions: true
        };
      } else if (channelsResponse.status === 403) {
        console.log('🔍 403 error - could be bot not in guild or missing permissions, checking membership...');
        // Don't assume bot is in guild on 403 - need to check membership first
      }
    } catch (outerError) {
      console.log('🔍 Outer channels check failed, trying member check...');
    }
    
    // Fallback to member check
    console.log('🔍 Trying to check bot membership...');
    
    const memberResponse = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${botClientId}`, {
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    console.log('🔍 Member API response status:', memberResponse.status);

    if (memberResponse.ok) {
      console.log('🔍 Bot is a member of the guild');
      // Bot is in the guild - now check if we had a 403 on channels earlier
      if (channelsStatus === 403) {
        console.log('🔍 Bot is in guild but lacks channel view permissions');
        return {
          isInGuild: true,
          hasPermissions: false,
          error: "Bot in guild but missing channel permissions"
        };
      } else {
        // Bot is in guild and should have permissions (channels check would have succeeded if it had proper perms)
        return {
          isInGuild: true,
          hasPermissions: true
        };
      }
    } else if (memberResponse.status === 404) {
      console.log('🔍 Bot is not a member of the guild');
      // Bot is not in the guild
      return {
        isInGuild: false,
        hasPermissions: false,
        error: "Bot not added to this server"
      };
    } else if (memberResponse.status === 403) {
      console.log('🔍 Bot lacks permissions to check membership - probably not in guild');
      // Bot doesn't have permission to check membership, likely not in guild
      return {
        isInGuild: false,
        hasPermissions: false,
        error: "Bot not in server or missing permissions"
      };
    } else {
      console.log('🔍 Unknown error checking bot status');
      return {
        isInGuild: false,
        hasPermissions: false,
        error: `Discord API error: ${memberResponse.status}`
      };
    }
  } catch (error: any) {
    console.error('Error verifying bot in guild:', error);
    return {
      isInGuild: false,
      hasPermissions: false,
      error: error.message || "Failed to verify bot status"
    };
  }
}

export const getDiscordGuilds: DiscordDataHandler<DiscordGuild> = async (integration: DiscordIntegration) => {
  try {
    // Validate and get token
    const tokenValidation = await validateDiscordToken(integration)
    
    if (!tokenValidation.success) {
      throw new Error(tokenValidation.error || "Token validation failed")
    }
    
    const data = await fetchDiscordWithRateLimit<any[]>(() => 
      fetch("https://discord.com/api/v10/users/@me/guilds", {
        headers: {
          Authorization: `Bearer ${tokenValidation.token}`,
          "Content-Type": "application/json",
        },
      })
    )

    // Process guilds and add bot status checking
    const guilds = (data || []).map((guild: any) => ({
      id: guild.id,
      name: guild.name,
      value: guild.id,
      label: guild.name,
      icon: guild.icon,
      owner: guild.owner,
      permissions: guild.permissions,
      features: guild.features,
      approximate_member_count: guild.approximate_member_count,
      approximate_presence_count: guild.approximate_presence_count,
    }))

    console.log(`🔍 [Discord Guilds] Found ${guilds.length} guilds, checking bot status for each...`);

    // Check if bot tokens are configured
    const botToken = process.env.DISCORD_BOT_TOKEN;
    const botClientId = process.env.DISCORD_CLIENT_ID || process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
    
    if (!botToken || !botClientId) {
      console.warn(`🔍 [Discord Guilds] Discord bot not configured, returning guilds without bot status`);
      return guilds.map(guild => ({
        ...guild,
        botInGuild: undefined,
        hasPermissions: false,
        botError: "Discord bot not configured"
      }));
    }

    // Make bot status checking non-blocking with timeout
    try {
      // Set a reasonable timeout for bot status checking (10 seconds total)
      const botStatusPromise = Promise.allSettled(
        guilds.map(async (guild, index) => {
          // Add a small delay between requests to avoid rate limiting
          if (index > 0) {
            await new Promise(resolve => setTimeout(resolve, 100)); // Reduced delay
          }
          
          // Set timeout for individual bot checks (2 seconds each)
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Bot check timeout')), 2000)
          );
          
          const botCheckPromise = verifyBotInGuild(guild.id);
          
          try {
            const botStatus = await Promise.race([botCheckPromise, timeoutPromise]);
            return {
              ...guild,
              botInGuild: botStatus.isInGuild,
              hasPermissions: botStatus.hasPermissions,
              botError: botStatus.error
            };
          } catch (error) {
            // If bot check fails or times out, return guild without bot status
            console.warn(`🔍 [Discord Guilds] Bot check failed for guild ${guild.name}:`, error.message);
            return {
              ...guild,
              botInGuild: undefined, // undefined means we couldn't check
              hasPermissions: false,
              botError: "Could not verify bot status"
            };
          }
        })
      );

      // Set overall timeout for all bot checks (10 seconds)
      const overallTimeout = new Promise((resolve) => 
        setTimeout(() => {
          console.warn(`🔍 [Discord Guilds] Bot status checking timed out, returning guilds without full bot status`);
          resolve(guilds.map(guild => ({
            ...guild,
            botInGuild: undefined,
            hasPermissions: false,
            botError: "Bot status check timed out"
          })));
        }, 10000)
      );

      const guildsWithBotStatus = await Promise.race([botStatusPromise, overallTimeout]);

      // If we got the actual results, process them
      let processedGuilds;
      if (Array.isArray(guildsWithBotStatus) && guildsWithBotStatus[0]?.status) {
        // This is from Promise.allSettled
        processedGuilds = guildsWithBotStatus.map((result, index) => {
          if (result.status === 'fulfilled') {
            return result.value;
          } else {
            console.warn(`🔍 [Discord Guilds] Failed to check bot status for guild ${guilds[index]?.name}:`, result.reason);
            return {
              ...guilds[index],
              botInGuild: undefined,
              hasPermissions: false,
              botError: "Failed to check bot status"
            };
          }
        });
      } else {
        // This is from the timeout fallback
        processedGuilds = guildsWithBotStatus;
      }

      console.log(`🔍 [Discord Guilds] Bot status check complete:`, {
        totalGuilds: processedGuilds.length,
        botsInGuild: processedGuilds.filter(g => g.botInGuild === true).length,
        withPermissions: processedGuilds.filter(g => g.botInGuild === true && g.hasPermissions).length,
        unknownBotStatus: processedGuilds.filter(g => g.botInGuild === undefined).length
      });

      return processedGuilds;
    } catch (error) {
      // If bot status checking completely fails, return guilds without bot status
      console.error(`🔍 [Discord Guilds] Bot status checking failed completely:`, error);
      return guilds.map(guild => ({
        ...guild,
        botInGuild: undefined,
        hasPermissions: false,
        botError: "Bot status unavailable"
      }));
    }
  } catch (error: any) {
    console.error("Error fetching Discord guilds:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Discord authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Discord API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(`Failed to fetch Discord guilds: ${error.message}`)
  }
}