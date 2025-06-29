"use client"

import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/authStore'

export function UserActivityTracker() {
  const { user } = useAuthStore()
  const isActiveRef = useRef(false)

  useEffect(() => {
    if (!user?.id) {
      console.log('UserActivityTracker: No user, skipping setup')
      isActiveRef.current = false
      return
    }

    isActiveRef.current = true

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
      // Check if component is still active and user still exists
      if (!isActiveRef.current) {
        console.log('UserActivityTracker: Component no longer active, stopping updates')
        return
      }

      const currentUser = useAuthStore.getState().user
      if (!currentUser?.id) {
        console.log('UserActivityTracker: User no longer exists, stopping updates')
        isActiveRef.current = false
        return
      }

      const now = Date.now()
      
      // Only update if enough time has passed since last update
      if (now - lastUpdate < UPDATE_INTERVAL) {
        console.log('UserActivityTracker: Skipping update, too soon')
        return
      }

      try {
        console.log('UserActivityTracker: Updating presence...')
        const response = await fetch('/api/user/presence', { method: 'POST' })
        
        if (response.status === 401) {
          console.log('UserActivityTracker: Unauthorized, user likely signed out, stopping updates')
          isActiveRef.current = false
          return
        }
        
        if (response.ok) {
          console.log('UserActivityTracker: Presence updated successfully')
        } else {
          console.error('UserActivityTracker: Failed to update presence', response.status)
        }
        lastUpdate = now
      } catch (error) {
        console.error('UserActivityTracker: Error updating presence', error)
        // If we get a network error, it might be because user signed out
        // Don't stop tracking for network errors, only for auth errors
      }
    }

    const handleActivity = () => {
      // Check if component is still active and user still exists
      if (!isActiveRef.current) {
        return
      }

      const currentUser = useAuthStore.getState().user
      if (!currentUser?.id) {
        console.log('UserActivityTracker: User no longer exists, skipping activity')
        isActiveRef.current = false
        return
      }

      // Clear existing timeout
      clearTimeout(timeoutId)
      
      // Set new timeout to update presence after 10 seconds of inactivity
      timeoutId = setTimeout(updatePresence, 10000)
    }

    // Handle signout event
    const handleSignout = () => {
      console.log('UserActivityTracker: Signout event received, stopping all activities')
      isActiveRef.current = false
      clearTimeout(timeoutId)
      clearInterval(intervalId)
      events.forEach(event => {
        document.removeEventListener(event, handleActivity)
      })
      window.removeEventListener('user-signout', handleSignout)
    }

    // Track various user activities
    const events = [
      'mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click',
      'focus', 'blur', 'input', 'change', 'submit'
    ]
    
    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true })
    })

    // Listen for signout event
    window.addEventListener('user-signout', handleSignout)

    // Update presence immediately and then every 2 minutes
    updatePresence()
    const intervalId = setInterval(updatePresence, 120000)

    return () => {
      console.log('UserActivityTracker: Cleaning up')
      isActiveRef.current = false
      clearTimeout(timeoutId)
      clearInterval(intervalId)
      events.forEach(event => {
        document.removeEventListener(event, handleActivity)
      })
      window.removeEventListener('user-signout', handleSignout)
    }
  }, [user])

  return null // This component doesn't render anything
} 