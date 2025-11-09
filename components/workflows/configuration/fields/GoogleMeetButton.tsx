"use client"

import React, { useState } from 'react'
import { Video, Copy, Settings, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface GoogleMeetData {
  link: string
  id: string
}

interface GoogleMeetButtonProps {
  value?: GoogleMeetData | null
  onChange: (value: GoogleMeetData | null) => void
  className?: string
  disabled?: boolean
}

// Generate a random Google Meet ID
function generateMeetId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz'
  const part1 = Array(3).fill(0).map(() => chars[Math.floor(Math.random() * chars.length)]).join('')
  const part2 = Array(4).fill(0).map(() => chars[Math.floor(Math.random() * chars.length)]).join('')
  const part3 = Array(3).fill(0).map(() => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `${part1}-${part2}-${part3}`
}

export function GoogleMeetButton({
  value,
  onChange,
  className,
  disabled = false
}: GoogleMeetButtonProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)

  const createMeet = () => {
    const meetId = generateMeetId()
    const link = `https://meet.google.com/${meetId}`
    onChange({ link, id: meetId })
  }

  const removeMeet = () => {
    onChange(null)
  }

  const copyMeetInfo = () => {
    if (!value) return

    const info = `Google Meet joining info\nVideo call link: ${value.link}`
    navigator.clipboard.writeText(info)
    // TODO: Show toast notification
  }

  if (!value) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={createMeet}
        disabled={disabled}
        className={cn("w-full justify-start", className)}
      >
        <Video className="h-4 w-4 mr-2" />
        Add Google Meet video conferencing
      </Button>
    )
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2 p-3 border rounded-md bg-muted/50">
        <Video className="h-5 w-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Join with Google Meet</p>
          <a
            href={value.link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline truncate block"
          >
            {value.link}
          </a>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={copyMeetInfo}
            disabled={disabled}
            title="Copy meeting info"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setSettingsOpen(!settingsOpen)}
            disabled={disabled}
            title="Meeting settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={removeMeet}
            disabled={disabled}
            title="Remove Google Meet"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* TODO: Add settings modal */}
      {settingsOpen && (
        <div className="p-3 border rounded-md space-y-2">
          <p className="text-sm font-medium">Meeting settings</p>
          <p className="text-xs text-muted-foreground">
            Settings modal coming soon
          </p>
        </div>
      )}
    </div>
  )
}
