"use client"

import React, { useState, useEffect, useRef, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { X, Tag } from "lucide-react"
import { cn } from "@/lib/utils"

interface GmailLabelOption {
  value: string
  label: string
  isExisting?: boolean
}

interface GmailLabelsInputProps {
  options: GmailLabelOption[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  disabled?: boolean
}

export function GmailLabelsInput({
  options,
  value,
  onChange,
  placeholder = "Type to add labels...",
  disabled = false,
}: GmailLabelsInputProps) {
  const [inputValue, setInputValue] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Get selected options
  const selectedOptions = options.filter((option) => value.includes(option.value))

  // Filter suggestions based on input and exclude already selected
  const filteredSuggestions = useMemo(() => {
    if (!inputValue.trim()) return []
    
    const query = inputValue.toLowerCase()
    const filtered = options.filter(option => {
      const matchesQuery = option.label.toLowerCase().includes(query)
      const notSelected = !value.includes(option.value)
      return matchesQuery && notSelected
    })
    
    return filtered.slice(0, 20) // Limit to 20 suggestions
  }, [inputValue, options, value])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
    setIsOpen(true)
    setSelectedIndex(-1)
  }

  const handleSuggestionSelect = (suggestion: GmailLabelOption) => {
    if (!value.includes(suggestion.value)) {
      onChange([...value, suggestion.value])
    }
    setInputValue("")
    setIsOpen(false)
    setSelectedIndex(-1)
    inputRef.current?.focus()
  }

  const handleLabelRemove = (labelValue: string) => {
    onChange(value.filter(v => v !== labelValue))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown') {
        setIsOpen(true)
        return
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev => 
          prev < filteredSuggestions.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1)
        break
      case 'Enter':
        e.preventDefault()
        if (selectedIndex >= 0 && filteredSuggestions[selectedIndex]) {
          handleSuggestionSelect(filteredSuggestions[selectedIndex])
        } else if (inputValue.trim()) {
          // Add manually typed label
          onChange([...value, inputValue.trim()])
          setInputValue("")
          setIsOpen(false)
        }
        break
      case 'Escape':
        setIsOpen(false)
        setSelectedIndex(-1)
        break
      case 'Backspace':
        if (!inputValue && value.length > 0) {
          // Remove last label when backspacing on empty input
          const newValue = value.slice(0, -1)
          onChange(newValue)
        }
        break
      case ',':
      case 'Tab':
        if (inputValue.trim()) {
          e.preventDefault()
          onChange([...value, inputValue.trim()])
          setInputValue("")
          setIsOpen(false)
        }
        break
    }
  }

  const handleInputFocus = () => {
    if (inputValue.trim()) {
      setIsOpen(true)
    }
  }

  const handleInputBlur = () => {
    // Delay closing to allow for clicks on suggestions
    setTimeout(() => {
      setIsOpen(false)
      setSelectedIndex(-1)
      
      // Add current input as label if not empty
      if (inputValue.trim()) {
        onChange([...value, inputValue.trim()])
        setInputValue("")
      }
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

  return (
    <div className="relative">
      {/* Selected labels display */}
      {selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {selectedOptions.map((option) => (
            <Badge
              key={option.value}
              variant="secondary"
              className="flex items-center gap-1 pr-1"
            >
              <Tag className="w-3 h-3" />
              {option.label}
              <button
                type="button"
                onClick={() => handleLabelRemove(option.value)}
                className="ml-1 hover:bg-muted rounded-full p-0.5"
                disabled={disabled}
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      
      <div className="relative">
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
          className="w-full"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
        />
      </div>

      {/* Suggestions dropdown */}
      {isOpen && filteredSuggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-64 overflow-auto">
          <ul ref={listRef} className="py-1">
            {filteredSuggestions.map((suggestion, index) => (
              <li key={suggestion.value}>
                <button
                  type="button"
                  className={cn(
                    "w-full px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground flex items-center gap-2",
                    selectedIndex === index && "bg-accent text-accent-foreground"
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault() // Prevent input blur
                    handleSuggestionSelect(suggestion)
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <Tag className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-popover-foreground truncate">
                      {suggestion.label}
                    </div>
                    {suggestion.isExisting && (
                      <div className="text-xs text-muted-foreground truncate">
                        existing label
                      </div>
                    )}
                  </div>
                </button>
              </li>
            ))}
            
            {/* Show create option if input doesn't match any existing label */}
            {inputValue.trim() && !filteredSuggestions.some(opt => 
              opt.label.toLowerCase() === inputValue.trim().toLowerCase()
            ) && (
              <li>
                <button
                  type="button"
                  className={cn(
                    "w-full px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground flex items-center gap-2 text-primary",
                    selectedIndex === filteredSuggestions.length && "bg-accent text-accent-foreground"
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    onChange([...value, inputValue.trim()])
                    setInputValue("")
                    setIsOpen(false)
                  }}
                  onMouseEnter={() => setSelectedIndex(filteredSuggestions.length)}
                >
                  <Tag className="w-4 h-4 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-primary truncate">
                      Create "{inputValue.trim()}"
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      new label
                    </div>
                  </div>
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
} 