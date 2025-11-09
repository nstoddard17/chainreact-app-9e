"use client"

import React, { useEffect, useState } from 'react'
import { Globe } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface TimezonePickerProps {
  value?: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
  disabled?: boolean
  className?: string
}

// Detect user's timezone using Intl API
function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'America/New_York' // fallback
  }
}

// Get timezone display name with abbreviation
function getTimezoneDisplayName(timezone: string): string {
  try {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short'
    })

    const parts = formatter.formatToParts(now)
    const tzPart = parts.find(part => part.type === 'timeZoneName')

    if (tzPart) {
      return `${timezone.split('/').pop()?.replace(/_/g, ' ')} (${tzPart.value})`
    }

    return timezone
  } catch {
    return timezone
  }
}

export function TimezonePicker({
  value,
  onChange,
  options,
  placeholder = "Select timezone",
  disabled = false,
  className
}: TimezonePickerProps) {
  const [userTz, setUserTz] = useState<string>('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const detectedTz = getUserTimezone()
    setUserTz(detectedTz)

    // Auto-select user's timezone if value is "auto" or not set
    if (!value || value === 'auto') {
      onChange(detectedTz)
    }
  }, [value, onChange])

  if (!mounted) {
    return (
      <Select disabled>
        <SelectTrigger className={cn("w-full", className)}>
          <SelectValue placeholder="Loading timezone..." />
        </SelectTrigger>
      </Select>
    )
  }

  const displayValue = value === 'auto' ? userTz : value

  return (
    <div className="space-y-2">
      <Select
        value={displayValue}
        onValueChange={onChange}
        disabled={disabled}
      >
        <SelectTrigger className={cn("w-full", className)}>
          <div className="flex items-center gap-2 w-full">
            <Globe className="h-4 w-4 shrink-0 opacity-50" />
            <SelectValue>
              {displayValue ? getTimezoneDisplayName(displayValue) : placeholder}
            </SelectValue>
          </div>
        </SelectTrigger>
        <SelectContent className="max-h-[300px]">
          {userTz && (
            <>
              <SelectItem value={userTz} className="font-medium">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Current:</span>
                  <span>{getTimezoneDisplayName(userTz)}</span>
                </div>
              </SelectItem>
              <div className="border-b my-1" />
            </>
          )}
          {options
            .filter((option) => option.value !== userTz)
            .map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>

      {userTz && (
        <p className="text-xs text-muted-foreground">
          Your timezone: {getTimezoneDisplayName(userTz)}
        </p>
      )}
    </div>
  )
}
