"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/hooks/use-toast'
import { 
  Webhook, 
  Copy, 
  ExternalLink, 
  Trash2, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Clock,
  Activity,
  Settings,
  Eye
} from 'lucide-react'

import { logger } from '@/lib/utils/logger'

interface WebhookConfig {
  id: string
  workflow_id: string
  user_id: string
  trigger_type: string
  provider_id: string
  webhook_url: string
  secret: string
  status: 'active' | 'inactive' | 'error'
  last_triggered: string | null
  error_count: number
  config: Record<string, any>
  created_at: string
  updated_at: string
}

interface WebhookExecution {
  id: string
  webhook_id: string
  workflow_id: string
  trigger_type: string
  provider_id: string
  payload: any
  headers: any
  status: 'success' | 'error' | 'pending'
  error_message: string | null
  execution_time_ms: number
  created_at: string
}

interface SupportedTrigger {
  type: string
  title: string
  description: string
  providerId: string
}

export default function TriggerWebhookManager() {
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([])
  const [supportedTriggers, setSupportedTriggers] = useState<SupportedTrigger[]>([])
  const [selectedWebhook, setSelectedWebhook] = useState<WebhookConfig | null>(null)
  const [webhookExecutions, setWebhookExecutions] = useState<WebhookExecution[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedWebhookId, setCopiedWebhookId] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    fetchWebhooks()
  }, [])

  const fetchWebhooks = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/workflows/webhook-registration')
      
      if (response.ok) {
        const data = await response.json()
        setWebhooks(data.webhooks || [])
        setSupportedTriggers(data.supportedTriggers || [])
      } else {
        throw new Error('Failed to fetch webhooks')
      }
    } catch (error) {
      logger.error('Error fetching webhooks:', error)
      toast({
        title: "Error",
        description: "Failed to load webhooks",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchWebhookExecutions = async (webhookId: string) => {
    try {
      const response = await fetch(`/api/workflows/webhook-registration?webhookId=${webhookId}`)
      
      if (response.ok) {
        const data = await response.json()
        setWebhookExecutions(data.executions || [])
      }
    } catch (error) {
      logger.error('Error fetching webhook executions:', error)
    }
  }

  const deleteWebhook = async (webhookId: string) => {
    try {
      const response = await fetch(`/api/workflows/webhook-registration?webhookId=${webhookId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        toast({
          title: "Success",
          description: "Webhook deleted successfully",
          variant: "default"
        })
        fetchWebhooks()
      } else {
        throw new Error('Failed to delete webhook')
      }
    } catch (error) {
      logger.error('Error deleting webhook:', error)
      toast({
        title: "Error",
        description: "Failed to delete webhook",
        variant: "destructive"
      })
    }
  }

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedWebhookId(label)
      toast({
        title: "Copied",
        description: `${label} copied to clipboard`,
        variant: "default"
      })
      setTimeout(() => setCopiedWebhookId(null), 2000)
    } catch (error) {
      logger.error('Error copying to clipboard:', error)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Active</Badge>
      case 'inactive':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Inactive</Badge>
      case 'error':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Error</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getExecutionStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge variant="default" className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Success</Badge>
      case 'error':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Error</Badge>
      case 'pending':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const getTriggerDisplayName = (triggerType: string) => {
    const trigger = supportedTriggers.find(t => t.type === triggerType)
    return trigger ? trigger.title : triggerType
  }

  const getProviderDisplayName = (providerId: string) => {
    const providerNames: Record<string, string> = {
      'gmail': 'Gmail',
      'google-calendar': 'Google Calendar',
      'google-drive': 'Google Drive',
      'google-sheets': 'Google Sheets',
      'slack': 'Slack',
      'github': 'GitHub',
      'notion': 'Notion',
      'hubspot': 'HubSpot',
      'airtable': 'Airtable',
      'discord': 'Discord'
    }
    return providerNames[providerId] || providerId
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        Loading webhooks...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Webhook Management</h1>
          <p className="text-muted-foreground">
            Manage webhooks for your workflow triggers
          </p>
        </div>
        <Button onClick={fetchWebhooks} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Webhooks</CardTitle>
            <Webhook className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{webhooks.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {webhooks.filter(w => w.status === 'active').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">With Errors</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {webhooks.filter(w => w.status === 'error').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Supported Triggers</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{supportedTriggers.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Webhooks Table */}
      <Card>
        <CardHeader>
          <CardTitle>Registered Webhooks</CardTitle>
          <CardDescription>
            All webhooks registered for your workflow triggers
          </CardDescription>
        </CardHeader>
        <CardContent>
          {webhooks.length === 0 ? (
            <div className="text-center py-8">
              <Webhook className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No webhooks yet</h3>
              <p className="text-muted-foreground mb-4">
                Webhooks are automatically registered when you add supported triggers to your workflows.
              </p>
              <Button onClick={() => window.location.href = '/workflows'}>
                Create Workflow
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Triggered</TableHead>
                  <TableHead>Error Count</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webhooks.map((webhook) => (
                  <TableRow key={webhook.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{getTriggerDisplayName(webhook.trigger_type)}</div>
                        <div className="text-sm text-muted-foreground">Workflow: {webhook.workflow_id}</div>
                      </div>
                    </TableCell>
                    <TableCell>{getProviderDisplayName(webhook.provider_id)}</TableCell>
                    <TableCell>{getStatusBadge(webhook.status)}</TableCell>
                    <TableCell>
                      {webhook.last_triggered ? formatDate(webhook.last_triggered) : 'Never'}
                    </TableCell>
                    <TableCell>
                      {webhook.error_count > 0 ? (
                        <Badge variant="destructive">{webhook.error_count}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedWebhook(webhook)
                                fetchWebhookExecutions(webhook.id)
                              }}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl">
                            <DialogHeader>
                              <DialogTitle>Webhook Details</DialogTitle>
                              <DialogDescription>
                                View webhook configuration and execution history
                              </DialogDescription>
                            </DialogHeader>
                            <Tabs defaultValue="config" className="w-full">
                              <TabsList>
                                <TabsTrigger value="config">Configuration</TabsTrigger>
                                <TabsTrigger value="executions">Executions</TabsTrigger>
                              </TabsList>
                              
                              <TabsContent value="config" className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <Label>Webhook ID</Label>
                                    <div className="flex items-center space-x-2">
                                      <Input value={webhook.id} readOnly />
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => copyToClipboard(webhook.id, 'Webhook ID')}
                                      >
                                        <Copy className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  </div>
                                  <div>
                                    <Label>Webhook URL</Label>
                                    <div className="flex items-center space-x-2">
                                      <Input value={webhook.webhook_url} readOnly />
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => copyToClipboard(webhook.webhook_url, 'Webhook URL')}
                                      >
                                        <Copy className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  </div>
                                  <div>
                                    <Label>Secret</Label>
                                    <div className="flex items-center space-x-2">
                                      <Input value={webhook.secret} type="password" readOnly />
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => copyToClipboard(webhook.secret, 'Secret')}
                                      >
                                        <Copy className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  </div>
                                  <div>
                                    <Label>Created</Label>
                                    <Input value={formatDate(webhook.created_at)} readOnly />
                                  </div>
                                </div>
                                
                                <div>
                                  <Label>Configuration</Label>
                                  <ScrollArea className="h-32 w-full border rounded-md p-2">
                                    <pre className="text-sm">
                                      {JSON.stringify(webhook.config, null, 2)}
                                    </pre>
                                  </ScrollArea>
                                </div>
                              </TabsContent>
                              
                              <TabsContent value="executions">
                                <div className="space-y-4">
                                  <div className="flex items-center justify-between">
                                    <h4 className="font-medium">Recent Executions</h4>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => fetchWebhookExecutions(webhook.id)}
                                    >
                                      <RefreshCw className="w-4 h-4 mr-2" />
                                      Refresh
                                    </Button>
                                  </div>
                                  
                                  {webhookExecutions.length === 0 ? (
                                    <div className="text-center py-8 text-muted-foreground">
                                      No executions yet
                                    </div>
                                  ) : (
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Time</TableHead>
                                          <TableHead>Status</TableHead>
                                          <TableHead>Execution Time</TableHead>
                                          <TableHead>Error</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {webhookExecutions.map((execution) => (
                                          <TableRow key={execution.id}>
                                            <TableCell>{formatDate(execution.created_at)}</TableCell>
                                            <TableCell>{getExecutionStatusBadge(execution.status)}</TableCell>
                                            <TableCell>{execution.execution_time_ms}ms</TableCell>
                                            <TableCell>
                                              {execution.error_message ? (
                                                <span className="text-red-600 text-sm">
                                                  {execution.error_message}
                                                </span>
                                              ) : (
                                                <span className="text-muted-foreground">-</span>
                                              )}
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  )}
                                </div>
                              </TabsContent>
                            </Tabs>
                          </DialogContent>
                        </Dialog>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(webhook.webhook_url, 'Webhook URL')}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Delete Webhook</DialogTitle>
                              <DialogDescription>
                                Are you sure you want to delete this webhook? This action cannot be undone.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="flex justify-end space-x-2">
                              <Button variant="outline">Cancel</Button>
                              <Button
                                variant="destructive"
                                onClick={() => deleteWebhook(webhook.id)}
                              >
                                Delete
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Supported Triggers */}
      <Card>
        <CardHeader>
          <CardTitle>Supported Triggers</CardTitle>
          <CardDescription>
            These trigger types automatically register webhooks when added to workflows
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {supportedTriggers.map((trigger) => (
              <div key={trigger.type} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">{trigger.title}</h4>
                  <Badge variant="outline">{getProviderDisplayName(trigger.providerId)}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{trigger.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 