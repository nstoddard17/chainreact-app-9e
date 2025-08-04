'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Bot, AlertCircle, CheckCircle, ExternalLink } from 'lucide-react'

interface DiscordBotStatusProps {
  guildId?: string
  className?: string
}

interface BotStatus {
  isInGuild: boolean
  hasPermissions: boolean
  error?: string
}

export default function DiscordBotStatus({ guildId, className = '' }: DiscordBotStatusProps) {
  const [status, setStatus] = useState<BotStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const checkBotStatus = async () => {
      if (!guildId) {
        setStatus({ isInGuild: false, hasPermissions: false, error: 'No guild ID provided' })
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        
        // Call the API to check bot status
        const response = await fetch(`/api/discord/bot-status?guildId=${guildId}`)
        const data = await response.json()
        
        if (response.ok) {
          setStatus(data)
        } else {
          setStatus({ isInGuild: false, hasPermissions: false, error: data.error || 'Failed to check bot status' })
        }
      } catch (error) {
        console.error('Error checking Discord bot status:', error)
        setStatus({ isInGuild: false, hasPermissions: false, error: 'Failed to check bot status' })
      } finally {
        setIsLoading(false)
      }
    }

    checkBotStatus()
  }, [guildId])

  const handleAddBot = () => {
    // Open Discord bot invite URL
    const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID
    const permissions = '8' // Administrator permissions
    const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=bot%20applications.commands`
    
    window.open(inviteUrl, '_blank')
  }

  if (isLoading) {
    return (
      <Card className={`border-slate-200 ${className}`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
            <span className="text-sm text-slate-600">Checking bot status...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!status) {
    return null
  }

  if (status.isInGuild && status.hasPermissions) {
    return (
      <Card className={`border-green-200 bg-green-50 ${className}`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium text-green-800">Discord Bot Ready</span>
            <Badge variant="secondary" className="text-xs">Connected</Badge>
          </div>
          <p className="text-xs text-green-700 mt-1">
            Bot is in the server and has required permissions
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Alert className={`border-orange-200 bg-orange-50 ${className}`}>
      <AlertCircle className="h-4 w-4 text-orange-600" />
      <AlertDescription className="text-orange-800">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Discord Bot Not Available</p>
            <p className="text-sm mt-1">
              {status.error || 'The bot needs to be added to this Discord server'}
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleAddBot}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            <Bot className="h-3 w-3 mr-1" />
            Add Bot
            <ExternalLink className="h-3 w-3 ml-1" />
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
} 