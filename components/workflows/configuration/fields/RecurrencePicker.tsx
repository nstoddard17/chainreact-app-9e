"use client"

import React, { useState, useEffect } from 'react'
import { Repeat } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface RecurrenceOption {
  value: string
  label: string
  dynamic?: boolean
}

interface RecurrencePickerProps {
  value?: string
  onChange: (value: string) => void
  options: RecurrenceOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
  startDate?: string // Used to generate dynamic labels
}

// Generate dynamic labels based on start date
function getDynamicLabel(value: string, startDate?: string): string {
  if (!startDate) return value

  try {
    const date = new Date(startDate)
    const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' })
    const dayOfMonth = date.getDate()
    const month = date.toLocaleDateString('en-US', { month: 'long' })
    const weekNumber = Math.ceil(dayOfMonth / 7)
    const weekNames = ['first', 'second', 'third', 'fourth', 'fifth']
    const weekName = weekNames[weekNumber - 1] || weekNumber.toString()

    if (value.includes('FREQ=WEEKLY') && !value.includes('BYDAY')) {
      return `Weekly on ${dayOfWeek}`
    } else if (value.includes('FREQ=MONTHLY')) {
      return `Monthly on the ${weekName} ${dayOfWeek}`
    } else if (value.includes('FREQ=YEARLY')) {
      return `Annually on ${month} ${dayOfMonth}`
    }
  } catch {
    // Fall through to default
  }

  return value.replace('RRULE:', '').replace('FREQ=', '')
}

export function RecurrencePicker({
  value,
  onChange,
  options,
  placeholder = "Does not repeat",
  disabled = false,
  className,
  startDate
}: RecurrencePickerProps) {
  const [customModalOpen, setCustomModalOpen] = useState(false)

  const handleChange = (newValue: string) => {
    if (newValue === 'custom') {
      setCustomModalOpen(true)
      // TODO: Open custom recurrence modal
      // For now, just set to weekly
      onChange('RRULE:FREQ=WEEKLY')
    } else {
      onChange(newValue)
    }
  }

  const selectedOption = options.find(opt => opt.value === value)
  const displayLabel = selectedOption && selectedOption.dynamic
    ? getDynamicLabel(selectedOption.value, startDate)
    : selectedOption?.label || placeholder

  return (
    <div className="space-y-2">
      <Select
        value={value}
        onValueChange={handleChange}
        disabled={disabled}
      >
        <SelectTrigger className={cn("w-full", className)}>
          <div className="flex items-center gap-2 w-full">
            <Repeat className="h-4 w-4 shrink-0 opacity-50" />
            <SelectValue placeholder={placeholder}>
              {displayLabel}
            </SelectValue>
          </div>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => {
            const label = option.dynamic
              ? getDynamicLabel(option.value, startDate)
              : option.label

            return (
              <SelectItem key={option.value} value={option.value}>
                {label}
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>

      {/* TODO: Add custom recurrence modal */}
      {customModalOpen && (
        <p className="text-xs text-muted-foreground">
          Custom recurrence modal coming soon
        </p>
      )}
    </div>
  )
}
