'use client'

import { useState, useEffect, useRef } from 'react'
import { Bell, Mail, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { logger } from '@/lib/utils/logger'

interface NotificationSettingsProps {
  workflowId: string
  userEmail?: string
}

interface WorkflowNotificationSettings {
  error_notifications_enabled: boolean
  error_notification_email: boolean
  error_notification_channels: {
    email?: string
  }
}

const defaultSettings: WorkflowNotificationSettings = {
  error_notifications_enabled: false,
  error_notification_email: false,
  error_notification_channels: {},
}

export function NotificationSettings({ workflowId, userEmail }: NotificationSettingsProps) {
  const [settings, setSettings] = useState<WorkflowNotificationSettings>(defaultSettings)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const hasFetchedRef = useRef(false)

  useEffect(() => {
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true
      fetchSettings()
    }
  }, [workflowId])

  const fetchSettings = async () => {
    try {
      const response = await fetch(`/api/workflows/${workflowId}/settings`)
      if (!response.ok) throw new Error('Failed to fetch settings')

      const { settings: data } = await response.json()
      setSettings({
        error_notifications_enabled: data.error_notifications_enabled ?? false,
        error_notification_email: data.error_notification_email ?? false,
        error_notification_channels: data.error_notification_channels ?? {},
      })
    } catch (error) {
      logger.error('Error fetching notification settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async () => {
    setSaving(true)
    try {
      const response = await fetch(`/api/workflows/${workflowId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })

      if (!response.ok) throw new Error('Failed to save settings')

      toast.success('Notification settings saved')
    } catch (error) {
      logger.error('Error saving notification settings:', error)
      toast.error('Failed to save notification settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const emailValue = settings.error_notification_channels?.email || userEmail || ''

  return (
    <Card>
      <CardContent className="pt-6 space-y-6">
        <div>
          <h3 className="text-sm font-semibold mb-1">Error Notifications</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Get notified when this workflow fails during execution
          </p>
        </div>

        {/* Enable toggle */}
        <div className="flex items-center justify-between py-4 px-5 rounded-xl border-2 bg-card hover:border-primary/50 transition-all duration-200">
          <div className="flex items-start gap-4 flex-1">
            <div className="mt-1 p-2.5 rounded-lg bg-primary/10">
              <Bell className="w-4 h-4 text-primary" />
            </div>
            <div className="space-y-1 flex-1">
              <Label className="text-sm font-semibold cursor-pointer">
                Enable Error Notifications
              </Label>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Receive alerts when workflow executions fail
              </p>
            </div>
          </div>
          <Switch
            checked={settings.error_notifications_enabled}
            onCheckedChange={(checked) =>
              setSettings((prev) => ({
                ...prev,
                error_notifications_enabled: checked,
                error_notification_email: checked ? prev.error_notification_email : false,
              }))
            }
            className="data-[state=checked]:bg-primary"
          />
        </div>

        {/* Email settings (shown when notifications enabled) */}
        {settings.error_notifications_enabled && (
          <div className="space-y-4 pl-2">
            <div className="flex items-center justify-between py-4 px-5 rounded-xl border-2 bg-card hover:border-primary/50 transition-all duration-200">
              <div className="flex items-start gap-4 flex-1">
                <div className="mt-1 p-2.5 rounded-lg bg-blue-500/10">
                  <Mail className="w-4 h-4 text-blue-500" />
                </div>
                <div className="space-y-1 flex-1">
                  <Label className="text-sm font-semibold cursor-pointer">
                    Email Notifications
                  </Label>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Send error details to an email address
                  </p>
                </div>
              </div>
              <Switch
                checked={settings.error_notification_email}
                onCheckedChange={(checked) =>
                  setSettings((prev) => ({ ...prev, error_notification_email: checked }))
                }
                className="data-[state=checked]:bg-blue-500"
              />
            </div>

            {settings.error_notification_email && (
              <div className="px-5">
                <Label htmlFor="notification-email" className="text-xs font-medium text-muted-foreground">
                  Email Address
                </Label>
                <Input
                  id="notification-email"
                  type="email"
                  placeholder={userEmail || 'your@email.com'}
                  value={emailValue}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      error_notification_channels: {
                        ...prev.error_notification_channels,
                        email: e.target.value,
                      },
                    }))
                  }
                  className="mt-1.5"
                />
              </div>
            )}
          </div>
        )}

        {/* Save button */}
        <div className="flex justify-end pt-4 border-t">
          <Button onClick={saveSettings} disabled={saving} size="sm">
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Notifications'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
