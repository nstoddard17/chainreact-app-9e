'use client'

import { useEffect, useState } from 'react'
import { initializeDiscordBot, getDiscordBotStatus, cleanupDiscordBot } from '@/lib/startup/discordBot'

interface DiscordBotStatus {
  isConnected: boolean
  reconnectAttempts: number
  sessionId: string | null
}

export default function DiscordBotProvider() {
  const [status, setStatus] = useState<DiscordBotStatus | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    const initializeBot = async () => {
      try {
        // Initialize Discord bot on app startup
        await initializeDiscordBot()
        setIsInitialized(true)
        
        // Get initial status
        const botStatus = getDiscordBotStatus()
        setStatus(botStatus)
        
        // Set up periodic status checks to ensure bot stays connected
        const statusInterval = setInterval(() => {
          const currentStatus = getDiscordBotStatus()
          setStatus(currentStatus)
          
          // If bot is not connected, try to reinitialize
          if (!currentStatus.isConnected && isInitialized) {
            console.log('Discord bot disconnected, attempting to reconnect...')
            initializeDiscordBot()
          }
        }, 30000) // Check every 30 seconds
        
        return () => {
          clearInterval(statusInterval)
        }
      } catch (error) {
        console.error('Failed to initialize Discord bot:', error)
      }
    }

    initializeBot()

    // Cleanup on unmount
    return () => {
      cleanupDiscordBot()
    }
  }, [])

  // Don't render anything visible, this is just for bot management
  return null
} 