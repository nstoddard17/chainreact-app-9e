/**
 * Discord Guilds Handler
 */

import { DiscordIntegration, DiscordGuild, DiscordDataHandler } from '../types'
import { makeDiscordApiRequest, validateDiscordToken, fetchDiscordWithRateLimit } from '../utils'

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
      
      const channels = await fetchDiscordWithRateLimit<any[]>(() =>
        fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
          headers: {
            'Authorization': `Bot ${botToken}`,
            'Content-Type': 'application/json',
          },
        })
      );
      
      console.log('🔍 Successfully fetched channels:', channels.length, 'channels found');
      
      // Bot can access channels, so it's in the guild with proper permissions
      return {
        isInGuild: true,
        hasPermissions: true
      };
    } catch (outerError) {
      console.log('🔍 Outer channels check failed, trying member check...');
    }
    
    // Fallback to member check
    console.log('🔍 Trying to check bot membership...');
    
    try {
      const memberData = await fetchDiscordWithRateLimit<any>(() =>
        fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${botClientId}`, {
          headers: {
            'Authorization': `Bot ${botToken}`,
            'Content-Type': 'application/json',
          },
        })
      );
      
      console.log('🔍 Bot is a member of the guild');
      // Bot is in the guild and we have member data
      return {
        isInGuild: true,
        hasPermissions: true
      };
    } catch (memberError: any) {
      console.log('🔍 Member check failed:', memberError.message);
      
      // Parse error to determine the issue
      if (memberError.status === 404) {
        console.log('🔍 Bot is not a member of the guild');
        return {
          isInGuild: false,
          hasPermissions: false,
          error: "Bot not added to this server"
        };
      } else if (memberError.status === 403) {
        console.log('🔍 Bot lacks permissions to check membership - probably not in guild');
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
          error: `Discord API error: ${memberError.status || 'unknown'}`
        };
      }
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

export const getDiscordGuilds: DiscordDataHandler<DiscordGuild> = async (integration: DiscordIntegration, options?: any) => {
  try {
    // Validate and get token
    const tokenValidation = await validateDiscordToken(integration)

    if (!tokenValidation.success) {
      throw new Error(tokenValidation.error || "Token validation failed")
    }

    // Use makeDiscordApiRequest which includes 10-minute caching
    const data = await makeDiscordApiRequest<any[]>(
      "https://discord.com/api/v10/users/@me/guilds",
      tokenValidation.token,
      {},
      true // Enable caching
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

    console.log(`🔍 [Discord Guilds] Found ${guilds.length} guilds`);

    // Skip bot status checks by default for faster loading
    // Only check bot status if explicitly requested via options
    if (options?.checkBotStatus === true) {
      console.log(`🔍 [Discord Guilds] Bot status check requested, checking bot status for guilds...`);
      
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

    // Make bot status checking less aggressive to avoid rate limits
    try {
      console.log(`🔍 [Discord Guilds] Checking bot status for ${Math.min(guilds.length, 3)} guilds (rate limit protection)`);
      
      // Only check bot status for the first few guilds to avoid rate limits
      const guildsToCheck = guilds.slice(0, 3); // Only check first 3 guilds
      const remainingGuilds = guilds.slice(3);
      
      const botStatusPromise = Promise.allSettled(
        guildsToCheck.map(async (guild, index) => {
          // Spread out requests more to avoid rate limits
          if (index > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second between requests
          }
          
          // Set timeout for individual bot checks (5 seconds each)
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Bot check timeout')), 5000)
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
          } catch (error: any) {
            // If bot check fails or times out, return guild without bot status
            console.warn(`🔍 [Discord Guilds] Bot check failed for guild ${guild.name}:`, error?.message || 'Unknown error');
            return {
              ...guild,
              botInGuild: undefined, // undefined means we couldn't check
              hasPermissions: false,
              botError: "Could not verify bot status"
            };
          }
        })
      );

      // Set overall timeout for bot checks (15 seconds for fewer guilds)
      const overallTimeout = new Promise((resolve) => 
        setTimeout(() => {
          console.warn(`🔍 [Discord Guilds] Bot status checking timed out, returning guilds without full bot status`);
          resolve([...guildsToCheck.map(guild => ({
            ...guild,
            botInGuild: undefined,
            hasPermissions: false,
            botError: "Bot status check timed out"
          })), ...remainingGuilds.map(guild => ({
            ...guild,
            botInGuild: undefined,
            hasPermissions: false,
            botError: "Bot status not checked (rate limit protection)"
          }))]);
        }, 15000)
      );

      const checkedGuildsResult = await Promise.race([botStatusPromise, overallTimeout]);

      // Process the results and combine with unchecked guilds
      let processedGuilds;
      if (Array.isArray(checkedGuildsResult) && checkedGuildsResult[0]?.status) {
        // This is from Promise.allSettled
        const checkedGuilds = checkedGuildsResult.map((result, index) => {
          if (result.status === 'fulfilled') {
            return result.value;
          } else {
            console.warn(`🔍 [Discord Guilds] Failed to check bot status for guild ${guildsToCheck[index]?.name}:`, result.reason);
            return {
              ...guildsToCheck[index],
              botInGuild: undefined,
              hasPermissions: false,
              botError: "Failed to check bot status"
            };
          }
        });
        
        // Add remaining guilds that weren't checked
        processedGuilds = [
          ...checkedGuilds,
          ...remainingGuilds.map(guild => ({
            ...guild,
            botInGuild: undefined,
            hasPermissions: false,
            botError: "Bot status not checked (rate limit protection)"
          }))
        ];
      } else {
        // This is from the timeout fallback
        processedGuilds = checkedGuildsResult;
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
    } else {
      // Return guilds immediately without bot status checks for faster loading
      console.log(`🔍 [Discord Guilds] Skipping bot status checks for faster loading`);
      return guilds;
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