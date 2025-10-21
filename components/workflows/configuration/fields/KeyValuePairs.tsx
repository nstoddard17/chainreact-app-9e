"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Trash2, Variable } from "lucide-react"
import { cn } from "@/lib/utils"

export interface KeyValuePair {
  id: string
  key: string
  value: string
  isVariable?: boolean
}

interface KeyValuePairsProps {
  value?: KeyValuePair[]
  onChange: (pairs: KeyValuePair[]) => void
  keyPlaceholder?: string
  valuePlaceholder?: string
  showVariablePicker?: boolean
}

export function KeyValuePairs({
  value = [],
  onChange,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
  showVariablePicker = true,
}: KeyValuePairsProps) {
  const [pairs, setPairs] = useState<KeyValuePair[]>(value)

  useEffect(() => {
    if (value.length === 0 && pairs.length === 0) {
      // Initialize with one empty pair
      const initialPair: KeyValuePair = {
        id: crypto.randomUUID(),
        key: '',
        value: '',
      }
      setPairs([initialPair])
      onChange([initialPair])
    }
  }, [])

  const addPair = () => {
    const newPair: KeyValuePair = {
      id: crypto.randomUUID(),
      key: '',
      value: '',
    }
    const updatedPairs = [...pairs, newPair]
    setPairs(updatedPairs)
    onChange(updatedPairs)
  }

  const removePair = (id: string) => {
    const updatedPairs = pairs.filter(p => p.id !== id)
    setPairs(updatedPairs)
    onChange(updatedPairs)
  }

  const updatePair = (id: string, updates: Partial<KeyValuePair>) => {
    const updatedPairs = pairs.map(p =>
      p.id === id ? { ...p, ...updates } : p
    )
    setPairs(updatedPairs)
    onChange(updatedPairs)
  }

  return (
    <div className="space-y-3">
      {pairs.map((pair, index) => (
        <div key={pair.id} className="flex items-center gap-2">
          {/* Key Input */}
          <Input
            value={pair.key}
            onChange={(e) => updatePair(pair.id, { key: e.target.value })}
            placeholder={keyPlaceholder}
            className="flex-1"
          />

          {/* Value Input */}
          <div className="flex-1 relative">
            <Input
              value={pair.value}
              onChange={(e) => updatePair(pair.id, { value: e.target.value })}
              placeholder={valuePlaceholder}
              className={cn(
                pair.isVariable && "bg-blue-50 dark:bg-blue-950"
              )}
            />
            {showVariablePicker && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                onClick={() =>
                  updatePair(pair.id, { isVariable: !pair.isVariable })
                }
                title="Toggle variable picker"
              >
                <Variable className="w-4 h-4" />
              </Button>
            )}
          </div>

          {/* Remove Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removePair(pair.id)}
            disabled={pairs.length === 1}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ))}

      {/* Add Pair Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={addPair}
        className="w-full"
      >
        <Plus className="w-4 h-4 mr-2" />
        Add {keyPlaceholder}
      </Button>
    </div>
  )
}
