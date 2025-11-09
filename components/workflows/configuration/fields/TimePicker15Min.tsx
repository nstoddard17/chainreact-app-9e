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

  // Try 24-hour format "14:30" or "1430"
  const match24Hour = clean.match(/^(\d{1,2}):?(\d{2})$/)
  if (match24Hour) {
    const hour = parseInt(match24Hour[1])
    const minute = parseInt(match24Hour[2])

    if (hour < 0 || hour > 23) return null
    if (minute < 0 || minute > 59) return null

    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
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
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const displayValue = value ? formatTimeDisplay(value) : ''

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const handleSelect = (selectedValue: string) => {
    onChange(selectedValue)
    setOpen(false)
  }

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditValue(displayValue)
    setEditing(true)
  }

  const handleEditBlur = () => {
    const parsed = parseTimeInput(editValue)
    if (parsed) {
      onChange(parsed)
    }
    setEditing(false)
  }

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const parsed = parseTimeInput(editValue)
      if (parsed) {
        onChange(parsed)
      }
      setEditing(false)
    } else if (e.key === 'Escape') {
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleEditBlur}
        onKeyDown={handleEditKeyDown}
        placeholder="e.g. 10:44pm"
        className={cn("font-mono", className)}
      />
    )
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
          <span onClick={handleEditClick} className="flex-1 text-left cursor-text">
            {displayValue || placeholder}
          </span>
          <Clock className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search time..." />
          <CommandList>
            <CommandEmpty>No time found.</CommandEmpty>
            <CommandGroup>
              {timeOptions.map((option) => (
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
