"use client"

import { createContext, useContext, useMemo } from 'react'
import { usePresenceOptimized } from '@/hooks/use-presence-optimized'

interface PresenceContextValue {
  onlineUsers: Array<{
    user_id: string
    username?: string
    full_name?: string
    avatar_url?: string
    online_at: string
    status?: 'active' | 'idle' | 'away'
  }>
  onlineCount: number
  isOnline: boolean
  userStatus: 'active' | 'idle' | 'away'
  updatePresence: (updates: any) => Promise<void>
}

const PresenceContext = createContext<PresenceContextValue | null>(null)

interface PresenceProviderOptimizedProps {
  children: React.ReactNode
  options?: {
    heartbeatInterval?: number
    idleTimeout?: number
    enableDatabase?: boolean
  }
}

export function PresenceProviderOptimized({ 
  children, 
  options = {} 
}: PresenceProviderOptimizedProps) {
  const presence = usePresenceOptimized(options)
  
  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => presence, [
    presence.onlineUsers,
    presence.onlineCount,
    presence.isOnline,
    presence.userStatus,
    presence.updatePresence,
  ])

  return (
    <PresenceContext.Provider value={contextValue}>
      {children}
    </PresenceContext.Provider>
  )
}

// Custom hook to use presence context
export function usePresenceContext() {
  const context = useContext(PresenceContext)
  if (!context) {
    throw new Error('usePresenceContext must be used within PresenceProviderOptimized')
  }
  return context
}

// Optional: Presence indicator component
export function PresenceIndicator({ className }: { className?: string }) {
  const { isOnline, onlineCount, userStatus } = usePresenceContext()
  
  const statusColors = {
    active: 'bg-green-500',
    idle: 'bg-yellow-500',
    away: 'bg-gray-500',
  }
  
  const statusText = {
    active: 'Active',
    idle: 'Idle',
    away: 'Away',
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-2 text-sm">
        <div className={`w-2 h-2 rounded-full ${isOnline ? statusColors[userStatus] : 'bg-red-500'}`} />
        <span className="text-muted-foreground">
          {isOnline ? statusText[userStatus] : 'Offline'} • {onlineCount} online
        </span>
      </div>
    </div>
  )
}