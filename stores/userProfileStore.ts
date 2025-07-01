import { createCacheStore, loadOnce, registerStore } from "./cacheStore"
import { supabase } from "@/utils/supabaseClient"

// Define the user profile type
export interface UserProfile {
  id: string
  username?: string
  full_name?: string
  first_name?: string
  last_name?: string
  avatar_url?: string
  company?: string
  job_title?: string
  role?: string
  updated_at?: string
}

// Create a cache store for user profiles
export const useUserProfileStore = createCacheStore<UserProfile>("userProfile")

// Register the store for auth-based clearing
registerStore({
  clearData: () => useUserProfileStore.getState().clearData()
})

// Helper function to fetch the user profile from Supabase
export async function fetchUserProfile(): Promise<UserProfile> {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error("Not authenticated")
  }
  
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, username, full_name, first_name, last_name, avatar_url, company, job_title, role, updated_at')
    .eq('id', user.id)
    .single()
    
  if (error) {
    throw error
  }
  
  return data
}

// Helper function to load the user profile once
export async function loadUserProfile(forceRefresh = false) {
  return loadOnce({
    getter: () => useUserProfileStore.getState().data,
    setter: (data) => useUserProfileStore.getState().setData(data),
    fetcher: fetchUserProfile,
    options: {
      forceRefresh,
      setLoading: (loading) => useUserProfileStore.getState().setLoading(loading),
      onError: (error) => useUserProfileStore.getState().setError(error.message),
      checkStale: () => useUserProfileStore.getState().isStale(15 * 60 * 1000) // 15 minutes
    }
  })
} 