"use client"

import { useEffect, useRef, useCallback, useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/utils/supabaseClient'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface OnlineUser {
  user_id: string
  username?: string
  full_name?: string
  avatar_url?: string
  online_at: string
  status?: 'active' | 'idle' | 'away'
}

interface UsePresenceOptions {
  heartbeatInterval?: number // milliseconds
  idleTimeout?: number // milliseconds
  enableDatabase?: boolean // whether to persist to database
}

const DEFAULT_OPTIONS: UsePresenceOptions = {
  heartbeatInterval: 30000, // 30 seconds
  idleTimeout: 300000, // 5 minutes
  enableDatabase: true,
}

export function usePresenceOptimized(options: UsePresenceOptions = {}) {
  const { user, profile } = useAuthStore()
  const [onlineUsers, setOnlineUsers] = useState<Map<string, OnlineUser>>(new Map())
  const [isOnline, setIsOnline] = useState(false)
  const [userStatus, setUserStatus] = useState<'active' | 'idle' | 'away'>('active')
  
  const channelRef = useRef<RealtimeChannel | null>(null)
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastActivityRef = useRef<number>(Date.now())
  const retryCountRef = useRef(0)
  const maxRetries = 3
  
  const opts = { ...DEFAULT_OPTIONS, ...options }

  // Debounced database update
  const updateDatabaseDebounced = useCallback(() => {
    if (!opts.enableDatabase || !user?.id) return

    // Use requestIdleCallback for non-critical updates
    if ('requestIdleCallback' in window) {
      requestIdleCallback(async () => {
        try {
          await supabase
            .from('user_presence')
            .upsert({
              id: user.id,
              full_name: profile?.full_name || 'Unknown',
              email: user.email || '',
              role: profile?.role || 'free',
              last_seen: new Date().toISOString(),
              status: userStatus,
            }, {
              onConflict: 'id'
            })
        } catch (error) {
          // Silent fail for non-critical updates
          console.debug('Presence DB update failed:', error)
        }
      })
    }
  }, [user?.id, profile, userStatus, opts.enableDatabase])

  // Activity detection
  const handleActivity = useCallback(() => {
    lastActivityRef.current = Date.now()
    
    if (userStatus !== 'active') {
      setUserStatus('active')
      
      // Update presence channel
      if (channelRef.current && user?.id) {
        channelRef.current.track({
          user_id: user.id,
          status: 'active',
          online_at: new Date().toISOString(),
        })
      }
    }
    
    // Reset idle timer
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
    }
    
    idleTimerRef.current = setTimeout(() => {
      setUserStatus('idle')
      if (channelRef.current && user?.id) {
        channelRef.current.track({
          user_id: user.id,
          status: 'idle',
          online_at: new Date().toISOString(),
        })
      }
    }, opts.idleTimeout)
  }, [user?.id, userStatus, opts.idleTimeout])

  // Heartbeat mechanism
  const sendHeartbeat = useCallback(async () => {
    if (!channelRef.current || !user?.id) return

    const now = Date.now()
    const timeSinceActivity = now - lastActivityRef.current
    const currentStatus = timeSinceActivity > opts.idleTimeout ? 'idle' : 'active'

    try {
      await channelRef.current.track({
        user_id: user.id,
        username: profile?.username,
        full_name: profile?.full_name,
        avatar_url: profile?.avatar_url,
        online_at: new Date().toISOString(),
        status: currentStatus,
      })
      
      // Reset retry count on success
      retryCountRef.current = 0
      
      // Update database periodically (debounced)
      updateDatabaseDebounced()
    } catch (error) {
      console.debug('Heartbeat failed:', error)
      
      // Implement exponential backoff for retries
      if (retryCountRef.current < maxRetries) {
        retryCountRef.current++
        const backoffDelay = Math.min(1000 * Math.pow(2, retryCountRef.current), 30000)
        setTimeout(sendHeartbeat, backoffDelay)
      }
    }
  }, [user?.id, profile, opts.idleTimeout, updateDatabaseDebounced])

  // Initialize presence
  useEffect(() => {
    if (!user?.id) return

    let isMounted = true

    const initializePresence = async () => {
      // Clean up any existing channel
      if (channelRef.current) {
        await channelRef.current.untrack()
        await channelRef.current.unsubscribe()
      }

      const channel = supabase.channel(`presence:${user.id}`, {
        config: {
          presence: {
            key: user.id,
          },
        },
      })

      channelRef.current = channel

      channel
        .on('presence', { event: 'sync' }, () => {
          if (!isMounted) return
          
          const state = channel.presenceState()
          const users = new Map<string, OnlineUser>()
          
          Object.entries(state).forEach(([key, presences]) => {
            if (Array.isArray(presences) && presences.length > 0) {
              // Take the most recent presence for each user
              const latestPresence = presences[presences.length - 1] as OnlineUser
              users.set(key, latestPresence)
            }
          })
          
          setOnlineUsers(users)
        })
        .subscribe(async (status) => {
          if (!isMounted) return
          
          if (status === 'SUBSCRIBED') {
            setIsOnline(true)
            
            // Initial presence track
            await channel.track({
              user_id: user.id,
              username: profile?.username,
              full_name: profile?.full_name,
              avatar_url: profile?.avatar_url,
              online_at: new Date().toISOString(),
              status: 'active',
            })
            
            // Start heartbeat
            if (heartbeatIntervalRef.current) {
              clearInterval(heartbeatIntervalRef.current)
            }
            heartbeatIntervalRef.current = setInterval(sendHeartbeat, opts.heartbeatInterval)
            
            // Initial database update
            updateDatabaseDebounced()
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setIsOnline(false)
            
            // Exponential backoff retry
            if (retryCountRef.current < maxRetries) {
              const backoffDelay = Math.min(1000 * Math.pow(2, retryCountRef.current), 30000)
              retryCountRef.current++
              
              setTimeout(() => {
                if (isMounted && channelRef.current) {
                  channelRef.current.subscribe()
                }
              }, backoffDelay)
            }
          }
        })
    }

    initializePresence()

    // Activity listeners
    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll']
    activityEvents.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true })
    })

    // Visibility change handler
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setUserStatus('away')
        if (channelRef.current && user?.id) {
          channelRef.current.track({
            user_id: user.id,
            status: 'away',
            online_at: new Date().toISOString(),
          })
        }
      } else {
        handleActivity()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Cleanup
    return () => {
      isMounted = false
      
      // Clear intervals
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
      }
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current)
      }
      
      // Remove listeners
      activityEvents.forEach(event => {
        window.removeEventListener(event, handleActivity)
      })
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      
      // Clean up channel
      if (channelRef.current) {
        channelRef.current.untrack().then(() => {
          channelRef.current?.unsubscribe()
        })
      }
      
      // Final database cleanup
      if (opts.enableDatabase && user?.id) {
        // Use sendBeacon for reliable cleanup on page unload
        const payload = JSON.stringify({ user_id: user.id })
        navigator.sendBeacon?.('/api/presence/cleanup', payload)
      }
    }
  }, [user?.id]) // Minimal dependencies to prevent re-subscriptions

  // Manual presence update
  const updatePresence = useCallback(async (updates: Partial<OnlineUser>) => {
    if (!channelRef.current || !user?.id) return

    const presence = {
      user_id: user.id,
      username: profile?.username,
      full_name: profile?.full_name,
      avatar_url: profile?.avatar_url,
      online_at: new Date().toISOString(),
      status: userStatus,
      ...updates,
    }

    await channelRef.current.track(presence)
    updateDatabaseDebounced()
  }, [user?.id, profile, userStatus, updateDatabaseDebounced])

  return {
    onlineUsers: Array.from(onlineUsers.values()),
    onlineCount: onlineUsers.size,
    isOnline,
    userStatus,
    updatePresence,
  }
}