"use client"

import React from 'react'
import { Bell, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { GoogleTimePicker } from './GoogleTimePicker'
import { cn } from '@/lib/utils'

interface Notification {
  method: 'popup' | 'email'
  minutes: number
  time?: string // Optional time of day (HH:mm format) for day/week notifications
}

interface NotificationBuilderProps {
  value?: Notification[]
  onChange: (value: Notification[]) => void
  className?: string
  disabled?: boolean
  showTimePicker?: boolean // Whether to show time picker for day/week units
}

const timeUnits = [
  { value: 1, label: 'minute(s)' },
  { value: 60, label: 'hour(s)' },
  { value: 1440, label: 'day(s)' },
  { value: 10080, label: 'week(s)' }
]

function convertMinutesToDisplay(minutes: number): { value: number; unit: number } {
  // Find the largest unit that divides evenly
  for (let i = timeUnits.length - 1; i >= 0; i--) {
    const unit = timeUnits[i]
    if (minutes % unit.value === 0) {
      return { value: minutes / unit.value, unit: unit.value }
    }
  }
  return { value: minutes, unit: 1 }
}


export function NotificationBuilder({
  value = [],
  onChange,
  className,
  disabled = false,
  showTimePicker = true
}: NotificationBuilderProps) {
  const notifications = value.length > 0 ? value : []

  const addNotification = () => {
    onChange([...notifications, { method: 'popup', minutes: 30 }])
  }

  const removeNotification = (index: number) => {
    onChange(notifications.filter((_, i) => i !== index))
  }

  const updateNotification = (index: number, updates: Partial<Notification>) => {
    const updated = notifications.map((notif, i) =>
      i === index ? { ...notif, ...updates } : notif
    )
    onChange(updated)
  }

  const updateTime = (index: number, value: number, unitMinutes: number) => {
    const updates: Partial<Notification> = { minutes: value * unitMinutes }
    updateNotification(index, updates)
  }

  if (notifications.length === 0) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={addNotification}
        disabled={disabled}
        className={cn("w-full justify-start", className)}
      >
        <Plus className="h-4 w-4 mr-2" />
        Add notification
      </Button>
    )
  }

  return (
    <div className={cn("space-y-2", className)}>
      {notifications.map((notification, index) => {
        const { value: timeValue, unit: unitMinutes } = convertMinutesToDisplay(notification.minutes)

        return (
          <div key={index} className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground shrink-0" />

            {/* Method selector */}
            <div style={{ width: '145px', minWidth: '145px' }}>
              <Combobox
                value={notification.method}
                onChange={(method) => updateNotification(index, { method: method as 'popup' | 'email' })}
                options={[
                  { value: 'popup', label: 'Notification' },
                  { value: 'email', label: 'Email' }
                ]}
                disabled={disabled}
                disableSearch={true}
                hideClearButton={true}
                style={{ width: '145px', minWidth: '145px' }}
              />
            </div>

            {/* Number input with spinner */}
            <Input
              type="number"
              min="1"
              max="999"
              value={timeValue}
              onChange={(e) => {
                const newValue = parseInt(e.target.value) || 1
                updateTime(index, newValue, unitMinutes)
              }}
              disabled={disabled}
              className="w-[90px]"
            />

            {/* Time unit selector */}
            <div style={{ width: '130px', minWidth: '130px' }}>
              <Combobox
                value={unitMinutes.toString()}
                onChange={(unit) => updateTime(index, timeValue, parseInt(unit))}
                options={timeUnits.map((unit) => ({
                  value: unit.value.toString(),
                  label: unit.label
                }))}
                disabled={disabled}
                disableSearch={true}
                hideClearButton={true}
                style={{ width: '130px', minWidth: '130px' }}
              />
            </div>

            {/* Remove button */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeNotification(index)}
              disabled={disabled}
              className="shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )
      })}

      {/* Add another notification */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addNotification}
        disabled={disabled}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add notification
      </Button>
    </div>
  )
}
