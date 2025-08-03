"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { ArrowLeft, Send, Clock, CheckCircle, XCircle, AlertTriangle, Bug, Zap, Settings, CreditCard, HelpCircle, FileText, User, Shield, MessageSquare } from "lucide-react"
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
  user_email: string
  user_name: string
  error_details?: any
  system_info?: any
}

interface SupportTicketResponse {
  id: string
  ticket_id: string
  user_id: string
  is_staff_response: boolean
  message: string
  created_at: string
  user_name?: string
  user_email?: string
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

export default function TicketDetailPage() {
  const params = useParams()
  const router = useRouter()
  const ticketId = params.id as string

  const [ticket, setTicket] = useState<SupportTicket | null>(null)
  const [responses, setResponses] = useState<SupportTicketResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [sendingResponse, setSendingResponse] = useState(false)
  const [newResponse, setNewResponse] = useState("")
  const [updatingStatus, setUpdatingStatus] = useState(false)

  useEffect(() => {
    if (ticketId) {
      fetchTicketDetails()
    }
  }, [ticketId])

  const fetchTicketDetails = async () => {
    try {
      const [ticketResponse, responsesResponse] = await Promise.all([
        fetch(`/api/support/tickets/${ticketId}`),
        fetch(`/api/support/tickets/${ticketId}/responses`)
      ])

      if (ticketResponse.ok) {
        const ticketData = await ticketResponse.json()
        setTicket(ticketData.ticket)
      } else {
        toast.error('Failed to fetch ticket details')
        router.push('/support')
        return
      }

      if (responsesResponse.ok) {
        const responsesData = await responsesResponse.json()
        setResponses(responsesData.responses || [])
      }
    } catch (error) {
      console.error('Error fetching ticket details:', error)
      toast.error('Failed to fetch ticket details')
      router.push('/support')
    } finally {
      setLoading(false)
    }
  }

  const sendResponse = async () => {
    if (!newResponse.trim()) {
      toast.error('Please enter a message')
      return
    }

    setSendingResponse(true)
    try {
      const response = await fetch(`/api/support/tickets/${ticketId}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: newResponse,
          isStaffResponse: false,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setResponses(prev => [...prev, data.response])
        setNewResponse("")
        toast.success('Response sent successfully!')
        // Refresh ticket details to get updated status
        fetchTicketDetails()
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to send response')
      }
    } catch (error) {
      console.error('Error sending response:', error)
      toast.error('Failed to send response')
    } finally {
      setSendingResponse(false)
    }
  }

  const updateTicketStatus = async (newStatus: string) => {
    if (!ticket) return

    setUpdatingStatus(true)
    try {
      const response = await fetch(`/api/support/tickets/${ticketId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: newStatus,
        }),
      })

      if (response.ok) {
        setTicket(prev => prev ? { ...prev, status: newStatus as any } : null)
        toast.success('Ticket status updated successfully!')
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to update status')
      }
    } catch (error) {
      console.error('Error updating status:', error)
      toast.error('Failed to update status')
    } finally {
      setUpdatingStatus(false)
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return <AlertTriangle className="w-4 h-4" />
      case 'in_progress':
        return <Clock className="w-4 h-4" />
      case 'waiting_for_user':
        return <Clock className="w-4 h-4" />
      case 'resolved':
        return <CheckCircle className="w-4 h-4" />
      case 'closed':
        return <XCircle className="w-4 h-4" />
      default:
        return <AlertTriangle className="w-4 h-4" />
    }
  }

  if (loading) {
    return (
      <AppLayout title="Loading Ticket..." subtitle="">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      </AppLayout>
    )
  }

  if (!ticket) {
    return (
      <AppLayout title="Ticket Not Found" subtitle="">
        <div className="flex flex-col items-center justify-center py-8">
          <h3 className="text-lg font-medium mb-2">Ticket not found</h3>
          <p className="text-muted-foreground mb-4">The ticket you're looking for doesn't exist or you don't have access to it.</p>
          <Button onClick={() => router.push('/support')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Support
          </Button>
        </div>
      </AppLayout>
    )
  }

  const CategoryIcon = categoryIcons[ticket.category]

  return (
    <AppLayout title={`Ticket ${ticket.ticket_number}`} subtitle={ticket.subject}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="outline" onClick={() => router.push('/support')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Support
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Ticket #{ticket.ticket_number}</h1>
              <p className="text-muted-foreground">{ticket.subject}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Badge className={cn("text-sm", priorityColors[ticket.priority])}>
              {ticket.priority}
            </Badge>
            <Badge className={cn("text-sm", statusColors[ticket.status])}>
              {getStatusIcon(ticket.status)}
              <span className="ml-1">{ticket.status.replace('_', ' ')}</span>
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Original Ticket */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <CategoryIcon className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-lg">Original Issue</CardTitle>
                    <CardDescription>
                      Created by {ticket.user_name || ticket.user_email} on {formatDate(ticket.created_at)}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none">
                  <p className="whitespace-pre-wrap">{ticket.description}</p>
                </div>
                {ticket.error_details && (
                  <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <h4 className="font-medium text-red-800 dark:text-red-200 mb-2">Error Details</h4>
                    <pre className="text-sm text-red-700 dark:text-red-300 overflow-x-auto">
                      {JSON.stringify(ticket.error_details, null, 2)}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Responses */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Conversation</h2>
              {responses.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-8">
                    <MessageSquare className="w-12 h-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No responses yet</h3>
                    <p className="text-muted-foreground text-center">
                      Be the first to respond to this ticket.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {responses.map((response) => (
                    <Card key={response.id} className={cn(
                      "border-l-4",
                      response.is_staff_response 
                        ? "border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20" 
                        : "border-l-green-500 bg-green-50/50 dark:bg-green-950/20"
                    )}>
                      <CardContent className="p-4">
                        <div className="flex items-start space-x-3">
                          <Avatar className="w-8 h-8">
                            <AvatarImage src="" />
                            <AvatarFallback className="text-xs">
                              {response.is_staff_response ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                              <span className="font-medium text-sm">
                                {response.is_staff_response ? 'Support Team' : (response.user_name || response.user_email || 'You')}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {response.is_staff_response ? 'Staff' : 'User'}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {formatDate(response.created_at)}
                              </span>
                            </div>
                            <div className="prose prose-sm max-w-none">
                              <p className="whitespace-pre-wrap">{response.message}</p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Add Response */}
            {ticket.status !== 'closed' && ticket.status !== 'resolved' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Add Response</CardTitle>
                  <CardDescription>
                    Add a response to this ticket. Your response will be sent to the support team.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="response">Your Message</Label>
                    <Textarea
                      id="response"
                      value={newResponse}
                      onChange={(e) => setNewResponse(e.target.value)}
                      placeholder="Type your response here..."
                      rows={4}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button 
                      onClick={sendResponse}
                      disabled={sendingResponse || !newResponse.trim()}
                      className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                    >
                      <Send className="w-4 h-4 mr-2" />
                      {sendingResponse ? 'Sending...' : 'Send Response'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Ticket Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Ticket Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Category</Label>
                  <div className="flex items-center space-x-2 mt-1">
                    <CategoryIcon className="w-4 h-4 text-muted-foreground" />
                    <span className="capitalize">{ticket.category.replace('_', ' ')}</span>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Priority</Label>
                  <Badge className={cn("mt-1", priorityColors[ticket.priority])}>
                    {ticket.priority}
                  </Badge>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Status</Label>
                  <Badge className={cn("mt-1", statusColors[ticket.status])}>
                    {getStatusIcon(ticket.status)}
                    <span className="ml-1">{ticket.status.replace('_', ' ')}</span>
                  </Badge>
                </div>
                <Separator />
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Created</Label>
                  <p className="text-sm mt-1">{formatDate(ticket.created_at)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Last Updated</Label>
                  <p className="text-sm mt-1">{formatDate(ticket.updated_at)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Responses</Label>
                  <p className="text-sm mt-1">{responses.length} message{responses.length !== 1 ? 's' : ''}</p>
                </div>
              </CardContent>
            </Card>

            {/* Status Update */}
            {ticket.status !== 'closed' && ticket.status !== 'resolved' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Update Status</CardTitle>
                  <CardDescription>
                    Mark this ticket as resolved or closed if the issue has been addressed.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    onClick={() => updateTicketStatus('resolved')}
                    disabled={updatingStatus}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Mark as Resolved
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    onClick={() => updateTicketStatus('closed')}
                    disabled={updatingStatus}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Close Ticket
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
} 
                                {response.is_staff_response ? 'Support Team' : (response.user_name || response.user_email || 'You')}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {response.is_staff_response ? 'Staff' : 'User'}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {formatDate(response.created_at)}
                              </span>
                            </div>
                            <div className="prose prose-sm max-w-none">
                              <p className="whitespace-pre-wrap">{response.message}</p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Add Response */}
            {ticket.status !== 'closed' && ticket.status !== 'resolved' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Add Response</CardTitle>
                  <CardDescription>
                    Add a response to this ticket. Your response will be sent to the support team.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="response">Your Message</Label>
                    <Textarea
                      id="response"
                      value={newResponse}
                      onChange={(e) => setNewResponse(e.target.value)}
                      placeholder="Type your response here..."
                      rows={4}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button 
                      onClick={sendResponse}
                      disabled={sendingResponse || !newResponse.trim()}
                      className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                    >
                      <Send className="w-4 h-4 mr-2" />
                      {sendingResponse ? 'Sending...' : 'Send Response'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Ticket Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Ticket Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Category</Label>
                  <div className="flex items-center space-x-2 mt-1">
                    <CategoryIcon className="w-4 h-4 text-muted-foreground" />
                    <span className="capitalize">{ticket.category.replace('_', ' ')}</span>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Priority</Label>
                  <Badge className={cn("mt-1", priorityColors[ticket.priority])}>
                    {ticket.priority}
                  </Badge>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Status</Label>
                  <Badge className={cn("mt-1", statusColors[ticket.status])}>
                    {getStatusIcon(ticket.status)}
                    <span className="ml-1">{ticket.status.replace('_', ' ')}</span>
                  </Badge>
                </div>
                <Separator />
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Created</Label>
                  <p className="text-sm mt-1">{formatDate(ticket.created_at)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Last Updated</Label>
                  <p className="text-sm mt-1">{formatDate(ticket.updated_at)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Responses</Label>
                  <p className="text-sm mt-1">{responses.length} message{responses.length !== 1 ? 's' : ''}</p>
                </div>
              </CardContent>
            </Card>

            {/* Status Update */}
            {ticket.status !== 'closed' && ticket.status !== 'resolved' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Update Status</CardTitle>
                  <CardDescription>
                    Mark this ticket as resolved or closed if the issue has been addressed.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    onClick={() => updateTicketStatus('resolved')}
                    disabled={updatingStatus}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Mark as Resolved
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    onClick={() => updateTicketStatus('closed')}
                    disabled={updatingStatus}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Close Ticket
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
} 
                                {response.is_staff_response ? 'Support Team' : (response.user_name || response.user_email || 'You')}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {response.is_staff_response ? 'Staff' : 'User'}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {formatDate(response.created_at)}
                              </span>
                            </div>
                            <div className="prose prose-sm max-w-none">
                              <p className="whitespace-pre-wrap">{response.message}</p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Add Response */}
            {ticket.status !== 'closed' && ticket.status !== 'resolved' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Add Response</CardTitle>
                  <CardDescription>
                    Add a response to this ticket. Your response will be sent to the support team.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="response">Your Message</Label>
                    <Textarea
                      id="response"
                      value={newResponse}
                      onChange={(e) => setNewResponse(e.target.value)}
                      placeholder="Type your response here..."
                      rows={4}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button 
                      onClick={sendResponse}
                      disabled={sendingResponse || !newResponse.trim()}
                      className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                    >
                      <Send className="w-4 h-4 mr-2" />
                      {sendingResponse ? 'Sending...' : 'Send Response'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Ticket Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Ticket Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Category</Label>
                  <div className="flex items-center space-x-2 mt-1">
                    <CategoryIcon className="w-4 h-4 text-muted-foreground" />
                    <span className="capitalize">{ticket.category.replace('_', ' ')}</span>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Priority</Label>
                  <Badge className={cn("mt-1", priorityColors[ticket.priority])}>
                    {ticket.priority}
                  </Badge>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Status</Label>
                  <Badge className={cn("mt-1", statusColors[ticket.status])}>
                    {getStatusIcon(ticket.status)}
                    <span className="ml-1">{ticket.status.replace('_', ' ')}</span>
                  </Badge>
                </div>
                <Separator />
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Created</Label>
                  <p className="text-sm mt-1">{formatDate(ticket.created_at)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Last Updated</Label>
                  <p className="text-sm mt-1">{formatDate(ticket.updated_at)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Responses</Label>
                  <p className="text-sm mt-1">{responses.length} message{responses.length !== 1 ? 's' : ''}</p>
                </div>
              </CardContent>
            </Card>

            {/* Status Update */}
            {ticket.status !== 'closed' && ticket.status !== 'resolved' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Update Status</CardTitle>
                  <CardDescription>
                    Mark this ticket as resolved or closed if the issue has been addressed.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    onClick={() => updateTicketStatus('resolved')}
                    disabled={updatingStatus}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Mark as Resolved
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    onClick={() => updateTicketStatus('closed')}
                    disabled={updatingStatus}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Close Ticket
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
} 
                                {response.is_staff_response ? 'Support Team' : (response.user_name || response.user_email || 'You')}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {response.is_staff_response ? 'Staff' : 'User'}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {formatDate(response.created_at)}
                              </span>
                            </div>
                            <div className="prose prose-sm max-w-none">
                              <p className="whitespace-pre-wrap">{response.message}</p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Add Response */}
            {ticket.status !== 'closed' && ticket.status !== 'resolved' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Add Response</CardTitle>
                  <CardDescription>
                    Add a response to this ticket. Your response will be sent to the support team.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="response">Your Message</Label>
                    <Textarea
                      id="response"
                      value={newResponse}
                      onChange={(e) => setNewResponse(e.target.value)}
                      placeholder="Type your response here..."
                      rows={4}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button 
                      onClick={sendResponse}
                      disabled={sendingResponse || !newResponse.trim()}
                      className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                    >
                      <Send className="w-4 h-4 mr-2" />
                      {sendingResponse ? 'Sending...' : 'Send Response'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Ticket Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Ticket Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Category</Label>
                  <div className="flex items-center space-x-2 mt-1">
                    <CategoryIcon className="w-4 h-4 text-muted-foreground" />
                    <span className="capitalize">{ticket.category.replace('_', ' ')}</span>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Priority</Label>
                  <Badge className={cn("mt-1", priorityColors[ticket.priority])}>
                    {ticket.priority}
                  </Badge>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Status</Label>
                  <Badge className={cn("mt-1", statusColors[ticket.status])}>
                    {getStatusIcon(ticket.status)}
                    <span className="ml-1">{ticket.status.replace('_', ' ')}</span>
                  </Badge>
                </div>
                <Separator />
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Created</Label>
                  <p className="text-sm mt-1">{formatDate(ticket.created_at)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Last Updated</Label>
                  <p className="text-sm mt-1">{formatDate(ticket.updated_at)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Responses</Label>
                  <p className="text-sm mt-1">{responses.length} message{responses.length !== 1 ? 's' : ''}</p>
                </div>
              </CardContent>
            </Card>

            {/* Status Update */}
            {ticket.status !== 'closed' && ticket.status !== 'resolved' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Update Status</CardTitle>
                  <CardDescription>
                    Mark this ticket as resolved or closed if the issue has been addressed.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    onClick={() => updateTicketStatus('resolved')}
                    disabled={updatingStatus}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Mark as Resolved
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    onClick={() => updateTicketStatus('closed')}
                    disabled={updatingStatus}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Close Ticket
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
} 
                                {response.is_staff_response ? 'Support Team' : (response.user_name || response.user_email || 'You')}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {response.is_staff_response ? 'Staff' : 'User'}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {formatDate(response.created_at)}
                              </span>
                            </div>
                            <div className="prose prose-sm max-w-none">
                              <p className="whitespace-pre-wrap">{response.message}</p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Add Response */}
            {ticket.status !== 'closed' && ticket.status !== 'resolved' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Add Response</CardTitle>
                  <CardDescription>
                    Add a response to this ticket. Your response will be sent to the support team.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="response">Your Message</Label>
                    <Textarea
                      id="response"
                      value={newResponse}
                      onChange={(e) => setNewResponse(e.target.value)}
                      placeholder="Type your response here..."
                      rows={4}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button 
                      onClick={sendResponse}
                      disabled={sendingResponse || !newResponse.trim()}
                      className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                    >
                      <Send className="w-4 h-4 mr-2" />
                      {sendingResponse ? 'Sending...' : 'Send Response'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Ticket Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Ticket Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Category</Label>
                  <div className="flex items-center space-x-2 mt-1">
                    <CategoryIcon className="w-4 h-4 text-muted-foreground" />
                    <span className="capitalize">{ticket.category.replace('_', ' ')}</span>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Priority</Label>
                  <Badge className={cn("mt-1", priorityColors[ticket.priority])}>
                    {ticket.priority}
                  </Badge>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Status</Label>
                  <Badge className={cn("mt-1", statusColors[ticket.status])}>
                    {getStatusIcon(ticket.status)}
                    <span className="ml-1">{ticket.status.replace('_', ' ')}</span>
                  </Badge>
                </div>
                <Separator />
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Created</Label>
                  <p className="text-sm mt-1">{formatDate(ticket.created_at)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Last Updated</Label>
                  <p className="text-sm mt-1">{formatDate(ticket.updated_at)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Responses</Label>
                  <p className="text-sm mt-1">{responses.length} message{responses.length !== 1 ? 's' : ''}</p>
                </div>
              </CardContent>
            </Card>

            {/* Status Update */}
            {ticket.status !== 'closed' && ticket.status !== 'resolved' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Update Status</CardTitle>
                  <CardDescription>
                    Mark this ticket as resolved or closed if the issue has been addressed.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    onClick={() => updateTicketStatus('resolved')}
                    disabled={updatingStatus}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Mark as Resolved
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    onClick={() => updateTicketStatus('closed')}
                    disabled={updatingStatus}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Close Ticket
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
} 
                                {response.is_staff_response ? 'Support Team' : (response.user_name || response.user_email || 'You')}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {response.is_staff_response ? 'Staff' : 'User'}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {formatDate(response.created_at)}
                              </span>
                            </div>
                            <div className="prose prose-sm max-w-none">
                              <p className="whitespace-pre-wrap">{response.message}</p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Add Response */}
            {ticket.status !== 'closed' && ticket.status !== 'resolved' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Add Response</CardTitle>
                  <CardDescription>
                    Add a response to this ticket. Your response will be sent to the support team.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="response">Your Message</Label>
                    <Textarea
                      id="response"
                      value={newResponse}
                      onChange={(e) => setNewResponse(e.target.value)}
                      placeholder="Type your response here..."
                      rows={4}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button 
                      onClick={sendResponse}
                      disabled={sendingResponse || !newResponse.trim()}
                      className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                    >
                      <Send className="w-4 h-4 mr-2" />
                      {sendingResponse ? 'Sending...' : 'Send Response'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Ticket Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Ticket Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Category</Label>
                  <div className="flex items-center space-x-2 mt-1">
                    <CategoryIcon className="w-4 h-4 text-muted-foreground" />
                    <span className="capitalize">{ticket.category.replace('_', ' ')}</span>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Priority</Label>
                  <Badge className={cn("mt-1", priorityColors[ticket.priority])}>
                    {ticket.priority}
                  </Badge>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Status</Label>
                  <Badge className={cn("mt-1", statusColors[ticket.status])}>
                    {getStatusIcon(ticket.status)}
                    <span className="ml-1">{ticket.status.replace('_', ' ')}</span>
                  </Badge>
                </div>
                <Separator />
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Created</Label>
                  <p className="text-sm mt-1">{formatDate(ticket.created_at)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Last Updated</Label>
                  <p className="text-sm mt-1">{formatDate(ticket.updated_at)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Responses</Label>
                  <p className="text-sm mt-1">{responses.length} message{responses.length !== 1 ? 's' : ''}</p>
                </div>
              </CardContent>
            </Card>

            {/* Status Update */}
            {ticket.status !== 'closed' && ticket.status !== 'resolved' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Update Status</CardTitle>
                  <CardDescription>
                    Mark this ticket as resolved or closed if the issue has been addressed.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    onClick={() => updateTicketStatus('resolved')}
                    disabled={updatingStatus}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Mark as Resolved
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    onClick={() => updateTicketStatus('closed')}
                    disabled={updatingStatus}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Close Ticket
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
} 