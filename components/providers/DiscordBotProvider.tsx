'use client'

import { useEffect, useState } from 'react'

interface DiscordBotStatus {
  isConnected: boolean
  reconnectAttempts: number
  sessionId: string | null
}

export default function DiscordBotProvider() {
  const [status, setStatus] = useState<DiscordBotStatus | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    // Only initialize on the client side
    if (typeof window === 'undefined') return

    const initializeDiscordBot = async () => {
      try {
        console.log("Initializing Discord bot on client...")
        
        // Call the API to initialize Discord Gateway
        const response = await fetch('/api/discord/initialize-presence', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        })

        if (response.ok) {
          const data = await response.json()
          setStatus(data.status)
          setIsInitialized(true)
          console.log("Discord bot initialized successfully:", data.status)
        } else {
          console.warn("Failed to initialize Discord bot:", response.status)
        }
      } catch (error) {
        console.error("Error initializing Discord bot:", error)
      }
    }

    // Initialize Discord bot
    initializeDiscordBot()

    // Set up periodic status checks
    const statusInterval = setInterval(async () => {
      try {
        const response = await fetch('/api/discord/initialize-presence')
        if (response.ok) {
          const data = await response.json()
          setStatus(data.status)
        }
      } catch (error) {
        console.error("Error checking Discord bot status:", error)
      }
    }, 30000) // Check every 30 seconds

    return () => {
      clearInterval(statusInterval)
    }
  }, [])

  // Don't render anything, this is just for initialization
  return null
} 