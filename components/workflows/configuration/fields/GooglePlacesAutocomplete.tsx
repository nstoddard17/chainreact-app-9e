"use client"

import React, { useState, useEffect, useRef } from 'react'
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

export function GooglePlacesAutocomplete({
  value,
  onChange,
  placeholder = "Enter location or address",
  disabled = false,
  className
}: GooglePlacesAutocompleteProps) {
  const [predictions, setPredictions] = useState<any[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null)

  // Initialize Google Places Autocomplete Service
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).google?.maps?.places) {
      autocompleteService.current = new (window as any).google.maps.places.AutocompleteService()
    }
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value
    onChange(inputValue)

    // Fetch predictions if we have the service and input value
    if (autocompleteService.current && inputValue.length > 2) {
      autocompleteService.current.getPlacePredictions(
        {
          input: inputValue,
          types: ['establishment', 'geocode']
        },
        (predictions: any, status: any) => {
          if (status === (window as any).google.maps.places.PlacesServiceStatus.OK && predictions) {
            setPredictions(predictions)
            setShowDropdown(true)
          } else {
            setPredictions([])
            setShowDropdown(false)
          }
        }
      )
    } else {
      setPredictions([])
      setShowDropdown(false)
    }
  }

  const handleSelectPrediction = (description: string) => {
    onChange(description)
    setPredictions([])
    setShowDropdown(false)
  }

  return (
    <div className={cn("relative", className)}>
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
      <Input
        ref={inputRef}
        type="text"
        value={value || ''}
        onChange={handleInputChange}
        placeholder={placeholder}
        disabled={disabled}
        className="!pl-11"
      />

      {/* Autocomplete dropdown */}
      {showDropdown && predictions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto">
          {predictions.map((prediction: any) => (
            <button
              key={prediction.place_id}
              type="button"
              onClick={() => handleSelectPrediction(prediction.description)}
              className="w-full px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground transition-colors flex items-start gap-2 text-sm"
            >
              <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="flex-1">
                <div className="font-medium">{prediction.structured_formatting.main_text}</div>
                <div className="text-xs text-muted-foreground">
                  {prediction.structured_formatting.secondary_text}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
