"use client"

import React from 'react'
import { Eye, EyeOff, Globe } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface VisibilityOption {
  value: string
  label: string
  description?: string
}

interface VisibilitySelectProps {
  value?: string
  onChange: (value: string) => void
  options: VisibilityOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
}

function getVisibilityIcon(value: string) {
  switch (value) {
    case 'public':
      return Globe
    case 'private':
      return EyeOff
    default:
      return Eye
  }
}

export function VisibilitySelect({
  value,
  onChange,
  options,
  placeholder = "Select visibility",
  disabled = false,
  className
}: VisibilitySelectProps) {
  const selectedOption = options.find(opt => opt.value === value)
  const Icon = selectedOption ? getVisibilityIcon(selectedOption.value) : Eye

  return (
    <div className="space-y-2">
      <Select
        value={value}
        onValueChange={onChange}
        disabled={disabled}
      >
        <SelectTrigger className={cn("w-full", className)}>
          <div className="flex items-center gap-2 w-full">
            <Icon className="h-4 w-4 shrink-0 opacity-50" />
            <SelectValue placeholder={placeholder}>
              {selectedOption?.label || placeholder}
            </SelectValue>
          </div>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => {
            const OptionIcon = getVisibilityIcon(option.value)
            return (
              <SelectItem key={option.value} value={option.value}>
                <div className="flex items-center gap-2">
                  <OptionIcon className="h-4 w-4 shrink-0 opacity-50" />
                  <span>{option.label}</span>
                </div>
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>

      {selectedOption?.description && (
        <p className="text-xs text-muted-foreground">
          {selectedOption.description}
        </p>
      )}
    </div>
  )
}
