"use client"

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon, X } from "lucide-react"
import { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DateRangePickerProps {
  value?: DateRange
  onChange?: (range: DateRange | undefined) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  numberOfMonths?: number
  minDate?: Date
  maxDate?: Date
}

export function DateRangePicker({
  value,
  onChange,
  placeholder = "Pick a date range",
  disabled,
  className,
  numberOfMonths = 2,
  minDate,
  maxDate,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false)

  const handleSelect = (range: DateRange | undefined) => {
    onChange?.(range)
    // Close popover when both dates are selected
    if (range?.from && range?.to) {
      setOpen(false)
    }
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange?.(undefined)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id="date"
          variant={"outline"}
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground",
            className
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
          <span className="flex-1 truncate">
            {value?.from ? (
              value.to ? (
                <>
                  {format(value.from, "LLL dd, y")} -{" "}
                  {format(value.to, "LLL dd, y")}
                </>
              ) : (
                format(value.from, "LLL dd, y")
              )
            ) : (
              <span>{placeholder}</span>
            )}
          </span>
          {value && !disabled && (
            <X 
              className="ml-2 h-4 w-4 opacity-50 hover:opacity-100 transition-opacity" 
              onClick={handleClear}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          initialFocus
          mode="range"
          defaultMonth={value?.from}
          selected={value}
          onSelect={handleSelect}
          numberOfMonths={numberOfMonths}
          disabled={(date) => {
            if (minDate && date < minDate) return true
            if (maxDate && date > maxDate) return true
            return false
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

// Helper component for preset date ranges
export function DateRangePickerWithPresets({
  value,
  onChange,
  placeholder,
  disabled,
  className,
}: DateRangePickerProps) {
  const presets = [
    {
      label: "Today",
      value: () => {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const endOfDay = new Date(today)
        endOfDay.setHours(23, 59, 59, 999)
        return { from: today, to: endOfDay }
      }
    },
    {
      label: "Yesterday",
      value: () => {
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)
        yesterday.setHours(0, 0, 0, 0)
        const endOfDay = new Date(yesterday)
        endOfDay.setHours(23, 59, 59, 999)
        return { from: yesterday, to: endOfDay }
      }
    },
    {
      label: "Last 7 Days",
      value: () => {
        const today = new Date()
        today.setHours(23, 59, 59, 999)
        const weekAgo = new Date()
        weekAgo.setDate(weekAgo.getDate() - 7)
        weekAgo.setHours(0, 0, 0, 0)
        return { from: weekAgo, to: today }
      }
    },
    {
      label: "Last 30 Days",
      value: () => {
        const today = new Date()
        today.setHours(23, 59, 59, 999)
        const monthAgo = new Date()
        monthAgo.setDate(monthAgo.getDate() - 30)
        monthAgo.setHours(0, 0, 0, 0)
        return { from: monthAgo, to: today }
      }
    },
    {
      label: "This Month",
      value: () => {
        const today = new Date()
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999)
        return { from: firstDay, to: lastDay }
      }
    },
    {
      label: "Last Month",
      value: () => {
        const today = new Date()
        const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1)
        const lastDay = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999)
        return { from: firstDay, to: lastDay }
      }
    }
  ]

  const [open, setOpen] = React.useState(false)

  const handlePresetSelect = (preset: typeof presets[0]) => {
    const range = preset.value()
    onChange?.(range)
    setOpen(false)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange?.(undefined)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id="date"
          variant={"outline"}
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground",
            className
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
          <span className="flex-1 truncate">
            {value?.from ? (
              value.to ? (
                <>
                  {format(value.from, "LLL dd, y")} -{" "}
                  {format(value.to, "LLL dd, y")}
                </>
              ) : (
                format(value.from, "LLL dd, y")
              )
            ) : (
              <span>{placeholder}</span>
            )}
          </span>
          {value && !disabled && (
            <X 
              className="ml-2 h-4 w-4 opacity-50 hover:opacity-100 transition-opacity" 
              onClick={handleClear}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex">
          <div className="border-r p-2 space-y-1">
            <p className="text-xs font-medium text-muted-foreground px-2 pb-1">Quick Select</p>
            {presets.map((preset, index) => (
              <Button
                key={index}
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => handlePresetSelect(preset)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <div>
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={value?.from}
              selected={value}
              onSelect={(range) => {
                onChange?.(range)
                if (range?.from && range?.to) {
                  setOpen(false)
                }
              }}
              numberOfMonths={2}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}