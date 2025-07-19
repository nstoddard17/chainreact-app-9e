"use client"

import * as React from "react"
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, startOfWeek, endOfWeek, addWeeks } from "date-fns"
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface DateTimePickerProps {
  value?: Date
  onChange?: (date: Date | undefined) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Pick date and time",
  disabled,
  className
}: DateTimePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [currentMonth, setCurrentMonth] = React.useState(value ? new Date(value) : new Date())
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(value)
  const [selectedTime, setSelectedTime] = React.useState<string>(
    value ? format(value, "HH:mm") : "12:00"
  )

  // Update state when value prop changes
  React.useEffect(() => {
    if (value) {
      setSelectedDate(value)
      setSelectedTime(format(value, "HH:mm"))
      setCurrentMonth(value)
    } else {
      setSelectedDate(undefined)
      setSelectedTime("12:00")
    }
  }, [value])

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date)
    if (selectedTime) {
      const [hours, minutes] = selectedTime.split(':').map(Number)
      date.setHours(hours, minutes, 0, 0)
      onChange?.(date)
    }
  }

  const handleTimeChange = (time: string) => {
    setSelectedTime(time)
    if (selectedDate) {
      const [hours, minutes] = time.split(':').map(Number)
      const newDate = new Date(selectedDate)
      newDate.setHours(hours, minutes, 0, 0)
      onChange?.(newDate)
    }
  }

  const handleApply = () => {
    if (selectedDate && selectedTime) {
      const [hours, minutes] = selectedTime.split(':').map(Number)
      const finalDate = new Date(selectedDate)
      finalDate.setHours(hours, minutes, 0, 0)
      onChange?.(finalDate)
    }
    setIsOpen(false)
  }

  const handleCancel = () => {
    // Reset to original values
    if (value) {
      setSelectedDate(value)
      setSelectedTime(format(value, "HH:mm"))
      setCurrentMonth(value)
    } else {
      setSelectedDate(undefined)
      setSelectedTime("12:00")
    }
    setIsOpen(false)
  }

  const displayValue = value ? format(value, "PPP 'at' h:mm a") : undefined

  // Generate calendar days - always show 6 weeks (42 days) for consistent size
  const monthStart = startOfMonth(currentMonth)
  const calendarStart = startOfWeek(monthStart)
  const calendarEnd = addWeeks(calendarStart, 5) // 6 weeks total
  
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd })

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

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground",
            className
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {displayValue || <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="start">
        <div className="space-y-4">
          {/* Calendar Header */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h3 className="font-medium">
              {format(currentMonth, "MMMM yyyy")}
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Calendar Grid - Fixed height container */}
          <div className="grid grid-cols-7 gap-1" style={{ height: '240px' }}>
            {/* Day headers */}
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
              <div key={day} className="text-center text-xs font-medium text-muted-foreground p-1">
                {day}
              </div>
            ))}
            
            {/* Calendar days */}
            {days.map((day) => {
              const isCurrentMonth = isSameMonth(day, currentMonth)
              const isSelected = selectedDate && isSameDay(day, selectedDate)
              const isToday = isSameDay(day, new Date())
              
              return (
                <Button
                  key={day.toISOString()}
                  variant={isSelected ? "default" : "ghost"}
                  size="sm"
                  className={cn(
                    "h-8 w-8 p-0 text-xs",
                    !isCurrentMonth && "text-muted-foreground/50",
                    isToday && !isSelected && "bg-muted font-semibold",
                    isSelected && "bg-primary text-primary-foreground"
                  )}
                  onClick={() => handleDateSelect(day)}
                >
                  {format(day, "d")}
                </Button>
              )
            })}
          </div>

          {/* Time Selection */}
          <div className="border-t pt-4">
            <h4 className="font-medium mb-2">Time</h4>
            <Select value={selectedTime} onValueChange={handleTimeChange}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {timeOptions.find(option => option.value === selectedTime)?.label || "Select time"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {timeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-2 pt-2">
            <Button variant="outline" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleApply}>
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
} 