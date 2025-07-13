import { createCacheStore, loadOnce, registerStore } from "./cacheStore"
import { apiClient } from "@/lib/apiClient"

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
  const response = await apiClient.post("/api/integrations/fetch-user-data", {
    provider: "discord",
    dataType: "discord_guilds"
  })

  if (!response.success) {
    throw new Error(response.error || "Failed to fetch Discord guilds")
  }

  return response.data || []
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