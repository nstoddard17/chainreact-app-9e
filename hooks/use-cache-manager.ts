"use client"

import { useEffect } from "react"
import { clearAllStores } from "@/stores/cacheStore"
import { supabase } from "@/utils/supabaseClient"

/**
 * Hook to manage cache across the application
 * Automatically clears all registered stores on auth state change (logout)
 */
export function useCacheManager() {
  useEffect(() => {
    // Set up auth state change listener to clear caches on logout
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (!session && event === 'USER_UPDATED')) {
        console.log('🧹 Clearing all caches due to auth state change:', event)
        clearAllStores()
      }
    })

    // Clean up subscription when component unmounts
    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return {
    clearAllCaches: clearAllStores
  }
}

export default useCacheManager 