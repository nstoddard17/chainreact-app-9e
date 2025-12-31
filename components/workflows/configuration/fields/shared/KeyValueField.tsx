"use client"

import React, { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { Plus, X, Code, List } from "lucide-react"

interface KeyValuePair {
  key: string
  value: string
}

interface KeyValueFieldProps {
  field: any
  value: any
  onChange: (value: any) => void
  error?: string
}

/**
 * KeyValueField - A user-friendly key-value pair input field
 * Supports both a visual key-value editor and raw JSON mode
 * Stores data as an object that can be converted to JSON for API calls
 */
export function KeyValueField({
  field,
  value,
  onChange,
  error
}: KeyValueFieldProps) {
  // Determine initial mode based on value format
  const getInitialMode = (): 'pairs' | 'json' => {
    if (typeof value === 'string') {
      try {
        JSON.parse(value)
        return 'json'
      } catch {
        return 'pairs'
      }
    }
    return 'pairs'
  }

  const [mode, setMode] = useState<'pairs' | 'json'>(getInitialMode)
  const [jsonError, setJsonError] = useState<string | null>(null)

  // Parse value into pairs array
  const getPairs = (): KeyValuePair[] => {
    if (!value) return [{ key: '', value: '' }]

    try {
      let obj: Record<string, any>
      if (typeof value === 'string') {
        obj = JSON.parse(value)
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        obj = value
      } else {
        return [{ key: '', value: '' }]
      }

      const pairs = Object.entries(obj).map(([k, v]) => ({
        key: k,
        value: typeof v === 'object' ? JSON.stringify(v) : String(v)
      }))

      return pairs.length > 0 ? pairs : [{ key: '', value: '' }]
    } catch {
      return [{ key: '', value: '' }]
    }
  }

  // Get JSON string for raw mode
  const getJsonString = (): string => {
    if (!value) return '{}'
    if (typeof value === 'string') return value
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return '{}'
    }
  }

  const [pairs, setPairs] = useState<KeyValuePair[]>(getPairs)
  const [jsonValue, setJsonValue] = useState<string>(getJsonString)

  // Convert pairs to object and call onChange
  const updateFromPairs = (newPairs: KeyValuePair[]) => {
    setPairs(newPairs)

    // Build object from pairs, filtering out empty keys
    const obj: Record<string, any> = {}
    newPairs.forEach(pair => {
      if (pair.key.trim()) {
        // Try to parse value as JSON for nested objects/arrays
        try {
          obj[pair.key.trim()] = JSON.parse(pair.value)
        } catch {
          // If not valid JSON, use as string
          obj[pair.key.trim()] = pair.value
        }
      }
    })

    // Store as object (not JSON string) for better handling
    onChange(Object.keys(obj).length > 0 ? obj : undefined)
  }

  // Handle JSON mode changes
  const updateFromJson = (jsonStr: string) => {
    setJsonValue(jsonStr)
    setJsonError(null)

    if (!jsonStr.trim()) {
      onChange(undefined)
      return
    }

    try {
      const parsed = JSON.parse(jsonStr)
      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        setJsonError('Must be a valid JSON object (not an array)')
        return
      }
      onChange(parsed)
    } catch (e) {
      setJsonError('Invalid JSON format')
    }
  }

  // Switch between modes
  const switchMode = (newMode: 'pairs' | 'json') => {
    if (newMode === mode) return

    if (newMode === 'json') {
      // Convert pairs to JSON
      const obj: Record<string, any> = {}
      pairs.forEach(pair => {
        if (pair.key.trim()) {
          try {
            obj[pair.key.trim()] = JSON.parse(pair.value)
          } catch {
            obj[pair.key.trim()] = pair.value
          }
        }
      })
      setJsonValue(JSON.stringify(obj, null, 2))
      setJsonError(null)
    } else {
      // Convert JSON to pairs
      try {
        const obj = JSON.parse(jsonValue)
        const newPairs = Object.entries(obj).map(([k, v]) => ({
          key: k,
          value: typeof v === 'object' ? JSON.stringify(v) : String(v)
        }))
        setPairs(newPairs.length > 0 ? newPairs : [{ key: '', value: '' }])
      } catch {
        setPairs([{ key: '', value: '' }])
      }
    }

    setMode(newMode)
  }

  // Add a new pair
  const addPair = () => {
    const newPairs = [...pairs, { key: '', value: '' }]
    updateFromPairs(newPairs)
  }

  // Remove a pair
  const removePair = (index: number) => {
    if (pairs.length === 1) {
      // Clear the last pair instead of removing it
      updateFromPairs([{ key: '', value: '' }])
      return
    }
    const newPairs = pairs.filter((_, i) => i !== index)
    updateFromPairs(newPairs)
  }

  // Update a specific pair
  const updatePair = (index: number, field: 'key' | 'value', newValue: string) => {
    const newPairs = pairs.map((pair, i) => {
      if (i === index) {
        return { ...pair, [field]: newValue }
      }
      return pair
    })
    updateFromPairs(newPairs)
  }

  return (
    <div className="space-y-3">
      {/* Mode Toggle */}
      <div className="flex gap-1 p-1 bg-muted rounded-md w-fit">
        <button
          type="button"
          onClick={() => switchMode('pairs')}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded transition-colors",
            mode === 'pairs'
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <List className="h-3.5 w-3.5" />
          Key-Value Pairs
        </button>
        <button
          type="button"
          onClick={() => switchMode('json')}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded transition-colors",
            mode === 'json'
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Code className="h-3.5 w-3.5" />
          Raw JSON
        </button>
      </div>

      {mode === 'pairs' ? (
        /* Key-Value Pairs Mode */
        <div className="space-y-2">
          {pairs.map((pair, index) => (
            <div key={index} className="flex gap-2 items-start">
              <div className="flex-1">
                <Input
                  placeholder="Key"
                  value={pair.key}
                  onChange={(e) => updatePair(index, 'key', e.target.value)}
                  className={cn(
                    "text-sm",
                    error && "border-red-500"
                  )}
                />
              </div>
              <div className="flex-1">
                <Input
                  placeholder="Value"
                  value={pair.value}
                  onChange={(e) => updatePair(index, 'value', e.target.value)}
                  className={cn(
                    "text-sm",
                    error && "border-red-500"
                  )}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removePair(index)}
                className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addPair}
            className="w-full mt-2"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Add Property
          </Button>
        </div>
      ) : (
        /* JSON Mode */
        <div className="space-y-2">
          <Textarea
            value={jsonValue}
            onChange={(e) => updateFromJson(e.target.value)}
            placeholder='{"key": "value"}'
            className={cn(
              "font-mono text-sm min-h-[120px]",
              (error || jsonError) && "border-red-500"
            )}
          />
          {jsonError && (
            <p className="text-sm text-red-500">{jsonError}</p>
          )}
        </div>
      )}

      {error && !jsonError && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      {field.description && (
        <p className="text-xs text-muted-foreground">{field.description}</p>
      )}
    </div>
  )
}
