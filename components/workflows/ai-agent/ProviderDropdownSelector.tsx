'use client'

import React, { useState, useMemo, useEffect } from 'react'
import Image from 'next/image'
import { Check, ChevronDown, Loader2, ArrowRight } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import type { ProviderOption } from '@/lib/workflows/ai-agent/providerDisambiguation'
import { useWorkflowPreferencesStore } from '@/stores/workflowPreferencesStore'

interface ProviderDropdownSelectorProps {
  categoryName: string // "Email", "Calendar", "Storage"
  categoryKey: string // "email", "calendar", "storage" - for preferences lookup
  providers: ProviderOption[]
  onSelect: (providerId: string, isConnected: boolean) => void
  preSelectedProviderId?: string // Provider to pre-select (from the prompt handler)
  loading?: boolean
  disabled?: boolean
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

export function ProviderDropdownSelector({
  categoryName,
  categoryKey,
  providers,
  onSelect,
  preSelectedProviderId,
  loading = false,
  disabled = false,
}: ProviderDropdownSelectorProps) {
  const { getDefaultProvider } = useWorkflowPreferencesStore()
  const defaultProvider = getDefaultProvider(categoryKey)

  // Pre-select: 1) preSelectedProviderId prop, 2) saved default, 3) first connected provider
  const initialValue = useMemo(() => {
    // First priority: explicitly pre-selected provider from prompt handler
    if (preSelectedProviderId && providers.find(p => p.id === preSelectedProviderId)) {
      return preSelectedProviderId
    }
    // Second priority: saved default preference
    if (defaultProvider && providers.find(p => p.id === defaultProvider)) {
      return defaultProvider
    }
    // Third priority: first connected provider
    const firstConnected = providers.find(p => p.isConnected)
    if (firstConnected) {
      return firstConnected.id
    }
    return ''
  }, [defaultProvider, preSelectedProviderId, providers])

  const [selectedProvider, setSelectedProvider] = useState<string>(initialValue)
  const [hasConfirmed, setHasConfirmed] = useState(false)

  // Update selection if preSelectedProviderId changes
  useEffect(() => {
    if (preSelectedProviderId && providers.find(p => p.id === preSelectedProviderId)) {
      setSelectedProvider(preSelectedProviderId)
    }
  }, [preSelectedProviderId, providers])

  const connectedProviders = useMemo(() =>
    providers.filter(p => p.isConnected),
    [providers]
  )
  const availableProviders = useMemo(() =>
    providers.filter(p => !p.isConnected),
    [providers]
  )

  const handleValueChange = (value: string) => {
    setSelectedProvider(value)
    setHasConfirmed(false) // Reset confirmation when selection changes
    // Don't immediately call onSelect - wait for Continue button
  }

  const handleContinue = () => {
    const provider = providers.find(p => p.id === selectedProvider)
    if (provider) {
      setHasConfirmed(true)
      onSelect(selectedProvider, provider.isConnected)
    }
  }

  // Custom render for the trigger value
  const selectedProviderData = providers.find(p => p.id === selectedProvider)

  return (
    <div className="py-3 space-y-3 w-full">
      <p className="text-sm font-medium text-foreground">
        Which {categoryName.toLowerCase()} app would you like to use?
      </p>

      <Select
        value={selectedProvider}
        onValueChange={handleValueChange}
        disabled={disabled || loading}
      >
        <SelectTrigger className="w-full h-12 px-3 text-left">
          {loading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-muted-foreground">Loading providers...</span>
            </div>
          ) : selectedProviderData ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-7 h-7 rounded-md bg-muted/50 shrink-0">
                <Image
                  src={getProviderIconPath(selectedProviderData.id)}
                  alt={selectedProviderData.displayName}
                  width={20}
                  height={20}
                  className="shrink-0"
                />
              </div>
              <span className="font-medium text-sm">{selectedProviderData.displayName}</span>
              {selectedProviderData.isConnected && (
                <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 ml-auto mr-2">
                  <Check className="w-3 h-3" />
                  Connected
                </span>
              )}
            </div>
          ) : (
            <SelectValue placeholder={`Select ${categoryName.toLowerCase()} provider...`} />
          )}
        </SelectTrigger>

        <SelectContent className="max-h-80">
          {/* Connected providers group */}
          {connectedProviders.length > 0 && (
            <SelectGroup>
              <SelectLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Connected
              </SelectLabel>
              {connectedProviders.map(provider => (
                <SelectItem
                  key={provider.id}
                  value={provider.id}
                  className="py-2.5 cursor-pointer"
                >
                  <div className="flex items-center gap-3 w-full">
                    <div className="flex items-center justify-center w-7 h-7 rounded-md bg-muted/50 shrink-0">
                      <Image
                        src={getProviderIconPath(provider.id)}
                        alt={provider.displayName}
                        width={20}
                        height={20}
                        className="shrink-0"
                      />
                    </div>
                    <span className="font-medium text-sm flex-1">{provider.displayName}</span>
                    <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <Check className="w-3 h-3" />
                      Connected
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          )}

          {/* Separator between groups */}
          {connectedProviders.length > 0 && availableProviders.length > 0 && (
            <SelectSeparator />
          )}

          {/* Available (not connected) providers group */}
          {availableProviders.length > 0 && (
            <SelectGroup>
              <SelectLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {connectedProviders.length > 0 ? 'Not Connected' : 'Connect to continue'}
              </SelectLabel>
              {availableProviders.map(provider => (
                <SelectItem
                  key={provider.id}
                  value={provider.id}
                  className="py-2.5 cursor-pointer"
                >
                  <div className="flex items-center gap-3 w-full">
                    <div className="flex items-center justify-center w-7 h-7 rounded-md bg-muted/30 border border-dashed border-border shrink-0 opacity-70">
                      <Image
                        src={getProviderIconPath(provider.id)}
                        alt={provider.displayName}
                        width={20}
                        height={20}
                        className="shrink-0 opacity-70"
                      />
                    </div>
                    <span className="font-medium text-sm flex-1 text-muted-foreground">
                      {provider.displayName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Click to connect
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>

      {/* Show hint about default if one was pre-selected */}
      {defaultProvider && selectedProvider === defaultProvider && !hasConfirmed && (
        <p className="text-xs text-muted-foreground">
          Pre-selected based on your saved preferences
        </p>
      )}

      {/* Continue button - shows when a connected provider is selected */}
      {selectedProviderData && selectedProviderData.isConnected && !hasConfirmed && (
        <Button
          onClick={handleContinue}
          className="w-full h-10 gap-2"
          disabled={loading || disabled}
        >
          Continue with {selectedProviderData.displayName}
          <ArrowRight className="w-4 h-4" />
        </Button>
      )}

      {/* Connect prompt for unconnected provider */}
      {selectedProviderData && !selectedProviderData.isConnected && !hasConfirmed && (
        <Button
          onClick={handleContinue}
          variant="outline"
          className="w-full h-10 gap-2"
          disabled={loading || disabled}
        >
          Connect {selectedProviderData.displayName} to continue
        </Button>
      )}
    </div>
  )
}
