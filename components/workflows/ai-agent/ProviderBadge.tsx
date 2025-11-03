import React, { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { ChevronDown } from 'lucide-react'
import type { ProviderOption } from '@/lib/workflows/ai-agent/providerDisambiguation'

interface ProviderBadgeProps {
  categoryName: string // "Email", "Calendar"
  selectedProvider: ProviderOption
  allProviders: ProviderOption[]
  onProviderChange: (providerId: string) => void
  onConnect: (providerId: string) => void
}

export function ProviderBadge({
  categoryName,
  selectedProvider,
  allProviders,
  onProviderChange,
  onConnect
}: ProviderBadgeProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDropdown])

  const otherProviders = allProviders.filter(p => p.id !== selectedProvider.id)

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <div className="inline-flex items-center gap-2 px-3 py-2 bg-muted/50 border border-border rounded-lg">
        <span className="text-sm text-muted-foreground">{categoryName} provider:</span>
        <div className="flex items-center gap-2">
          <Image
            src={`/integrations/${selectedProvider.id}.svg`}
            alt={selectedProvider.displayName}
            width={20}
            height={20}
            className="shrink-0"
          />
          <span className="font-medium text-sm">{selectedProvider.displayName}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs ml-2"
          onClick={() => setShowDropdown(!showDropdown)}
        >
          Change
          <ChevronDown className="w-3 h-3 ml-1" />
        </Button>
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute top-full left-0 mt-2 w-64 bg-popover border border-border rounded-lg shadow-lg z-50 p-2">
          <div className="space-y-1">
            {/* Current selection */}
            <div className="px-2 py-1 bg-primary/10 rounded flex items-center gap-2">
              <Image
                src={`/integrations/${selectedProvider.id}.svg`}
                alt={selectedProvider.displayName}
                width={20}
                height={20}
                className="shrink-0"
              />
              <span className="text-sm font-medium flex-1">{selectedProvider.displayName}</span>
              <span className="text-xs text-primary">Current</span>
            </div>

            {/* Other connected providers */}
            {otherProviders.filter(p => p.isConnected).map(provider => (
              <button
                key={provider.id}
                className="w-full px-2 py-1.5 hover:bg-muted rounded flex items-center gap-2 text-left"
                onClick={() => {
                  onProviderChange(provider.id)
                  setShowDropdown(false)
                }}
              >
                <Image
                  src={`/integrations/${provider.id}.svg`}
                  alt={provider.displayName}
                  width={20}
                  height={20}
                  className="shrink-0"
                />
                <span className="text-sm flex-1">{provider.displayName}</span>
                <span className="text-xs text-green-600 dark:text-green-400">✓</span>
              </button>
            ))}

            {/* Divider if there are unconnected providers */}
            {otherProviders.some(p => !p.isConnected) && otherProviders.some(p => p.isConnected) && (
              <div className="border-t border-border my-1" />
            )}

            {/* Unconnected providers */}
            {otherProviders.filter(p => !p.isConnected).map(provider => (
              <button
                key={provider.id}
                className="w-full px-2 py-1.5 hover:bg-muted rounded flex items-center gap-2 text-left opacity-60 hover:opacity-100"
                onClick={() => {
                  onConnect(provider.id)
                  setShowDropdown(false)
                }}
              >
                <Image
                  src={`/integrations/${provider.id}.svg`}
                  alt={provider.displayName}
                  width={20}
                  height={20}
                  className="shrink-0"
                />
                <span className="text-sm flex-1">{provider.displayName}</span>
                <span className="text-xs text-primary">Connect →</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
