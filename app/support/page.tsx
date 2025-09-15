"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { AlertCircle, Plus, MessageSquare, Clock, CheckCircle, XCircle, AlertTriangle, Bug, Zap, Settings, CreditCard, HelpCircle, FileText } from "lucide-react"
import { LightningLoader } from '@/components/ui/lightning-loader'
import AppLayout from "@/components/layout/AppLayout"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface SupportTicket {
  id: string
  ticket_number: string
  subject: string
  description: string
  priority: "low" | "medium" | "high" | "urgent"
  status: "open" | "in_progress" | "waiting_for_user" | "resolved" | "closed"
  category: "bug" | "feature_request" | "integration_issue" | "billing" | "general" | "technical_support"
  created_at: string
  updated_at: string
  support_ticket_responses: { count: number }[]
}

const priorityColors = {
  low: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  medium: "bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-200",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-800 dark:text-orange-200",
  urgent: "bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-200",
}

const statusColors = {
  open: "bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-200",
  waiting_for_user: "bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200",
  resolved: "bg-purple-100 text-purple-800 dark:bg-purple-800 dark:text-purple-200",
  closed: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
}

const categoryIcons = {
  bug: Bug,
  feature_request: Zap,
  integration_issue: Settings,
  billing: CreditCard,
  general: HelpCircle,
  technical_support: FileText,
}

// Helper function to get formatted browser/system info
const getBrowserSystemInfo = () => {
  if (typeof navigator === 'undefined') return ''
  
  const userAgent = navigator.userAgent
  const platform = navigator.platform
  
  // Detect browser
  let browser = 'Unknown Browser'
  let browserVersion = ''
  
  if (userAgent.includes('Firefox/')) {
    browser = 'Firefox'
    browserVersion = userAgent.match(/Firefox\/(\d+\.\d+)/)?.[1] || ''
  } else if (userAgent.includes('Edg/')) {
    browser = 'Edge'
    browserVersion = userAgent.match(/Edg\/(\d+\.\d+)/)?.[1] || ''
  } else if (userAgent.includes('Chrome/') && !userAgent.includes('Edg')) {
    browser = 'Chrome'
    browserVersion = userAgent.match(/Chrome\/(\d+\.\d+)/)?.[1] || ''
  } else if (userAgent.includes('Safari/') && !userAgent.includes('Chrome')) {
    browser = 'Safari'
    browserVersion = userAgent.match(/Version\/(\d+\.\d+)/)?.[1] || ''
  }
  
  // Detect OS
  let os = 'Unknown OS'
  if (userAgent.includes('Windows NT 10.0')) os = 'Windows 10'
  else if (userAgent.includes('Windows NT 11.0')) os = 'Windows 11'
  else if (userAgent.includes('Mac OS X')) {
    const version = userAgent.match(/Mac OS X (\d+[._]\d+)/)?.[1]?.replace('_', '.') || ''
    os = `macOS ${version}`
  } else if (userAgent.includes('Linux')) os = 'Linux'
  else if (userAgent.includes('Android')) os = 'Android'
  else if (userAgent.includes('iOS')) os = 'iOS'
  
  // Get screen resolution
  const screenRes = typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : 'Unknown'
  
  // Get language
  const language = navigator.language || 'Unknown'
  
  // Format the info
  return `Browser: ${browser} ${browserVersion}
OS: ${os}
Platform: ${platform}
Screen Resolution: ${screenRes}
Language: ${language}
Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`
}

