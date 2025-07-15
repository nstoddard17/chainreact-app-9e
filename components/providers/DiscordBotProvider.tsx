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

  // Don't render anything, this is just a placeholder for future Discord functionality
  // Discord will be initialized on-demand when Discord nodes are actually used
  return null
} 