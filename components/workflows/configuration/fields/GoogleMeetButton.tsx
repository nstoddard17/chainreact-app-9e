"use client"

import React, { useState } from 'react'
import { Video, Copy, Settings, X, Check, Loader2 } from 'lucide-react'
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
import { Combobox } from '@/components/ui/combobox'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useAuthStore } from '@/stores/authStore'

interface GoogleMeetSettings {
  accessType?: 'open' | 'trusted' | 'restricted'
  allowJoinBeforeHost?: boolean
  muteOnEntry?: boolean
  enableRecording?: boolean
}

interface GoogleMeetData {
  link: string
  id: string
  eventId?: string // Google Calendar event ID for the placeholder event
  settings?: GoogleMeetSettings
}

interface GoogleMeetButtonProps {
  value?: GoogleMeetData | null
  onChange: (value: GoogleMeetData | null) => void
  className?: string
  disabled?: boolean
}

const accessTypeOptions = [
  {
    value: 'open',
    label: 'Open',
    description: 'Anyone with the link can join'
  },
  {
    value: 'trusted',
    label: 'Trusted',
    description: 'Only people in your organization'
  },
  {
    value: 'restricted',
    label: 'Restricted',
    description: 'Only invited people can join'
  }
]

export function GoogleMeetButton({
  value,
  onChange,
  className,
  disabled = false
}: GoogleMeetButtonProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [settings, setSettings] = useState<GoogleMeetSettings>(value?.settings || {
    accessType: 'open',
    allowJoinBeforeHost: true,
    muteOnEntry: false,
    enableRecording: false
  })
  const { toast } = useToast()
  const user = useAuthStore((state) => state.user)

  const createMeet = async () => {
    if (!user?.id) {
      toast({
        title: "Error",
        description: "You must be logged in to create a Google Meet link.",
        variant: "destructive"
      })
      return
    }

    setIsCreating(true)

    try {
      // Call API to create a real Google Meet via Google Calendar
      const response = await fetch('/api/google-meet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          settings: {
            accessType: 'open',
            allowJoinBeforeHost: true,
            muteOnEntry: false,
            enableRecording: false
          }
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create Google Meet link')
      }

      // Update the field value with the real Meet link
      onChange(data.data)
    } catch (error: any) {
      console.error('Error creating Google Meet:', error)
      toast({
        title: "Error creating Google Meet",
        description: error.message || "Failed to create Google Meet link. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsCreating(false)
    }
  }

  const removeMeet = async () => {
    if (!user?.id || !value?.eventId) {
      // If no eventId, just remove locally
      onChange(null)
      toast({
        title: "Google Meet removed",
        description: "The video conference has been removed from this event.",
      })
      return
    }

    setIsDeleting(true)

    try {
      // Call API to delete the temporary Google Calendar event
      const response = await fetch('/api/google-meet', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          eventId: value.eventId
        })
      })

      const data = await response.json()

      if (!response.ok && response.status !== 404) {
        throw new Error(data.error || 'Failed to delete Google Meet link')
      }

      // Remove from local state
      onChange(null)

      toast({
        title: "Google Meet removed",
        description: "The video conference has been deleted from Google Calendar.",
      })
    } catch (error: any) {
      console.error('Error deleting Google Meet:', error)

      // Still remove from local state even if deletion failed
      onChange(null)

      toast({
        title: "Google Meet removed",
        description: "Removed locally. The temporary event may still exist in Google Calendar.",
        variant: "destructive"
      })
    } finally {
      setIsDeleting(false)
    }
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

  // Get display label for current access type
  const currentAccessType = accessTypeOptions.find(opt => opt.value === (settings.accessType || 'open'))

  if (!value) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={createMeet}
        disabled={disabled || isCreating}
        className={cn("w-full justify-start", className)}
      >
        {isCreating ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Creating Google Meet...
          </>
        ) : (
          <>
            <Video className="h-4 w-4 mr-2" />
            Add Google Meet video conferencing
          </>
        )}
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
              Active Google Meet link ready to use
            </p>
          </div>
          <div className="flex items-center gap-1">
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
              onClick={removeMeet}
              disabled={disabled || isDeleting}
              title="Remove Google Meet"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <X className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-[500px] bg-white dark:bg-white border-gray-200">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Google Meet Settings</DialogTitle>
            <DialogDescription className="text-gray-600">
              Configure settings for this Google Meet video conference
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Access Type */}
            <div className="space-y-2">
              <Label htmlFor="access-type" className="text-gray-900">Meeting Access</Label>
              <Combobox
                value={settings.accessType || 'open'}
                onChange={(val) => updateSetting('accessType', val as GoogleMeetSettings['accessType'])}
                options={accessTypeOptions.map(opt => ({
                  value: opt.value,
                  label: opt.label
                }))}
                placeholder="Select access type"
                searchPlaceholder="Search access types..."
                emptyPlaceholder="No access types found"
                disableSearch={true}
                hideClearButton={true}
              />
              <p className="text-xs text-gray-600">
                {currentAccessType?.description || 'Control who can access this meeting'}
              </p>
            </div>

            {/* Join Before Host */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5 flex-1">
                <Label htmlFor="join-before-host" className="text-gray-900">Allow joining before host</Label>
                <p className="text-xs text-gray-600">
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
                <Label htmlFor="mute-on-entry" className="text-gray-900">Mute participants on entry</Label>
                <p className="text-xs text-gray-600">
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
                <Label htmlFor="enable-recording" className="text-gray-900">Enable recording</Label>
                <p className="text-xs text-gray-600">
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
            <div className="space-y-2 p-3 bg-gray-50 rounded-md">
              <Label className="text-xs font-medium text-gray-600">Meeting Link</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={value.link}
                  readOnly
                  className="text-sm bg-white border-gray-300 text-gray-900"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copyMeetInfo}
                  className="border-gray-300 text-gray-700 hover:bg-gray-100"
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <p className="text-xs text-green-600">
                ✓ This is a live, active Google Meet link
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSettingsOpen(false)}
              className="border-gray-300 text-gray-700 hover:bg-gray-100"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={saveSettings}
              className="bg-blue-600 hover:bg-blue-700 text-white"
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
