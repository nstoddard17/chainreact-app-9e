import { supabase } from "@/lib/supabase"

interface PreloadResult {
  provider: string
  dataType: string
  success: boolean
  count: number
  error?: string
  duration: number
}

export class GlobalDataPreloader {
  private static instance: GlobalDataPreloader
  private preloadPromises: Map<string, Promise<any>> = new Map()
  private preloadResults: Map<string, PreloadResult> = new Map()

  static getInstance(): GlobalDataPreloader {
    if (!GlobalDataPreloader.instance) {
      GlobalDataPreloader.instance = new GlobalDataPreloader()
    }
    return GlobalDataPreloader.instance
  }

  async preloadAllUserData(userId: string): Promise<PreloadResult[]> {
    console.log(`🚀 Starting enhanced global preload for user: ${userId}`)

    // Get connected integrations
    const { data: integrations } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "connected")

    if (!integrations || integrations.length === 0) {
      console.log("❌ No connected integrations found")
      return []
    }

    const preloadTasks: Array<{ provider: string; dataType: string }> = []

    // Define what to preload for each provider
    const PRELOAD_MAP = {
      notion: ["pages", "databases"],
      slack: ["channels", "users"],
      github: ["repositories"],
      "google-sheets": ["spreadsheets"],
      "google-calendar": ["calendars"],
      "google-drive": ["folders"],
      airtable: ["bases"],
      trello: ["boards"],
      hubspot: ["pipelines"],
    }

    // Build preload task list
    integrations.forEach((integration) => {
      const dataTypes = PRELOAD_MAP[integration.provider as keyof typeof PRELOAD_MAP]
      if (dataTypes) {
        dataTypes.forEach((dataType) => {
          preloadTasks.push({ provider: integration.provider, dataType })
        })
      }
    })

    console.log(`📋 Preloading ${preloadTasks.length} resource types across ${integrations.length} providers`)

    // Execute preload tasks with concurrency control
    const results = await this.executePreloadTasks(preloadTasks)

    console.log(`🎉 Global preload completed: ${results.filter((r) => r.success).length}/${results.length} successful`)

    return results
  }

  private async executePreloadTasks(tasks: Array<{ provider: string; dataType: string }>): Promise<PreloadResult[]> {
    const BATCH_SIZE = 3 // Process 3 at a time to avoid rate limits
    const results: PreloadResult[] = []

    for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
      const batch = tasks.slice(i, i + BATCH_SIZE)
      const batchPromises = batch.map((task) => this.preloadSingleResource(task.provider, task.dataType))

      const batchResults = await Promise.allSettled(batchPromises)

      batchResults.forEach((result, index) => {
        const task = batch[index]
        if (result.status === "fulfilled") {
          results.push(result.value)
        } else {
          results.push({
            provider: task.provider,
            dataType: task.dataType,
            success: false,
            count: 0,
            error: result.reason?.message || "Unknown error",
            duration: 0,
          })
        }
      })

      // Small delay between batches to be respectful to APIs
      if (i + BATCH_SIZE < tasks.length) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    return results
  }

  private async preloadSingleResource(provider: string, dataType: string): Promise<PreloadResult> {
    const startTime = Date.now()
    const cacheKey = `${provider}-${dataType}`

    try {
      // Check if already preloading
      if (this.preloadPromises.has(cacheKey)) {
        console.log(`⏳ Already preloading ${cacheKey}, waiting...`)
        return await this.preloadPromises.get(cacheKey)!
      }

      // Start preloading
      const preloadPromise = this.fetchResourceData(provider, dataType)
      this.preloadPromises.set(cacheKey, preloadPromise)

      const data = await preloadPromise
      const duration = Date.now() - startTime

      const result: PreloadResult = {
        provider,
        dataType,
        success: true,
        count: data.length,
        duration,
      }

      this.preloadResults.set(cacheKey, result)
      console.log(`✅ Preloaded ${cacheKey}: ${data.length} items in ${duration}ms`)

      return result
    } catch (error: any) {
      const duration = Date.now() - startTime
      const result: PreloadResult = {
        provider,
        dataType,
        success: false,
        count: 0,
        error: error.message,
        duration,
      }

      this.preloadResults.set(cacheKey, result)
      console.error(`❌ Failed to preload ${cacheKey}:`, error.message)

      return result
    } finally {
      this.preloadPromises.delete(cacheKey)
    }
  }

  private async fetchResourceData(provider: string, dataType: string): Promise<any[]> {
    const response = await fetch("/api/integrations/fetch-user-data", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ provider, dataType }),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error || "Failed to fetch data")
    }

    return result.data || []
  }

  getPreloadResults(): Map<string, PreloadResult> {
    return new Map(this.preloadResults)
  }

  clearCache(): void {
    this.preloadPromises.clear()
    this.preloadResults.clear()
    console.log("🧹 Preload cache cleared")
  }
}

export const globalDataPreloader = GlobalDataPreloader.getInstance()
