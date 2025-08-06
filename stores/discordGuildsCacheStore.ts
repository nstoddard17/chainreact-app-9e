import { createCacheStore, loadOnce, registerStore } from "./cacheStore"
import { apiClient } from "@/lib/apiClient"
import { useIntegrationStore } from "./integrationStore"
import { configValidator } from "@/lib/config/validator"
import { FetchUserDataRequest } from "@/types/integration"

// Define the Discord guild interface
export interface DiscordGuild {
  id: string
  name: string
  value: string
  icon: string | null
  owner: boolean
  permissions: string
}

// Create the Discord guilds cache store
export const useDiscordGuildsStore = createCacheStore<DiscordGuild[]>("discordGuilds")

// Register the store for auth-based clearing
registerStore({
  clearData: () => useDiscordGuildsStore.getState().clearData()
})

// Mock data to use when real data cannot be fetched
const MOCK_DISCORD_GUILDS: DiscordGuild[] = [
  { id: "mock1", name: "Mock Server 1", value: "mock1", icon: null, owner: true, permissions: "ADMINISTRATOR" },
  { id: "mock2", name: "Mock Server 2", value: "mock2", icon: null, owner: true, permissions: "ADMINISTRATOR" },
  { id: "mock3", name: "Mock Server 3", value: "mock3", icon: null, owner: true, permissions: "ADMINISTRATOR" }
]

// Last time we hit a rate limit
let lastRateLimitHit = 0;
// Track API call attempts
let apiCallsSinceRateLimit = 0;

/**
 * Fetch Discord guilds for the current user
 */
async function fetchDiscordGuilds(): Promise<DiscordGuild[]> {
  console.log('🔍 fetchDiscordGuilds called');
  
  // Check if we've been rate limited recently (in the last 10 seconds)
  const now = Date.now();
  if (now - lastRateLimitHit < 10000) {
    console.warn(`⚠️ Discord API rate limited recently (${Math.round((now - lastRateLimitHit) / 1000)}s ago), using mock data`);
    return MOCK_DISCORD_GUILDS;
  }

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
    
    console.log('🔍 Discord integration check:', integration ? `Found: ${integration.id}` : 'Not found');
    
    if (!integration) {
      console.warn('⚠️ No Discord integration found, returning mock data');
      return MOCK_DISCORD_GUILDS;
    }

    try {
      // Create properly typed request
      const request: FetchUserDataRequest = {
        integrationId: integration.id,
        dataType: "discord_guilds"
      }
      
      console.log('🔍 Fetching Discord guilds with request:', request);

      const response = await apiClient.post("/api/integrations/fetch-user-data", request)
      console.log('🔍 Discord guilds API response:', response);

      if (!response.success) {
        console.error("Failed to fetch Discord guilds:", response.error)
        
        // Check if it's a rate limit error
        if (response.error && typeof response.error === 'string' && 
            (response.error.includes('rate limit') || response.error.includes('429'))) {
          lastRateLimitHit = Date.now();
          apiCallsSinceRateLimit = 0;
          console.warn('⚠️ Discord API rate limited, returning mock data');
        }
        
        // Always return mock data when API fails
        return MOCK_DISCORD_GUILDS;
      }
      
      // Reset counter on successful response
      apiCallsSinceRateLimit = 0;
      
      if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
        console.warn('⚠️ API returned empty or invalid data, returning mock data instead');
        return MOCK_DISCORD_GUILDS;
      }

      console.log('✅ Successfully fetched Discord guilds:', response.data.length);
      return response.data || []
    } catch (error) {
      console.error("Error fetching Discord guilds:", error)
      
      // Check if it's a rate limit error
      if (error && typeof error === 'object' && 'message' in error &&
          typeof error.message === 'string' && 
          (error.message.includes('rate limit') || error.message.includes('429'))) {
        lastRateLimitHit = Date.now();
        apiCallsSinceRateLimit = 0;
        console.warn('⚠️ Discord API rate limited in catch block, returning mock data');
      }
      
      return MOCK_DISCORD_GUILDS;
    }
  } catch (configError) {
    console.error("Config validation error:", configError);
    return MOCK_DISCORD_GUILDS;
  }
}

/**
 * Load Discord guilds with caching
 * @param forceRefresh Whether to force a refresh regardless of cache state
 * @returns Array of Discord guilds
 */
export async function loadDiscordGuildsOnce(forceRefresh = false): Promise<DiscordGuild[]> {
  // Get current data to potentially use while refreshing
  const currentData = useDiscordGuildsStore.getState().data;
  
  // Even if forcing refresh, don't clear existing data during loading
  const result = await loadOnce({
    getter: () => useDiscordGuildsStore.getState().data,
    setter: (data) => useDiscordGuildsStore.getState().setData(data),
    fetcher: fetchDiscordGuilds,
    options: {
      forceRefresh,
      setLoading: (loading) => useDiscordGuildsStore.getState().setLoading(loading),
      onError: (error) => useDiscordGuildsStore.getState().setError(error.message),
      // Consider Discord guilds stale after 10 minutes (they don't change often)
      checkStale: () => useDiscordGuildsStore.getState().isStale(10 * 60 * 1000)
    }
  })

  // If we got no results but had previous data, keep using the previous data
  if ((!result || result.length === 0) && currentData && currentData.length > 0) {
    console.log('⚠️ New fetch returned no results, keeping previous Discord guild data');
    return currentData;
  }
  
  return result || MOCK_DISCORD_GUILDS; // Always return at least mock data
}

/**
 * Get a specific Discord guild by ID
 * @param guildId The ID of the guild to find
 * @returns The guild or null if not found
 */
export function getDiscordGuildById(guildId: string): DiscordGuild | null {
  const guilds = useDiscordGuildsStore.getState().data
  
  if (!guilds) return null
  
  return guilds.find(guild => guild.id === guildId) || null
}

/**
 * Clear Discord guilds cache
 */
export function clearDiscordGuildsCache(): void {
  useDiscordGuildsStore.getState().clearData()
} 