// Reusable ticket creation form component
const TicketCreationForm = ({ 
  newTicket, 
  setNewTicket, 
  createTicket, 
  creatingTicket,
  onCancel
}: {
  newTicket: any
  setNewTicket: any
  createTicket: () => void
  creatingTicket: boolean
  onCancel?: () => void
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false)
  
  // Determine if there are advanced fields to show
  const hasAdvancedFields = 
    newTicket.category === 'bug' || 
    newTicket.category === 'integration_issue' || 
    newTicket.category === 'technical_support'
  
  // Update browser info when component mounts or category changes to bug/technical
  useEffect(() => {
    if (newTicket.category === 'bug' || newTicket.category === 'technical_support') {
      setNewTicket((prev: any) => ({
        ...prev,
        browserInfo: getBrowserSystemInfo()
      }))
    }
  }, [newTicket.category, setNewTicket])
  
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="subject">Subject *</Label>
        <Input
          id="subject"
          value={newTicket.subject}
          onChange={(e) => setNewTicket((prev: any) => ({ ...prev, subject: e.target.value }))}
          placeholder="Brief description of your issue"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="category">Category</Label>
          <Select
            value={newTicket.category}
            onValueChange={(value: any) => setNewTicket((prev: any) => ({ ...prev, category: value }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="general">General</SelectItem>
              <SelectItem value="bug">Bug Report</SelectItem>
              <SelectItem value="feature_request">Feature Request</SelectItem>
              <SelectItem value="integration_issue">Integration Issue</SelectItem>
              <SelectItem value="billing">Billing</SelectItem>
              <SelectItem value="technical_support">Technical Support</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="priority">Priority</Label>
          <Select
            value={newTicket.priority}
            onValueChange={(value: any) => setNewTicket((prev: any) => ({ ...prev, priority: value }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="description">Description *</Label>
        <Textarea
          id="description"
          value={newTicket.description}
          onChange={(e) => setNewTicket((prev: any) => ({ ...prev, description: e.target.value }))}
          placeholder="Please provide detailed information about your issue..."
          rows={6}
        />
      </div>
      
      {/* Advanced Options Toggle - only show if there are advanced fields */}
      {hasAdvancedFields && (
        <div className="pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full"
          >
            {showAdvanced ? 'Hide' : 'Show'} Advanced Options
          </Button>
        </div>
      )}

      {/* Advanced Fields */}
      {showAdvanced && (
        <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
          {/* Bug-specific fields */}
          {newTicket.category === 'bug' && (
            <>
              <div>
                <Label htmlFor="stepsToReproduce">Steps to Reproduce</Label>
                <Textarea
                  id="stepsToReproduce"
                  value={newTicket.stepsToReproduce}
                  onChange={(e) => setNewTicket((prev: any) => ({ ...prev, stepsToReproduce: e.target.value }))}
                  placeholder="1. Go to...\n2. Click on...\n3. See error..."
                  rows={4}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="expectedBehavior">Expected Behavior</Label>
                  <Textarea
                    id="expectedBehavior"
                    value={newTicket.expectedBehavior}
                    onChange={(e) => setNewTicket((prev: any) => ({ ...prev, expectedBehavior: e.target.value }))}
                    placeholder="What should happen..."
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="actualBehavior">Actual Behavior</Label>
                  <Textarea
                    id="actualBehavior"
                    value={newTicket.actualBehavior}
                    onChange={(e) => setNewTicket((prev: any) => ({ ...prev, actualBehavior: e.target.value }))}
                    placeholder="What actually happens..."
                    rows={3}
                  />
                </div>
              </div>
            </>
          )}

          {/* Integration issue field */}
          {newTicket.category === 'integration_issue' && (
            <div>
              <Label htmlFor="affectedIntegration">Affected Integration</Label>
              <Input
                id="affectedIntegration"
                value={newTicket.affectedIntegration}
                onChange={(e) => setNewTicket((prev: any) => ({ ...prev, affectedIntegration: e.target.value }))}
                placeholder="e.g., Gmail, Slack, Discord..."
              />
            </div>
          )}

          {/* Technical support / workflow field */}
          {(newTicket.category === 'technical_support' || newTicket.category === 'bug') && (
            <div>
              <Label htmlFor="affectedWorkflow">Affected Workflow (if applicable)</Label>
              <Input
                id="affectedWorkflow"
                value={newTicket.affectedWorkflow}
                onChange={(e) => setNewTicket((prev: any) => ({ ...prev, affectedWorkflow: e.target.value }))}
                placeholder="Name or ID of the workflow experiencing issues"
              />
            </div>
          )}

          {/* Browser info (only show for bug/technical support) */}
          {(newTicket.category === 'bug' || newTicket.category === 'technical_support') && (
            <div>
              <Label htmlFor="browserInfo">Browser/System Information</Label>
              <Textarea
                id="browserInfo"
                value={newTicket.browserInfo}
                onChange={(e) => setNewTicket((prev: any) => ({ ...prev, browserInfo: e.target.value }))}
                placeholder="Automatically detected..."
                rows={6}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                This helps us reproduce issues in your environment
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end space-x-2">
        <Button 
          variant="outline" 
          onClick={() => {
            setNewTicket({
              subject: "",
              description: "",
              priority: "medium",
              category: "general",
              affectedWorkflow: "",
              affectedIntegration: "",
              stepsToReproduce: "",
              expectedBehavior: "",
              actualBehavior: "",
              browserInfo: "",
            })
            onCancel?.()
          }}
        >
          Cancel
        </Button>
        <Button 
          onClick={createTicket}
          disabled={creatingTicket || !newTicket.subject || !newTicket.description}
          className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
        >
          {creatingTicket ? 'Creating...' : 'Create Ticket'}
        </Button>
      </div>
    </div>
  )
}

export default function SupportPage() {
  const router = useRouter()
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [creatingTicket, setCreatingTicket] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [emptyDialogOpen, setEmptyDialogOpen] = useState(false)
  const [newTicket, setNewTicket] = useState({
    subject: "",
    description: "",
    priority: "medium" as const,
    category: "general" as const,
    affectedWorkflow: "",
    affectedIntegration: "",
    stepsToReproduce: "",
    expectedBehavior: "",
    actualBehavior: "",
    browserInfo: "",
  })

  useEffect(() => {
    fetchTickets()
  }, [])

  const fetchTickets = async () => {
    try {
      const response = await fetch('/api/support/tickets')
      if (response.ok) {
        const data = await response.json()
        setTickets(data.tickets || [])
      } else {
        toast.error('Failed to fetch tickets')
      }
    } catch (error) {
      console.error('Error fetching tickets:', error)
      toast.error('Failed to fetch tickets')
    } finally {
      setLoading(false)
    }
  }

  const createTicket = async () => {
    if (!newTicket.subject || !newTicket.description) {
      toast.error('Please fill in all required fields')
      return
    }

    setCreatingTicket(true)
    try {
      // Build the ticket data with advanced fields when present
      const ticketData: any = {
        subject: newTicket.subject,
        description: newTicket.description,
        priority: newTicket.priority,
        category: newTicket.category,
      }

      // Add advanced fields to description if they're filled out
      let enhancedDescription = newTicket.description
      
      if (newTicket.category === 'bug' && newTicket.stepsToReproduce) {
        enhancedDescription += `\n\n**Steps to Reproduce:**\n${newTicket.stepsToReproduce}`
      }
      if (newTicket.category === 'bug' && newTicket.expectedBehavior) {
        enhancedDescription += `\n\n**Expected Behavior:**\n${newTicket.expectedBehavior}`
      }
      if (newTicket.category === 'bug' && newTicket.actualBehavior) {
        enhancedDescription += `\n\n**Actual Behavior:**\n${newTicket.actualBehavior}`
      }
      if (newTicket.affectedWorkflow) {
        enhancedDescription += `\n\n**Affected Workflow:** ${newTicket.affectedWorkflow}`
      }
      if (newTicket.affectedIntegration) {
        enhancedDescription += `\n\n**Affected Integration:** ${newTicket.affectedIntegration}`
      }
      if (newTicket.browserInfo) {
        enhancedDescription += `\n\n**Browser Info:** ${newTicket.browserInfo}`
      }

      ticketData.description = enhancedDescription

      const response = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(ticketData),
      })

      if (response.ok) {
        const data = await response.json()
        toast.success(`Ticket ${data.ticket.ticket_number} created successfully!`)
        setNewTicket({
          subject: "",
          description: "",
          priority: "medium",
          category: "general",
          affectedWorkflow: "",
          affectedIntegration: "",
          stepsToReproduce: "",
          expectedBehavior: "",
          actualBehavior: "",
          browserInfo: "",
        })
        setDialogOpen(false) // Close main dialog on success
        setEmptyDialogOpen(false) // Close empty state dialog on success
        fetchTickets()
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to create ticket')
      }
    } catch (error) {
      console.error('Error creating ticket:', error)
      toast.error('Failed to create ticket')
    } finally {
      setCreatingTicket(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return <AlertCircle className="w-4 h-4" />
      case 'in_progress':
        return <Clock className="w-4 h-4" />
      case 'waiting_for_user':
        return <MessageSquare className="w-4 h-4" />
      case 'resolved':
        return <CheckCircle className="w-4 h-4" />
      case 'closed':
        return <XCircle className="w-4 h-4" />
      default:
        return <AlertCircle className="w-4 h-4" />
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const openTickets = tickets.filter(ticket => ticket.status !== 'closed' && ticket.status !== 'resolved')
  const closedTickets = tickets.filter(ticket => ticket.status === 'closed' || ticket.status === 'resolved')

  return (
    <AppLayout title="Support Center" subtitle="Get help with ChainReact and track your support tickets">
      <div className="space-y-6">
        {/* Create Ticket Button */}
        <div className="flex items-center justify-end">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700">
                <Plus className="w-4 h-4 mr-2" />
                New Ticket
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Support Ticket</DialogTitle>
                <DialogDescription>
                  Describe your issue or request and we'll get back to you as soon as possible.
                </DialogDescription>
              </DialogHeader>
              <TicketCreationForm
                newTicket={newTicket}
                setNewTicket={setNewTicket}
                createTicket={createTicket}
                creatingTicket={creatingTicket}
                onCancel={() => setDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>

        {/* Quick Help */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <HelpCircle className="w-5 h-5" />
              <span>Quick Help</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link 
                href="/learn" 
                className="flex items-center space-x-3 p-3 rounded-lg border hover:border-blue-500 hover:bg-blue-50/50 transition-colors cursor-pointer group"
              >
                <FileText className="w-8 h-8 text-blue-500 group-hover:text-blue-600" />
                <div>
                  <h3 className="font-medium group-hover:text-blue-600">Documentation</h3>
                  <p className="text-sm text-muted-foreground">Browse our guides</p>
                </div>
              </Link>
              <Link 
                href="/community" 
                className="flex items-center space-x-3 p-3 rounded-lg border hover:border-green-500 hover:bg-green-50/50 transition-colors cursor-pointer group"
              >
                <MessageSquare className="w-8 h-8 text-green-500 group-hover:text-green-600" />
                <div>
                  <h3 className="font-medium group-hover:text-green-600">Community</h3>
                  <p className="text-sm text-muted-foreground">Ask other users</p>
                </div>
              </Link>
              <Link 
                href="/templates" 
                className="flex items-center space-x-3 p-3 rounded-lg border hover:border-orange-500 hover:bg-orange-50/50 transition-colors cursor-pointer group"
              >
                <AlertTriangle className="w-8 h-8 text-orange-500 group-hover:text-orange-600" />
                <div>
                  <h3 className="font-medium group-hover:text-orange-600">Templates</h3>
                  <p className="text-sm text-muted-foreground">Browse workflow templates</p>
                </div>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Tickets */}
        <Tabs defaultValue="open" className="space-y-4">
          <TabsList>
            <TabsTrigger value="open">
              Open Tickets ({openTickets.length})
            </TabsTrigger>
            <TabsTrigger value="closed">
              Closed Tickets ({closedTickets.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="open" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <LightningLoader size="lg" color="blue" />
              </div>
            ) : openTickets.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-8">
                  <MessageSquare className="w-12 h-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No open tickets</h3>
                  <p className="text-muted-foreground text-center mb-4">
                    You don't have any open support tickets. Create a new ticket if you need help.
                  </p>
                  <Dialog open={emptyDialogOpen} onOpenChange={setEmptyDialogOpen}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="w-4 h-4 mr-2" />
                        Create Ticket
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Create Support Ticket</DialogTitle>
                        <DialogDescription>
                          Describe your issue or request and we'll get back to you as soon as possible.
                        </DialogDescription>
                      </DialogHeader>
                      <TicketCreationForm
                        newTicket={newTicket}
                        setNewTicket={setNewTicket}
                        createTicket={createTicket}
                        creatingTicket={creatingTicket}
                        onCancel={() => setEmptyDialogOpen(false)}
                      />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {openTickets.map((ticket) => {
                  const CategoryIcon = categoryIcons[ticket.category]
                  return (
                    <Card key={ticket.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => router.push(`/support/tickets/${ticket.id}`)}>
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3 mb-2">
                              <CategoryIcon className="w-5 h-5 text-muted-foreground" />
                              <h3 className="font-semibold hover:text-blue-600 transition-colors">{ticket.subject}</h3>
                              <Badge variant="outline" className="text-xs">
                                {ticket.ticket_number}
                              </Badge>
                            </div>
                            <p className="text-muted-foreground text-sm mb-3 line-clamp-2">
                              {ticket.description}
                            </p>
                            <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                              <span>Created {formatDate(ticket.created_at)}</span>
                              <span>•</span>
                              <span>{ticket.support_ticket_responses?.[0]?.count || 0} responses</span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end space-y-2">
                            <Badge className={cn("text-xs", priorityColors[ticket.priority])}>
                              {ticket.priority}
                            </Badge>
                            <Badge className={cn("text-xs", statusColors[ticket.status])}>
                              {getStatusIcon(ticket.status)}
                              <span className="ml-1">{ticket.status.replace('_', ' ')}</span>
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="closed" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <LightningLoader size="lg" color="blue" />
              </div>
            ) : closedTickets.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-8">
                  <CheckCircle className="w-12 h-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No closed tickets</h3>
                  <p className="text-muted-foreground text-center">
                    You don't have any closed support tickets yet.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {closedTickets.map((ticket) => {
                  const CategoryIcon = categoryIcons[ticket.category]
                  return (
                    <Card key={ticket.id} className="hover:shadow-md transition-shadow opacity-75 cursor-pointer" onClick={() => router.push(`/support/tickets/${ticket.id}`)}>
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3 mb-2">
                              <CategoryIcon className="w-5 h-5 text-muted-foreground" />
                              <h3 className="font-semibold hover:text-blue-600 transition-colors">{ticket.subject}</h3>
                              <Badge variant="outline" className="text-xs">
                                {ticket.ticket_number}
                              </Badge>
                            </div>
                            <p className="text-muted-foreground text-sm mb-3 line-clamp-2">
                              {ticket.description}
                            </p>
                            <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                              <span>Created {formatDate(ticket.created_at)}</span>
                              <span>•</span>
                              <span>Updated {formatDate(ticket.updated_at)}</span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end space-y-2">
                            <Badge className={cn("text-xs", priorityColors[ticket.priority])}>
                              {ticket.priority}
                            </Badge>
                            <Badge className={cn("text-xs", statusColors[ticket.status])}>
                              {getStatusIcon(ticket.status)}
                              <span className="ml-1">{ticket.status.replace('_', ' ')}</span>
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  )
}
