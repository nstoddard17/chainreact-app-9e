'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Bot, AlertCircle, CheckCircle, ExternalLink } from 'lucide-react'
import { LightningLoader } from '@/components/ui/lightning-loader'

import { logger } from '@/lib/utils/logger'

interface DiscordBotStatusProps {
  guildId?: string
  className?: string
}

interface BotStatus {
  isInGuild: boolean
  hasPermissions: boolean
  error?: string
}

interface DiscordConfig {
  configured: boolean
  clientId?: string
  error?: string
}

export default function DiscordBotStatus({ guildId, className = '' }: DiscordBotStatusProps) {
  const [status, setStatus] = useState<BotStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [discordConfig, setDiscordConfig] = useState<DiscordConfig | null>(null)
  const [isBotConnectionInProgress, setIsBotConnectionInProgress] = useState(false)

  // Load Discord configuration
  useEffect(() => {
    const loadDiscordConfig = async () => {
      try {
        const response = await fetch('/api/discord/config')
        const config = await response.json()
        setDiscordConfig(config)
      } catch (error) {
        logger.error('Error loading Discord config:', error)
        setDiscordConfig({ configured: false, error: 'Failed to load Discord configuration' })
      }
    }

    loadDiscordConfig()
  }, [])

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
        logger.error('Error checking Discord bot status:', error)
        setStatus({ isInGuild: false, hasPermissions: false, error: 'Failed to check bot status' })
      } finally {
        setIsLoading(false)
      }
    }

    checkBotStatus()
  }, [guildId])

  const handleAddBot = () => {
    if (!discordConfig?.configured || !discordConfig?.clientId || !guildId) {
      logger.error('Discord not configured or missing guild ID')
      return
    }

    setIsBotConnectionInProgress(true)

    const permissions = '8' // Administrator permissions
    let inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${discordConfig.clientId}&permissions=${permissions}&scope=bot%20applications.commands`
    
    // Add guild_id parameter to pre-select the server
    inviteUrl += `&guild_id=${guildId}`

    // Open popup
    const popup = window.open(
      inviteUrl,
      'discord-bot-auth',
      'width=500,height=700,scrollbars=yes,resizable=yes'
    )

    if (!popup) {
      logger.error('Failed to open popup')
      setIsBotConnectionInProgress(false)
      return
    }

    // Monitor popup for completion
    const checkClosed = setInterval(async () => {
      try {
        if (popup.closed) {
          clearInterval(checkClosed)
          setIsBotConnectionInProgress(false)
          
          // Wait a moment then check bot status
          setTimeout(async () => {
            try {
              const response = await fetch(`/api/discord/bot-status?guildId=${guildId}`)
              const botStatus = await response.json()
              setStatus(botStatus)
            } catch (error) {
              logger.error('Error checking bot status after popup:', error)
            }
          }, 2000)
          
          return
        }

        // Try to detect successful authorization by checking URL
        try {
          if (popup.location && popup.location.href.includes('discord.com/oauth2/authorized')) {
            logger.debug('🎉 Bot authorization detected!')
            popup.close()
            clearInterval(checkClosed)
            setIsBotConnectionInProgress(false)
            
            // Check bot status after successful auth
            setTimeout(async () => {
              try {
                const response = await fetch(`/api/discord/bot-status?guildId=${guildId}`)
                const botStatus = await response.json()
                setStatus(botStatus)
              } catch (error) {
                logger.error('Error checking bot status after auth:', error)
              }
            }, 2000)
          }
        } catch (e) {
          // Cross-origin error is expected, continue monitoring
        }
      } catch (error) {
        logger.error('Error monitoring popup:', error)
      }
    }, 1000)

    // Cleanup timeout after 5 minutes
    setTimeout(() => {
      clearInterval(checkClosed)
      if (!popup.closed) {
        popup.close()
      }
      setIsBotConnectionInProgress(false)
    }, 5 * 60 * 1000)
  }

  if (isLoading) {
    return (
      <Card className={`border-slate-200 ${className}`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <LightningLoader size="sm" color="blue" />
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
          {discordConfig?.configured === false ? (
            <div className="bg-red-50 border border-red-200 rounded p-2">
              <p className="text-xs text-red-700">
                Discord bot not configured. Contact administrator.
              </p>
            </div>
          ) : (
            <Button
              size="sm"
              onClick={handleAddBot}
              disabled={isBotConnectionInProgress || !discordConfig?.configured}
              className="bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50"
            >
              {isBotConnectionInProgress ? (
                <div className="flex items-center gap-2">
                  <LightningLoader size="sm" color="white" />
                  Connecting...
                </div>
              ) : (
                <>
                  <Bot className="h-3 w-3 mr-1" />
                  Add Bot
                  <ExternalLink className="h-3 w-3 ml-1" />
                </>
              )}
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  )
} 