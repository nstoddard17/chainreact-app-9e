"use client"

import { useState } from "react"
import { Plus, Trash2, GripVertical } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface SelectOption {
  name: string
  color: string
}

interface NotionSelectOptionsFieldProps {
  value: SelectOption[] | string | null
  onChange: (value: SelectOption[]) => void
  placeholder?: string
  disabled?: boolean
  error?: string
}

// Notion's supported colors for select options
const NOTION_COLORS = [
  { value: "default", label: "Default", bg: "bg-gray-100 dark:bg-gray-700", text: "text-gray-800 dark:text-gray-200" },
  { value: "gray", label: "Gray", bg: "bg-gray-200 dark:bg-gray-600", text: "text-gray-800 dark:text-gray-200" },
  { value: "brown", label: "Brown", bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-800 dark:text-amber-200" },
  { value: "orange", label: "Orange", bg: "bg-orange-100 dark:bg-orange-900/40", text: "text-orange-800 dark:text-orange-200" },
  { value: "yellow", label: "Yellow", bg: "bg-yellow-100 dark:bg-yellow-900/40", text: "text-yellow-800 dark:text-yellow-200" },
  { value: "green", label: "Green", bg: "bg-green-100 dark:bg-green-900/40", text: "text-green-800 dark:text-green-200" },
  { value: "blue", label: "Blue", bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-800 dark:text-blue-200" },
  { value: "purple", label: "Purple", bg: "bg-purple-100 dark:bg-purple-900/40", text: "text-purple-800 dark:text-purple-200" },
  { value: "pink", label: "Pink", bg: "bg-pink-100 dark:bg-pink-900/40", text: "text-pink-800 dark:text-pink-200" },
  { value: "red", label: "Red", bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-800 dark:text-red-200" },
]

export function NotionSelectOptionsField({
  value,
  onChange,
  placeholder = "Add options for your select field",
  disabled = false,
  error
}: NotionSelectOptionsFieldProps) {
  // Parse value if it's a string (JSON)
  const parseValue = (val: SelectOption[] | string | null): SelectOption[] => {
    if (!val) return []
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val)
        return Array.isArray(parsed) ? parsed : []
      } catch {
        return []
      }
    }
    return Array.isArray(val) ? val : []
  }

  const options = parseValue(value)

  const addOption = () => {
    const newOptions = [...options, { name: "", color: "default" }]
    onChange(newOptions)
  }

  const removeOption = (index: number) => {
    const newOptions = options.filter((_, i) => i !== index)
    onChange(newOptions)
  }

  const updateOption = (index: number, field: keyof SelectOption, newValue: string) => {
    const newOptions = options.map((opt, i) =>
      i === index ? { ...opt, [field]: newValue } : opt
    )
    onChange(newOptions)
  }

  const getColorStyles = (colorValue: string) => {
    const color = NOTION_COLORS.find(c => c.value === colorValue) || NOTION_COLORS[0]
    return color
  }

  return (
    <div className="space-y-3">
      {options.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-md">
          {placeholder}
        </div>
      ) : (
        <div className="space-y-2">
          {options.map((option, index) => {
            const colorStyles = getColorStyles(option.color)
            return (
              <div
                key={index}
                className="flex items-center gap-2 p-2 bg-muted/30 rounded-md border"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground/50 cursor-grab" />

                {/* Option Name */}
                <div className="flex-1">
                  <Input
                    value={option.name}
                    onChange={(e) => updateOption(index, 'name', e.target.value)}
                    placeholder="Option name"
                    disabled={disabled}
                    className="h-8"
                  />
                </div>

                {/* Color Selector */}
                <Select
                  value={option.color}
                  onValueChange={(newColor) => updateOption(index, 'color', newColor)}
                  disabled={disabled}
                >
                  <SelectTrigger className="w-[130px] h-8">
                    <SelectValue>
                      <div className="flex items-center gap-2">
                        <div className={cn("w-3 h-3 rounded-sm", colorStyles.bg)} />
                        <span className="text-xs">{colorStyles.label}</span>
                      </div>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {NOTION_COLORS.map((color) => (
                      <SelectItem key={color.value} value={color.value}>
                        <div className="flex items-center gap-2">
                          <div className={cn("w-3 h-3 rounded-sm", color.bg)} />
                          <span>{color.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Preview Badge */}
                {option.name && (
                  <div className={cn(
                    "px-2 py-0.5 rounded text-xs font-medium",
                    colorStyles.bg,
                    colorStyles.text
                  )}>
                    {option.name}
                  </div>
                )}

                {/* Remove Button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeOption(index)}
                  disabled={disabled}
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )
          })}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addOption}
        disabled={disabled}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Option
      </Button>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  )
}
