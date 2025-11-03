import React from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Check, ArrowRight } from 'lucide-react'
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
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Connected</p>
          <div className="flex flex-col gap-2 w-full">
            {connectedProviders.map(provider => (
              <button
                key={provider.id}
                className="group relative h-auto py-4 px-4 flex items-center justify-start gap-4 w-full rounded-lg border-2 border-primary/20 bg-primary/5 hover:bg-primary/10 hover:border-primary/30 transition-all duration-200 shadow-sm hover:shadow-md"
                onClick={() => onSelect(provider.id)}
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-background border border-border shadow-sm shrink-0">
                  <Image
                    src={getProviderIconPath(provider.id)}
                    alt={provider.displayName}
                    width={28}
                    height={28}
                    className="shrink-0"
                  />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="font-semibold text-sm truncate text-foreground">{provider.displayName}</div>
                  <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 mt-0.5">
                    <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                    <span className="font-medium">Connected</span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Available but not connected */}
      {availableProviders.length > 0 && (
        <div className="space-y-2 w-full">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {connectedProviders.length > 0 ? 'Available' : 'Connect to continue'}
          </p>
          <div className="flex flex-col gap-2 w-full">
            {availableProviders.map(provider => (
              <button
                key={provider.id}
                className="group relative h-auto py-4 px-4 flex items-center justify-between gap-4 w-full rounded-lg border-2 border-dashed border-border hover:border-primary hover:bg-muted/50 transition-all duration-200"
                onClick={() => onConnect(provider.id)}
              >
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted/50 border border-border shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                    <Image
                      src={getProviderIconPath(provider.id)}
                      alt={provider.displayName}
                      width={28}
                      height={28}
                      className="shrink-0"
                    />
                  </div>
                  <div className="text-left min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate text-foreground">{provider.displayName}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Not connected</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-primary group-hover:text-primary/80 transition-colors">
                  <span className="text-xs font-semibold uppercase tracking-wide">Connect</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
