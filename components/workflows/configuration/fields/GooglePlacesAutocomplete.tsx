"use client"

import React, { useState, useEffect, useRef } from 'react'
import { MapPin, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface GooglePlacesAutocompleteProps {
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

interface Prediction {
  place_id: string
  description: string
  structured_formatting: {
    main_text: string
    secondary_text: string
  }
}

export function GooglePlacesAutocomplete({
  value,
  onChange,
  placeholder = "Enter location or address",
  disabled = false,
  className
}: GooglePlacesAutocompleteProps) {
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  const fetchPredictions = async (inputValue: string) => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    setIsLoading(true)
    abortControllerRef.current = new AbortController()

    try {
      const response = await fetch(
        `/api/google-maps/places-autocomplete?query=${encodeURIComponent(inputValue)}`,
        { signal: abortControllerRef.current.signal }
      )

      if (!response.ok) {
        throw new Error('Failed to fetch predictions')
      }

      const data = await response.json()

      if (data.predictions && Array.isArray(data.predictions)) {
        setPredictions(data.predictions)
        setShowDropdown(data.predictions.length > 0)
      } else {
        setPredictions([])
        setShowDropdown(false)
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Error fetching place predictions:', error)
        setPredictions([])
        setShowDropdown(false)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value
    onChange(inputValue)

    // Clear previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    // Fetch predictions if input value is long enough
    if (inputValue.length > 2) {
      // Debounce API calls by 300ms
      debounceTimerRef.current = setTimeout(() => {
        fetchPredictions(inputValue)
      }, 300)
    } else {
      setPredictions([])
      setShowDropdown(false)
      setIsLoading(false)
    }
  }

  const handleSelectPrediction = (e: React.MouseEvent, description: string) => {
    // Prevent default behavior and stop propagation
    e.preventDefault()
    e.stopPropagation()

    // Update the field value with the selected address
    onChange(description)

    // Delay clearing dropdown to ensure value updates
    setTimeout(() => {
      setPredictions([])
      setShowDropdown(false)
    }, 50)
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      const dropdown = document.querySelector('.google-places-dropdown')

      if (inputRef.current &&
          !inputRef.current.contains(target) &&
          (!dropdown || !dropdown.contains(target))) {
        setShowDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

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

      {/* Loading indicator */}
      {isLoading && (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
      )}

      {/* Autocomplete dropdown */}
      {showDropdown && predictions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto google-places-dropdown">
          {predictions.map((prediction: Prediction) => (
            <button
              key={prediction.place_id}
              type="button"
              onClick={(e) => handleSelectPrediction(e, prediction.description)}
              onMouseDown={(e) => e.preventDefault()}
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
