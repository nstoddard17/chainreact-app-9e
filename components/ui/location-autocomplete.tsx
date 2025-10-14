"use client"

import React, { useState, useEffect, useRef, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { MapPin, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

import { logger } from '@/lib/utils/logger'

interface LocationSuggestion {
  place_id: string
  description: string
  structured_formatting?: {
    main_text: string
    secondary_text: string
  }
  types: string[]
}

interface LocationAutocompleteProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function LocationAutocomplete({
  value,
  onChange,
  placeholder = "Enter an address...",
  disabled = false,
  className
}: LocationAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value || "")
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Update input value when prop changes
  useEffect(() => {
    setInputValue(value || "")
  }, [value])

  // Debounced search function
  const searchPlaces = useMemo(
    () => {
      return (query: string) => {
        if (debounceTimeoutRef.current) {
          clearTimeout(debounceTimeoutRef.current)
        }

        debounceTimeoutRef.current = setTimeout(async () => {
          if (!query.trim()) {
            setSuggestions([])
            setIsLoading(false)
            return
          }

          setIsLoading(true)
          try {
            // Use Google Maps Places API Autocomplete
            const response = await fetch(`/api/places/autocomplete?input=${encodeURIComponent(query)}`)
            if (response.ok) {
              const data = await response.json()
              setSuggestions(data.predictions || [])
            } else {
              logger.error('Failed to fetch place suggestions')
              setSuggestions([])
            }
          } catch (error) {
            logger.error('Error fetching place suggestions:', error)
            setSuggestions([])
          } finally {
            setIsLoading(false)
          }
        }, 300) // 300ms debounce
      }
    },
    []
  )

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
    onChange(newValue)
    setIsOpen(true)
    setSelectedIndex(-1)
    
    if (newValue.trim()) {
      searchPlaces(newValue)
    } else {
      setSuggestions([])
      setIsLoading(false)
    }
  }

  const handleSuggestionSelect = (suggestion: LocationSuggestion) => {
    const selectedValue = suggestion.description
    setInputValue(selectedValue)
    onChange(selectedValue)
    setIsOpen(false)
    setSelectedIndex(-1)
    setSuggestions([])
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === 'ArrowDown' && suggestions.length > 0) {
        setIsOpen(true)
        return
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1)
        break
      case 'Enter':
        e.preventDefault()
        if (selectedIndex >= 0 && suggestions[selectedIndex]) {
          handleSuggestionSelect(suggestions[selectedIndex])
        }
        break
      case 'Escape':
        setIsOpen(false)
        setSelectedIndex(-1)
        break
    }
  }

  const handleInputFocus = () => {
    if (suggestions.length > 0) {
      setIsOpen(true)
    }
  }

  const handleInputBlur = () => {
    // Delay closing to allow for clicks on suggestions
    setTimeout(() => {
      setIsOpen(false)
      setSelectedIndex(-1)
    }, 200)
  }

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest" })
      }
    }
  }, [selectedIndex])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }
    }
  }, [])

  const showSuggestions = isOpen && (suggestions.length > 0 || isLoading)

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          placeholder={placeholder}
          disabled={disabled}
          className={cn("pl-10 pr-10", className)}
          autoComplete="off"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {showSuggestions && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-auto">
          <ul ref={listRef} className="py-1">
            {isLoading && suggestions.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching for places...
              </li>
            )}
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion.place_id}
                className={cn(
                  "px-3 py-2 text-sm cursor-pointer transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  selectedIndex === index && "bg-accent text-accent-foreground"
                )}
                onClick={() => handleSuggestionSelect(suggestion)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    {suggestion.structured_formatting ? (
                      <div>
                        <div className="font-medium truncate">
                          {suggestion.structured_formatting.main_text}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {suggestion.structured_formatting.secondary_text}
                        </div>
                      </div>
                    ) : (
                      <div className="truncate">{suggestion.description}</div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
} 