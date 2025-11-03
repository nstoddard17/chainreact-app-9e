"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Webhook, Save, TestTube, AlertCircle, CheckCircle2, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { logger } from "@/lib/utils/logger"

interface WebhookSetting {
  id: string
  setting_key: string
  webhook_url: string
  webhook_type: 'discord' | 'slack' | 'custom'
  enabled: boolean
  description: string
  metadata: any
  created_at: string
  updated_at: string
}

export default function WebhookSettings() {
  const { toast } = useToast()
  const [settings, setSettings] = useState<WebhookSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)

  // Fetch webhook settings
  const fetchSettings = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/webhook-settings')
      if (!response.ok) throw new Error('Failed to fetch webhook settings')

      const data = await response.json()
      setSettings(data.settings || [])
    } catch (error: any) {
      logger.error('Failed to fetch webhook settings:', error)
      toast({
        title: "Error",
        description: "Failed to load webhook settings",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSettings()
  }, [])

  // Update webhook setting
  const handleSave = async (setting: WebhookSetting) => {
    try {
      setSaving(setting.id)

      const response = await fetch('/api/admin/webhook-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: setting.id,
          webhook_url: setting.webhook_url,
          webhook_type: setting.webhook_type,
          enabled: setting.enabled,
          description: setting.description,
          metadata: setting.metadata
        })
      })

      if (!response.ok) throw new Error('Failed to update webhook setting')

      toast({
        title: "Success",
        description: "Webhook settings updated successfully",
      })

      await fetchSettings()
    } catch (error: any) {
      logger.error('Failed to save webhook setting:', error)
      toast({
        title: "Error",
        description: "Failed to save webhook settings",
        variant: "destructive"
      })
    } finally {
      setSaving(null)
    }
  }

  // Test webhook
  const handleTest = async (setting: WebhookSetting) => {
    try {
      setTesting(setting.id)

      // Prepare test payload based on webhook type
      let payload
      if (setting.webhook_type === 'discord') {
        payload = {
          embeds: [{
            title: '🧪 Test Webhook',
            description: 'This is a test notification from ChainReact Admin Panel',
            color: 0x36a64f,
            fields: [
              { name: 'Setting Key', value: setting.setting_key, inline: true },
              { name: 'Webhook Type', value: setting.webhook_type, inline: true },
              { name: 'Status', value: setting.enabled ? '✅ Enabled' : '❌ Disabled', inline: true }
            ],
            footer: { text: 'ChainReact Webhook Test' },
            timestamp: new Date().toISOString()
          }]
        }
      } else if (setting.webhook_type === 'slack') {
        payload = {
          text: '🧪 *Test Webhook*',
          attachments: [{
            color: '#36a64f',
            title: 'This is a test notification from ChainReact Admin Panel',
            fields: [
              { title: 'Setting Key', value: setting.setting_key, short: true },
              { title: 'Webhook Type', value: setting.webhook_type, short: true },
              { title: 'Status', value: setting.enabled ? '✅ Enabled' : '❌ Disabled', short: true }
            ],
            footer: 'ChainReact Webhook Test',
            ts: Math.floor(Date.now() / 1000)
          }]
        }
      } else {
        // Custom webhook - send generic JSON
        payload = {
          test: true,
          setting_key: setting.setting_key,
          webhook_type: setting.webhook_type,
          enabled: setting.enabled,
          timestamp: new Date().toISOString()
        }
      }

      const response = await fetch(setting.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}: ${response.statusText}`)
      }

      toast({
        title: "Test Successful",
        description: "Test notification sent successfully! Check your channel.",
      })
    } catch (error: any) {
      logger.error('Failed to test webhook:', error)
      toast({
        title: "Test Failed",
        description: error.message || "Failed to send test notification",
        variant: "destructive"
      })
    } finally {
      setTesting(null)
    }
  }

  // Update setting field
  const updateSetting = (id: string, field: keyof WebhookSetting, value: any) => {
    setSettings(prev =>
      prev.map(s => s.id === id ? { ...s, [field]: value } : s)
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-200/20 rounded-2xl p-6">
        <div className="flex items-center space-x-3">
          <Webhook className="w-6 h-6 text-blue-500" />
          <div>
            <h2 className="text-xl font-bold">Webhook Settings</h2>
            <p className="text-sm text-muted-foreground">
              Configure webhooks for system notifications (error reports, etc.)
            </p>
          </div>
        </div>
      </div>

      {settings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No webhook settings configured</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {settings.map((setting) => (
            <Card key={setting.id} className="border-border">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Webhook className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <CardTitle className="text-lg">{setting.description || setting.setting_key}</CardTitle>
                      <CardDescription className="mt-1">
                        Key: <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{setting.setting_key}</code>
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`enabled-${setting.id}`} className="text-sm text-muted-foreground">
                      {setting.enabled ? 'Enabled' : 'Disabled'}
                    </Label>
                    <Switch
                      id={`enabled-${setting.id}`}
                      checked={setting.enabled}
                      onCheckedChange={(checked) => updateSetting(setting.id, 'enabled', checked)}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Webhook Type */}
                <div className="space-y-2">
                  <Label htmlFor={`type-${setting.id}`}>Webhook Type</Label>
                  <Select
                    value={setting.webhook_type}
                    onValueChange={(value) => updateSetting(setting.id, 'webhook_type', value)}
                  >
                    <SelectTrigger id={`type-${setting.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="discord">Discord</SelectItem>
                      <SelectItem value="slack">Slack</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Webhook URL */}
                <div className="space-y-2">
                  <Label htmlFor={`url-${setting.id}`}>Webhook URL</Label>
                  <Input
                    id={`url-${setting.id}`}
                    type="url"
                    placeholder="https://discord.com/api/webhooks/..."
                    value={setting.webhook_url}
                    onChange={(e) => updateSetting(setting.id, 'webhook_url', e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {setting.webhook_type === 'discord' && 'Get from Discord: Server Settings → Integrations → Webhooks'}
                    {setting.webhook_type === 'slack' && 'Get from Slack: Workspace Settings → Incoming Webhooks'}
                    {setting.webhook_type === 'custom' && 'Any endpoint that accepts POST requests with JSON payload'}
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={() => handleSave(setting)}
                    disabled={!setting.webhook_url || saving === setting.id}
                  >
                    {saving === setting.id ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Save Changes
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleTest(setting)}
                    disabled={!setting.webhook_url || testing === setting.id || !setting.enabled}
                  >
                    {testing === setting.id ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      <>
                        <TestTube className="mr-2 h-4 w-4" />
                        Send Test
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
