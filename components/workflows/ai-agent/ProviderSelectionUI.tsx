import React from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import type { ProviderOption } from '@/lib/workflows/ai-agent/providerDisambiguation'

interface ProviderSelectionUIProps {
  categoryName: string // "Email", "Calendar"
  providers: ProviderOption[]
  onSelect: (providerId: string) => void
  onConnect: (providerId: string) => void
}

/**
 * Maps provider IDs to their actual icon filenames
 */
function getProviderIconPath(providerId: string): string {
  const iconMap: Record<string, string> = {
    'outlook': 'microsoft-outlook',
    'yahoo-mail': 'yahoo-mail',
    // Add more mappings here as needed
  }

  return `/integrations/${iconMap[providerId] || providerId}.svg`
}

export function ProviderSelectionUI({
  categoryName,
  providers,
  onSelect,
  onConnect
}: ProviderSelectionUIProps) {
  const connectedProviders = providers.filter(p => p.isConnected)
  const availableProviders = providers.filter(p => !p.isConnected)

  return (
    <div className="py-3 space-y-4 w-full">
      <p className="text-sm font-medium text-foreground">
        Which {categoryName.toLowerCase()} app would you like to use?
      </p>

      {/* Connected providers */}
      {connectedProviders.length > 0 && (
        <div className="space-y-2 w-full">
          <p className="text-xs text-muted-foreground">Connected:</p>
          <div className="flex flex-col gap-2 w-full">
            {connectedProviders.map(provider => (
              <Button
                key={provider.id}
                variant="outline"
                className="h-auto py-3 px-4 flex items-center justify-start gap-3 border-2 hover:border-primary hover:bg-primary/5 w-full"
                onClick={() => onSelect(provider.id)}
              >
                <Image
                  src={getProviderIconPath(provider.id)}
                  alt={provider.displayName}
                  width={24}
                  height={24}
                  className="shrink-0"
                />
                <div className="flex-1 text-left min-w-0">
                  <div className="font-medium text-sm truncate">{provider.displayName}</div>
                  <div className="text-xs text-green-600 dark:text-green-400">✓ Connected</div>
                </div>
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Available but not connected */}
      {availableProviders.length > 0 && (
        <div className="space-y-2 w-full">
          <p className="text-xs text-muted-foreground">
            {connectedProviders.length > 0 ? 'Or connect another:' : 'Available:'}
          </p>
          <div className="flex flex-col gap-2 w-full">
            {availableProviders.map(provider => (
              <Button
                key={provider.id}
                variant="outline"
                className="h-auto py-3 px-4 flex items-center justify-between gap-2 border-dashed hover:border-primary hover:bg-primary/5 w-full"
                onClick={() => onConnect(provider.id)}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Image
                    src={getProviderIconPath(provider.id)}
                    alt={provider.displayName}
                    width={24}
                    height={24}
                    className="shrink-0 opacity-50"
                  />
                  <div className="text-left min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{provider.displayName}</div>
                    <div className="text-xs text-muted-foreground">Not connected</div>
                  </div>
                </div>
                <span className="text-xs text-primary font-medium shrink-0">Connect →</span>
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
