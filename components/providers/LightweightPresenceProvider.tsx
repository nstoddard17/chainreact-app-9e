"use client"

import { createContext, useContext, useMemo } from 'react'
import { useSingleTabPresence } from '@/hooks/use-single-tab-presence'

interface PresenceContextValue {
  onlineCount: number
  isConnected: boolean
  isLeaderTab: boolean
  tabId: string
}

const PresenceContext = createContext<PresenceContextValue | null>(null)

interface LightweightPresenceProviderProps {
  children: React.ReactNode
}

export function LightweightPresenceProvider({ children }: LightweightPresenceProviderProps) {
  const presence = useSingleTabPresence()
  
  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    onlineCount: presence.onlineCount,
    isConnected: presence.isConnected,
    isLeaderTab: presence.isLeaderTab,
    tabId: presence.tabId,
  }), [
    presence.onlineCount,
    presence.isConnected,
    presence.isLeaderTab,
    presence.tabId,
  ])

  return (
    <PresenceContext.Provider value={contextValue}>
      {children}
    </PresenceContext.Provider>
  )
}

// Custom hook to use presence context
export function usePresence() {
  const context = useContext(PresenceContext)
  if (!context) {
    // Return default values if not in provider (for backwards compatibility)
    return {
      onlineCount: 0,
      isConnected: false,
      isLeaderTab: false,
      tabId: 'unknown',
    }
  }
  return context
}

// Lightweight presence indicator component
export function OnlineUsersIndicator({ className }: { className?: string }) {
  const { onlineCount, isConnected, isLeaderTab } = usePresence()
  
  // Only show if we have a valid count
  if (!isConnected && onlineCount === 0) {
    return null
  }
  
  return (
    <div className={className}>
      <div className="flex items-center gap-2 text-sm">
        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-yellow-500'} ${isConnected ? 'animate-pulse' : ''}`} />
        <span className="text-muted-foreground">
          {onlineCount} {onlineCount === 1 ? 'user' : 'users'} online
          {isLeaderTab && (
            <span className="ml-1 text-xs text-muted-foreground/50">(leader)</span>
          )}
        </span>
      </div>
    </div>
  )
}