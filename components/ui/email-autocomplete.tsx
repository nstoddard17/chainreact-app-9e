"use client"

import React, { useState, useEffect, useRef, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { X, Mail, Users } from "lucide-react"
import { cn } from "@/lib/utils"

interface EmailSuggestion {
  value: string
  label: string
  email: string
  name?: string
  type?: string
  isGroup?: boolean
  groupId?: string
  members?: { email: string; name?: string }[]
}

interface EmailAutocompleteProps {
  value: string
  onChange: (value: string) => void
  suggestions: EmailSuggestion[]
  placeholder?: string
  disabled?: boolean
  multiple?: boolean
  className?: string
  isLoading?: boolean
}

export function EmailAutocomplete({
  value,
  onChange,
  suggestions,
  placeholder = "Enter email addresses...",
  disabled = false,
  multiple = false,
  className,
  isLoading = false
}: EmailAutocompleteProps) {
  const [inputValue, setInputValue] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [selectedEmails, setSelectedEmails] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Initialize selected emails from value prop
  useEffect(() => {
    if (multiple && value) {
      const emails = value.split(',').map(email => email.trim()).filter(Boolean)
      setSelectedEmails(emails)
    }
  }, [value, multiple])

  // Filter suggestions based on input and exclude already selected emails
  const filteredSuggestions = useMemo(() => {
    if (!inputValue.trim()) return suggestions.slice(0, 50)
    
    const query = inputValue.toLowerCase()
    const filtered = suggestions.filter(suggestion => {
      const matchesQuery = 
        suggestion.email.toLowerCase().includes(query) ||
        (suggestion.name && suggestion.name.toLowerCase().includes(query))
      
      // Exclude already selected emails in multiple mode
      const notSelected = !multiple || !selectedEmails.includes(suggestion.email)
      
      return matchesQuery && notSelected
    })
    
    return filtered.slice(0, 50)
  }, [inputValue, suggestions, selectedEmails, multiple])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
    setIsOpen(true)
    setSelectedIndex(-1)
    
    // If not multiple mode, update value directly
    if (!multiple) {
      onChange(newValue)
    }
  }

  const handleSuggestionSelect = (suggestion: EmailSuggestion) => {
    if (suggestion.isGroup && suggestion.members) {
      // Handle contact group selection - expand to individual emails
      const groupEmails = suggestion.members.map(member => member.email)
      if (multiple) {
        const newEmails = [...selectedEmails, ...groupEmails]
        setSelectedEmails(newEmails)
        onChange(newEmails.join(', '))
        setInputValue("")
      } else {
        // For single mode, just use the first email from the group
        onChange(groupEmails[0] || suggestion.email)
        setInputValue(groupEmails[0] || suggestion.email)
      }
    } else {
      // Handle individual email selection
      if (multiple) {
        const newEmails = [...selectedEmails, suggestion.email]
        setSelectedEmails(newEmails)
        onChange(newEmails.join(', '))
        setInputValue("")
      } else {
        onChange(suggestion.email)
        setInputValue(suggestion.email)
      }
    }
    setIsOpen(false)
    setSelectedIndex(-1)
  }

  const handleEmailRemove = (emailToRemove: string) => {
    const newEmails = selectedEmails.filter(email => email !== emailToRemove)
    setSelectedEmails(newEmails)
    onChange(newEmails.join(', '))
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
        } else if (inputValue.trim() && isValidEmail(inputValue.trim())) {
          // Add manually typed email
          if (multiple) {
            const newEmails = [...selectedEmails, inputValue.trim()]
            setSelectedEmails(newEmails)
            onChange(newEmails.join(', '))
            setInputValue("")
          } else {
            onChange(inputValue.trim())
          }
          setIsOpen(false)
        }
        break
      case 'Escape':
        setIsOpen(false)
        setSelectedIndex(-1)
        break
      case 'Backspace':
        if (multiple && !inputValue && selectedEmails.length > 0) {
          // Remove last email when backspacing on empty input
          handleEmailRemove(selectedEmails[selectedEmails.length - 1])
        }
        break
      case ',':
      case 'Tab':
        if (inputValue.trim() && isValidEmail(inputValue.trim())) {
          e.preventDefault()
          if (multiple) {
            const newEmails = [...selectedEmails, inputValue.trim()]
            setSelectedEmails(newEmails)
            onChange(newEmails.join(', '))
            setInputValue("")
          }
        }
        break
    }
  }

  const handleInputFocus = () => {
    setIsOpen(true)
  }

  const handleInputBlur = () => {
    // Delay closing to allow for clicks on suggestions
    setTimeout(() => {
      setIsOpen(false)
      setSelectedIndex(-1)
      
      // Add current input as email if valid and in multiple mode
      if (multiple && inputValue.trim() && isValidEmail(inputValue.trim())) {
        const newEmails = [...selectedEmails, inputValue.trim()]
        setSelectedEmails(newEmails)
        onChange(newEmails.join(', '))
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
    <div className={cn("relative", className)}>
      <div className="relative">
        {/* Selected emails display (multiple mode) */}
        {multiple && selectedEmails.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {selectedEmails.map((email, index) => (
              <Badge
                key={index}
                variant="secondary"
                className="flex items-center gap-1 pr-1"
              >
                <Mail className="w-3 h-3" />
                {email}
                <button
                  type="button"
                  onClick={() => handleEmailRemove(email)}
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
            value={multiple ? inputValue : (inputValue || value)}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={(e) => {
              e.target.removeAttribute('readonly')
              handleInputFocus()
            }}
            onBlur={handleInputBlur}
            placeholder={isLoading ? "Loading suggestions..." : placeholder}
            disabled={disabled || isLoading}
            className="w-full pr-10"
            autoComplete="new-password"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            data-form-type="other"
            data-lpignore="true"
            data-1p-ignore="true"
            data-bwignore="true"
            data-dashlane-ignore="true"
            name={`custom-email-field-${Math.random().toString(36).substr(2, 9)}`}
            role="combobox"
            aria-autocomplete="list"
            readOnly={false}
          />
          {isLoading && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-border border-t-primary rounded-full animate-spin"></div>
            </div>
          )}
        </div>
      </div>

      {/* Suggestions dropdown */}
      {isOpen && (isLoading || filteredSuggestions.length > 0) && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-64 overflow-auto">
          {isLoading ? (
            // Loading state in dropdown
            <div className="flex items-center justify-center py-8 space-x-3">
              <div className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-spin"></div>
              <span className="text-sm text-muted-foreground">Loading email suggestions...</span>
            </div>
          ) : (
            <ul ref={listRef} className="py-1">
              {filteredSuggestions.map((suggestion, index) => (
                <li key={suggestion.email}>
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
                    {suggestion.isGroup ? (
                      <Users className="w-4 h-4 text-primary flex-shrink-0" />
                    ) : (
                      <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    )}
                                          <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-popover-foreground truncate">
                          {suggestion.name || suggestion.email}
                        </div>
                        {suggestion.name && !suggestion.isGroup && (
                          <div className="text-xs text-muted-foreground truncate">
                            {suggestion.email}
                          </div>
                        )}
                        {suggestion.isGroup && suggestion.members && (
                          <div className="text-xs text-primary truncate">
                            {suggestion.members.length} members: {suggestion.members.slice(0, 2).map(m => m.name || m.email).join(', ')}
                            {suggestion.members.length > 2 && '...'}
                          </div>
                        )}
                      </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
  return emailRegex.test(email.trim())
} 