import { createCacheStore, loadOnce, registerStore } from "./cacheStore"
import { apiClient } from "@/lib/apiClient"
import { useIntegrationStore } from "./integrationStore"
import { configValidator } from "@/lib/config/validator"
import { FetchUserDataRequest } from "@/types/integration"

// Define the Discord channel interface
export interface DiscordChannel {
  id: string
  name: string
  type: number
  position?: number
  guild_id?: string
}

// Create a cache store for Discord channels per guild
export const useDiscordChannelsStore = createCacheStore<Record<string, DiscordChannel[]>>("discordChannels")

// Track in-flight requests to prevent duplicate API calls
const inFlightRequests = new Map<string, Promise<DiscordChannel[]>>();

// Register the store for auth-based clearing
registerStore({
  clearData: () => useDiscordChannelsStore.getState().clearData()
})

/**
 * Fetch Discord channels for a specific guild
 */
async function fetchDiscordChannels(guildId: string): Promise<DiscordChannel[]> {
  console.log('🔍 fetchDiscordChannels called for guild:', guildId);
  
  try {
    // Validate Discord bot configuration first
    configValidator.validateDiscordBotConfig()
    console.log('✅ Discord bot config validated');

    // Get the Discord integration ID
    const { getIntegrationByProvider } = useIntegrationStore.getState()
    const integration = getIntegrationByProvider("discord")
    
    console.log('🔍 Discord integration check:', integration ? `Found: ${integration.id}` : 'Not found');
    
    if (!integration) {
      console.warn('⚠️ No Discord integration found');
      return [];
    }

    try {
      // Create properly typed request
      const request: FetchUserDataRequest = {
        integrationId: integration.id,
        dataType: "discord_channels",
        options: { guildId }
      }
      
      console.log('🔍 Fetching Discord channels with request:', request);

      const response = await apiClient.post("/api/integrations/fetch-user-data", request)
      console.log('🔍 Discord channels API response for guild', guildId, ':', response);

      if (!response.success) {
        console.error("Failed to fetch Discord channels:", response.error)
        return [];
      }
      
      if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
        console.warn('⚠️ API returned empty or invalid channel data for guild', guildId);
        return [];
      }

      console.log('✅ Successfully fetched Discord channels for guild', guildId, ':', response.data.length);
      return response.data || []
    } catch (error) {
      console.error("Error fetching Discord channels for guild", guildId, ":", error)
      return [];
    }
  } catch (configError) {
    console.error("Config validation error:", configError);
    return [];
  }
}

/**
 * Load Discord channels for a specific guild with caching
 * @param guildId The guild ID to load channels for
 * @param forceRefresh Whether to force a refresh regardless of cache state
 * @returns Array of Discord channels for the guild
 */
export async function loadDiscordChannelsOnce(guildId: string, forceRefresh = false): Promise<DiscordChannel[]> {
  if (!guildId) {
    console.warn('⚠️ loadDiscordChannelsOnce called without guildId');
    return [];
  }
  
  // Check if there's already an in-flight request for this guild
  const inFlightKey = `${guildId}:${forceRefresh}`;
  const existingRequest = inFlightRequests.get(inFlightKey);
  if (existingRequest) {
    console.log(`🔄 [Discord Channels] Reusing in-flight request for guild ${guildId}`);
    return existingRequest;
  }

  const store = useDiscordChannelsStore.getState();
  
  // Custom getter/setter for guild-specific data
  const getter = () => {
    const allChannels = store.data;
    return allChannels?.[guildId] || null;
  };
  
  const setter = (channels: DiscordChannel[]) => {
    const currentData = store.data || {};
    store.setData({
      ...currentData,
      [guildId]: channels
    });
  };

  // Check if data is stale (10 minutes for channels since they rarely change)
  const isStale = () => {
    const lastUpdated = store.lastUpdated;
    if (!lastUpdated) return true;
    return Date.now() - lastUpdated > (10 * 60 * 1000); // Increased cache time
  };
  
  // Create the loading promise
  const loadPromise = loadOnce({
    getter,
    setter,
    fetcher: () => fetchDiscordChannels(guildId),
    options: {
      forceRefresh,
      setLoading: (loading) => store.setLoading(loading),
      onError: (error) => {
        store.setError(error.message);
        // Clean up in-flight request on error
        inFlightRequests.delete(inFlightKey);
      },
      checkStale: isStale
    }
  });
  
  // Store the in-flight request
  inFlightRequests.set(inFlightKey, loadPromise);
  
  try {
    const result = await loadPromise;
    return result || [];
  } finally {
    // Clean up in-flight request when done
    inFlightRequests.delete(inFlightKey);
  }
}

/**
 * Get a specific Discord channel by ID from cache
 * @param guildId The guild ID containing the channel
 * @param channelId The ID of the channel to find
 * @returns The channel or null if not found
 */
export function getDiscordChannelById(guildId: string, channelId: string): DiscordChannel | null {
  const allChannels = useDiscordChannelsStore.getState().data
  
  if (!allChannels || !guildId) return null
  
  const guildChannels = allChannels[guildId];
  if (!guildChannels) return null;
  
  return guildChannels.find(channel => channel.id === channelId) || null;
}

/**
 * Clear Discord channels cache for a specific guild
 */
export function clearDiscordChannelsCache(guildId?: string): void {
  if (guildId) {
    const store = useDiscordChannelsStore.getState();
    const currentData = store.data || {};
    delete currentData[guildId];
    store.setData(currentData);
  } else {
    // Clear all channels cache
    useDiscordChannelsStore.getState().clearData();
  }
}

/**
 * Get all cached channels for all guilds (mainly for debugging)
 */
export function getAllCachedChannels(): Record<string, DiscordChannel[]> {
  return useDiscordChannelsStore.getState().data || {};
}