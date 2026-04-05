import { useState, useEffect } from 'react'
import { useAuth } from './use-auth'
import { useApiClient } from './use-api-client'

export interface MicrosoftGraphSubscription {
  id: string
  resource: string
  changeType: string
  expirationDateTime: string
  status: 'active' | 'expired' | 'deleted'
  createdAt: string
}

export interface MicrosoftSubscriptionSelection {
  teams?: { teamId: string; channelId: string; name: string }[]
  chats?: { chatId: string; name: string }[]
  mail?: boolean
  calendar?: boolean
  onedrive?: boolean
  onenote?: boolean
}

export function useMicrosoftGraphSubscriptions() {
  const { user } = useAuth()
  const apiClient = useApiClient()
  const [subscriptions, setSubscriptions] = useState<MicrosoftGraphSubscription[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [healthStatus, setHealthStatus] = useState<'active' | 'renewing' | 'error' | null>(null)

  // Fetch user's subscriptions
  const fetchSubscriptions = async () => {
    if (!user) return

    setLoading(true)
    setError(null)

    try {
      const response = await apiClient.get('/api/microsoft-graph/subscriptions')
      
      if (response.ok) {
        const data = await response.json()
        setSubscriptions(data.subscriptions || [])
        
        // Determine health status
        if (data.subscriptions?.length > 0) {
          // Check if any are expiring soon (within 12 hours)
          const now = new Date()
          const hasExpiringSoon = data.subscriptions.some((sub: MicrosoftGraphSubscription) => {
            const expirationDate = new Date(sub.expirationDateTime)
            const hoursUntilExpiration = (expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60)
            return hoursUntilExpiration < 12
          })
          
          setHealthStatus(hasExpiringSoon ? 'renewing' : 'active')
        } else {
          setHealthStatus(null)
        }
      } else {
        setError('Failed to fetch subscriptions')
        setHealthStatus('error')
      }
    } catch (err) {
      setError('An error occurred while fetching subscriptions')
      setHealthStatus('error')
    } finally {
      setLoading(false)
    }
  }

  // Create subscriptions based on user selections
  const createSubscriptions = async (selections: MicrosoftSubscriptionSelection) => {
    if (!user) return { success: false, error: 'User not authenticated' }

    setLoading(true)
    setError(null)

    try {
      const response = await apiClient.post('/api/microsoft-graph/auto-subscribe', {
        userId: user.id,
        selections
      })

      if (response.ok) {
        const data = await response.json()
        await fetchSubscriptions() // Refresh the list
        return { success: true, data }
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to create subscriptions')
        setHealthStatus('error')
        return { success: false, error: errorData.error }
      }
    } catch (err: any) {
      const errorMessage = err.message || 'An error occurred while creating subscriptions'
      setError(errorMessage)
      setHealthStatus('error')
      return { success: false, error: errorMessage }
    } finally {
      setLoading(false)
    }
  }

  // Delete a subscription
  const deleteSubscription = async (subscriptionId: string) => {
    if (!user) return { success: false, error: 'User not authenticated' }

    setLoading(true)
    setError(null)

    try {
      const response = await apiClient.delete(`/api/microsoft-graph/subscriptions/${subscriptionId}`)

      if (response.ok) {
        await fetchSubscriptions() // Refresh the list
        return { success: true }
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to delete subscription')
        return { success: false, error: errorData.error }
      }
    } catch (err: any) {
      const errorMessage = err.message || 'An error occurred while deleting subscription'
      setError(errorMessage)
      return { success: false, error: errorMessage }
    } finally {
      setLoading(false)
    }
  }

  // Check subscription health
  const checkHealth = async () => {
    if (!user) return { success: false, error: 'User not authenticated' }

    setLoading(true)
    setError(null)

    try {
      const response = await apiClient.get(`/api/microsoft-graph/auto-subscribe?userId=${user.id}`)

      if (response.ok) {
        const data = await response.json()
        
        if (data.status === 'ok') {
          setHealthStatus(data.expiringSubscriptions > 0 ? 'renewing' : 'active')
        } else {
          setHealthStatus('error')
          setError(data.error || 'Subscription health check failed')
        }
        
        return { success: true, data }
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to check subscription health')
        setHealthStatus('error')
        return { success: false, error: errorData.error }
      }
    } catch (err: any) {
      const errorMessage = err.message || 'An error occurred while checking subscription health'
      setError(errorMessage)
      setHealthStatus('error')
      return { success: false, error: errorMessage }
    } finally {
      setLoading(false)
    }
  }

  // Load subscriptions when user changes
  useEffect(() => {
    if (user) {
      fetchSubscriptions()
    } else {
      setSubscriptions([])
      setHealthStatus(null)
    }
  }, [user])

  return {
    subscriptions,
    loading,
    error,
    healthStatus,
    fetchSubscriptions,
    createSubscriptions,
    deleteSubscription,
    checkHealth
  }
}
