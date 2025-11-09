"use client"

import React from 'react'
import { Palette } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface ColorOption {
  value: string
  label: string
  color: string | null
}

interface ColorSelectProps {
  value?: string
  onChange: (value: string) => void
  options: ColorOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
  showColorDots?: boolean
}

export function ColorSelect({
  value,
  onChange,
  options,
  placeholder = "Select color",
  disabled = false,
  className,
  showColorDots = true
}: ColorSelectProps) {
  const selectedOption = options.find(opt => opt.value === value)

  return (
    <Select
      value={value}
      onValueChange={onChange}
      disabled={disabled}
    >
      <SelectTrigger className={cn("w-full", className)}>
        <div className="flex items-center gap-2 w-full">
          {showColorDots && selectedOption?.color && (
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: selectedOption.color }}
            />
          )}
          {!showColorDots && <Palette className="h-4 w-4 shrink-0 opacity-50" />}
          <SelectValue placeholder={placeholder}>
            {selectedOption?.label || placeholder}
          </SelectValue>
        </div>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <div className="flex items-center gap-2">
              {showColorDots && option.color ? (
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: option.color }}
                />
              ) : (
                showColorDots && <div className="w-3 h-3 shrink-0" />
              )}
              <span>{option.label}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
