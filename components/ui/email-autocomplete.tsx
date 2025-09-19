"use client"

import React, { useState, useEffect, useRef, useMemo, ReactNode } from "react"
import { createPortal } from "react-dom"
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
  endAdornment?: ReactNode
  error?: string
  onFocus?: () => void
  onDemandLoading?: boolean
}

export function EmailAutocomplete({
  value,
  onChange,
  suggestions,
  placeholder = "Enter email addresses...",
  disabled = false,
  multiple = false,
  className,
  isLoading = false,
  endAdornment,
  error,
  onFocus,
  onDemandLoading = true
}: EmailAutocompleteProps) {

  const [inputValue, setInputValue] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [selectedEmails, setSelectedEmails] = useState<string[]>([])
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 })
  const [hasUserInteracted, setHasUserInteracted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Calculate dropdown position
  const updateDropdownPosition = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect()
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4, // Add small gap
        left: rect.left + window.scrollX,
        width: rect.width
      })
    }
  }

  // Initialize selected emails from value prop
  useEffect(() => {
    if (multiple && value) {
      const emails = value.split(',').map(email => email.trim()).filter(Boolean)
      setSelectedEmails(emails)
    }
  }, [value, multiple])

  // Filter suggestions based on input and exclude already selected emails
  const filteredSuggestions = useMemo(() => {
    // If on-demand loading is enabled and user hasn't interacted yet, don't show suggestions
    if (onDemandLoading && !hasUserInteracted) {
      return []
    }
    
    const query = inputValue.toLowerCase()
    
    // First filter out already selected emails
    const availableSuggestions = suggestions.filter(suggestion => 
      !multiple || !selectedEmails.includes(suggestion.email)
    )
    
    if (!query) {
      // When empty, return all available suggestions with smart ordering
      return availableSuggestions
        .sort((a, b) => {
          // Prioritize contacts first
          if (a.type === 'contact' && b.type !== 'contact') return -1
          if (b.type === 'contact' && a.type !== 'contact') return 1
          
          // Then recent contacts
          if (a.type === 'recent' && b.type !== 'recent') return -1
          if (b.type === 'recent' && a.type !== 'recent') return 1
          
          // Then by name availability
          if (a.name && !b.name) return -1
          if (b.name && !a.name) return 1
          
          // Default to alphabetical
          return (a.name || a.email).localeCompare(b.name || b.email)
        })
        .slice(0, 50)
    }
    
    // When there's input, filter by query with smarter ranking
    const filtered = availableSuggestions.filter(suggestion => {
      // Check if query matches email or name
      return suggestion.email.toLowerCase().includes(query) ||
        (suggestion.name && suggestion.name.toLowerCase().includes(query))
    }).sort((a, b) => {
      // Sort by relevance:
      // 1. Exact matches at beginning of email or name
      // 2. Matches at beginning of email or name
      // 3. Contains matches
      // 4. Recent contacts (if they have a type field with 'recent')
      
      const aEmail = a.email.toLowerCase()
      const bEmail = b.email.toLowerCase()
      const aName = (a.name || '').toLowerCase()
      const bName = (b.name || '').toLowerCase()
      
      // Exact matches at beginning
      if (aEmail.startsWith(query) && !bEmail.startsWith(query)) return -1
      if (bEmail.startsWith(query) && !aEmail.startsWith(query)) return 1
      if (aName.startsWith(query) && !bName.startsWith(query)) return -1
      if (bName.startsWith(query) && !aName.startsWith(query)) return 1
      
      // Recent contacts
      if (a.type === 'recent' && b.type !== 'recent') return -1
      if (b.type === 'recent' && a.type !== 'recent') return 1
      
      // Prioritize contacts over generic emails
      if (a.name && !b.name) return -1
      if (b.name && !a.name) return 1
      
      // Default to alphabetical
      return aEmail.localeCompare(bEmail)
    })
    
    return filtered.slice(0, 50)
  }, [inputValue, suggestions, selectedEmails, multiple, onDemandLoading, hasUserInteracted])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
    
    // Always open dropdown when typing
    setIsOpen(true)
    setSelectedIndex(-1)
    
    // If not multiple mode, update value directly
    if (!multiple) {
      onChange(newValue)
    }
  }

  const handleSuggestionSelect = (suggestion: EmailSuggestion) => {
    // Cancel any pending blur timeout
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current)
      blurTimeoutRef.current = null
    }

    if (suggestion.isGroup && suggestion.members) {
      // Handle contact group selection - expand to individual emails
      const groupEmails = suggestion.members.map(member => member.email)
      if (multiple) {
        const newEmails = [...selectedEmails, ...groupEmails]
        setSelectedEmails(newEmails)
        onChange(newEmails.join(', '))
        setInputValue("")
        // Keep dropdown open for multiple selection
        setIsOpen(true)
        setSelectedIndex(-1)
        // Keep focus on input for more selections
        if (inputRef.current) {
          inputRef.current.focus()
        }
      } else {
        // For single mode, just use the first email from the group
        onChange(groupEmails[0] || suggestion.email)
        setInputValue(groupEmails[0] || suggestion.email)
        setIsOpen(false)
        setSelectedIndex(-1)
      }
    } else {
      // Handle individual email selection
      if (multiple) {
        const newEmails = [...selectedEmails, suggestion.email]
        setSelectedEmails(newEmails)
        onChange(newEmails.join(', '))
        setInputValue("")
        // Keep dropdown open for multiple selection
        setIsOpen(true)
        setSelectedIndex(-1)
        // Keep focus on input for more selections
        if (inputRef.current) {
          inputRef.current.focus()
        }
      } else {
        onChange(suggestion.email)
        setInputValue(suggestion.email)
        setIsOpen(false)
        setSelectedIndex(-1)
      }
    }
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
            // Keep dropdown open for multiple selection
            setIsOpen(true)
          } else {
            onChange(inputValue.trim())
            setIsOpen(false)
          }
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
            // Keep dropdown open for multiple selection
            setIsOpen(true)
          }
        }
        break
    }
  }

  const handleInputFocus = () => {
    setHasUserInteracted(true)
    updateDropdownPosition()
    setIsOpen(true)
    setSelectedIndex(-1)
    
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }

  const handleInputBlur = () => {
    // Small delay to allow suggestion clicks to complete
    blurTimeoutRef.current = setTimeout(() => {
      setIsOpen(false)
      setSelectedIndex(-1)
    }, 150) // Just enough time for clicks to register
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
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current)
      }
    }
  }, [])
  

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
              onFocus?.()
            }}
            onBlur={handleInputBlur}
            onClick={() => {
              setHasUserInteracted(true)
              if (!isOpen) {
                setIsOpen(true)
                setSelectedIndex(-1)
              }
            }}
            placeholder={
              (isLoading && (!onDemandLoading || hasUserInteracted)) 
                ? "Loading suggestions..." 
                : placeholder
            }
            disabled={disabled || isLoading}
            className="w-full pr-10" // Reduce right padding for flush button
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
          {isLoading && (!onDemandLoading || hasUserInteracted) && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-border border-t-primary rounded-full animate-spin"></div>
            </div>
          )}
          {endAdornment && !isLoading && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2 z-10">
              {React.cloneElement(endAdornment as React.ReactElement, {
                style: { borderRadius: 0, marginRight: 0, ...((endAdornment as any)?.props?.style || {}) },
                className: ((endAdornment as any)?.props?.className || "") + " !rounded-none !mr-0"
              })}
            </div>
          )}
        </div>
      </div>

      {/* Suggestions dropdown using portal */}
      {isOpen && typeof window !== 'undefined' && createPortal(
        <div
          className="fixed bg-popover border border-border rounded-md shadow-lg text-popover-foreground pointer-events-auto"
          data-email-dropdown="true"
          style={{
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            minWidth: Math.max(dropdownPosition.width, 320), // Ensure minimum width of 320px
            maxWidth: '500px', // Allow wider dropdown for better UX
            maxHeight: '320px', // Set max height in pixels
            overflowY: 'auto', // Enable vertical scrolling
            overflowX: 'hidden', // Prevent horizontal scrolling
            zIndex: 999999, // Ensure very high z-index for clicking
          }}
        >
          {isLoading && (!onDemandLoading || hasUserInteracted) ? (
            // Loading state in dropdown
            <div className="flex items-center justify-center py-8 space-x-3">
              <div className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-spin"></div>
              <span className="text-sm text-muted-foreground">Loading email suggestions...</span>
            </div>
          ) : filteredSuggestions.length > 0 ? (
            <ul ref={listRef} className="py-1">
              {/* Recent contacts section */}
              {filteredSuggestions.some(s => s.type === 'recent') && (
                <li className="px-3 py-1 text-xs font-medium text-muted-foreground bg-muted/30 border-b border-border">
                  Recent Contacts
                </li>
              )}
              
              {/* Recent contacts */}
              {filteredSuggestions
                .filter(s => s.type === 'recent')
                .map((suggestion, index) => {
                  const actualIndex = filteredSuggestions.findIndex(s => s.email === suggestion.email)
                  return (
                    <li key={`recent-${suggestion.email}`}>
                      <button
                        type="button"
                        className={cn(
                          "w-full px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground flex items-center gap-2",
                          selectedIndex === actualIndex && "bg-accent text-accent-foreground"
                        )}
                        onClick={() => handleSuggestionSelect(suggestion)}
                        onMouseEnter={() => setSelectedIndex(actualIndex)}
                      >
                        <Mail className="w-4 h-4 text-primary flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-popover-foreground truncate">
                            {suggestion.name || suggestion.email}
                          </div>
                          {suggestion.name && (
                            <div className="text-xs text-muted-foreground truncate">
                              {suggestion.email}
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  )
                })
              }
              
              {/* Contacts section */}
              {filteredSuggestions.some(s => s.type === 'contact' || (!s.type && s.name)) && (
                <li className="px-3 py-1 text-xs font-medium text-muted-foreground bg-muted/30 border-b border-border">
                  Contacts
                </li>
              )}
              
              {/* Regular contacts */}
              {filteredSuggestions
                .filter(s => s.type === 'contact' || (!s.type && s.name && !s.isGroup))
                .map((suggestion, index) => {
                  const actualIndex = filteredSuggestions.findIndex(s => s.email === suggestion.email)
                  return (
                    <li key={`contact-${suggestion.email}`}>
                      <button
                        type="button"
                        className={cn(
                          "w-full px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground flex items-center gap-2",
                          selectedIndex === actualIndex && "bg-accent text-accent-foreground"
                        )}
                        onClick={() => handleSuggestionSelect(suggestion)}
                        onMouseEnter={() => setSelectedIndex(actualIndex)}
                      >
                        <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-popover-foreground truncate">
                            {suggestion.name || suggestion.email}
                          </div>
                          {suggestion.name && (
                            <div className="text-xs text-muted-foreground truncate">
                              {suggestion.email}
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  )
                })
              }
              
              {/* Groups section */}
              {filteredSuggestions.some(s => s.isGroup) && (
                <li className="px-3 py-1 text-xs font-medium text-muted-foreground bg-muted/30 border-b border-border">
                  Contact Groups
                </li>
              )}
              
              {/* Groups */}
              {filteredSuggestions
                .filter(s => s.isGroup)
                .map((suggestion, index) => {
                  const actualIndex = filteredSuggestions.findIndex(s => s.email === suggestion.email)
                  return (
                    <li key={`group-${suggestion.email}`}>
                      <button
                        type="button"
                        className={cn(
                          "w-full px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground flex items-center gap-2",
                          selectedIndex === actualIndex && "bg-accent text-accent-foreground"
                        )}
                        onClick={() => handleSuggestionSelect(suggestion)}
                        onMouseEnter={() => setSelectedIndex(actualIndex)}
                      >
                        <Users className="w-4 h-4 text-primary flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-popover-foreground truncate">
                            {suggestion.name || suggestion.email}
                          </div>
                          {suggestion.members && (
                            <div className="text-xs text-primary truncate">
                              {suggestion.members.length} members: {suggestion.members.slice(0, 2).map(m => m.name || m.email).join(', ')}
                              {suggestion.members.length > 2 && '...'}
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  )
                })
              }
              
              {/* Other emails section */}
              {filteredSuggestions.some(s => !s.type && !s.name && !s.isGroup) && (
                <li className="px-3 py-1 text-xs font-medium text-muted-foreground bg-muted/30 border-b border-border">
                  Other Emails
                </li>
              )}
              
              {/* Other emails */}
              {filteredSuggestions
                .filter(s => !s.type && !s.name && !s.isGroup)
                .map((suggestion, index) => {
                  const actualIndex = filteredSuggestions.findIndex(s => s.email === suggestion.email)
                  return (
                    <li key={`other-${suggestion.email}`}>
                      <button
                        type="button"
                        className={cn(
                          "w-full px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground flex items-center gap-2",
                          selectedIndex === actualIndex && "bg-accent text-accent-foreground"
                        )}
                        onClick={() => handleSuggestionSelect(suggestion)}
                        onMouseEnter={() => setSelectedIndex(actualIndex)}
                      >
                        <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-popover-foreground truncate">
                            {suggestion.email}
                          </div>
                        </div>
                      </button>
                    </li>
                  )
                })
              }
            </ul>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 px-4">
              {error ? (
                <div className="text-sm text-red-500 text-center">
                  {error}
                </div>
              ) : (
                <>
                  <div className="text-sm text-muted-foreground text-center">
                    {inputValue ? 
                      "No matching email addresses found" : 
                      "Type to search or enter a new email address"
                    }
                  </div>
                  {inputValue && isValidEmail(inputValue) && (
                    <button
                      type="button"
                      className="mt-2 text-sm text-primary hover:underline"
                      onClick={() => {
                        if (multiple) {
                          const newEmails = [...selectedEmails, inputValue.trim()]
                          setSelectedEmails(newEmails)
                          onChange(newEmails.join(', '))
                          setInputValue("")
                        } else {
                          onChange(inputValue.trim())
                          setInputValue(inputValue.trim())
                          setIsOpen(false)
                        }
                      }}
                    >
                      Use "{inputValue}"
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
  return emailRegex.test(email.trim())
} 