"use client"

import { useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'

export function UserActivityTracker() {
  const { user } = useAuthStore()

  useEffect(() => {
    if (!user?.id) return

    const sendHeartbeat = async () => {
      try {
        await fetch('/api/user/presence', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })
      } catch (error) {
        console.error('Failed to send heartbeat:', error)
      }
    }

    let timeoutId: NodeJS.Timeout
    let lastUpdate = 0
    const UPDATE_INTERVAL = 30000 // Update every 30 seconds max

    const updatePresence = async () => {
      const now = Date.now()
      
      // Only update if enough time has passed since last update
      if (now - lastUpdate < UPDATE_INTERVAL) {
        console.log('UserActivityTracker: Skipping update, too soon')
        return
      }

      try {
        console.log('UserActivityTracker: Updating presence...')
        const response = await fetch('/api/user/presence', { method: 'POST' })
        if (response.ok) {
          console.log('UserActivityTracker: Presence updated successfully')
        } else {
          console.error('UserActivityTracker: Failed to update presence', response.status)
        }
        lastUpdate = now
      } catch (error) {
        console.error('UserActivityTracker: Error updating presence', error)
      }
    }

    const handleActivity = () => {
      // Clear existing timeout
      clearTimeout(timeoutId)
      
      // Set new timeout to update presence after 10 seconds of inactivity
      timeoutId = setTimeout(updatePresence, 10000)
    }

    // Track various user activities
    const events = [
      'mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click',
      'focus', 'blur', 'input', 'change', 'submit'
    ]
    
    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true })
    })

    // Update presence immediately and then every 2 minutes
    updatePresence()
    const intervalId = setInterval(updatePresence, 120000)

    return () => {
      console.log('UserActivityTracker: Cleaning up')
      clearTimeout(timeoutId)
      clearInterval(intervalId)
      events.forEach(event => {
        document.removeEventListener(event, handleActivity)
      })
    }
  }, [user])

  return null // This component doesn't render anything
} 