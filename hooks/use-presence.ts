"use client"

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/utils/supabaseClient'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface OnlineUser {
  user_id: string
  username?: string
  full_name?: string
  avatar_url?: string
  online_at: string
}

export function usePresence() {
  const { user, profile } = useAuthStore()
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([])
  const [isOnline, setIsOnline] = useState(false)
  const [channel, setChannel] = useState<RealtimeChannel | null>(null)

  // Function to update database presence
  const updateDatabasePresence = async () => {
    if (!user?.id) return

    try {
      // Upsert user presence in database
      const { error } = await supabase
        .from('user_presence')
        .upsert({
          id: user.id,
          full_name: profile?.full_name || profile?.first_name || user.name || 'Unknown',
          email: user.email || 'No email',
          role: profile?.role || 'free',
          last_seen: new Date().toISOString(),
        }, {
          onConflict: 'id'
        })

      if (error) {
        console.error('Presence: Error updating database:', error)
      } else {
        console.log('Presence: Database updated successfully')
      }
    } catch (error) {
      console.error('Presence: Database update failed:', error)
    }
  }

  useEffect(() => {
    if (!user?.id) {
      console.log('Presence: No user, skipping setup')
      return
    }

    console.log('Presence: Setting up for user:', user.id)

    // Create a unique channel for presence
    const presenceChannel = supabase.channel('online-users', {
      config: {
        presence: {
          key: user.id,
        },
      },
    })

    setChannel(presenceChannel)

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        console.log('Presence: Syncing online users')
        const presenceState = presenceChannel.presenceState()
        const users: OnlineUser[] = []
        
        Object.values(presenceState).forEach((presences: any) => {
          presences.forEach((presence: any) => {
            users.push(presence)
          })
        })
        
        setOnlineUsers(users)
        console.log('Presence: Online users updated:', users.length)
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        console.log('Presence: User(s) joined:', newPresences)
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        console.log('Presence: User(s) left:', leftPresences)
      })
      .subscribe(async (status) => {
        console.log('Presence: Channel status:', status)
        
        if (status === 'SUBSCRIBED') {
          console.log('Presence: Successfully subscribed, tracking user as online')
          
          // Track current user as online in realtime
          const userPresence: OnlineUser = {
            user_id: user.id,
            username: profile?.username,
            full_name: profile?.full_name || profile?.first_name || user.name,
            avatar_url: profile?.avatar_url || user.avatar,
            online_at: new Date().toISOString(),
          }

          const trackResult = await presenceChannel.track(userPresence)
          console.log('Presence: Track result:', trackResult)
          
          // Also update database for admin interface
          await updateDatabasePresence()
          
          setIsOnline(true)
        } else if (status === 'CHANNEL_ERROR') {
          console.error('Presence: Channel error occurred')
          setIsOnline(false)
        } else if (status === 'TIMED_OUT') {
          console.error('Presence: Channel timed out')
          setIsOnline(false)
        }
      })

    // Update database presence every 2 minutes to keep it fresh
    const presenceInterval = setInterval(updateDatabasePresence, 2 * 60 * 1000)

    // Cleanup function
    return () => {
      console.log('Presence: Cleaning up')
      setIsOnline(false)
      clearInterval(presenceInterval)
      if (presenceChannel) {
        presenceChannel.untrack()
        presenceChannel.unsubscribe()
      }
    }
  }, [user?.id, profile?.username, profile?.full_name, profile?.avatar_url, profile?.role])

  // Function to manually update presence (useful for status changes)
  const updatePresence = async (updates: Partial<OnlineUser>) => {
    if (!channel || !user?.id) return

    const updatedPresence = {
      user_id: user.id,
      username: profile?.username,
      full_name: profile?.full_name || profile?.first_name || user.name,
      avatar_url: profile?.avatar_url || user.avatar,
      online_at: new Date().toISOString(),
      ...updates,
    }

    const result = await channel.track(updatedPresence)
    console.log('Presence: Updated presence:', result)
    
    // Also update database
    await updateDatabasePresence()
    
    return result
  }

  return {
    onlineUsers,
    isOnline,
    onlineCount: onlineUsers.length,
    updatePresence,
  }
} 