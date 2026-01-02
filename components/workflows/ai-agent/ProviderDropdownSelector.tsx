'use client'

import React, { useState, useMemo, useEffect } from 'react'
import Image from 'next/image'
import { Check, ChevronDown, ArrowRight, Mail, Calendar, HardDrive, MessageSquare, Database } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { ProviderOption } from '@/lib/workflows/ai-agent/providerDisambiguation'
import { useWorkflowPreferencesStore } from '@/stores/workflowPreferencesStore'

interface ProviderDropdownSelectorProps {
  categoryName: string
  categoryKey: string
  providers: ProviderOption[]
  onSelect: (providerId: string, isConnected: boolean) => void
  preSelectedProviderId?: string
  loading?: boolean
  disabled?: boolean
}

function getProviderIconPath(providerId: string): string {
  const iconMap: Record<string, string> = {
    'outlook': 'microsoft-outlook',
    'yahoo-mail': 'yahoo-mail',
  }
  return `/integrations/${iconMap[providerId] || providerId}.svg`
}

function getCategoryIcon(categoryKey: string) {
  const icons: Record<string, React.ReactNode> = {
    email: <Mail className="w-5 h-5" />,
    calendar: <Calendar className="w-5 h-5" />,
    storage: <HardDrive className="w-5 h-5" />,
    files: <HardDrive className="w-5 h-5" />,
    chat: <MessageSquare className="w-5 h-5" />,
    notification: <MessageSquare className="w-5 h-5" />,
    spreadsheet: <Database className="w-5 h-5" />,
    database: <Database className="w-5 h-5" />,
  }
  return icons[categoryKey] || <Mail className="w-5 h-5" />
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
  const [open, setOpen] = useState(false)
  const [hasConfirmed, setHasConfirmed] = useState(false)
  const { getDefaultProvider } = useWorkflowPreferencesStore()
  const defaultProvider = getDefaultProvider(categoryKey)

  // Pre-select logic
  const initialValue = useMemo(() => {
    if (preSelectedProviderId && providers.find(p => p.id === preSelectedProviderId)) {
      return preSelectedProviderId
    }
    if (defaultProvider && providers.find(p => p.id === defaultProvider)) {
      return defaultProvider
    }
    const firstConnected = providers.find(p => p.isConnected)
    if (firstConnected) {
      return firstConnected.id
    }
    return providers[0]?.id || ''
  }, [defaultProvider, preSelectedProviderId, providers])

  const [selectedProvider, setSelectedProvider] = useState<string>(initialValue)

  // Sync selection when providers load
  useEffect(() => {
    if (preSelectedProviderId && providers.find(p => p.id === preSelectedProviderId)) {
      setSelectedProvider(preSelectedProviderId)
    } else if (!selectedProvider && providers.length > 0) {
      const firstConnected = providers.find(p => p.isConnected)
      setSelectedProvider(firstConnected?.id || providers[0].id)
    }
  }, [preSelectedProviderId, providers, selectedProvider])

  const selectedProviderData = providers.find(p => p.id === selectedProvider)

  const handleSelect = (providerId: string) => {
    setSelectedProvider(providerId)
    setOpen(false)
  }

  const handleContinue = () => {
    const provider = providers.find(p => p.id === selectedProvider)
    if (provider) {
      setHasConfirmed(true)
      onSelect(selectedProvider, provider.isConnected)
    }
  }

  if (hasConfirmed) {
    return null
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden w-full max-w-md">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
            {getCategoryIcon(categoryKey)}
          </div>
          <div>
            <h3 className="font-semibold text-sm">Select {categoryName} App</h3>
            <p className="text-xs text-muted-foreground">
              Which {categoryName.toLowerCase()} app would you like to use?
            </p>
          </div>
        </div>
      </div>

      {/* Combobox */}
      <div className="p-4">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              disabled={disabled || loading}
              className="w-full flex items-center gap-3 p-3 rounded-lg border bg-background text-left hover:bg-accent/30 transition-colors"
            >
              {selectedProviderData ? (
                <>
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg border bg-background shrink-0">
                    <Image
                      src={getProviderIconPath(selectedProviderData.id)}
                      alt={selectedProviderData.displayName}
                      width={22}
                      height={22}
                      className="shrink-0"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{selectedProviderData.displayName}</div>
                  </div>
                </>
              ) : (
                <div className="flex-1 text-muted-foreground text-sm">
                  Select {categoryName.toLowerCase()} app...
                </div>
              )}
              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          </PopoverTrigger>

          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput placeholder={`Search ${categoryName.toLowerCase()} apps...`} />
              <CommandList>
                <CommandEmpty>No {categoryName.toLowerCase()} apps found.</CommandEmpty>
                <CommandGroup>
                  {providers.map(provider => (
                    <CommandItem
                      key={provider.id}
                      value={provider.id}
                      onSelect={() => handleSelect(provider.id)}
                      className="flex items-center gap-3 py-2.5 cursor-pointer"
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-md bg-background border shrink-0">
                        <Image
                          src={getProviderIconPath(provider.id)}
                          alt={provider.displayName}
                          width={20}
                          height={20}
                          className="shrink-0"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{provider.displayName}</div>
                      </div>
                      {selectedProvider === provider.id && (
                        <Check className="w-4 h-4 text-primary shrink-0" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Footer */}
      <div className="px-4 pb-4">
        {defaultProvider && selectedProvider === defaultProvider && (
          <p className="text-xs text-muted-foreground mb-2 text-center">
            Based on your saved preferences
          </p>
        )}

        <Button
          onClick={handleContinue}
          disabled={loading || disabled || !selectedProvider}
          className="w-full h-10 gap-2"
        >
          {selectedProviderData ? (
            <>
              Continue with {selectedProviderData.displayName}
              <ArrowRight className="w-4 h-4" />
            </>
          ) : (
            'Select an app above'
          )}
        </Button>
      </div>
    </div>
  )
}
