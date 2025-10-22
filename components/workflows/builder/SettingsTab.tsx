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
import { Save, Mail, MessageSquare, Bell, Phone, Info, ChevronDown, ChevronUp } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

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
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
  const [slackChannels, setSlackChannels] = useState<Array<{ id: string; name: string }>>([])
  const [discordChannels, setDiscordChannels] = useState<Array<{ id: string; name: string }>>([])
  const [isSlackConnected, setIsSlackConnected] = useState(false)
  const [isDiscordConnected, setIsDiscordConnected] = useState(false)
  const [loadingSlackChannels, setLoadingSlackChannels] = useState(false)
  const [loadingDiscordChannels, setLoadingDiscordChannels] = useState(false)
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
    timeout_seconds: undefined,
    concurrent_execution_limit: undefined,
    ...initialSettings,
  })

  useEffect(() => {
    fetchSettings()
    checkIntegrations()
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

  const checkIntegrations = async () => {
    try {
      const response = await fetch('/api/integrations')
      const data = await response.json()

      if (data.integrations) {
        const slack = data.integrations.find((i: any) => i.provider === 'slack' && i.status === 'connected')
        const discord = data.integrations.find((i: any) => i.provider === 'discord' && i.status === 'connected')

        setIsSlackConnected(!!slack)
        setIsDiscordConnected(!!discord)

        if (slack) {
          fetchSlackChannels()
        }
        if (discord) {
          fetchDiscordChannels()
        }
      }
    } catch (error) {
      console.error('Failed to check integrations:', error)
    }
  }

  const fetchSlackChannels = async () => {
    setLoadingSlackChannels(true)
    try {
      const response = await fetch('/api/integrations/slack/data?type=slack_channels')
      const data = await response.json()

      if (data.options) {
        setSlackChannels(data.options.map((ch: any) => ({ id: ch.value, name: ch.label })))
      }
    } catch (error) {
      console.error('Failed to fetch Slack channels:', error)
    } finally {
      setLoadingSlackChannels(false)
    }
  }

  const fetchDiscordChannels = async () => {
    setLoadingDiscordChannels(true)
    try {
      // First get the guild ID from integrations
      const intResponse = await fetch('/api/integrations')
      const intData = await intResponse.json()
      const discordInt = intData.integrations?.find((i: any) => i.provider === 'discord')

      if (discordInt?.credentials?.guild_id) {
        const response = await fetch(`/api/integrations/discord/data?type=discord_channels&guildId=${discordInt.credentials.guild_id}`)
        const data = await response.json()

        if (data.options) {
          setDiscordChannels(data.options.map((ch: any) => ({ id: ch.value, name: ch.label })))
        }
      }
    } catch (error) {
      console.error('Failed to fetch Discord channels:', error)
    } finally {
      setLoadingDiscordChannels(false)
    }
  }

  const handleConnectIntegration = (provider: string) => {
    // Open integration connection in new window and refresh on complete
    const width = 600
    const height = 700
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2

    const popup = window.open(
      `/apps?connect=${provider}`,
      '_blank',
      `width=${width},height=${height},left=${left},top=${top}`
    )

    // Poll for popup close
    const checkPopup = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkPopup)
        // Refresh integrations after OAuth complete
        setTimeout(() => {
          checkIntegrations()
        }, 1000)
      }
    }, 500)
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

  const updateSetting = async <K extends keyof WorkflowSettings>(
    key: K,
    value: WorkflowSettings[K]
  ) => {
    const newSettings = { ...settings, [key]: value }
    setSettings(newSettings)

    // Auto-save
    await saveSettings(newSettings)
  }

  const updateNotificationChannel = async (
    channel: keyof WorkflowSettings['error_notification_channels'],
    value: string
  ) => {
    const newSettings = {
      ...settings,
      error_notification_channels: {
        ...settings.error_notification_channels,
        [channel]: value,
      },
    }
    setSettings(newSettings)

    // Auto-save
    await saveSettings(newSettings)
  }

  const saveSettings = async (settingsToSave: WorkflowSettings) => {
    try {
      // Remove name and description from settings since we're not managing them here anymore
      const { name, description, ...settingsOnly } = settingsToSave

      const response = await fetch(`/api/workflows/${workflowId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsOnly),
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to save settings')
      }
    } catch (error: any) {
      console.error('Failed to auto-save settings:', error)
    }
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
    <TooltipProvider>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="border-b bg-background p-4">
          <div>
            <h2 className="text-lg font-semibold">Workflow Settings</h2>
            <p className="text-sm text-muted-foreground">
              Configure error handling, notifications, and advanced options. All changes are saved automatically.
            </p>
          </div>
        </div>

        {/* Settings Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">

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
                <div className="flex items-center gap-2">
                  <Label htmlFor="error-notifications">Error Notifications</Label>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-4 h-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>When enabled, you'll receive instant alerts via your chosen channels (email, Slack, Discord, or SMS) whenever this workflow encounters an error or fails to complete.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
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
                      disabled={!isSlackConnected}
                    />
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                    <Label>Slack</Label>
                  </div>
                  {!isSlackConnected && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleConnectIntegration('slack')}
                      className="ml-6"
                    >
                      Connect Slack
                    </Button>
                  )}
                  {isSlackConnected && settings.error_notification_slack && (
                    <Select
                      value={settings.error_notification_channels.slack_channel || ''}
                      onValueChange={(value) => updateNotificationChannel('slack_channel', value)}
                      disabled={loadingSlackChannels}
                    >
                      <SelectTrigger className="ml-6">
                        <SelectValue placeholder={loadingSlackChannels ? "Loading channels..." : "Select channel"} />
                      </SelectTrigger>
                      <SelectContent>
                        {slackChannels.map(channel => (
                          <SelectItem key={channel.id} value={channel.id}>
                            #{channel.name}
                          </SelectItem>
                        ))}
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
                      disabled={!isDiscordConnected}
                    />
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                    <Label>Discord</Label>
                  </div>
                  {!isDiscordConnected && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleConnectIntegration('discord')}
                      className="ml-6"
                    >
                      Connect Discord
                    </Button>
                  )}
                  {isDiscordConnected && settings.error_notification_discord && (
                    <Select
                      value={settings.error_notification_channels.discord_channel || ''}
                      onValueChange={(value) => updateNotificationChannel('discord_channel', value)}
                      disabled={loadingDiscordChannels}
                    >
                      <SelectTrigger className="ml-6">
                        <SelectValue placeholder={loadingDiscordChannels ? "Loading channels..." : "Select channel"} />
                      </SelectTrigger>
                      <SelectContent>
                        {discordChannels.map(channel => (
                          <SelectItem key={channel.id} value={channel.id}>
                            #{channel.name}
                          </SelectItem>
                        ))}
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
        <Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
          <CollapsibleTrigger className="flex items-center justify-between w-full p-4 border rounded-lg hover:bg-accent/50 transition-colors">
            <div className="text-left">
              <h3 className="text-lg font-semibold mb-1">Advanced</h3>
              <p className="text-sm text-muted-foreground">
                Performance and execution settings
              </p>
            </div>
            {isAdvancedOpen ? (
              <ChevronUp className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            )}
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-4 space-y-4 pl-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="timeout">Execution Timeout (seconds)</Label>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="w-4 h-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>Sets a maximum time limit for your workflow to complete. If the workflow runs longer than this, it will be automatically stopped. Leave empty to allow workflows to run indefinitely (useful for long-running processes).</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                id="timeout"
                type="number"
                value={settings.timeout_seconds || ''}
                onChange={(e) => updateSetting('timeout_seconds', parseInt(e.target.value) || undefined)}
                placeholder="No timeout"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty for no timeout
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="concurrent-limit">Concurrent Execution Limit</Label>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="w-4 h-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>Limits how many instances of this workflow can run at the same time. This is useful for workflows that access rate-limited APIs or need to prevent resource overload. Leave empty to allow unlimited concurrent executions.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                id="concurrent-limit"
                type="number"
                value={settings.concurrent_execution_limit || ''}
                onChange={(e) => updateSetting('concurrent_execution_limit', parseInt(e.target.value) || undefined)}
                placeholder="Unlimited"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty for unlimited
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
    </TooltipProvider>
  )
}
