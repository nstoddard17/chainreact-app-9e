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

/**
 * Fetch Discord guilds for the current user
 */
async function fetchDiscordGuilds(): Promise<DiscordGuild[]> {
  console.log('🔍 fetchDiscordGuilds called');
  
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
        dataType: "discord_guilds"
      }
      
      console.log('🔍 Fetching Discord guilds with request:', request);

      const response = await apiClient.post("/api/integrations/fetch-user-data", request)
      console.log('🔍 Discord guilds API response:', response);

      if (!response.success) {
        console.error("Failed to fetch Discord guilds:", response.error)
        return [];
      }
      
      if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
        console.warn('⚠️ API returned empty or invalid data');
        return [];
      }

      console.log('✅ Successfully fetched Discord guilds:', response.data.length);
      return response.data || []
    } catch (error) {
      console.error("Error fetching Discord guilds:", error)
      return [];
    }
  } catch (configError) {
    console.error("Config validation error:", configError);
    return [];
  }
}

/**
 * Load Discord guilds with caching
 * @param forceRefresh Whether to force a refresh regardless of cache state
 * @returns Array of Discord guilds
 */
export async function loadDiscordGuildsOnce(forceRefresh = false): Promise<DiscordGuild[]> {
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

  return result || []
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