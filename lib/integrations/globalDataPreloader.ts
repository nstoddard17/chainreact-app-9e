import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/supabase"

// Create a client-side Supabase client for the preloader
function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing Supabase environment variables for preloader")
    return null
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey)
}

interface PreloadConfig {
  provider: string
  dataTypes: string[]
  priority: number
  batchSize?: number
}

interface PreloadResult {
  provider: string
  dataType: string
  success: boolean
  count: number
  error?: string
}

class GlobalDataPreloader {
  private isPreloading = false
  private preloadQueue: PreloadConfig[] = []
  private results: PreloadResult[] = []
  private progressCallback?: (progress: { [key: string]: boolean }) => void

  // Configuration for each provider
  private readonly PRELOAD_CONFIGS: PreloadConfig[] = [
    {
      provider: "notion",
      dataTypes: ["pages", "databases"],
      priority: 1,
      batchSize: 50,
    },
    {
      provider: "slack",
      dataTypes: ["channels", "users"],
      priority: 2,
      batchSize: 100,
    },
    {
      provider: "google-sheets",
      dataTypes: ["spreadsheets"],
      priority: 2,
      batchSize: 50,
    },
    {
      provider: "google-calendar",
      dataTypes: ["calendars"],
      priority: 3,
      batchSize: 20,
    },
    {
      provider: "airtable",
      dataTypes: ["bases"],
      priority: 2,
      batchSize: 30,
    },
    {
      provider: "trello",
      dataTypes: ["boards"],
      priority: 3,
      batchSize: 50,
    },
    {
      provider: "github",
      dataTypes: ["repositories"],
      priority: 2,
      batchSize: 100,
    },
    {
      provider: "gmail",
      dataTypes: ["labels"],
      priority: 4,
      batchSize: 50,
    },
  ]

  async startPreloading(
    connectedProviders: string[],
    progressCallback?: (progress: { [key: string]: boolean }) => void,
  ): Promise<PreloadResult[]> {
    if (this.isPreloading) {
      console.log("Preloading already in progress")
      return this.results
    }

    this.isPreloading = true
    this.results = []
    this.progressCallback = progressCallback

    try {
      // Filter and sort configs by connected providers and priority
      this.preloadQueue = this.PRELOAD_CONFIGS.filter((config) => connectedProviders.includes(config.provider)).sort(
        (a, b) => a.priority - b.priority,
      )

      console.log(`Starting preload for ${this.preloadQueue.length} provider configurations`)

      // Initialize progress
      const initialProgress: { [key: string]: boolean } = {}
      this.preloadQueue.forEach((config) => {
        initialProgress[config.provider] = false
      })
      this.progressCallback?.(initialProgress)

      // Process each provider configuration
      for (const config of this.preloadQueue) {
        await this.preloadProvider(config)
      }

      console.log("Global preloading completed", this.results)
      return this.results
    } catch (error) {
      console.error("Global preloading failed:", error)
      throw error
    } finally {
      this.isPreloading = false
    }
  }

  private async preloadProvider(config: PreloadConfig): Promise<void> {
    console.log(`Preloading ${config.provider} with data types:`, config.dataTypes)

    try {
      // Process each data type for this provider
      const promises = config.dataTypes.map((dataType) =>
        this.preloadDataType(config.provider, dataType, config.batchSize),
      )

      await Promise.allSettled(promises)

      // Update progress
      const currentProgress = { ...this.getCurrentProgress() }
      currentProgress[config.provider] = true
      this.progressCallback?.(currentProgress)

      console.log(`Completed preloading for ${config.provider}`)
    } catch (error) {
      console.error(`Failed to preload ${config.provider}:`, error)
    }
  }

