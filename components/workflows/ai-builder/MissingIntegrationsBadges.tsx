"use client"

import { Button } from "@/components/ui/button"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { INTEGRATION_CONFIGS } from "@/lib/integrations/availableIntegrations"

interface MissingIntegration {
  provider: string
  name: string
}

interface MissingIntegrationsBadgesProps {
  missingIntegrations: MissingIntegration[]
  onConnect?: (provider: string) => void
}

export function MissingIntegrationsBadges({
  missingIntegrations,
  onConnect
}: MissingIntegrationsBadgesProps) {
  const router = useRouter()

  const handleConnect = (provider: string) => {
    if (onConnect) {
      onConnect(provider)
    } else {
      // Navigate to integrations page
      router.push('/integrations')
    }
  }

  return (
    <div className="space-y-2">
      {missingIntegrations.map((integration) => {
        // Get proper name from INTEGRATION_CONFIGS
        const config = INTEGRATION_CONFIGS[integration.provider]
        const displayName = config?.name || integration.name
        const iconPath = `/integrations/${integration.provider}.svg`

        return (
          <div
            key={integration.provider}
            className="flex items-center gap-3 bg-accent/50 border border-border rounded-lg px-4 py-3"
          >
            {/* Icon - Use actual integration SVG */}
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-background border border-border flex items-center justify-center p-1.5">
              <Image
                src={iconPath}
                alt={displayName}
                width={28}
                height={28}
                className="w-full h-full object-contain"
              />
            </div>

            {/* Name */}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground">
                {displayName}
              </div>
              <div className="text-xs text-muted-foreground">
                Not connected
              </div>
            </div>

            {/* Connect button */}
            <Button
              onClick={() => handleConnect(integration.provider)}
              size="sm"
              className="flex-shrink-0"
            >
              Connect
            </Button>
          </div>
        )
      })}
    </div>
  )
}
