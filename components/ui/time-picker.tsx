"use client"

import * as React from "react"
import { Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface TimePickerProps {
  value?: string
  onChange?: (time: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

// Generate time options (every 15 minutes)
const generateTimeOptions = () => {
  const times = []
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
      const displayTime = new Date(2000, 0, 1, hour, minute).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
      times.push({ value: timeString, label: displayTime })
    }
  }
  return times
}

const timeOptions = generateTimeOptions()

export function TimePicker({
  value,
  onChange,
  placeholder = "Select time",
  disabled,
  className
}: TimePickerProps) {
  const displayValue = value ? timeOptions.find(option => option.value === value)?.label : undefined

  return (
    <Select onValueChange={onChange} value={value} disabled={disabled}>
      <SelectTrigger className={cn("w-full", className)}>
        <div className="flex items-center">
          <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
          <SelectValue placeholder={placeholder}>
            {displayValue || placeholder}
          </SelectValue>
        </div>
      </SelectTrigger>
      <SelectContent className="max-h-60">
        {timeOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
} 