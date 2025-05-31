import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import type { Database } from "@/types/supabase"

// Flag to track if warning has been shown
let warningShown = false

// Suppress the GoTrueClient warning by patching console.warn
const originalWarn = console.warn
console.warn = (...args) => {
  // Check if this is the GoTrueClient warning
  if (args[0] && typeof args[0] === "string" && args[0].includes("Multiple GoTrueClient instances detected")) {
    // Only show it once
    if (!warningShown) {
      warningShown = true
      originalWarn.apply(console, ["Supabase warning suppressed after first occurrence"])
    }
    return
  }
  originalWarn.apply(console, args)
}

// Global singleton instance
let globalSupabaseClient: ReturnType<typeof createClientComponentClient<Database>> | null = null

// Create the client only once
export function getSupabaseClient() {
  if (globalSupabaseClient) return globalSupabaseClient

  try {
    if (typeof window !== "undefined") {
      // We're in the browser
      globalSupabaseClient = createClientComponentClient<Database>()
    } else {
      // We're on the server, create a new instance each time
      return createClientComponentClient<Database>()
    }
  } catch (error) {
    console.error("Failed to create Supabase client:", error)
    return null
  }

  return globalSupabaseClient
}

// Export a single instance
export const supabase = getSupabaseClient()
