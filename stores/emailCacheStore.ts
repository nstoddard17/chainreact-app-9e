import { createCacheStore, loadOnce, registerStore } from "./cacheStore"
import { supabase } from "@/utils/supabaseClient"

// Types from existing email cache service
export interface EmailSuggestion {
  value: string
  label: string
  email: string
  name?: string
  type?: string
  frequency: number
  source: string
  photo?: string
  aliases?: string[]
}

export interface EmailStats {
  totalEmails: number
  totalUsage: number
  topEmails: EmailSuggestion[]
  sourceBreakdown: Record<string, number>
}

// Default empty values
const DEFAULT_EMAIL_STATS: EmailStats = {
  totalEmails: 0,
  totalUsage: 0,
  topEmails: [],
  sourceBreakdown: {}
};

// Create cache stores for different email data types
export const useFrequentEmailsStore = createCacheStore<EmailSuggestion[]>("frequentEmails")
export const useEmailStatsStore = createCacheStore<EmailStats>("emailStats")

// Register stores for auth-based clearing
registerStore({
  clearData: () => useFrequentEmailsStore.getState().clearData()
})

registerStore({
  clearData: () => useEmailStatsStore.getState().clearData()
})

/**
 * Track email usage - send to API
 */
export async function trackEmailUsage(
  emails: string[], 
  source: string, 
  integrationId?: string
): Promise<boolean> {
  try {
    const response = await fetch('/api/integrations/email-cache/track-usage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        emails,
        source,
        integrationId
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to track email usage')
    }

    // Clear the cache after tracking new emails
    useFrequentEmailsStore.getState().clearData()
    useEmailStatsStore.getState().clearData()
    
    return true
  } catch (error) {
    console.error('Failed to track email usage:', error)
    return false
  }
}

/**
 * Fetch frequent emails from API
 */
async function fetchFrequentEmails(source?: string, limit: number = 50): Promise<EmailSuggestion[]> {
  const params = new URLSearchParams()
  if (source) params.append('source', source)
  params.append('limit', limit.toString())

  const response = await fetch(`/api/integrations/email-cache/track-usage?${params}`)

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || 'Failed to get frequent emails')
  }

  return await response.json()
}

/**
 * Load frequent emails with caching
 */
export async function loadFrequentEmails(
  source?: string, 
  limit: number = 50, 
  forceRefresh = false
): Promise<EmailSuggestion[]> {
  const result = await loadOnce({
    getter: () => useFrequentEmailsStore.getState().data,
    setter: (data) => useFrequentEmailsStore.getState().setData(data),
    fetcher: () => fetchFrequentEmails(source, limit),
    options: {
      forceRefresh,
      setLoading: (loading) => useFrequentEmailsStore.getState().setLoading(loading),
      onError: (error) => useFrequentEmailsStore.getState().setError(error.message),
      checkStale: () => useFrequentEmailsStore.getState().isStale(10 * 60 * 1000) // 10 minutes
    }
  })
  
  return result || []
}

/**
 * Fetch email statistics from API
 */
async function fetchEmailStats(): Promise<EmailStats> {
  const response = await fetch('/api/integrations/email-cache/track-usage?stats=true')

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || 'Failed to get email stats')
  }

  return await response.json()
}

/**
 * Load email statistics with caching
 */
export async function loadEmailStats(forceRefresh = false): Promise<EmailStats> {
  const result = await loadOnce({
    getter: () => useEmailStatsStore.getState().data,
    setter: (data) => useEmailStatsStore.getState().setData(data),
    fetcher: fetchEmailStats,
    options: {
      forceRefresh,
      setLoading: (loading) => useEmailStatsStore.getState().setLoading(loading),
      onError: (error) => useEmailStatsStore.getState().setError(error.message),
      checkStale: () => useEmailStatsStore.getState().isStale(15 * 60 * 1000) // 15 minutes
    }
  })
  
  return result || DEFAULT_EMAIL_STATS
} 