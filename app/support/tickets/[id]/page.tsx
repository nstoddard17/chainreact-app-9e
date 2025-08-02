"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { AlertCircle, Clock, CheckCircle, XCircle, MessageSquare, ArrowLeft, Send, User, Shield } from "lucide-react"
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
  support_ticket_responses: SupportTicketResponse[]
}

interface SupportTicketResponse {
  id: string
  message: string
  is_staff_response: boolean
  created_at: string
  updated_at: string
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

export default function TicketDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [ticket, setTicket] = useState<SupportTicket | null>(null)
  const [loading, setLoading] = useState(true)
  const [sendingResponse, setSendingResponse] = useState(false)
  const [newResponse, setNewResponse] = useState("")

  useEffect(() => {
    if (params.id) {
      fetchTicket()
    }
  }, [params.id])

  const fetchTicket = async () => {
    try {
      const response = await fetch(`/api/support/tickets/${params.id}`)
      if (response.ok) {
        const data = await response.json()
        setTicket(data.ticket)
      } else {
        toast.error('Failed to fetch ticket')
        router.push('/support')
      }
    } catch (error) {
      console.error('Error fetching ticket:', error)
      toast.error('Failed to fetch ticket')
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
      const response = await fetch(`/api/support/tickets/${params.id}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: newResponse,
        }),
      })

      if (response.ok) {
        toast.success('Response sent successfully!')
        setNewResponse("")
        fetchTicket() // Refresh ticket data
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

  if (loading) {
    return (
      <AppLayout title="Loading..." subtitle="Fetching ticket details">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      </AppLayout>
    )
  }

  if (!ticket) {
    return (
      <AppLayout title="Ticket Not Found" subtitle="The requested ticket could not be found">
        <div className="flex flex-col items-center justify-center py-8">
          <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Ticket Not Found</h3>
          <p className="text-muted-foreground text-center mb-4">
            The ticket you're looking for doesn't exist or you don't have permission to view it.
          </p>
          <Button onClick={() => router.push('/support')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Support
          </Button>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title={`Ticket ${ticket.ticket_number}`} subtitle={ticket.subject}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => router.push('/support')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Support
          </Button>
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

        {/* Ticket Details */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-xl">{ticket.subject}</CardTitle>
                <CardDescription>
                  Ticket #{ticket.ticket_number} • Created {formatDate(ticket.created_at)}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="prose dark:prose-invert max-w-none">
              <p className="whitespace-pre-wrap">{ticket.description}</p>
            </div>
          </CardContent>
        </Card>

        {/* Responses */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Conversation</h2>
          
          {ticket.support_ticket_responses.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <MessageSquare className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No responses yet</h3>
                <p className="text-muted-foreground text-center">
                  Be the first to add a response to this ticket.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {ticket.support_ticket_responses.map((response) => (
                <Card key={response.id} className={cn(
                  response.is_staff_response ? "border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20" : "border-gray-200 dark:border-gray-700"
                )}>
                  <CardContent className="p-4">
                    <div className="flex items-start space-x-3">
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center",
                        response.is_staff_response 
                          ? "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400" 
                          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                      )}>
                        {response.is_staff_response ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="font-medium">
                            {response.is_staff_response ? 'Support Team' : 'You'}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {formatDate(response.created_at)}
                          </span>
                          {response.is_staff_response && (
                            <Badge variant="outline" className="text-xs">
                              Staff
                            </Badge>
                          )}
                        </div>
                        <div className="prose dark:prose-invert max-w-none">
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
              <CardTitle>Add Response</CardTitle>
              <CardDescription>
                Add additional information or ask a follow-up question.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={newResponse}
                onChange={(e) => setNewResponse(e.target.value)}
                placeholder="Type your response here..."
                rows={4}
                className="resize-none"
              />
              <div className="flex justify-end">
                <Button 
                  onClick={sendResponse}
                  disabled={sendingResponse || !newResponse.trim()}
                  className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                >
                  {sendingResponse ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send Response
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Ticket Status */}
        {ticket.status === 'closed' || ticket.status === 'resolved' ? (
          <Card className="border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20">
            <CardContent className="flex items-center space-x-3 p-4">
              <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
              <div>
                <h3 className="font-medium text-green-800 dark:text-green-200">
                  Ticket {ticket.status === 'resolved' ? 'Resolved' : 'Closed'}
                </h3>
                <p className="text-sm text-green-600 dark:text-green-400">
                  This ticket has been {ticket.status === 'resolved' ? 'resolved' : 'closed'}. 
                  If you have additional questions, please create a new ticket.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </AppLayout>
  )
} 