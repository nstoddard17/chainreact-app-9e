"use client"

import React from 'react'
import { MapPin } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface GooglePlacesAutocompleteProps {
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

// TODO: Integrate Google Places Autocomplete API
// For now, this is a simple text input
export function GooglePlacesAutocomplete({
  value,
  onChange,
  placeholder = "Enter location or address",
  disabled = false,
  className
}: GooglePlacesAutocompleteProps) {
  return (
    <div className={cn("relative", className)}>
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="pl-9"
      />
      {/* TODO: Add Google Places Autocomplete dropdown */}
    </div>
  )
}
