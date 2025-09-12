import { useState, useCallback, useEffect } from 'react'
import { 
  EmailSuggestion, 
  EmailStats, 
  loadFrequentEmails, 
  loadEmailStats, 
  trackEmailUsage as trackEmails,
  useFrequentEmailsStore, 
  useEmailStatsStore 
} from '@/stores/emailCacheStore'
import useCacheManager from './use-cache-manager'

export interface UseEmailCacheReturn {
  trackEmailUsage: (emails: string[], source: string, integrationId?: string) => Promise<void>
  getFrequentEmails: (source?: string, limit?: number) => Promise<EmailSuggestion[]>
  getEmailStats: () => Promise<EmailStats>
  frequentEmails: EmailSuggestion[] | null
  emailStats: EmailStats | null
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useEmailCache(): UseEmailCacheReturn {
  // Initialize cache manager for auth state changes
  useCacheManager()
  
  // Use our cached stores
  const { 
    data: frequentEmails, 
    loading: loadingEmails, 
    error: emailsError 
  } = useFrequentEmailsStore()
  
  const { 
    data: emailStats, 
    loading: loadingStats, 
    error: statsError 
  } = useEmailStatsStore()
  
  // Combined loading and error states
  const isLoading = loadingEmails || loadingStats
  const error = emailsError || statsError

  // Tracking email usage
  const trackEmailUsage = useCallback(async (
    emails: string[], 
    source: string, 
    integrationId?: string
  ): Promise<void> => {
    await trackEmails(emails, source, integrationId)
  }, [])

  // Get frequent emails with cache
  const getFrequentEmails = useCallback(async (
    source?: string, 
    limit: number = 50
  ): Promise<EmailSuggestion[]> => {
    return await loadFrequentEmails(source, limit)
  }, [])

  // Get email stats with cache
  const getEmailStats = useCallback(async (): Promise<EmailStats> => {
    return await loadEmailStats()
  }, [])
  
  // Force refresh all email data
  const refresh = useCallback(async (): Promise<void> => {
    await Promise.all([
      loadFrequentEmails(undefined, 50, true),
      loadEmailStats(true)
    ])
  }, [])

  // Removed automatic loading on mount to prevent rapid API calls
  // Data will be loaded on-demand when actually needed

  return {
    trackEmailUsage,
    getFrequentEmails,
    getEmailStats,
    frequentEmails,
    emailStats,
    isLoading,
    error,
    refresh
  }
}

// Helper hook for tracking emails when workflow executes
export function useWorkflowEmailTracking() {
  const { trackEmailUsage } = useEmailCache()

  const trackWorkflowEmails = useCallback(async (
    workflowConfig: Record<string, any>,
    integrationId?: string
  ) => {
    try {
      const emailsToTrack: string[] = []
      
      // Extract emails from common email fields
      const emailFields = ['to', 'cc', 'bcc', 'recipients', 'email']
      
      emailFields.forEach(field => {
        if (workflowConfig[field]) {
          if (Array.isArray(workflowConfig[field])) {
            emailsToTrack.push(...workflowConfig[field])
          } else if (typeof workflowConfig[field] === 'string') {
            emailsToTrack.push(workflowConfig[field])
          }
        }
      })

      if (emailsToTrack.length > 0) {
        // Determine source from workflow type or integration
        const source = workflowConfig.type?.includes('gmail') ? 'gmail' :
                      workflowConfig.type?.includes('outlook') ? 'outlook' :
                      'workflow'

        await trackEmailUsage(emailsToTrack, source, integrationId)
      }
    } catch (error) {
      console.error('Failed to track workflow emails:', error)
    }
  }, [trackEmailUsage])

  return { trackWorkflowEmails }
} 