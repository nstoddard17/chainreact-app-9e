"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/hooks/use-toast"
import { Save, Mail, MessageSquare, Bell, Phone, Info } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface WorkflowSettings {
  name: string
  description: string
  error_notifications_enabled: boolean
  error_notification_email: boolean
  error_notification_slack: boolean
  error_notification_discord: boolean
  error_notification_sms: boolean
  error_notification_channels: {
    email?: string
    slack_channel?: string
    discord_channel?: string
    sms_phone?: string
  }
  auto_retry_enabled: boolean
  max_retries: number
  retry_strategy: 'exponential' | 'linear' | 'immediate'
  timeout_seconds?: number
  concurrent_execution_limit?: number
}

interface SettingsTabProps {
  workflowId: string
  initialSettings?: Partial<WorkflowSettings>
}

export function SettingsTab({ workflowId, initialSettings }: SettingsTabProps) {
  const { toast } = useToast()
  const [isSaving, setIsSaving] = useState(false)
  const [settings, setSettings] = useState<WorkflowSettings>({
    name: '',
    description: '',
    error_notifications_enabled: false,
    error_notification_email: false,
    error_notification_slack: false,
    error_notification_discord: false,
    error_notification_sms: false,
    error_notification_channels: {},
    auto_retry_enabled: false,
    max_retries: 3,
    retry_strategy: 'exponential',
    timeout_seconds: 300,
    concurrent_execution_limit: undefined,
    ...initialSettings,
  })

  useEffect(() => {
    fetchSettings()
  }, [workflowId])

  const fetchSettings = async () => {
    try {
      const response = await fetch(`/api/workflows/${workflowId}/settings`)
      const data = await response.json()
      if (data.success) {
        setSettings(prev => ({ ...prev, ...data.settings }))
      }
    } catch (error) {
      console.error('Failed to fetch workflow settings:', error)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const response = await fetch(`/api/workflows/${workflowId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Settings Saved",
          description: "Workflow settings have been updated successfully.",
        })
      } else {
        throw new Error(data.error || 'Failed to save settings')
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save workflow settings",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const updateSetting = <K extends keyof WorkflowSettings>(
    key: K,
    value: WorkflowSettings[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  const updateNotificationChannel = (
    channel: keyof WorkflowSettings['error_notification_channels'],
    value: string
  ) => {
    setSettings(prev => ({
      ...prev,
      error_notification_channels: {
        ...prev.error_notification_channels,
        [channel]: value,
      },
    }))
  }

  const getRetryDelays = () => {
    const delays = []
    for (let i = 1; i <= settings.max_retries; i++) {
      if (settings.retry_strategy === 'exponential') {
        delays.push(`${Math.pow(2, i)}s`)
      } else if (settings.retry_strategy === 'linear') {
        delays.push(`${i * 2}s`)
      } else {
        delays.push('immediate')
      }
    }
    return delays.join(', ')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b bg-background p-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Workflow Settings</h2>
          <p className="text-sm text-muted-foreground">
            Configure error handling, notifications, and advanced options
          </p>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <div className="w-4 h-4 border-2 border-background border-t-foreground rounded-full animate-spin mr-2" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>

      {/* Settings Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* General Settings */}
        <section className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold mb-1">General</h3>
            <p className="text-sm text-muted-foreground">Basic workflow information</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Workflow Name</Label>
              <Input
                id="name"
                value={settings.name}
                onChange={(e) => updateSetting('name', e.target.value)}
                placeholder="My Workflow"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={settings.description}
                onChange={(e) => updateSetting('description', e.target.value)}
                placeholder="What does this workflow do?"
                rows={3}
              />
            </div>
          </div>
        </section>

        <Separator />

        {/* Error Handling */}
        <section className="space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-1">Error Handling</h3>
              <p className="text-sm text-muted-foreground">
                Configure how errors are handled and reported
              </p>
            </div>
          </div>

          {/* Error Notifications */}
          <div className="space-y-4 p-4 border rounded-lg">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="error-notifications">Error Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Get notified when this workflow fails
                </p>
              </div>
              <Switch
                id="error-notifications"
                checked={settings.error_notifications_enabled}
                onCheckedChange={(checked) => updateSetting('error_notifications_enabled', checked)}
              />
            </div>

            {settings.error_notifications_enabled && (
              <div className="space-y-4 pl-4 border-l-2">
                {/* Email Notifications */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={settings.error_notification_email}
                      onCheckedChange={(checked) => updateSetting('error_notification_email', checked)}
                    />
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <Label>Email</Label>
                  </div>
                  {settings.error_notification_email && (
                    <Input
                      type="email"
                      placeholder="user@example.com"
                      value={settings.error_notification_channels.email || ''}
                      onChange={(e) => updateNotificationChannel('email', e.target.value)}
                      className="ml-6"
                    />
                  )}
                </div>

                {/* Slack Notifications */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={settings.error_notification_slack}
                      onCheckedChange={(checked) => updateSetting('error_notification_slack', checked)}
                    />
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                    <Label>Slack</Label>
                  </div>
                  {settings.error_notification_slack && (
                    <Select
                      value={settings.error_notification_channels.slack_channel || ''}
                      onValueChange={(value) => updateNotificationChannel('slack_channel', value)}
                    >
                      <SelectTrigger className="ml-6">
                        <SelectValue placeholder="Select channel" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="#alerts">#alerts</SelectItem>
                        <SelectItem value="#notifications">#notifications</SelectItem>
                        <SelectItem value="#errors">#errors</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Discord Notifications */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={settings.error_notification_discord}
                      onCheckedChange={(checked) => updateSetting('error_notification_discord', checked)}
                    />
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                    <Label>Discord</Label>
                  </div>
                  {settings.error_notification_discord && (
                    <Select
                      value={settings.error_notification_channels.discord_channel || ''}
                      onValueChange={(value) => updateNotificationChannel('discord_channel', value)}
                    >
                      <SelectTrigger className="ml-6">
                        <SelectValue placeholder="Select channel" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="alerts">alerts</SelectItem>
                        <SelectItem value="notifications">notifications</SelectItem>
                        <SelectItem value="errors">errors</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* SMS Notifications */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={settings.error_notification_sms}
                      onCheckedChange={(checked) => updateSetting('error_notification_sms', checked)}
                    />
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <Label>SMS</Label>
                  </div>
                  {settings.error_notification_sms && (
                    <Input
                      type="tel"
                      placeholder="+1 (555) 123-4567"
                      value={settings.error_notification_channels.sms_phone || ''}
                      onChange={(e) => updateNotificationChannel('sms_phone', e.target.value)}
                      className="ml-6"
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Auto-Retry */}
          <div className="space-y-4 p-4 border rounded-lg">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Label htmlFor="auto-retry">Automatic Retries</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-4 h-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>If a step fails, ChainReact will automatically retry it with increasing delays to give external services time to recover.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="text-sm text-muted-foreground">
                  Retry failed steps automatically
                </p>
              </div>
              <Switch
                id="auto-retry"
                checked={settings.auto_retry_enabled}
                onCheckedChange={(checked) => updateSetting('auto_retry_enabled', checked)}
              />
            </div>

            {settings.auto_retry_enabled && (
              <div className="space-y-4 pl-4 border-l-2">
                <div className="space-y-2">
                  <Label htmlFor="max-retries">Maximum Retries</Label>
                  <Select
                    value={String(settings.max_retries)}
                    onValueChange={(value) => updateSetting('max_retries', parseInt(value))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 retry</SelectItem>
                      <SelectItem value="2">2 retries</SelectItem>
                      <SelectItem value="3">3 retries</SelectItem>
                      <SelectItem value="5">5 retries</SelectItem>
                      <SelectItem value="10">10 retries</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="retry-strategy">Retry Strategy</Label>
                  <Select
                    value={settings.retry_strategy}
                    onValueChange={(value: any) => updateSetting('retry_strategy', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="exponential">Exponential Backoff</SelectItem>
                      <SelectItem value="linear">Linear Backoff</SelectItem>
                      <SelectItem value="immediate">Immediate</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {settings.retry_strategy === 'exponential' && (
                      <>Delays: {getRetryDelays()} (recommended)</>
                    )}
                    {settings.retry_strategy === 'linear' && (
                      <>Delays: {getRetryDelays()}</>
                    )}
                    {settings.retry_strategy === 'immediate' && (
                      <>Retries immediately without delay</>
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        <Separator />

        {/* Advanced Settings */}
        <section className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold mb-1">Advanced</h3>
            <p className="text-sm text-muted-foreground">
              Performance and execution settings
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="timeout">Execution Timeout (seconds)</Label>
              <Input
                id="timeout"
                type="number"
                value={settings.timeout_seconds || ''}
                onChange={(e) => updateSetting('timeout_seconds', parseInt(e.target.value) || undefined)}
                placeholder="300"
              />
              <p className="text-xs text-muted-foreground">
                Maximum time allowed for workflow execution. Leave empty for no timeout.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="concurrent-limit">Concurrent Execution Limit</Label>
              <Input
                id="concurrent-limit"
                type="number"
                value={settings.concurrent_execution_limit || ''}
                onChange={(e) => updateSetting('concurrent_execution_limit', parseInt(e.target.value) || undefined)}
                placeholder="Unlimited"
              />
              <p className="text-xs text-muted-foreground">
                Maximum number of concurrent executions. Leave empty for unlimited.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
