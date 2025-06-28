"use client"

import React, { useState, useEffect, useRef } from "react"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useAuthStore } from "@/stores/authStore"
import AppLayout from "@/components/layout/AppLayout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import {
  Send,
  Bot,
  User,
  Calendar,
  Mail,
  FileText,
  Sparkles,
  CheckCircle,
  AlertCircle,
  Loader2,
  Users,
  Code,
  DollarSign,
  MessageSquare,
  Zap
} from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/utils/supabase/client"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  metadata?: {
    type?: "calendar" | "email" | "file" | "confirmation" | "social" | "crm" | "ecommerce" | "developer" | "productivity" | "communication" | "integration_not_connected" | "error"
    data?: any
    requiresConfirmation?: boolean
    integration?: string
    action?: string
  }
}

export default function AIAssistantContent() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "Hi! I'm your AI assistant. I can help you with all your connected integrations by checking your data and performing actions. If you're not sure what I can do, just ask me!",
      timestamp: new Date(),
    }
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [pendingConfirmation, setPendingConfirmation] = useState<any>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const { toast } = useToast()
  const { integrations } = useIntegrationStore()
  const { user } = useAuthStore()

  // Cleanup function for any pending requests when component unmounts
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const getIntegrationIcon = (provider: string) => {
    switch (provider) {
      case "google-calendar":
        return <Calendar className="w-4 h-4" />
      case "gmail":
      case "microsoft-outlook":
        return <Mail className="w-4 h-4" />
      case "google-drive":
      case "onedrive":
      case "dropbox":
      case "box":
        return <FileText className="w-4 h-4" />
      case "slack":
      case "discord":
      case "teams":
        return <Users className="w-4 h-4" />
      case "twitter":
      case "facebook":
      case "instagram":
      case "linkedin":
      case "tiktok":
      case "youtube":
        return <Sparkles className="w-4 h-4" />
      case "github":
      case "gitlab":
        return <Code className="w-4 h-4" />
      case "notion":
      case "trello":
      case "airtable":
        return <FileText className="w-4 h-4" />
      case "hubspot":
      case "shopify":
      case "stripe":
      case "paypal":
        return <DollarSign className="w-4 h-4" />
      default:
        return <Sparkles className="w-4 h-4" />
    }
  }

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    // Cancel any existing requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    let retryCount = 0
    const maxRetries = 2

    while (retryCount <= maxRetries) {
      try {
        // Get the current session token
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        
        if (!session) {
          throw new Error("No active session")
        }

        // Create a new AbortController and store the reference
        abortControllerRef.current = new AbortController()
        const timeoutId = setTimeout(() => {
          if (abortControllerRef.current) abortControllerRef.current.abort()
        }, 30000) // 30 second timeout

        const response = await fetch("/api/ai/assistant", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            message: userMessage.content,
          }),
          signal: abortControllerRef.current.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          const errorText = await response.text()
          console.error("API Error:", response.status, errorText)
          throw new Error(`API error: ${response.status} - ${errorText}`)
        }

        const data = await response.json()

        if (!data || !data.content) {
          throw new Error("Invalid response format from API")
        }

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.content,
          timestamp: new Date(),
          metadata: data.metadata,
        }

        setMessages(prev => [...prev, assistantMessage])

        if (data.metadata?.requiresConfirmation) {
          setPendingConfirmation(data.metadata)
        }

        // Success - break out of retry loop
        break

      } catch (error) {
        // Clear the abortControllerRef if it was aborted
        if (error instanceof Error && error.name === 'AbortError') {
          abortControllerRef.current = null;
        }
        
        console.error(`Error sending message (attempt ${retryCount + 1}):`, error)
        
        // If this is the last retry, show error
        if (retryCount === maxRetries) {
          let errorMessage = "Failed to send message. Please try again."
          
          if (error instanceof Error) {
            if (error.name === 'AbortError') {
              errorMessage = "Request timed out. Please try again."
            } else if (error.message.includes('API error:')) {
              errorMessage = error.message.replace('API error: ', '')
            } else if (error.message.includes('No active session')) {
              errorMessage = "Session expired. Please refresh the page and try again."
            } else if (error.message.includes('Failed to fetch')) {
              errorMessage = "Network error. Please check your connection and try again."
            }
          }
          
          // Add error message to chat
          const errorAssistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: `Sorry, I encountered an error: ${errorMessage}`,
            timestamp: new Date(),
            metadata: { type: "error" },
          }
          
          setMessages(prev => [...prev, errorAssistantMessage])
          
          toast({
            title: "Error",
            description: errorMessage,
            variant: "destructive",
          })
        } else {
          // Wait before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)))
        }
        
        retryCount++
      }
    }
    
    // Clean up the abort controller reference
    abortControllerRef.current = null;
    setIsLoading(false)
  }

  const handleConfirmAction = async (confirmed: boolean) => {
    if (!pendingConfirmation) return

    // Cancel any existing requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Create a new AbortController
    abortControllerRef.current = new AbortController();

    try {
      // Get the current session token
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error("No active session")
      }

      const response = await fetch("/api/ai/confirm-action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: pendingConfirmation.action,
          confirmed,
          parameters: pendingConfirmation.parameters,
        }),
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        throw new Error("Failed to confirm action")
      }

      const data = await response.json()

      const confirmationMessage: Message = {
        id: (Date.now() + 2).toString(),
        role: "assistant",
        content: confirmed ? data.content : "Action cancelled.",
        timestamp: new Date(),
        metadata: confirmed ? { type: "confirmation" } : undefined,
      }

      setMessages(prev => [...prev, confirmationMessage])
    } catch (error) {
      console.error("Error confirming action:", error)
      toast({
        title: "Error",
        description: "Failed to confirm action. Please try again.",
        variant: "destructive",
      })
    } finally {
      abortControllerRef.current = null;
      setPendingConfirmation(null)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const renderMessageContent = (content: string) => {
    // Convert markdown-style links [text](url) to clickable links
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
    const parts = content.split(linkRegex)
    
    if (parts.length === 1) {
      return <div className="whitespace-pre-wrap">{content}</div>
    }
    
    const elements = []
    for (let i = 0; i < parts.length; i += 3) {
      if (i + 2 < parts.length) {
        // Add text before link
        if (parts[i]) {
          elements.push(<span key={`text-${i}`} className="whitespace-pre-wrap">{parts[i]}</span>)
        }
        // Add link
        elements.push(
          <a 
            key={`link-${i}`}
            href={parts[i + 2]} 
            className="text-blue-600 hover:text-blue-800 underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {parts[i + 1]}
          </a>
        )
      } else {
        // Add remaining text
        elements.push(<span key={`text-${i}`} className="whitespace-pre-wrap">{parts[i]}</span>)
      }
    }
    
    return <div>{elements}</div>
  }

  const renderCalendarView = (events: any[]) => {
    if (!events || events.length === 0) return null

    // Group events by date using the new date field
    const eventsByDate = events.reduce((acc, event) => {
      const dateKey = event.date || new Date(event.start).toDateString()
      
      if (!acc[dateKey]) {
        acc[dateKey] = []
      }
      acc[dateKey].push(event)
      return acc
    }, {} as Record<string, any[]>)

    // Sort dates
    const sortedDates = Object.keys(eventsByDate).sort((a, b) => {
      const dateA = new Date(a)
      const dateB = new Date(b)
      return dateA.getTime() - dateB.getTime()
    })

    return (
      <div className="mt-3 p-4 bg-background rounded-lg border">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5" />
          <span className="font-medium text-lg">Calendar View</span>
        </div>
        
        <div className="space-y-4">
          {sortedDates.map((dateKey) => {
            const dayEvents = eventsByDate[dateKey]
            const firstEvent = dayEvents[0]
            const displayDate = firstEvent.date || new Date(dateKey).toLocaleDateString('en-US', { 
              weekday: 'long', 
              month: 'long', 
              day: 'numeric' 
            })
            
            return (
              <div key={dateKey} className="border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-3">
                  <div className="text-sm font-medium text-muted-foreground">
                    {displayDate}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    ({dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''})
                  </div>
                </div>
                
                <div className="space-y-2">
                  {dayEvents.map((event: any, index: number) => {
                    // Use the pre-formatted times if available, otherwise format them
                    const startTime = event.startTime || new Date(event.start).toLocaleTimeString('en-US', { 
                      hour: 'numeric', 
                      minute: '2-digit',
                      hour12: true 
                    })
                    const endTime = event.endTime || new Date(event.end).toLocaleTimeString('en-US', { 
                      hour: 'numeric', 
                      minute: '2-digit',
                      hour12: true 
                    })
                    
                    // Check if this is a multi-day event
                    const startDate = new Date(event.start)
                    const endDate = new Date(event.end)
                    const isMultiDay = startDate.toDateString() !== endDate.toDateString()
                    
                    // Format dates for display
                    const startDateFormatted = startDate.toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric' 
                    })
                    const endDateFormatted = endDate.toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric' 
                    })
                    
                    return (
                      <div key={index} className="flex items-start gap-3 p-3 bg-muted/50 rounded-md">
                        <div className="flex-shrink-0 w-2 h-2 bg-primary rounded-full mt-2"></div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm mb-1">{event.title}</div>
                          
                          {/* Time display */}
                          <div className="text-xs text-muted-foreground mb-2">
                            {event.isAllDay ? (
                              <span className="font-medium">
                                {isMultiDay ? `${startDateFormatted} - ${endDateFormatted}` : 'All day'}
                              </span>
                            ) : (
                              <span>
                                {isMultiDay 
                                  ? `${startDateFormatted} ${startTime} - ${endDateFormatted} ${endTime}`
                                  : `${startTime} - ${endTime}`
                                }
                              </span>
                            )}
                          </div>
                          
                          {/* Location */}
                          {event.location && (
                            <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                              <span>📍</span>
                              <span>{event.location}</span>
                            </div>
                          )}
                          
                          {/* Description */}
                          {event.description && (
                            <div className="text-xs text-muted-foreground mb-2">
                              <div className="line-clamp-2">{event.description}</div>
                            </div>
                          )}
                          
                          {/* Calendar name */}
                          <div className="text-xs text-blue-600 font-medium">
                            {event.calendar}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <AppLayout title="AI Assistant" subtitle="Your intelligent integration companion">
      <div className="flex flex-col h-[calc(100vh-120px)]">
        <Card className="overflow-hidden flex-1">
          <CardContent className="p-6 h-full overflow-y-auto">
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-3",
                    message.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {message.role === "assistant" && (
                    <div className="flex-shrink-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                      <Bot className="w-4 h-4 text-primary-foreground" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[80%] rounded-lg px-4 py-2",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                  >
                    {renderMessageContent(message.content)}
                    
                    {/* Metadata display */}
                    {message.metadata?.type === "calendar" && message.metadata.data && (
                      renderCalendarView(message.metadata.data)
                    )}
                    
                    {message.metadata?.type === "email" && message.metadata.data && (
                      <div className="mt-3 p-3 bg-background rounded-lg border">
                        <div className="flex items-center gap-2 mb-2">
                          <Mail className="w-4 h-4" />
                          <span className="font-medium">Email Messages</span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {message.metadata.data.length} unread emails found
                        </div>
                      </div>
                    )}
                    
                    {message.metadata?.type === "file" && message.metadata.data && (
                      <div className="mt-3 p-3 bg-background rounded-lg border">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="w-4 h-4" />
                          <span className="font-medium">Files Found</span>
                        </div>
                        {message.metadata.data.map((file: any, index: number) => (
                          <div key={index} className="text-sm space-y-1">
                            <div className="font-medium">{file.name}</div>
                            <div className="text-muted-foreground">
                              {file.provider} • {new Date(file.modified).toLocaleDateString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {message.metadata?.type === "social" && message.metadata.data && (
                      <div className="mt-3 p-3 bg-background rounded-lg border">
                        <div className="flex items-center gap-2 mb-2">
                          <Sparkles className="w-4 h-4" />
                          <span className="font-medium">Social Media Posts</span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {message.metadata.data.length} posts found
                        </div>
                      </div>
                    )}
                    
                    {message.metadata?.type === "crm" && message.metadata.data && (
                      <div className="mt-3 p-3 bg-background rounded-lg border">
                        <div className="flex items-center gap-2 mb-2">
                          <Users className="w-4 h-4" />
                          <span className="font-medium">CRM Records</span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {message.metadata.data.length} records found
                        </div>
                      </div>
                    )}
                    
                    {message.metadata?.type === "ecommerce" && message.metadata.data && (
                      <div className="mt-3 p-3 bg-background rounded-lg border">
                        <div className="flex items-center gap-2 mb-2">
                          <DollarSign className="w-4 h-4" />
                          <span className="font-medium">E-commerce Orders</span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {message.metadata.data.length} orders found
                        </div>
                      </div>
                    )}
                    
                    {message.metadata?.type === "developer" && message.metadata.data && (
                      <div className="mt-3 p-3 bg-background rounded-lg border">
                        <div className="flex items-center gap-2 mb-2">
                          <Code className="w-4 h-4" />
                          <span className="font-medium">Developer Repositories</span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {message.metadata.data.length} repositories found
                        </div>
                      </div>
                    )}
                    
                    {message.metadata?.type === "productivity" && message.metadata.data && (
                      <div className="mt-3 p-3 bg-background rounded-lg border">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="w-4 h-4" />
                          <span className="font-medium">Productivity Items</span>
                        </div>
                        <div className="space-y-2">
                          {message.metadata.data.map((item: any, index: number) => (
                            <div key={index} className="flex items-start gap-3 p-2 bg-muted/50 rounded-md">
                              <div className="flex-shrink-0 w-2 h-2 bg-primary rounded-full mt-2"></div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm mb-1">
                                  {item.url ? (
                                    <a 
                                      href={item.url} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="text-blue-600 hover:text-blue-800 underline"
                                    >
                                      {item.title}
                                    </a>
                                  ) : (
                                    item.title
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {item.provider}
                                  {item.last_edited && (
                                    <span> • Last edited {new Date(item.last_edited).toLocaleDateString()}</span>
                                  )}
                                  {item.created && !item.last_edited && (
                                    <span> • Created {new Date(item.created).toLocaleDateString()}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {message.metadata?.type === "communication" && message.metadata.data && (
                      <div className="mt-3 p-3 bg-background rounded-lg border">
                        <div className="flex items-center gap-2 mb-2">
                          <MessageSquare className="w-4 h-4" />
                          <span className="font-medium">Communication Channels</span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {message.metadata.data.length} channels found
                        </div>
                      </div>
                    )}
                    
                    {message.metadata?.type === "integration_not_connected" && (
                      <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertCircle className="w-4 h-4 text-blue-600" />
                          <span className="font-medium text-blue-800">Integration Not Connected</span>
                        </div>
                        <p className="text-sm text-blue-700 mb-3">
                          You need to connect {message.metadata.integration} to use this feature.
                        </p>
                        <a 
                          href="/integrations" 
                          className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 underline"
                        >
                          Go to Integrations Page
                        </a>
                      </div>
                    )}
                    
                    {message.metadata?.type === "confirmation" && (
                      <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center gap-2 text-green-700">
                          <CheckCircle className="w-4 h-4" />
                          <span className="font-medium">Action completed successfully</span>
                        </div>
                      </div>
                    )}
                  </div>
                  {message.role === "user" && (
                    <div className="flex-shrink-0 w-8 h-8 bg-muted rounded-full flex items-center justify-center">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              ))}
              
              {isLoading && (
                <div className="flex gap-3 justify-start">
                  <div className="flex-shrink-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                    <Bot className="w-4 h-4 text-primary-foreground" />
                  </div>
                  <div className="bg-muted rounded-lg px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Thinking...</span>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          </CardContent>
        </Card>

        {/* Confirmation Dialog */}
        {pendingConfirmation && (
          <Card className="bg-yellow-50 border-yellow-200 mt-4">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-yellow-600" />
                <span className="font-medium text-yellow-800">Confirm Action</span>
              </div>
              <p className="text-sm text-yellow-700 mb-3">
                Are you sure you want to {pendingConfirmation.action}?
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleConfirmAction(true)}
                  className="bg-yellow-600 hover:bg-yellow-700"
                >
                  Confirm
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleConfirmAction(false)}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Input Area */}
        <Card className="mt-4 mb-0">
          <CardContent className="p-4">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask me anything about your integrations..."
                className="flex-1"
                disabled={isLoading}
              />
              <Button onClick={handleSendMessage} disabled={isLoading || !input.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  )
} 