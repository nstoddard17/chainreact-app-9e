"use client"

import { useEffect, useRef, useCallback, useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/utils/supabaseClient'
import type { RealtimeChannel } from '@supabase/supabase-js'

// Broadcast channel for cross-tab communication
// Use environment-specific channel to avoid dev/prod conflicts
const BROADCAST_CHANNEL = process.env.NODE_ENV === 'development' 
  ? 'presence-tab-election-dev' 
  : 'presence-tab-election'
const LEADER_HEARTBEAT_INTERVAL = 2000 // 2 seconds (for cross-tab communication only)
const LEADER_TIMEOUT = 5000 // 5 seconds
const PRESENCE_HEARTBEAT_INTERVAL = 3600000 // 1 hour (for Supabase presence)
const USER_COUNT_UPDATE_INTERVAL = 300000 // 5 minutes (how often to fetch count)
const DB_UPDATE_INTERVAL = 3600000 // 1 hour (how often to actually update database)

// In development, reduce update frequency to handle hot reloading
const MIN_UPDATE_INTERVAL = process.env.NODE_ENV === 'development' ? 60000 : 30000 // 1 min in dev, 30s in prod

interface TabMessage {
  type: 'heartbeat' | 'election' | 'resignation'
  tabId: string
  timestamp: number
  userId?: string
}

interface OnlineUser {
  user_id: string
  username?: string
  full_name?: string
  last_seen: string
}

// Track mount time to detect hot reloading
let lastMountTime = 0

export function useSingleTabPresence() {
  const { user, profile } = useAuthStore()
  const [isLeaderTab, setIsLeaderTab] = useState(false)
  const [onlineCount, setOnlineCount] = useState(0)
  const [isConnected, setIsConnected] = useState(false)

  const tabId = useRef<string>(`tab-${Date.now()}-${Math.random()}`).current
  const mountTime = useRef<number>(Date.now()).current
  const isLeaderTabRef = useRef<boolean>(false)
  
  // Detect hot reloading in development
  const isHotReload = process.env.NODE_ENV === 'development' && 
    lastMountTime > 0 && 
    (mountTime - lastMountTime) < 1000 // Less than 1 second since last mount
  
  if (process.env.NODE_ENV === 'development') {
    lastMountTime = mountTime
  }
  const broadcastChannel = useRef<BroadcastChannel | null>(null)
  const leaderHeartbeatInterval = useRef<NodeJS.Timeout | null>(null)
  const leaderCheckInterval = useRef<NodeJS.Timeout | null>(null)
  const presenceChannel = useRef<RealtimeChannel | null>(null)
  const presenceHeartbeatInterval = useRef<NodeJS.Timeout | null>(null)
  const lastLeaderHeartbeat = useRef<number>(Date.now())
  const lastOnlineCount = useRef<number>(0)
  const dbUpdateInterval = useRef<NodeJS.Timeout | null>(null)
  const lastDbUpdateTime = useRef<number>(0)
  const pendingDbUpdate = useRef<NodeJS.Timeout | null>(null)

  // Send heartbeat as leader
  const sendLeaderHeartbeat = useCallback(() => {
    if (!broadcastChannel.current || !user?.id) return
    
    const message: TabMessage = {
      type: 'heartbeat',
      tabId,
      timestamp: Date.now(),
      userId: user.id
    }
    
    try {
      broadcastChannel.current.postMessage(message)
    } catch (error) {
      console.debug('Failed to send leader heartbeat:', error)
    }
  }, [tabId, user?.id])

  // Elect self as leader
  const becomeLeader = useCallback(async () => {
    setIsLeaderTab(true)
    isLeaderTabRef.current = true
    
    // Start leader heartbeat
    if (leaderHeartbeatInterval.current) {
      clearInterval(leaderHeartbeatInterval.current)
    }
    leaderHeartbeatInterval.current = setInterval(sendLeaderHeartbeat, LEADER_HEARTBEAT_INTERVAL)
    
    // Initialize Supabase presence ONLY for leader tab
    if (!user?.id) return
    
    // Clean up any existing channel
    if (presenceChannel.current) {
      await presenceChannel.current.untrack()
      await presenceChannel.current.unsubscribe()
      presenceChannel.current = null
    }
    
    // Create presence channel
    const channel = supabase.channel('presence-room', {
      config: {
        presence: {
          key: user.id,
        },
      },
    })
    
    presenceChannel.current = channel
    
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const userCount = Object.keys(state).length

        // Only update local state, don't call API on every sync
        if (userCount !== lastOnlineCount.current) {
          lastOnlineCount.current = userCount
          setOnlineCount(userCount)
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true)

          // Track presence
          await channel.track({
            user_id: user.id,
            username: profile?.username,
            full_name: profile?.full_name,
            online_at: new Date().toISOString(),
          })
          
          // Start presence heartbeat
          if (presenceHeartbeatInterval.current) {
            clearInterval(presenceHeartbeatInterval.current)
          }
          presenceHeartbeatInterval.current = setInterval(async () => {
            await channel.track({
              user_id: user.id,
              online_at: new Date().toISOString(),
            })
          }, PRESENCE_HEARTBEAT_INTERVAL)
          
          // Start database update interval (separate from presence)
          if (dbUpdateInterval.current) {
            clearInterval(dbUpdateInterval.current)
          }
          dbUpdateInterval.current = setInterval(() => {
            // Only update database once per hour
            if (lastOnlineCount.current > 0) {
              updateOnlineCount(lastOnlineCount.current)
            }
          }, DB_UPDATE_INTERVAL)
          
          // Do one initial update after a delay (longer in dev to handle hot reloading)
          setTimeout(() => {
            if (lastOnlineCount.current > 0) {
              updateOnlineCount(lastOnlineCount.current)
            }
          }, process.env.NODE_ENV === 'development' ? 30000 : 10000) // 30s in dev, 10s in prod
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setIsConnected(false)
        }
      })
    
    // Send initial heartbeat
    sendLeaderHeartbeat()
  }, [tabId, user?.id, profile, sendLeaderHeartbeat])

  // Resign from leadership
  const resignLeader = useCallback(async () => {
    setIsLeaderTab(false)
    isLeaderTabRef.current = false
    
    // Stop leader heartbeat
    if (leaderHeartbeatInterval.current) {
      clearInterval(leaderHeartbeatInterval.current)
      leaderHeartbeatInterval.current = null
    }
    
    // Stop database update interval
    if (dbUpdateInterval.current) {
      clearInterval(dbUpdateInterval.current)
      dbUpdateInterval.current = null
    }
    
    // Clean up presence channel
    if (presenceChannel.current) {
      await presenceChannel.current.untrack()
      await presenceChannel.current.unsubscribe()
      presenceChannel.current = null
    }
    
    // Stop presence heartbeat
    if (presenceHeartbeatInterval.current) {
      clearInterval(presenceHeartbeatInterval.current)
      presenceHeartbeatInterval.current = null
    }
    
    setIsConnected(false)
  }, [tabId])

  // Check if leader is alive
  const checkLeaderAlive = useCallback(() => {
    const now = Date.now()
    const timeSinceLastHeartbeat = now - lastLeaderHeartbeat.current

    if (timeSinceLastHeartbeat > LEADER_TIMEOUT) {
      // Leader is dead, start election

      // Announce election
      if (broadcastChannel.current && user?.id) {
        const message: TabMessage = {
          type: 'election',
          tabId,
          timestamp: now,
          userId: user.id
        }
        broadcastChannel.current.postMessage(message)
      }

      // Become leader after a random delay (to handle race conditions)
      const delay = Math.random() * 500
      setTimeout(() => {
        if (!isLeaderTabRef.current) {
          becomeLeader()
        }
      }, delay)
    }
  }, [tabId, user?.id, becomeLeader])

  // Handle broadcast messages
  const handleBroadcastMessage = useCallback((event: MessageEvent<TabMessage>) => {
    const message = event.data
    
    if (!message || typeof message !== 'object') return
    
    switch (message.type) {
      case 'heartbeat':
        // Update last heartbeat time
        lastLeaderHeartbeat.current = message.timestamp
        
        // If we're the leader but another tab is sending heartbeats, yield
        if (isLeaderTabRef.current && message.tabId !== tabId) {
          if (message.timestamp > Date.now() - LEADER_HEARTBEAT_INTERVAL * 2) {
            resignLeader()
          }
        }
        break
        
      case 'election':
        // If we're already leader, assert dominance
        if (isLeaderTabRef.current) {
          sendLeaderHeartbeat()
        }
        break
        
      case 'resignation':
        // Previous leader resigned, start election after delay
        if (!isLeaderTabRef.current) {
          setTimeout(() => {
            checkLeaderAlive()
          }, Math.random() * 1000)
        }
        break
    }
  }, [tabId, sendLeaderHeartbeat, resignLeader, checkLeaderAlive])

  // Lightweight function to update online count in database with debouncing
  const updateOnlineCount = useCallback(async (count: number) => {
    if (!user?.id) return
    
    // Debounce: Don't update if we've updated recently
    const now = Date.now()
    if (now - lastDbUpdateTime.current < MIN_UPDATE_INTERVAL) {
      // Schedule an update after the debounce period
      if (pendingDbUpdate.current) {
        clearTimeout(pendingDbUpdate.current)
      }
      pendingDbUpdate.current = setTimeout(() => {
        updateOnlineCount(count)
      }, MIN_UPDATE_INTERVAL - (now - lastDbUpdateTime.current))
      return
    }
    
    lastDbUpdateTime.current = now
    
    try {
      // Use a simple endpoint to update count
      const response = await fetch('/api/presence/update-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId: user.id,
          count,
          timestamp: new Date().toISOString()
        })
      })
      
      // Don't throw on non-200 responses, just log
      if (!response.ok) {
        console.debug(`Presence update returned ${response.status}`)
      }
    } catch (error) {
      console.debug('Failed to update online count:', error)
    }
  }, [user?.id])

  // Initialize
  useEffect(() => {
    if (!user?.id) {
      return
    }

    // Skip initialization during hot reload to prevent election storms
    if (isHotReload) {
      return
    }

    // Create broadcast channel for cross-tab communication
    if ('BroadcastChannel' in window) {
      broadcastChannel.current = new BroadcastChannel(BROADCAST_CHANNEL)
      broadcastChannel.current.onmessage = handleBroadcastMessage

      // Start election process
      checkLeaderAlive()

      // Periodically check if leader is alive (only for non-leaders)
      leaderCheckInterval.current = setInterval(() => {
        if (!isLeaderTabRef.current) {
          checkLeaderAlive()
        }
      }, LEADER_TIMEOUT / 2)
    } else {
      // Fallback: if BroadcastChannel not supported, always be leader
      becomeLeader()
    }

    // Handle tab close/unload
    const handleUnload = () => {
      if (isLeaderTabRef.current && broadcastChannel.current) {
        // Announce resignation
        const message: TabMessage = {
          type: 'resignation',
          tabId,
          timestamp: Date.now(),
          userId: user.id
        }

        // Try to send resignation message
        try {
          broadcastChannel.current.postMessage(message)
        } catch (error) {
          console.debug('Failed to send resignation:', error)
        }
      }

      // Clean up
      resignLeader()
    }

    window.addEventListener('beforeunload', handleUnload)
    window.addEventListener('pagehide', handleUnload)

    // Cleanup
    return () => {
      handleUnload()

      if (leaderCheckInterval.current) {
        clearInterval(leaderCheckInterval.current)
      }

      if (dbUpdateInterval.current) {
        clearInterval(dbUpdateInterval.current)
      }

      if (pendingDbUpdate.current) {
        clearTimeout(pendingDbUpdate.current)
      }

      if (broadcastChannel.current) {
        broadcastChannel.current.close()
      }

      window.removeEventListener('beforeunload', handleUnload)
      window.removeEventListener('pagehide', handleUnload)
    }
    // Remove handleBroadcastMessage, checkLeaderAlive, becomeLeader, resignLeader from deps
    // These are callbacks that don't need to trigger re-initialization
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isHotReload, tabId])

  // Fetch online count periodically (for all tabs, not just leader)
  useEffect(() => {
    if (!user?.id) return

    const fetchOnlineCount = async () => {
      try {
        const response = await fetch('/api/presence/count')
        const data = await response.json()
        if (data.count !== undefined) {
          setOnlineCount(data.count)
        }
      } catch (error) {
        console.debug('Failed to fetch online count:', error)
      }
    }

    // Fetch immediately
    fetchOnlineCount()

    // Then fetch periodically
    const interval = setInterval(fetchOnlineCount, USER_COUNT_UPDATE_INTERVAL)

    return () => clearInterval(interval)
  }, [user?.id])

  return {
    isLeaderTab,
    onlineCount,
    isConnected,
    tabId,
  }
}