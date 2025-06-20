'use client'

import { useEffect, useState } from 'react'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useAuthStore } from '@/stores/authStore'
import { AlertTriangle, X, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'

interface ReAuthNotificationProps {
  className?: string
}

const DISMISSAL_KEY = 'reauth-notification-dismissed'

export function ReAuthNotification({ className }: ReAuthNotificationProps) {
  const { integrations } = useIntegrationStore()
  const { user } = useAuthStore()
  const [isVisible, setIsVisible] = useState(false)
  const [needsReAuthCount, setNeedsReAuthCount] = useState(0)
  const [dismissedUntil, setDismissedUntil] = useState<number | null>(null)

  // Load dismissal state from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(DISMISSAL_KEY)
      if (stored) {
        const timestamp = parseInt(stored, 10)
        if (!isNaN(timestamp)) {
          setDismissedUntil(timestamp)
        }
      }
    }
  }, [])

  useEffect(() => {
    if (!user || !integrations.length) {
      setIsVisible(false)
      return
    }

    // Check if notification was dismissed
    const now = new Date()
    if (dismissedUntil && now.getTime() < dismissedUntil) {
      setIsVisible(false)
      return
    }

    // Use the same logic as the UI to determine expired integrations
    const reAuthIntegrations = integrations.filter(integration => {
      // Check database status first
      if (integration.status === 'needs_reauthorization' || integration.status === 'expired') {
        console.log(`🔴 Integration ${integration.provider} needs re-auth (status: ${integration.status})`)
        return true
      }
      
      // Check if connected integration has expired based on expires_at timestamp
      if (integration.status === 'connected' && integration.expires_at) {
        const expiresAt = new Date(integration.expires_at)
        // Use the same approach as UI: UTC timestamps for comparison to avoid timezone issues
        const expiryTimestamp = expiresAt.getTime()
        const nowTimestamp = now.getTime()
        
        // If expired (past the expiry time)
        if (expiryTimestamp <= nowTimestamp) {
          console.log(`🔴 Integration ${integration.provider} needs re-auth (expired at ${expiresAt.toISOString()}, now: ${now.toISOString()})`)
          return true
        }
      }
      
      return false
    })

    const reAuthCount = reAuthIntegrations.length
    console.log(`📊 Re-auth notification: ${reAuthCount} integrations need re-authorization`)
    setNeedsReAuthCount(reAuthCount)
    setIsVisible(reAuthCount > 0)
  }, [user, integrations, dismissedUntil])

  const handleDismiss = () => {
    // Dismiss for 1 hour
    const oneHourFromNow = Date.now() + (60 * 60 * 1000)
    setDismissedUntil(oneHourFromNow)
    setIsVisible(false)
    
    // Store in localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem(DISMISSAL_KEY, oneHourFromNow.toString())
    }
  }

  const handleGoToIntegrations = () => {
    window.location.href = '/integrations'
  }

  if (!isVisible) return null

  return (
    <div className={cn(
      "fixed top-4 left-1/2 transform -translate-x-1/2 z-[100] w-full max-w-md",
      className
    )}>
      <Alert className="border-red-200 bg-red-50 shadow-lg border-l-4">
        <AlertTriangle className="h-4 w-4 text-red-600" />
        <AlertDescription className="text-red-800">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <span className="font-medium">
                {needsReAuthCount} integration{needsReAuthCount !== 1 ? 's' : ''} need{needsReAuthCount !== 1 ? '' : 's'} re-authorization
              </span>
              <p className="text-sm mt-1 opacity-90">
                Please reconnect your integrations to continue using them.
              </p>
            </div>
            <div className="flex items-center gap-2 ml-4">
              <Button
                onClick={handleGoToIntegrations}
                size="sm"
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-100"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Reconnect
              </Button>
              <Button
                onClick={handleDismiss}
                size="sm"
                variant="ghost"
                className="text-red-600 hover:bg-red-100 p-1 h-8 w-8"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  )
} 