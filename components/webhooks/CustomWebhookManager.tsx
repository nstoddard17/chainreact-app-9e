"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { 
  Webhook, 
  Plus,
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
  Eye,
  TestTube
} from 'lucide-react'

import { logger } from '@/lib/utils/logger'

interface CustomWebhook {
  id: string
  user_id: string
  name: string
  description: string
  webhook_url: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH'
  headers: Record<string, string>
  body_template: string
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
  status: 'success' | 'error' | 'pending'
  response_code: number | null
  response_body: string | null
  error_message: string | null
  execution_time_ms: number
  triggered_at: string
  payload_sent: any
}

export default function CustomWebhookManager() {
  const [webhooks, setWebhooks] = useState<CustomWebhook[]>([])
  const [executions, setExecutions] = useState<WebhookExecution[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [selectedWebhook, setSelectedWebhook] = useState<CustomWebhook | null>(null)
  const [copiedWebhookId, setCopiedWebhookId] = useState<string | null>(null)
  const { toast } = useToast()

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    webhook_url: '',
    method: 'POST' as const,
    headers: '',
    body_template: ''
  })

  useEffect(() => {
    fetchWebhooks()
  }, [])

  const fetchWebhooks = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/custom-webhooks')
      
      if (response.ok) {
        const data = await response.json()
        setWebhooks(data.webhooks || [])
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
      const response = await fetch(`/api/custom-webhooks/${webhookId}/executions`)
      
      if (response.ok) {
        const data = await response.json()
        setExecutions(data.executions || [])
      }
    } catch (error) {
      logger.error('Error fetching webhook executions:', error)
    }
  }

  const createWebhook = async () => {
    try {
      const headers: Record<string, string> = {}
      if (formData.headers) {
        formData.headers.split('\n').forEach(line => {
          const [key, value] = line.split(':').map(s => s.trim())
          if (key && value) {
            headers[key] = value
          }
        })
      }

      const response = await fetch('/api/custom-webhooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          webhook_url: formData.webhook_url,
          method: formData.method,
          headers: headers,
          body_template: formData.body_template
        })
      })

      if (response.ok) {
        toast({
          title: "Success",
          description: "Webhook created successfully",
          variant: "default"
        })
        setShowCreateDialog(false)
        resetForm()
        fetchWebhooks()
      } else {
        const error = await response.json()
        throw new Error(error.message || 'Failed to create webhook')
      }
    } catch (error: any) {
      logger.error('Error creating webhook:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to create webhook",
        variant: "destructive"
      })
    }
  }

  const deleteWebhook = async (webhookId: string) => {
    try {
      const response = await fetch(`/api/custom-webhooks/${webhookId}`, {
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

  const testWebhook = async (webhookId: string) => {
    try {
      const response = await fetch(`/api/custom-webhooks/${webhookId}/test`, {
        method: 'POST'
      })

      if (response.ok) {
        const result = await response.json()
        toast({
          title: "Test Successful",
          description: `Webhook responded with status ${result.statusCode}`,
          variant: "default"
        })
      } else {
        const error = await response.json()
        toast({
          title: "Test Failed",
          description: error.message || "Webhook test failed",
          variant: "destructive"
        })
      }
    } catch (error) {
      logger.error('Error testing webhook:', error)
      toast({
        title: "Test Failed",
        description: "Failed to test webhook",
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

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      webhook_url: '',
      method: 'POST',
      headers: '',
      body_template: ''
    })
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Custom Webhooks</h1>
          <p className="text-muted-foreground">
            Create and manage your own webhook endpoints for external integrations
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button onClick={fetchWebhooks} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Webhook
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Custom Webhook</DialogTitle>
                <DialogDescription>
                  Create a webhook endpoint that can be triggered from your workflows
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="My Custom Webhook"
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="What this webhook does..."
                  />
                </div>
                <div>
                  <Label htmlFor="webhook_url">Webhook URL</Label>
                  <Input
                    id="webhook_url"
                    value={formData.webhook_url}
                    onChange={(e) => setFormData({ ...formData, webhook_url: e.target.value })}
                    placeholder="https://api.example.com/webhook"
                  />
                </div>
                <div>
                  <Label htmlFor="method">HTTP Method</Label>
                  <Select value={formData.method} onValueChange={(value: any) => setFormData({ ...formData, method: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GET">GET</SelectItem>
                      <SelectItem value="POST">POST</SelectItem>
                      <SelectItem value="PUT">PUT</SelectItem>
                      <SelectItem value="PATCH">PATCH</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="headers">Headers (optional)</Label>
                  <Textarea
                    id="headers"
                    value={formData.headers}
                    onChange={(e) => setFormData({ ...formData, headers: e.target.value })}
                    placeholder="Content-Type: application/json&#10;Authorization: Bearer your-token"
                    rows={3}
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Enter headers in format: Key: Value (one per line)
                  </p>
                </div>
                <div>
                  <Label htmlFor="body_template">Body Template (optional)</Label>
                  <Textarea
                    id="body_template"
                    value={formData.body_template}
                    onChange={(e) => setFormData({ ...formData, body_template: e.target.value })}
                    placeholder='{"message": "{{data.message}}", "timestamp": "{{timestamp}}"}'
                    rows={4}
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Use template variables like data.field and timestamp in your body template
                  </p>
                </div>
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={createWebhook}>
                  Create Webhook
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

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
            <CardTitle className="text-sm font-medium">Errors</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {webhooks.reduce((sum, w) => sum + w.error_count, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Custom Webhooks</CardTitle>
          <CardDescription>
            Manage your custom webhook endpoints
          </CardDescription>
        </CardHeader>
        <CardContent>
          {webhooks.length === 0 ? (
            <div className="text-center py-8">
              <Webhook className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No custom webhooks yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first custom webhook to integrate with external services.
              </p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Webhook
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Method</TableHead>
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
                      <div>
                        <div className="font-medium">{webhook.name}</div>
                        <div className="text-sm text-muted-foreground">{webhook.description}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div 
                        className="max-w-md break-all text-sm font-mono cursor-help" 
                        title={webhook.webhook_url}
                      >
                        {webhook.webhook_url}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{webhook.method}</Badge>
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
                              <DialogTitle>Webhook Details: {webhook.name}</DialogTitle>
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
                                      <Input 
                                        value={webhook.webhook_url} 
                                        readOnly 
                                        className="font-mono text-sm"
                                      />
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
                                    <Label>Method</Label>
                                    <Input value={webhook.method} readOnly />
                                  </div>
                                  <div>
                                    <Label>Created</Label>
                                    <Input value={formatDate(webhook.created_at)} readOnly />
                                  </div>
                                </div>
                                
                                {Object.keys(webhook.headers).length > 0 && (
                                  <div>
                                    <Label>Headers</Label>
                                    <ScrollArea className="h-32 w-full border rounded-md p-2">
                                      <pre className="text-sm">
                                        {JSON.stringify(webhook.headers, null, 2)}
                                      </pre>
                                    </ScrollArea>
                                  </div>
                                )}
                                
                                {webhook.body_template && (
                                  <div>
                                    <Label>Body Template</Label>
                                    <ScrollArea className="h-32 w-full border rounded-md p-2">
                                      <pre className="text-sm">
                                        {webhook.body_template}
                                      </pre>
                                    </ScrollArea>
                                  </div>
                                )}
                              </TabsContent>
                              
                              <TabsContent value="executions" className="mt-2">
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
                                          <TableHead>Status</TableHead>
                                          <TableHead>Response Code</TableHead>
                                          <TableHead>Execution Time</TableHead>
                                          <TableHead>Error</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {executions.map((execution) => (
                                          <TableRow key={execution.id}>
                                            <TableCell>{formatDate(execution.triggered_at)}</TableCell>
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
                                            <TableCell>
                                              {execution.response_code ? (
                                                <Badge variant="outline">{execution.response_code}</Badge>
                                              ) : (
                                                <span className="text-muted-foreground">-</span>
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
                          onClick={() => testWebhook(webhook.id)}
                        >
                          <TestTube className="w-4 h-4" />
                        </Button>
                        
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
                                Are you sure you want to delete "{webhook.name}"? This action cannot be undone.
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
    </div>
  )
} 
