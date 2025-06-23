import { useState, useCallback } from 'react'
import { EmailCacheService, EmailSuggestion } from '@/lib/services/emailCacheService'

export interface UseEmailCacheReturn {
  trackEmailUsage: (emails: string[], source: string, integrationId?: string) => Promise<void>
  getFrequentEmails: (source?: string, limit?: number) => Promise<EmailSuggestion[]>
  getEmailStats: () => Promise<{
    totalEmails: number
    totalUsage: number
    topEmails: EmailSuggestion[]
    sourceBreakdown: Record<string, number>
  }>
  isLoading: boolean
  error: string | null
}

export function useEmailCache(): UseEmailCacheReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trackEmailUsage = useCallback(async (
    emails: string[], 
    source: string, 
    integrationId?: string
  ): Promise<void> => {
    try {
      setIsLoading(true)
      setError(null)

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

      const result = await response.json()
      console.log(`Tracked ${result.tracked} emails successfully`)

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'
      setError(errorMessage)
      console.error('Failed to track email usage:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const getFrequentEmails = useCallback(async (
    source?: string, 
    limit: number = 50
  ): Promise<EmailSuggestion[]> => {
    try {
      setIsLoading(true)
      setError(null)

      const params = new URLSearchParams()
      if (source) params.append('source', source)
      params.append('limit', limit.toString())

      const response = await fetch(`/api/integrations/email-cache/track-usage?${params}`)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to get frequent emails')
      }

      const emails = await response.json()
      return emails

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'
      setError(errorMessage)
      console.error('Failed to get frequent emails:', err)
      return []
    } finally {
      setIsLoading(false)
    }
  }, [])

  const getEmailStats = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch('/api/integrations/email-cache/track-usage?stats=true')

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to get email stats')
      }

      const stats = await response.json()
      return stats

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'
      setError(errorMessage)
      console.error('Failed to get email stats:', err)
      return {
        totalEmails: 0,
        totalUsage: 0,
        topEmails: [],
        sourceBreakdown: {}
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  return {
    trackEmailUsage,
    getFrequentEmails,
    getEmailStats,
    isLoading,
    error
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