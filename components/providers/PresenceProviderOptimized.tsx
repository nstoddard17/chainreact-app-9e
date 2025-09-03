"use client"

import { createContext, useContext, useMemo } from 'react'
import { useRealtimePresence, type PresenceUser } from '@/hooks/use-realtime-presence'

interface PresenceContextValue {
  onlineUsers: PresenceUser[]
  onlineCount: number
  isOnline: boolean
  userStatus: 'online' | 'away' | 'offline'
  updatePresence: (status?: 'online' | 'away' | 'offline') => Promise<void>
}

const PresenceContext = createContext<PresenceContextValue | null>(null)

interface PresenceProviderOptimizedProps {
  children: React.ReactNode
  options?: {
    roomId?: string
    enablePresence?: boolean
    updateInterval?: number
  }
}

export function PresenceProviderOptimized({ 
  children, 
  options = {} 
}: PresenceProviderOptimizedProps) {
  const presence = useRealtimePresence(options)
  
  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    onlineUsers: presence.onlineUsers,
    onlineCount: presence.totalOnline,
    isOnline: presence.isConnected,
    userStatus: presence.userStatus,
    updatePresence: presence.updatePresence,
  }), [
    presence.onlineUsers,
    presence.totalOnline,
    presence.isConnected,
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
    online: 'bg-green-500',
    away: 'bg-yellow-500',
    offline: 'bg-gray-500',
  }
  
  const statusText = {
    online: 'Online',
    away: 'Away',
    offline: 'Offline',
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-2 text-sm">
        <div className={`w-2 h-2 rounded-full ${isOnline ? statusColors[userStatus] : 'bg-red-500'} animate-pulse`} />
        <span className="text-muted-foreground">
          {isOnline ? statusText[userStatus] : 'Offline'} • {onlineCount} online
        </span>
      </div>
    </div>
  )
}