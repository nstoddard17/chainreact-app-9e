"use client"

import React, { useState } from 'react'
import { Video, Copy, Settings, X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

interface GoogleMeetSettings {
  accessType?: 'open' | 'trusted' | 'restricted'
  allowJoinBeforeHost?: boolean
  muteOnEntry?: boolean
  enableRecording?: boolean
}

interface GoogleMeetData {
  link: string
  id: string
  settings?: GoogleMeetSettings
}

interface GoogleMeetButtonProps {
  value?: GoogleMeetData | null
  onChange: (value: GoogleMeetData | null) => void
  className?: string
  disabled?: boolean
}

// Generate a placeholder Google Meet ID
// The actual Meet link will be created when the event is created via the Calendar API
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
  const [settings, setSettings] = useState<GoogleMeetSettings>(value?.settings || {
    accessType: 'open',
    allowJoinBeforeHost: true,
    muteOnEntry: false,
    enableRecording: false
  })
  const { toast } = useToast()

  const createMeet = () => {
    const meetId = generateMeetId()
    const link = `https://meet.google.com/${meetId}`
    onChange({
      link,
      id: meetId,
      settings: {
        accessType: 'open',
        allowJoinBeforeHost: true,
        muteOnEntry: false,
        enableRecording: false
      }
    })
    toast({
      title: "Google Meet added",
      description: "A Google Meet link will be created when the event is created.",
    })
  }

  const removeMeet = () => {
    onChange(null)
    toast({
      title: "Google Meet removed",
      description: "The video conference has been removed from this event.",
    })
  }

  const copyMeetInfo = () => {
    if (!value) return

    const info = `Google Meet joining info\nVideo call link: ${value.link}`
    navigator.clipboard.writeText(info)
    toast({
      title: "Copied to clipboard",
      description: "Meeting info has been copied to your clipboard.",
    })
  }

  const saveSettings = () => {
    if (!value) return

    onChange({
      ...value,
      settings
    })
    setSettingsOpen(false)
    toast({
      title: "Settings saved",
      description: "Google Meet settings have been updated.",
    })
  }

  const updateSetting = <K extends keyof GoogleMeetSettings>(
    key: K,
    val: GoogleMeetSettings[K]
  ) => {
    setSettings(prev => ({
      ...prev,
      [key]: val
    }))
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
    <>
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
            <p className="text-xs text-muted-foreground mt-0.5">
              Link will be generated when event is created
            </p>
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
              onClick={() => {
                setSettings(value.settings || {
                  accessType: 'open',
                  allowJoinBeforeHost: true,
                  muteOnEntry: false,
                  enableRecording: false
                })
                setSettingsOpen(true)
              }}
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
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Google Meet Settings</DialogTitle>
            <DialogDescription>
              Configure settings for this Google Meet video conference
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Access Type */}
            <div className="space-y-2">
              <Label htmlFor="access-type">Meeting Access</Label>
              <Select
                value={settings.accessType || 'open'}
                onValueChange={(val) => updateSetting('accessType', val as GoogleMeetSettings['accessType'])}
              >
                <SelectTrigger id="access-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">
                    <div className="flex flex-col items-start">
                      <span className="font-medium">Open</span>
                      <span className="text-xs text-muted-foreground">Anyone with the link can join</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="trusted">
                    <div className="flex flex-col items-start">
                      <span className="font-medium">Trusted</span>
                      <span className="text-xs text-muted-foreground">Only people in your organization</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="restricted">
                    <div className="flex flex-col items-start">
                      <span className="font-medium">Restricted</span>
                      <span className="text-xs text-muted-foreground">Only invited people can join</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Control who can access this meeting
              </p>
            </div>

            {/* Join Before Host */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5 flex-1">
                <Label htmlFor="join-before-host">Allow joining before host</Label>
                <p className="text-xs text-muted-foreground">
                  Participants can join the meeting before the host arrives
                </p>
              </div>
              <Switch
                id="join-before-host"
                checked={settings.allowJoinBeforeHost ?? true}
                onCheckedChange={(checked) => updateSetting('allowJoinBeforeHost', checked)}
              />
            </div>

            {/* Mute on Entry */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5 flex-1">
                <Label htmlFor="mute-on-entry">Mute participants on entry</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically mute participants when they join
                </p>
              </div>
              <Switch
                id="mute-on-entry"
                checked={settings.muteOnEntry ?? false}
                onCheckedChange={(checked) => updateSetting('muteOnEntry', checked)}
              />
            </div>

            {/* Enable Recording */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5 flex-1">
                <Label htmlFor="enable-recording">Enable recording</Label>
                <p className="text-xs text-muted-foreground">
                  Allow the meeting to be recorded (requires workspace recording permissions)
                </p>
              </div>
              <Switch
                id="enable-recording"
                checked={settings.enableRecording ?? false}
                onCheckedChange={(checked) => updateSetting('enableRecording', checked)}
              />
            </div>

            {/* Meeting Link Preview */}
            <div className="space-y-2 p-3 bg-muted rounded-md">
              <Label className="text-xs font-medium text-muted-foreground">Meeting Link</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={value.link}
                  readOnly
                  className="text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copyMeetInfo}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                This link will be finalized when the event is created
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSettingsOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={saveSettings}
            >
              <Check className="h-4 w-4 mr-2" />
              Save Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
