"use client"

import React, { useState, useRef, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Variable, X, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VariableOption {
  name: string
  label: string
  type: string
  example?: string
}

interface VariableAutocompleteProps {
  value: string
  onChange: (value: string) => void
  variables?: VariableOption[]
  placeholder?: string
  className?: string
  isVariable?: boolean
  onToggleVariable?: (isVariable: boolean) => void
}

export function VariableAutocomplete({
  value,
  onChange,
  variables = [],
  placeholder = "Enter value...",
  className,
  isVariable = false,
  onToggleVariable
}: VariableAutocompleteProps) {
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [filteredVariables, setFilteredVariables] = useState<VariableOption[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // Filter variables based on input
  useEffect(() => {
    const cursorPos = inputRef.current?.selectionStart || 0
    const textBeforeCursor = value.substring(0, cursorPos)

    // Check if we're inside {{ }}
    const lastOpenBrace = textBeforeCursor.lastIndexOf('{{')
    const lastCloseBrace = textBeforeCursor.lastIndexOf('}}')

    if (lastOpenBrace > lastCloseBrace) {
      // We're inside a variable reference
      const searchText = textBeforeCursor.substring(lastOpenBrace + 2).toLowerCase()
      const filtered = variables.filter(v =>
        v.label.toLowerCase().includes(searchText) ||
        v.name.toLowerCase().includes(searchText)
      )
      setFilteredVariables(filtered)
      setShowSuggestions(filtered.length > 0)
      setSelectedIndex(0)
    } else {
      setShowSuggestions(false)
    }
  }, [value, variables])

  const insertVariable = (variable: VariableOption) => {
    const cursorPos = inputRef.current?.selectionStart || 0
    const textBeforeCursor = value.substring(0, cursorPos)
    const textAfterCursor = value.substring(cursorPos)

    const lastOpenBrace = textBeforeCursor.lastIndexOf('{{')

    const newValue =
      textBeforeCursor.substring(0, lastOpenBrace) +
      `{{${variable.name}}}` +
      textAfterCursor

    onChange(newValue)
    setShowSuggestions(false)

    // Focus back on input
    setTimeout(() => {
      inputRef.current?.focus()
      const newCursorPos = lastOpenBrace + variable.name.length + 4
      inputRef.current?.setSelectionRange(newCursorPos, newCursorPos)
    }, 0)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions) {
      // Quick insert with {{
      if (e.key === '{' && value.endsWith('{')) {
        e.preventDefault()
        setShowSuggestions(true)
        return
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev => Math.min(prev + 1, filteredVariables.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => Math.max(prev - 1, 0))
        break
      case 'Enter':
      case 'Tab':
        e.preventDefault()
        if (filteredVariables[selectedIndex]) {
          insertVariable(filteredVariables[selectedIndex])
        }
        break
      case 'Escape':
        e.preventDefault()
        setShowSuggestions(false)
        break
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'string': return '📝'
      case 'number': return '🔢'
      case 'boolean': return '✓'
      case 'array': return '📋'
      case 'object': return '📦'
      default: return '•'
    }
  }

  const handleVariableToggle = () => {
    if (onToggleVariable) {
      const newState = !isVariable
      onToggleVariable(newState)
      if (newState && !value.includes('{{')) {
        onChange(`{{${value}}}`)
      } else if (!newState && value.includes('{{')) {
        onChange(value.replace(/^\{\{|\}\}$/g, ''))
      }
    }
  }

  return (
    <div className="relative w-full">
      <div className="relative">
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (value.includes('{{')) {
              setShowSuggestions(true)
            }
          }}
          placeholder={placeholder}
          className={cn(
            "pr-20",
            isVariable && "bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700",
            className
          )}
        />

        {/* Variable toggle button */}
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {isVariable && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => {
                if (onToggleVariable) {
                  onToggleVariable(false)
                  onChange(value.replace(/\{\{|\}\}/g, ''))
                }
              }}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 w-7 p-0",
              isVariable && "text-blue-600 dark:text-blue-400"
            )}
            onClick={handleVariableToggle}
            title="Use variable from previous step"
          >
            <Variable className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Autocomplete suggestions */}
      {showSuggestions && filteredVariables.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover shadow-lg"
        >
          <div className="p-2 space-y-1">
            <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
              <Sparkles className="w-3 h-3" />
              <span>Available variables - Press Enter to insert</span>
            </div>
            {filteredVariables.map((variable, index) => (
              <button
                key={variable.name}
                type="button"
                onClick={() => insertVariable(variable)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={cn(
                  "w-full flex items-start gap-3 px-2 py-2 rounded text-left hover:bg-accent transition-colors",
                  selectedIndex === index && "bg-accent"
                )}
              >
                <span className="text-lg mt-0.5">{getTypeIcon(variable.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {variable.label}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {variable.type}
                    </Badge>
                  </div>
                  {variable.example && (
                    <span className="text-xs text-muted-foreground block truncate mt-0.5">
                      Example: {variable.example}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Helper text */}
      {!showSuggestions && variables.length > 0 && (
        <div className="mt-1.5 text-xs text-muted-foreground flex items-center gap-1">
          <Variable className="w-3 h-3" />
          <span>Type <code className="px-1 py-0.5 rounded bg-muted">{'{{ }}'}</code> to insert variables</span>
        </div>
      )}
    </div>
  )
}
