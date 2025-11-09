"use client"

import React, { useState, useRef, useEffect } from 'react'
import { Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface TimePicker15MinProps {
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

// Generate all time options in 15-minute increments
function generateTimeOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = []

  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
      const ampm = hour < 12 ? 'am' : 'pm'
      const hourStr = hour.toString().padStart(2, '0')
      const minuteStr = minute.toString().padStart(2, '0')

      const value = `${hourStr}:${minuteStr}`
      const label = `${hour12}:${minuteStr}${ampm}`

      options.push({ value, label })
    }
  }

  return options
}

const timeOptions = generateTimeOptions()

// Parse various time formats to 24-hour HH:mm
function parseTimeInput(input: string): string | null {
  if (!input) return null

  // Remove spaces
  const clean = input.trim().toLowerCase().replace(/\s+/g, '')

  // Try to match patterns like "10:44pm", "10:44 pm", "1044pm", "10pm"
  const match12Hour = clean.match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)$/i)
  if (match12Hour) {
    let hour = parseInt(match12Hour[1])
    const minute = match12Hour[2] ? parseInt(match12Hour[2]) : 0
    const ampm = match12Hour[3].toLowerCase()

    if (hour < 1 || hour > 12) return null
    if (minute < 0 || minute > 59) return null

    // Convert to 24-hour
    if (ampm === 'pm' && hour !== 12) hour += 12
    if (ampm === 'am' && hour === 12) hour = 0

    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
  }

  // Try shorthand format without am/pm: "1000", "945", "10:00", "9:45"
  // Auto-detect am/pm based on proximity to current time
  const matchShorthand = clean.match(/^(\d{1,2}):?(\d{2})$/)
  if (matchShorthand) {
    let hour = parseInt(matchShorthand[1])
    const minute = parseInt(matchShorthand[2])

    // If hour is 1-12, determine am/pm based on current time
    if (hour >= 1 && hour <= 12 && minute >= 0 && minute <= 59) {
      const now = new Date()
      const currentHour = now.getHours()
      const currentMinute = now.getMinutes()
      const currentTotalMinutes = currentHour * 60 + currentMinute

      // Calculate total minutes for both am and pm interpretations
      const amHour = hour === 12 ? 0 : hour
      const pmHour = hour === 12 ? 12 : hour + 12
      const amTotalMinutes = amHour * 60 + minute
      const pmTotalMinutes = pmHour * 60 + minute

      // Calculate distance from current time for both options
      const amDistance = Math.abs(currentTotalMinutes - amTotalMinutes)
      const pmDistance = Math.abs(currentTotalMinutes - pmTotalMinutes)

      // Choose the interpretation closer to current time
      const finalHour = amDistance <= pmDistance ? amHour : pmHour

      return `${finalHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
    }

    // If hour is 0-23, treat as 24-hour format
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
    }
  }

  return null
}

// Format 24-hour time to 12-hour display
function formatTimeDisplay(time24: string): string {
  if (!time24) return ''

  const [hourStr, minuteStr] = time24.split(':')
  const hour = parseInt(hourStr)
  const minute = parseInt(minuteStr)

  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  const ampm = hour < 12 ? 'am' : 'pm'

  return `${hour12}:${minuteStr}${ampm}`
}

export function TimePicker15Min({
  value,
  onChange,
  placeholder = "Select time",
  disabled = false,
  className
}: TimePicker15MinProps) {
  const [open, setOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const displayValue = value ? formatTimeDisplay(value) : ''

  // Filter options based on search
  const filteredOptions = searchValue
    ? timeOptions.filter(option =>
        option.label.toLowerCase().includes(searchValue.toLowerCase())
      )
    : timeOptions

  const handleSelect = (selectedValue: string) => {
    onChange(selectedValue)
    setOpen(false)
    setSearchValue('')
  }

  const handleSearchChange = (value: string) => {
    setSearchValue(value)
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchValue) {
      e.preventDefault()
      const parsed = parseTimeInput(searchValue)
      if (parsed) {
        onChange(parsed)
        setOpen(false)
        setSearchValue('')
      }
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          <span className="flex-1 text-left">
            {displayValue || placeholder}
          </span>
          <Clock className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0" align="start" style={{ width: 'var(--radix-popover-trigger-width)' }}>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Type time (e.g., 1000, 10pm)..."
            value={searchValue}
            onValueChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
          />
          <CommandList className="max-h-[300px] overflow-y-auto">
            <CommandEmpty>
              {searchValue ? 'Type Enter to use this time' : 'No time found.'}
            </CommandEmpty>
            <CommandGroup>
              {filteredOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => handleSelect(option.value)}
                >
                  <span className="font-mono">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
