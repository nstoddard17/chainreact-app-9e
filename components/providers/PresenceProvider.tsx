"use client"

import { useEffect } from 'react'
import { usePresence } from '@/hooks/use-presence'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/utils/supabaseClient'

interface PresenceProviderProps {
  children: React.ReactNode
}

export function PresenceProvider({ children }: PresenceProviderProps) {
  const { user } = useAuthStore()
  const { onlineUsers, isOnline, onlineCount, updatePresence } = usePresence()

  useEffect(() => {
    // Only log when user is authenticated to avoid noise
    if (user?.id) {
      console.log('PresenceProvider: User online status:', isOnline)
      console.log('PresenceProvider: Total online users:', onlineCount)
    }
  }, [isOnline, onlineCount, user?.id])

  // Function to remove user from database presence
  const removeFromDatabasePresence = async () => {
    if (!user?.id) return
    
    try {
      const { error } = await supabase
        .from('user_presence')
        .delete()
        .eq('id', user.id)
      
      if (error) {
        console.error('PresenceProvider: Error removing from database:', error)
      } else {
        console.log('PresenceProvider: Removed from database presence')
      }
    } catch (error) {
      console.error('PresenceProvider: Failed to remove from database:', error)
    }
  }

  // Handle page visibility changes to update presence
  useEffect(() => {
    if (!user?.id) return

    const handleVisibilityChange = async () => {
      if (document.hidden) {
        console.log('PresenceProvider: Page hidden, user going away')
        // Remove from database when page is hidden
        await removeFromDatabasePresence()
      } else {
        console.log('PresenceProvider: Page visible, user active')
        // Update presence when page becomes visible again
        if (updatePresence) {
          await updatePresence({ online_at: new Date().toISOString() })
        }
      }
    }

    const handleBeforeUnload = async () => {
      console.log('PresenceProvider: Page unloading, cleaning up presence')
      // Remove from database when user leaves
      await removeFromDatabasePresence()
    }

    // Handle when user closes tab/browser
    const handleUnload = async () => {
      console.log('PresenceProvider: User leaving, cleaning up presence')
      await removeFromDatabasePresence()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('unload', handleUnload)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('unload', handleUnload)
    }
  }, [user?.id, updatePresence])

  // For debugging in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && user?.id) {
      const logInterval = setInterval(() => {
        console.log('PresenceProvider Debug:', {
          isOnline,
          onlineCount,
          totalUsers: onlineUsers.length,
          currentUser: user.id,
        })
      }, 30000) // Log every 30 seconds

      return () => clearInterval(logInterval)
    }
  }, [isOnline, onlineCount, onlineUsers.length, user?.id])

  return <>{children}</>
}

// Optional: Export a component that shows online status for admin/debugging
export function OnlineStatusIndicator() {
  const { onlineCount, isOnline } = usePresence()
  const { user } = useAuthStore()

  if (!user?.id) return null

  return (
    <div className="fixed bottom-4 right-4 bg-gray-900/90 text-white px-3 py-2 rounded-lg text-sm backdrop-blur-sm border border-gray-700">
      <div className="flex items-center gap-2">
        <div 
          className={`w-2 h-2 rounded-full ${
            isOnline ? 'bg-green-500' : 'bg-red-500'
          }`}
        />
        <span>
          {isOnline ? 'Online' : 'Offline'} • {onlineCount} users
        </span>
      </div>
    </div>
  )
} 