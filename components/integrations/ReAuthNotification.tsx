'use client'

import { useEffect, useState } from 'react'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useAuthStore } from '@/stores/authStore'
import { AlertTriangle, X, RefreshCw, Clock } from 'lucide-react'
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
  const [expiringCount, setExpiringCount] = useState(0)
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
    const now = Date.now()
    if (dismissedUntil && now < dismissedUntil) {
      setIsVisible(false)
      return
    }

    // Count integrations that need re-authorization
    const reAuthIntegrations = integrations.filter(
      integration => integration.status === 'needs_reauthorization' || 
                     integration.status === 'expired'
    )

    // Count integrations that are expiring soon (within 10 minutes)
    const expiringIntegrations = integrations.filter(integration => {
      if (integration.status !== 'connected' || !integration.expires_at) return false
      
      const expiresAt = new Date(integration.expires_at).getTime()
      const now = Date.now()
      const tenMinutesMs = 10 * 60 * 1000
      
      return expiresAt > now && expiresAt < now + tenMinutesMs
    })

    const reAuthCount = reAuthIntegrations.length
    const expiringCount = expiringIntegrations.length
    
    setNeedsReAuthCount(reAuthCount)
    setExpiringCount(expiringCount)
    setIsVisible(reAuthCount > 0 || expiringCount > 0)
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

  const totalCount = needsReAuthCount + expiringCount
  const hasReAuth = needsReAuthCount > 0
  const hasExpiring = expiringCount > 0

  return (
    <div className={cn(
      "fixed top-4 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-md",
      className
    )}>
      <Alert className={cn(
        "shadow-lg border-l-4",
        hasReAuth 
          ? "border-red-200 bg-red-50" 
          : "border-yellow-200 bg-yellow-50"
      )}>
        {hasReAuth ? (
          <AlertTriangle className="h-4 w-4 text-red-600" />
        ) : (
          <Clock className="h-4 w-4 text-yellow-600" />
        )}
        <AlertDescription className={cn(
          hasReAuth ? "text-red-800" : "text-yellow-800"
        )}>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <span className="font-medium">
                {totalCount} integration{totalCount !== 1 ? 's' : ''} need{totalCount !== 1 ? '' : 's'} attention
              </span>
              <p className="text-sm mt-1 opacity-90">
                {hasReAuth && hasExpiring && (
                  <>
                    {needsReAuthCount} need{needsReAuthCount !== 1 ? '' : 's'} re-authorization, {expiringCount} expiring soon
                  </>
                )}
                {hasReAuth && !hasExpiring && (
                  <>
                    {needsReAuthCount} integration{needsReAuthCount !== 1 ? 's' : ''} need{needsReAuthCount !== 1 ? '' : 's'} re-authorization
                  </>
                )}
                {!hasReAuth && hasExpiring && (
                  <>
                    {expiringCount} integration{expiringCount !== 1 ? 's' : ''} expiring soon
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 ml-4">
              <Button
                onClick={handleGoToIntegrations}
                size="sm"
                variant="outline"
                className={cn(
                  "hover:bg-opacity-80",
                  hasReAuth 
                    ? "border-red-300 text-red-700 hover:bg-red-100" 
                    : "border-yellow-300 text-yellow-700 hover:bg-yellow-100"
                )}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Fix Now
              </Button>
              <Button
                onClick={handleDismiss}
                size="sm"
                variant="ghost"
                className={cn(
                  "p-1 h-8 w-8",
                  hasReAuth 
                    ? "text-red-600 hover:bg-red-100" 
                    : "text-yellow-600 hover:bg-yellow-100"
                )}
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