"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { 
  Webhook, 
  Plus, 
  Trash2, 
  Copy, 
  ExternalLink, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  Activity,
  Settings
} from "lucide-react"
import { toast } from "sonner"
import { useAuthStore } from "@/stores/authStore"

import { logger } from '@/lib/utils/logger'

interface WebhookConfig {
  id: string
  workflowId: string
  userId: string
  triggerType: string
  providerId: string
  webhookUrl: string
  secret?: string
  status: 'active' | 'inactive' | 'error'
  lastTriggered?: Date
  errorCount: number
  createdAt: Date
  updatedAt: Date
}

interface Workflow {
  id: string
  name: string
  description?: string
}

export default function WebhookManager() {
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([])
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>("")
  const [selectedTrigger, setSelectedTrigger] = useState<string>("")
  const [selectedProvider, setSelectedProvider] = useState<string>("")
  const { user } = useAuthStore()

  useEffect(() => {
    fetchWebhooks()
    fetchWorkflows()
  }, [])

  const fetchWebhooks = async () => {
    try {
      const response = await fetch('/api/webhook-management')
      if (response.ok) {
        const data = await response.json()
        setWebhooks(data)
      }
    } catch (error) {
      logger.error('Failed to fetch webhooks:', error)
      toast.error('Failed to load webhooks')
    } finally {
      setLoading(false)
    }
  }

  const fetchWorkflows = async () => {
    try {
      const response = await fetch('/api/workflows')
      if (response.ok) {
        const data = await response.json()
        setWorkflows(data)
      }
    } catch (error) {
      logger.error('Failed to fetch workflows:', error)
    }
  }

  const createWebhook = async () => {
    if (!selectedWorkflow || !selectedTrigger || !selectedProvider) {
      toast.error('Please fill in all required fields')
      return
    }

    try {
      const response = await fetch('/api/webhook-management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId: selectedWorkflow,
          triggerType: selectedTrigger,
          providerId: selectedProvider
        })
      })

      if (response.ok) {
        const webhook = await response.json()
        setWebhooks(prev => [webhook, ...prev])
        setCreateDialogOpen(false)
        toast.success('Webhook created successfully')
        
        // Reset form
        setSelectedWorkflow("")
        setSelectedTrigger("")
        setSelectedProvider("")
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to create webhook')
      }
    } catch (error) {
      logger.error('Failed to create webhook:', error)
      toast.error('Failed to create webhook')
    }
  }

  const deleteWebhook = async (webhookId: string) => {
    try {
      const response = await fetch(`/api/webhook-management/${webhookId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        setWebhooks(prev => prev.filter(w => w.id !== webhookId))
        toast.success('Webhook deleted successfully')
      } else {
        toast.error('Failed to delete webhook')
      }
    } catch (error) {
      logger.error('Failed to delete webhook:', error)
      toast.error('Failed to delete webhook')
    }
  }

  const copyWebhookUrl = async (webhookUrl: string) => {
    try {
      await navigator.clipboard.writeText(webhookUrl)
      toast.success('Webhook URL copied to clipboard')
    } catch (error) {
      toast.error('Failed to copy webhook URL')
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800'
      case 'inactive': return 'bg-gray-100 text-gray-800'
      case 'error': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle className="w-4 h-4" />
      case 'inactive': return <Clock className="w-4 h-4" />
      case 'error': return <AlertTriangle className="w-4 h-4" />
      default: return <Clock className="w-4 h-4" />
    }
  }

  const getWorkflowName = (workflowId: string) => {
    const workflow = workflows.find(w => w.id === workflowId)
    return workflow?.name || 'Unknown Workflow'
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-48 bg-slate-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Webhook Manager</h1>
          <p className="text-slate-600">Manage webhooks for your workflow triggers</p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-orange-600 hover:bg-orange-700">
              <Plus className="w-4 h-4 mr-2" />
              Create Webhook
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Webhook</DialogTitle>
              <DialogDescription>
                Set up a webhook to trigger your workflow from external services.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="workflow">Workflow</Label>
                <Select value={selectedWorkflow} onValueChange={setSelectedWorkflow}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a workflow" />
                  </SelectTrigger>
                  <SelectContent>
                    {workflows.map(workflow => (
                      <SelectItem key={workflow.id} value={workflow.id}>
                        {workflow.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="trigger">Trigger Type</Label>
                <Select value={selectedTrigger} onValueChange={setSelectedTrigger}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select trigger type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="webhook">Webhook</SelectItem>
                    <SelectItem value="gmail_trigger_new_email">Gmail - New Email</SelectItem>
                    <SelectItem value="slack_trigger_new_message">Slack - New Message</SelectItem>
                    <SelectItem value="github_trigger_new_issue">GitHub - New Issue</SelectItem>
                    <SelectItem value="stripe_trigger_new_payment">Stripe - New Payment</SelectItem>
                    <SelectItem value="shopify_trigger_order_created">Shopify - Order Created</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="provider">Provider</Label>
                <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gmail">Gmail</SelectItem>
                    <SelectItem value="slack">Slack</SelectItem>
                    <SelectItem value="github">GitHub</SelectItem>
                    <SelectItem value="discord">Discord</SelectItem>
                    <SelectItem value="stripe">Stripe</SelectItem>
                    <SelectItem value="shopify">Shopify</SelectItem>
                    <SelectItem value="hubspot">HubSpot</SelectItem>
                    <SelectItem value="notion">Notion</SelectItem>
                    <SelectItem value="airtable">Airtable</SelectItem>
                    <SelectItem value="google-calendar">Google Calendar</SelectItem>
                    <SelectItem value="google-sheets">Google Sheets</SelectItem>
                    <SelectItem value="google-drive">Google Drive</SelectItem>
                    <SelectItem value="trello">Trello</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="twitter">Twitter</SelectItem>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="youtube">YouTube</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                    <SelectItem value="twitch">Twitch</SelectItem>
                    <SelectItem value="spotify">Spotify</SelectItem>
                    <SelectItem value="zoom">Zoom</SelectItem>
                    <SelectItem value="teams">Microsoft Teams</SelectItem>
                    <SelectItem value="outlook">Outlook</SelectItem>
                    <SelectItem value="onedrive">OneDrive</SelectItem>
                    <SelectItem value="dropbox">Dropbox</SelectItem>
                    <SelectItem value="box">Box</SelectItem>
                    <SelectItem value="gitlab">GitLab</SelectItem>
                    <SelectItem value="bitbucket">Bitbucket</SelectItem>
                    <SelectItem value="jira">Jira</SelectItem>
                    <SelectItem value="asana">Asana</SelectItem>
                    <SelectItem value="clickup">ClickUp</SelectItem>
                    <SelectItem value="monday">Monday.com</SelectItem>
                    <SelectItem value="linear">Linear</SelectItem>
                    <SelectItem value="figma">Figma</SelectItem>
                    <SelectItem value="canva">Canva</SelectItem>
                    <SelectItem value="mailchimp">Mailchimp</SelectItem>
                    <SelectItem value="sendgrid">SendGrid</SelectItem>
                    <SelectItem value="resend">Resend</SelectItem>
                    <SelectItem value="calendly">Calendly</SelectItem>
                    <SelectItem value="typeform">Typeform</SelectItem>
                    <SelectItem value="google-forms">Google Forms</SelectItem>
                    <SelectItem value="microsoft-forms">Microsoft Forms</SelectItem>
                    <SelectItem value="survey-monkey">Survey Monkey</SelectItem>
                    <SelectItem value="qualtrics">Qualtrics</SelectItem>
                    <SelectItem value="zapier">Zapier</SelectItem>
                    <SelectItem value="make">Make (Integromat)</SelectItem>
                    <SelectItem value="n8n">n8n</SelectItem>
                    <SelectItem value="node-red">Node-RED</SelectItem>
                    <SelectItem value="ifttt">IFTTT</SelectItem>
                    <SelectItem value="integromat">Integromat</SelectItem>
                    <SelectItem value="automate-io">Automate.io</SelectItem>
                    <SelectItem value="workato">Workato</SelectItem>
                    <SelectItem value="tray-io">Tray.io</SelectItem>
                    <SelectItem value="elastic-io">Elastic.io</SelectItem>
                    <SelectItem value="pie-io">Pie.io</SelectItem>
                    <SelectItem value="phantombuster">Phantombuster</SelectItem>
                    <SelectItem value="apify">Apify</SelectItem>
                    <SelectItem value="scraping-bee">ScrapingBee</SelectItem>
                    <SelectItem value="scraper-api">ScraperAPI</SelectItem>
                    <SelectItem value="bright-data">Bright Data</SelectItem>
                    <SelectItem value="proxycurl">Proxycurl</SelectItem>
                    <SelectItem value="hunter-io">Hunter.io</SelectItem>
                    <SelectItem value="findthatlead">FindThatLead</SelectItem>
                    <SelectItem value="snov-io">Snov.io</SelectItem>
                    <SelectItem value="email-finder">Email Finder</SelectItem>
                    <SelectItem value="email-verifier">Email Verifier</SelectItem>
                    <SelectItem value="email-validator">Email Validator</SelectItem>
                    <SelectItem value="email-checker">Email Checker</SelectItem>
                    <SelectItem value="email-tester">Email Tester</SelectItem>
                    <SelectItem value="email-analyzer">Email Analyzer</SelectItem>
                    <SelectItem value="email-scorer">Email Scorer</SelectItem>
                    <SelectItem value="email-profiler">Email Profiler</SelectItem>
                    <SelectItem value="email-enricher">Email Enricher</SelectItem>
                    <SelectItem value="email-finder-pro">Email Finder Pro</SelectItem>
                    <SelectItem value="email-verifier-pro">Email Verifier Pro</SelectItem>
                    <SelectItem value="email-validator-pro">Email Validator Pro</SelectItem>
                    <SelectItem value="email-checker-pro">Email Checker Pro</SelectItem>
                    <SelectItem value="email-tester-pro">Email Tester Pro</SelectItem>
                    <SelectItem value="email-analyzer-pro">Email Analyzer Pro</SelectItem>
                    <SelectItem value="email-scorer-pro">Email Scorer Pro</SelectItem>
                    <SelectItem value="email-profiler-pro">Email Profiler Pro</SelectItem>
                    <SelectItem value="email-enricher-pro">Email Enricher Pro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setCreateDialogOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button onClick={createWebhook} className="flex-1">
                  Create Webhook
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Webhooks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {webhooks.map(webhook => (
          <Card key={webhook.id} className="bg-white rounded-2xl shadow-lg border border-slate-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Webhook className="w-5 h-5 text-orange-600" />
                  <CardTitle className="text-lg font-semibold text-slate-900">
                    {getWorkflowName(webhook.workflowId)}
                  </CardTitle>
                </div>
                <Badge className={getStatusColor(webhook.status)}>
                  {getStatusIcon(webhook.status)}
                  <span className="ml-1">{webhook.status}</span>
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Provider:</span>
                  <span className="font-medium text-slate-900">{webhook.providerId}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Trigger:</span>
                  <span className="font-medium text-slate-900">{webhook.triggerType}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Last Triggered:</span>
                  <span className="font-medium text-slate-900">
                    {webhook.lastTriggered 
                      ? new Date(webhook.lastTriggered).toLocaleDateString()
                      : 'Never'
                    }
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Errors:</span>
                  <span className="font-medium text-slate-900">{webhook.errorCount}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">Webhook URL</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={webhook.webhookUrl}
                    readOnly
                    className="text-xs font-mono bg-slate-50"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyWebhookUrl(webhook.webhookUrl)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => window.open(webhook.webhookUrl, '_blank')}
                >
                  <ExternalLink className="w-4 h-4 mr-1" />
                  Test
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                >
                  <Settings className="w-4 h-4 mr-1" />
                  Settings
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => deleteWebhook(webhook.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {webhooks.length === 0 && (
        <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
          <CardContent className="py-12 text-center">
            <Webhook className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No Webhooks Yet</h3>
            <p className="text-slate-600 mb-4">
              Create your first webhook to start receiving triggers from external services.
            </p>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Webhook
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
} 