  private async preloadDataType(provider: string, dataType: string, batchSize = 50): Promise<void> {
    try {
      console.log(`Fetching ${dataType} for ${provider}`)

      const response = await fetch("/api/integrations/fetch-user-data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider,
          dataType,
          batchSize,
          preload: true,
        }),
      })

      const result = await response.json()

      if (result.success) {
        this.results.push({
          provider,
          dataType,
          success: true,
          count: result.data?.length || 0,
        })

        console.log(`Successfully preloaded ${result.data?.length || 0} ${dataType} for ${provider}`)
      } else {
        throw new Error(result.error || `Failed to fetch ${dataType}`)
      }
    } catch (error: any) {
      console.error(`Failed to preload ${dataType} for ${provider}:`, error)

      this.results.push({
        provider,
        dataType,
        success: false,
        count: 0,
        error: error.message,
      })
    }
  }

  private getCurrentProgress(): { [key: string]: boolean } {
    const progress: { [key: string]: boolean } = {}
    this.preloadQueue.forEach((config) => {
      const providerResults = this.results.filter((r) => r.provider === config.provider)
      const expectedCount = config.dataTypes.length
      const completedCount = providerResults.length

      progress[config.provider] = completedCount >= expectedCount
    })
    return progress
  }

  async refreshProviderData(provider: string): Promise<PreloadResult[]> {
    const config = this.PRELOAD_CONFIGS.find((c) => c.provider === provider)
    if (!config) {
      throw new Error(`No preload configuration found for provider: ${provider}`)
    }

    console.log(`Refreshing data for ${provider}`)

    const refreshResults: PreloadResult[] = []

    for (const dataType of config.dataTypes) {
      try {
        await this.preloadDataType(provider, dataType, config.batchSize)
        const result = this.results.find((r) => r.provider === provider && r.dataType === dataType)
        if (result) {
          refreshResults.push(result)
        }
      } catch (error: any) {
        refreshResults.push({
          provider,
          dataType,
          success: false,
          count: 0,
          error: error.message,
        })
      }
    }

    return refreshResults
  }

  getPreloadResults(): PreloadResult[] {
    return this.results
  }

  isCurrentlyPreloading(): boolean {
    return this.isPreloading
  }

  getProviderProgress(provider: string): boolean {
    const config = this.PRELOAD_CONFIGS.find((c) => c.provider === provider)
    if (!config) return false

    const providerResults = this.results.filter((r) => r.provider === provider && r.success)
    return providerResults.length >= config.dataTypes.length
  }

  async validateUserAccess(): Promise<boolean> {
    try {
      const supabase = createSupabaseClient()
      if (!supabase) {
        console.error("Failed to create Supabase client for user validation")
        return false
      }

      const { data: user } = await supabase.auth.getUser()
      return !!user.user
    } catch (error) {
      console.error("Failed to validate user access:", error)
      return false
    }
  }

  // Method to get estimated preload time
  getEstimatedPreloadTime(connectedProviders: string[]): number {
    const relevantConfigs = this.PRELOAD_CONFIGS.filter((config) => connectedProviders.includes(config.provider))

    // Estimate based on priority and data types (rough calculation)
    let estimatedSeconds = 0
    relevantConfigs.forEach((config) => {
      estimatedSeconds += config.dataTypes.length * 2 // 2 seconds per data type
    })

    return Math.min(estimatedSeconds, 30) // Cap at 30 seconds
  }
}

// Export singleton instance
export const globalDataPreloader = new GlobalDataPreloader()

// Helper functions for integration with the store
export async function initializePreloadingForUser(
  connectedProviders: string[],
  progressCallback?: (progress: { [key: string]: boolean }) => void,
): Promise<PreloadResult[]> {
  const hasAccess = await globalDataPreloader.validateUserAccess()
  if (!hasAccess) {
    throw new Error("User not authenticated")
  }

  return globalDataPreloader.startPreloading(connectedProviders, progressCallback)
}

export async function refreshProviderResources(provider: string): Promise<PreloadResult[]> {
  return globalDataPreloader.refreshProviderData(provider)
}

export function getPreloadingStatus(): {
  isPreloading: boolean
  results: PreloadResult[]
} {
  return {
    isPreloading: globalDataPreloader.isCurrentlyPreloading(),
    results: globalDataPreloader.getPreloadResults(),
  }
}

export function getEstimatedPreloadTime(connectedProviders: string[]): number {
  return globalDataPreloader.getEstimatedPreloadTime(connectedProviders)
}
