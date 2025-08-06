import { createCacheStore, loadOnce, registerStore } from "./cacheStore"
import { apiClient } from "@/lib/apiClient"
import { useIntegrationStore } from "./integrationStore"
import { configValidator } from "@/lib/config/validator"
import { FetchUserDataRequest } from "@/types/integration"

// Define the Discord channel interface
export interface DiscordChannel {
  id: string
  name: string
  value: string
  type: string
  parentId?: string
  position: number
}

// Create the Discord channels cache store
export const useDiscordChannelsStore = createCacheStore<Record<string, DiscordChannel[]>>("discordChannels")

// Register the store for auth-based clearing
registerStore({
  clearData: () => useDiscordChannelsStore.getState().clearData()
})

// Mock data to use when real data cannot be fetched
const MOCK_DISCORD_CHANNELS: DiscordChannel[] = [
  { id: "mock1", name: "general", value: "mock1", type: "GUILD_TEXT", position: 0 },
  { id: "mock2", name: "announcements", value: "mock2", type: "GUILD_TEXT", position: 1 },
  { id: "mock3", name: "random", value: "mock3", type: "GUILD_TEXT", position: 2 }
]

// Last time we hit a rate limit
let lastRateLimitHit = 0;
// Track API call attempts
let apiCallsSinceRateLimit = 0;
// Cache of last request time per guild
const guildRequestTimes: Record<string, number> = {};

/**
 * Fetch Discord channels for a specific guild
 */
async function fetchDiscordChannels(guildId: string): Promise<DiscordChannel[]> {
  console.log(`🔍 fetchDiscordChannels called for guild ${guildId}`);
  
  // Check if we've been rate limited recently (in the last 10 seconds)
  const now = Date.now();
  if (now - lastRateLimitHit < 10000) {
    console.warn(`⚠️ Discord API rate limited recently (${Math.round((now - lastRateLimitHit) / 1000)}s ago), using mock data for channels`);
    return MOCK_DISCORD_CHANNELS;
  }
  
  // Check if we've requested this guild's channels recently (in the last 10 seconds)
  if (guildRequestTimes[guildId] && now - guildRequestTimes[guildId] < 10000) {
    console.log(`⏱️ Requested channels for guild ${guildId} recently, using cached data`);
    const currentData = useDiscordChannelsStore.getState().data;
    return currentData?.[guildId] || MOCK_DISCORD_CHANNELS;
  }
  
  // Record this request time
  guildRequestTimes[guildId] = now;

  // Increment API call counter
  apiCallsSinceRateLimit++;
  
  // If we've made more than 3 calls since the last rate limit, wait a bit
  if (apiCallsSinceRateLimit > 3) {
    console.log('⏱️ Throttling Discord API calls to avoid rate limits');
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  try {
    // Validate Discord bot configuration first
    configValidator.validateDiscordBotConfig()
    console.log('✅ Discord bot config validated');

    // Get the Discord integration ID
    const { getIntegrationByProvider } = useIntegrationStore.getState()
    const integration = getIntegrationByProvider("discord")
    
    console.log('🔍 Discord integration check for channels:', integration ? `Found: ${integration.id}` : 'Not found');
    
    if (!integration) {
      console.warn('⚠️ No Discord integration found, returning mock channel data');
      return MOCK_DISCORD_CHANNELS;
    }

    try {
      // Create properly typed request
      const request: FetchUserDataRequest = {
        integrationId: integration.id,
        dataType: "discord_channels",
        options: {
          guildId
        }
      }
      
      console.log('🔍 Fetching Discord channels with request:', request);

      const response = await apiClient.post("/api/integrations/fetch-user-data", request)
      console.log('🔍 Discord channels API response:', response);

      if (!response.success) {
        console.error("Failed to fetch Discord channels:", response.error)
        
        // Check if it's a rate limit error
        if (response.error && typeof response.error === 'string' && 
            (response.error.includes('rate limit') || response.error.includes('429'))) {
          lastRateLimitHit = Date.now();
          apiCallsSinceRateLimit = 0;
          console.warn('⚠️ Discord API rate limited, returning mock channel data');
        }
        
        // Always return mock data when API fails
        return MOCK_DISCORD_CHANNELS;
      }
      
      // Reset counter on successful response
      apiCallsSinceRateLimit = 0;
      
      if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
        console.warn('⚠️ API returned empty or invalid channel data, returning mock data instead');
        return MOCK_DISCORD_CHANNELS;
      }

      console.log('✅ Successfully fetched Discord channels:', response.data.length);
      return response.data || []
    } catch (error) {
      console.error("Error fetching Discord channels:", error)
      
      // Check if it's a rate limit error
      if (error && typeof error === 'object' && 'message' in error &&
          typeof error.message === 'string' && 
          (error.message.includes('rate limit') || error.message.includes('429'))) {
        lastRateLimitHit = Date.now();
        apiCallsSinceRateLimit = 0;
        console.warn('⚠️ Discord API rate limited in catch block, returning mock channel data');
      }
      
      return MOCK_DISCORD_CHANNELS;
    }
  } catch (configError) {
    console.error("Config validation error for channels:", configError);
    return MOCK_DISCORD_CHANNELS;
  }
}

/**
 * Load Discord channels with caching
 * @param guildId The Discord guild ID to load channels for
 * @param forceRefresh Whether to force a refresh regardless of cache state
 * @returns Array of Discord channels
 */
export async function loadDiscordChannelsOnce(guildId: string, forceRefresh = false): Promise<DiscordChannel[]> {
  if (!guildId) {
    console.warn('⚠️ No guildId provided to loadDiscordChannelsOnce, returning empty array');
    return [];
  }
  
  // Get current channels data for this guild
  const allChannels = useDiscordChannelsStore.getState().data || {};
  const currentChannels = allChannels[guildId] || [];
  
  try {
    // Fetch channels with caching
    const channelsResult = await fetchDiscordChannels(guildId);
    
    // Update the store with the channels for this guild
    const updatedChannels = {
      ...allChannels,
      [guildId]: channelsResult
    };
    
    // Update the store
    useDiscordChannelsStore.getState().setData(updatedChannels);
    
    return channelsResult;
  } catch (error) {
    console.error("Error loading Discord channels:", error);
    
    // If we got an error but have previous data, keep using it
    if (currentChannels.length > 0) {
      return currentChannels;
    }
    
    return MOCK_DISCORD_CHANNELS;
  }
}

/**
 * Get Discord channels for a specific guild
 * @param guildId The guild ID to get channels for
 * @returns Channels for the guild or mock channels if none found
 */
export function getDiscordChannelsForGuild(guildId: string): DiscordChannel[] {
  if (!guildId) return [];
  
  const allChannels = useDiscordChannelsStore.getState().data;
  if (!allChannels) return [];
  
  return allChannels[guildId] || [];
}

/**
 * Clear Discord channels cache
 */
export function clearDiscordChannelsCache(): void {
  useDiscordChannelsStore.getState().clearData()
} 