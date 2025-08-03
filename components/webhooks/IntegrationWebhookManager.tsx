"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { 
  Webhook, 
  Copy, 
  ExternalLink, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Clock,
  Activity,
  Settings,
  Eye,
  BookOpen,
  Link,
  Zap
} from 'lucide-react'

interface IntegrationWebhook {
  id: string
  user_id: string
  provider_id: string
  webhook_url: string
  trigger_types: string[]
  integration_config: Record<string, any>
  external_config: {
    type: string
    setup_required: boolean
    instructions: string
    integration_name: string
    category: string
    capabilities: string[]
  }
  status: 'active' | 'inactive' | 'error'
  last_triggered: string | null
  trigger_count: number
  error_count: number
  created_at: string
  updated_at: string
}

interface WebhookExecution {
  id: string
  webhook_id: string
  user_id: string
  provider_id: string
  trigger_type: string
  payload: any
  headers: any
  status: 'success' | 'error' | 'pending'
  response_code: number | null
  response_body: string | null
  error_message: string | null
  execution_time_ms: number
  triggered_at: string
}

export default function IntegrationWebhookManager() {
  const [webhooks, setWebhooks] = useState<IntegrationWebhook[]>([])
  const [executions, setExecutions] = useState<WebhookExecution[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedWebhook, setSelectedWebhook] = useState<IntegrationWebhook | null>(null)
  const [copiedWebhookId, setCopiedWebhookId] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    fetchIntegrationWebhooks()
  }, [])

  const fetchIntegrationWebhooks = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/integration-webhooks')
      
      if (response.ok) {
        const data = await response.json()
        setWebhooks(data.webhooks || [])
      } else {
        throw new Error('Failed to fetch integration webhooks')
      }
    } catch (error) {
      console.error('Error fetching integration webhooks:', error)
      toast({
        title: "Error",
        description: "Failed to load integration webhooks",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchWebhookExecutions = async (webhookId: string) => {
    try {
      const response = await fetch(`/api/integration-webhooks/executions/${webhookId}`)
      
      if (response.ok) {
        const data = await response.json()
        setExecutions(data.executions || [])
      }
    } catch (error) {
      console.error('Error fetching webhook executions:', error)
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
      console.error('Error copying to clipboard:', error)
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const getProviderIcon = (providerId: string) => {
    // You can add provider-specific icons here
    return <Webhook className="w-4 h-4" />
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        Loading integration webhooks...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Integration Webhooks</h1>
          <p className="text-muted-foreground">
            Webhook URLs and setup instructions for your connected integrations
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button onClick={fetchIntegrationWebhooks} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Integrations</CardTitle>
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
            <CardTitle className="text-sm font-medium">Total Triggers</CardTitle>
            <Activity className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {webhooks.reduce((sum, w) => sum + w.trigger_count, 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Setup Required</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {webhooks.filter(w => w.external_config?.setup_required).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Webhooks Table */}
      <Card>
        <CardHeader>
          <CardTitle>Integration Webhook URLs</CardTitle>
          <CardDescription>
            Copy these URLs to your integration developer portals
          </CardDescription>
        </CardHeader>
        <CardContent>
          {webhooks.length === 0 ? (
            <div className="text-center py-8">
              <Webhook className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No integration webhooks yet</h3>
              <p className="text-muted-foreground mb-4">
                Connect integrations to automatically generate webhook URLs.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Integration</TableHead>
                  <TableHead>Webhook URL</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Triggers</TableHead>
                  <TableHead>Last Triggered</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webhooks.map((webhook) => (
                  <TableRow key={webhook.id}>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        {getProviderIcon(webhook.provider_id)}
                        <div>
                          <div className="font-medium">
                            {webhook.external_config?.integration_name || webhook.provider_id}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {webhook.external_config?.category || 'Integration'}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-xs truncate" title={webhook.webhook_url}>
                        {webhook.webhook_url}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(webhook.status)}</TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">{webhook.trigger_count}</span>
                        {webhook.error_count > 0 && (
                          <Badge variant="destructive">{webhook.error_count} errors</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {webhook.last_triggered ? formatDate(webhook.last_triggered) : 'Never'}
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
                              <DialogTitle>
                                {webhook.external_config?.integration_name || webhook.provider_id} Webhook Details
                              </DialogTitle>
                              <DialogDescription>
                                Webhook configuration and setup instructions
                              </DialogDescription>
                            </DialogHeader>
                            <Tabs defaultValue="setup" className="w-full">
                              <TabsList>
                                <TabsTrigger value="setup">Setup Instructions</TabsTrigger>
                                <TabsTrigger value="url">Webhook URL</TabsTrigger>
                                <TabsTrigger value="executions">Executions</TabsTrigger>
                              </TabsList>
                              
                              <TabsContent value="setup" className="space-y-4">
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                  <h4 className="font-medium text-blue-900 mb-2">Setup Instructions</h4>
                                  <p className="text-blue-800 mb-4">
                                    {webhook.external_config?.instructions || 'No setup instructions available.'}
                                  </p>
                                  <div className="flex items-center space-x-2">
                                    <BookOpen className="w-4 h-4 text-blue-600" />
                                    <span className="text-sm text-blue-700">
                                      Follow the instructions in your {webhook.external_config?.integration_name} developer portal
                                    </span>
                                  </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <Label className="text-sm font-medium">Integration</Label>
                                    <p className="text-sm text-muted-foreground">
                                      {webhook.external_config?.integration_name || webhook.provider_id}
                                    </p>
                                  </div>
                                  <div>
                                    <Label className="text-sm font-medium">Category</Label>
                                    <p className="text-sm text-muted-foreground">
                                      {webhook.external_config?.category || 'Unknown'}
                                    </p>
                                  </div>
                                  <div>
                                    <Label className="text-sm font-medium">Capabilities</Label>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {webhook.external_config?.capabilities?.slice(0, 3).map((cap: string, i: number) => (
                                        <Badge key={i} variant="outline" className="text-xs">
                                          {cap}
                                        </Badge>
                                      ))}
                                      {webhook.external_config?.capabilities?.length > 3 && (
                                        <Badge variant="outline" className="text-xs">
                                          +{webhook.external_config.capabilities.length - 3} more
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                  <div>
                                    <Label className="text-sm font-medium">Trigger Types</Label>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {webhook.trigger_types?.slice(0, 2).map((trigger: string, i: number) => (
                                        <Badge key={i} variant="secondary" className="text-xs">
                                          {trigger}
                                        </Badge>
                                      ))}
                                      {webhook.trigger_types?.length > 2 && (
                                        <Badge variant="secondary" className="text-xs">
                                          +{webhook.trigger_types.length - 2} more
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </TabsContent>
                              
                              <TabsContent value="url" className="space-y-4">
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
                                  <p className="text-sm text-muted-foreground mt-2">
                                    Copy this URL and paste it into your {webhook.external_config?.integration_name} developer portal webhook settings.
                                  </p>
                                </div>
                                
                                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                  <h4 className="font-medium text-yellow-900 mb-2">Important Notes</h4>
                                  <ul className="text-sm text-yellow-800 space-y-1">
                                    <li>• This webhook URL is unique to your account</li>
                                    <li>• Keep this URL secure and don't share it publicly</li>
                                    <li>• The webhook will trigger workflows when events occur in {webhook.external_config?.integration_name}</li>
                                    <li>• You can monitor webhook executions in the Executions tab</li>
                                  </ul>
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
                                  
                                  {executions.length === 0 ? (
                                    <div className="text-center py-8 text-muted-foreground">
                                      No executions yet
                                    </div>
                                  ) : (
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Time</TableHead>
                                          <TableHead>Trigger Type</TableHead>
                                          <TableHead>Status</TableHead>
                                          <TableHead>Execution Time</TableHead>
                                          <TableHead>Error</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {executions.map((execution) => (
                                          <TableRow key={execution.id}>
                                            <TableCell>{formatDate(execution.triggered_at)}</TableCell>
                                            <TableCell>
                                              <Badge variant="outline">{execution.trigger_type}</Badge>
                                            </TableCell>
                                            <TableCell>
                                              {execution.status === 'success' ? (
                                                <Badge variant="default" className="bg-green-100 text-green-800">
                                                  <CheckCircle className="w-3 h-3 mr-1" />Success
                                                </Badge>
                                              ) : (
                                                <Badge variant="destructive">
                                                  <XCircle className="w-3 h-3 mr-1" />Error
                                                </Badge>
                                              )}
                                            </TableCell>
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
                        
                        {webhook.external_config?.setup_required && (
                          <Badge variant="outline" className="text-orange-600 border-orange-200">
                            <Settings className="w-3 h-3 mr-1" />
                            Setup Required
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 