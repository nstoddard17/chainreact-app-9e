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

export default function SupportPage() {
  const router = useRouter()
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [creatingTicket, setCreatingTicket] = useState(false)
  const [newTicket, setNewTicket] = useState({
    subject: "",
    description: "",
    priority: "medium" as const,
    category: "general" as const,
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
      const response = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newTicket),
      })

      if (response.ok) {
        const data = await response.json()
        toast.success(`Ticket ${data.ticket.ticket_number} created successfully!`)
        setNewTicket({
          subject: "",
          description: "",
          priority: "medium",
          category: "general",
        })
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
    <AppLayout title="Support Center" subtitle="Get help with ChainReact">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Support Center</h1>
            <p className="text-muted-foreground">Get help with ChainReact and track your support tickets</p>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700">
                <Plus className="w-4 h-4 mr-2" />
                New Ticket
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Support Ticket</DialogTitle>
                <DialogDescription>
                  Describe your issue or request and we'll get back to you as soon as possible.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="subject">Subject *</Label>
                  <Input
                    id="subject"
                    value={newTicket.subject}
                    onChange={(e) => setNewTicket(prev => ({ ...prev, subject: e.target.value }))}
                    placeholder="Brief description of your issue"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="category">Category</Label>
                    <Select
                      value={newTicket.category}
                      onValueChange={(value: any) => setNewTicket(prev => ({ ...prev, category: value }))}
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
                      onValueChange={(value: any) => setNewTicket(prev => ({ ...prev, priority: value }))}
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
                    onChange={(e) => setNewTicket(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Please provide detailed information about your issue..."
                    rows={6}
                  />
                </div>
                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setNewTicket({
                    subject: "",
                    description: "",
                    priority: "medium",
                    category: "general",
                  })}>
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
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              </div>
            ) : openTickets.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-8">
                  <MessageSquare className="w-12 h-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No open tickets</h3>
                  <p className="text-muted-foreground text-center mb-4">
                    You don't have any open support tickets. Create a new ticket if you need help.
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="w-4 h-4 mr-2" />
                        Create Ticket
                      </Button>
                    </DialogTrigger>
                    {/* Same dialog content as above */}
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
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
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

}

}
