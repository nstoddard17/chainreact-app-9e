'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react'

interface DiscordConfig {
  isConfigured: boolean
  missingVars: string[]
  botToken: string | null
  botUserId: string | null
}

interface DiscordConfigResponse {
  success: boolean
  config: DiscordConfig
  setupInstructions: string[]
  timestamp: string
}

export default function DiscordBotDebug() {
  const [config, setConfig] = useState<DiscordConfigResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checkConfig = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/api/discord/check-config')
      const data = await response.json()
      
      if (data.success) {
        setConfig(data)
      } else {
        setError(data.error || 'Failed to check configuration')
      }
    } catch (err) {
      setError('Failed to check Discord configuration')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    checkConfig()
  }, [])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Discord Bot Configuration</CardTitle>
          <CardDescription>Checking configuration...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Discord Bot Configuration</CardTitle>
          <CardDescription>Error checking configuration</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button onClick={checkConfig} className="mt-4">
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!config) {
    return null
  }

  const { config: discordConfig, setupInstructions } = config

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Discord Bot Configuration
          {discordConfig.isConfigured ? (
            <Badge variant="default" className="bg-green-500">
              <CheckCircle className="h-3 w-3 mr-1" />
              Configured
            </Badge>
          ) : (
            <Badge variant="destructive">
              <XCircle className="h-3 w-3 mr-1" />
              Not Configured
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Check if your Discord bot is properly configured for the workflow builder
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Configuration Status */}
        <div className="space-y-2">
          <h4 className="font-medium">Environment Variables</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex items-center justify-between p-2 border rounded">
              <span>DISCORD_BOT_TOKEN</span>
              {discordConfig.botToken ? (
                <Badge variant="default" className="bg-green-500">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Set
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <XCircle className="h-3 w-3 mr-1" />
                  Missing
                </Badge>
              )}
            </div>
            <div className="flex items-center justify-between p-2 border rounded">
              <span>DISCORD_BOT_USER_ID</span>
              {discordConfig.botUserId ? (
                <Badge variant="default" className="bg-green-500">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Set
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <XCircle className="h-3 w-3 mr-1" />
                  Missing
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Missing Variables */}
        {discordConfig.missingVars.length > 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Missing environment variables: {discordConfig.missingVars.join(', ')}
            </AlertDescription>
          </Alert>
        )}

        {/* Setup Instructions */}
        <div className="space-y-2">
          <h4 className="font-medium flex items-center gap-2">
            <Info className="h-4 w-4" />
            Setup Instructions
          </h4>
          <div className="bg-muted p-4 rounded-lg">
            <ol className="list-decimal list-inside space-y-1 text-sm">
              {setupInstructions.map((instruction, index) => (
                <li key={index} className="text-muted-foreground">
                  {instruction}
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Important Notes */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Important:</strong> Make sure to enable these Privileged Gateway Intents in your Discord Developer Portal:
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Server Members Intent</li>
              <li>Message Content Intent</li>
            </ul>
            Without these intents, the bot will not be able to connect to Discord Gateway and will show error 4013.
          </AlertDescription>
        </Alert>

        <Button onClick={checkConfig} variant="outline">
          Refresh Configuration
        </Button>
      </CardContent>
    </Card>
  )
} 