"use client"

import React from "react"
import { Plug, ExternalLink, CheckCircle } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface IntegrationConnectionRendererProps {
  provider: string
  providerName: string
  oauthUrl: string
  action?: 'connect' | 'reconnect'
  className?: string
}

export function IntegrationConnectionRenderer({
  provider,
  providerName,
  oauthUrl,
  action = 'connect',
  className
}: IntegrationConnectionRendererProps) {
  const handleConnect = () => {
    // Open OAuth flow in new window
    const width = 600
    const height = 700
    const left = (window.screen.width / 2) - (width / 2)
    const top = (window.screen.height / 2) - (height / 2)

    window.open(
      oauthUrl,
      'oauth',
      `width=${width},height=${height},left=${left},top=${top}`
    )
  }

  return (
    <Card className={cn("mt-3 p-6 border-2 border-primary/20", className)}>
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className="flex-shrink-0 w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
          <Plug className="w-6 h-6 text-primary" />
        </div>

        {/* Content */}
        <div className="flex-1 space-y-3">
          <div>
            <h3 className="font-semibold text-lg">
              {action === 'reconnect' ? 'Reconnect' : 'Connect'} {providerName}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {action === 'reconnect'
                ? `Your ${providerName} connection needs to be refreshed. Click below to re-authorize.`
                : `Click the button below to securely connect your ${providerName} account.`
              }
            </p>
          </div>

          {/* Connection Button */}
          <Button
            onClick={handleConnect}
            className="w-full sm:w-auto"
            size="lg"
          >
            <Plug className="w-4 h-4 mr-2" />
            {action === 'reconnect' ? 'Reconnect' : 'Connect'} {providerName}
          </Button>

          {/* Security Note */}
          <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
            <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-muted-foreground">
              <strong>Secure OAuth:</strong> We use industry-standard OAuth 2.0. Your credentials are encrypted and we never see your password.
            </div>
          </div>

          {/* What happens next */}
          <div className="text-xs text-muted-foreground space-y-1">
            <div className="font-medium">What happens next:</div>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>You'll be redirected to {providerName}</li>
              <li>Log in and grant permissions</li>
              <li>You'll be redirected back to ChainReact</li>
              <li>Your integration will be ready to use!</li>
            </ol>
          </div>

          {/* Manual Link */}
          <div className="pt-2 border-t">
            <a
              href="/integrations"
              className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              Or go to the Integrations page
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </Card>
  )
}
