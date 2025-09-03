'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { RealtimeChannel, RealtimePresenceState } from '@supabase/supabase-js'
import { getSupabaseClient } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

export interface PresenceUser {
  user_id: string
  email: string
  full_name: string
  online_at: string
  status?: 'online' | 'away' | 'offline'
}

export interface UseRealtimePresenceOptions {
  roomId?: string
  enablePresence?: boolean
  updateInterval?: number
}

const DEFAULT_OPTIONS: UseRealtimePresenceOptions = {
  roomId: 'global',
  enablePresence: true,
  updateInterval: 30000, // Update presence every 30 seconds
}

export function useRealtimePresence(options: UseRealtimePresenceOptions = {}) {
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [userStatus, setUserStatus] = useState<'online' | 'away' | 'offline'>('online')
  const { user, profile } = useAuthStore()
  const supabase = getSupabaseClient()
  const channelRef = useRef<RealtimeChannel | null>(null)
  const presenceRef = useRef<any>(null)
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null)
  
  const opts = { ...DEFAULT_OPTIONS, ...options }

  // Update user's own presence
  const updatePresence = useCallback(async (status: 'online' | 'away' | 'offline' = 'online') => {
    if (!channelRef.current || !user) return
    
    const presence = {
      user_id: user.id,
      email: user.email || '',
      full_name: profile?.full_name || user.user_metadata?.full_name || 'Unknown',
      online_at: new Date().toISOString(),
      status,
    }
    
    presenceRef.current = presence
    
    try {
      await channelRef.current.track(presence)
      setUserStatus(status)
    } catch (error) {
      console.debug('Failed to update presence:', error)
    }
  }, [user, profile])

  // Handle visibility change for away status
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        updatePresence('away')
      } else {
        updatePresence('online')
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [updatePresence])

  // Handle user activity for auto-away
  useEffect(() => {
    let inactivityTimer: NodeJS.Timeout

    const resetInactivityTimer = () => {
      clearTimeout(inactivityTimer)
      if (userStatus === 'away' && !document.hidden) {
        updatePresence('online')
      }
      inactivityTimer = setTimeout(() => {
        updatePresence('away')
      }, 5 * 60 * 1000) // 5 minutes of inactivity
    }

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart']
    events.forEach(event => {
      document.addEventListener(event, resetInactivityTimer)
    })

    resetInactivityTimer()

    return () => {
      clearTimeout(inactivityTimer)
      events.forEach(event => {
        document.removeEventListener(event, resetInactivityTimer)
      })
    }
  }, [updatePresence, userStatus])

  // Setup presence channel
  useEffect(() => {
    if (!opts.enablePresence || !user) return

    let channel: RealtimeChannel | null = null
    let updateInterval: NodeJS.Timeout | null = null

    const setupPresence = async () => {
      try {
        // Create a presence channel
        channel = supabase.channel(`presence:${opts.roomId}`, {
          config: {
            presence: {
              key: user.id,
            },
          },
        })

        channelRef.current = channel

        // Track presence state
        channel
          .on('presence', { event: 'sync' }, () => {
            const state: RealtimePresenceState<PresenceUser> = channel!.presenceState()
            const users = Object.values(state).flat() as PresenceUser[]
            
            // Filter out duplicates and sort by online_at
            const uniqueUsers = Array.from(
              new Map(users.map(u => [u.user_id, u])).values()
            ).sort((a, b) => 
              new Date(b.online_at).getTime() - new Date(a.online_at).getTime()
            )
            
            setOnlineUsers(uniqueUsers)
          })
          .on('presence', { event: 'join' }, ({ key, newPresences }) => {
            console.debug('User joined:', key, newPresences)
          })
          .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
            console.debug('User left:', key, leftPresences)
          })
          .subscribe(async (status) => {
            setIsConnected(status === 'SUBSCRIBED')
            
            if (status === 'SUBSCRIBED') {
              // Send initial presence
              await updatePresence('online')
              
              // Set up periodic presence updates to maintain connection
              updateInterval = setInterval(() => {
                if (presenceRef.current && channelRef.current) {
                  channelRef.current.track({
                    ...presenceRef.current,
                    online_at: new Date().toISOString(),
                  }).catch(err => {
                    console.debug('Failed to update presence:', err)
                  })
                }
              }, opts.updateInterval)
              
              updateIntervalRef.current = updateInterval
            }
          })
      } catch (error) {
        console.error('Failed to setup presence:', error)
        setIsConnected(false)
      }
    }

    setupPresence()

    // Cleanup on unmount
    return () => {
      // Clear the interval
      if (updateInterval) {
        clearInterval(updateInterval)
      }
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current)
        updateIntervalRef.current = null
      }
      
      // Untrack and remove channel
      if (channel) {
        channel.untrack().catch(() => {
          // Ignore errors during cleanup
        })
        
        // Use setTimeout to avoid immediate removal issues
        setTimeout(() => {
          if (channel) {
            try {
              supabase.removeChannel(channel)
            } catch (error) {
              // Ignore removal errors
              console.debug('Channel removal error (safe to ignore):', error)
            }
          }
        }, 100)
      }
      
      channelRef.current = null
    }
  }, [user?.id, opts.roomId, opts.enablePresence, opts.updateInterval]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    onlineUsers,
    isConnected,
    userStatus,
    updatePresence,
    totalOnline: onlineUsers.length,
  }
}