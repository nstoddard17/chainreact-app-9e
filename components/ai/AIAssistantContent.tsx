"use client"

import React, { useState, useEffect, useRef } from "react"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
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
  Zap,
  Clock,
  Workflow
} from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/utils/supabase/client"

import { logger } from '@/lib/utils/logger'

// Import all data renderers
import {
  EmailRenderer,
  FileRenderer,
  TableRenderer,
  JSONRenderer,
  CodeRenderer,
  MetricsRenderer,
  ListRenderer,
  TaskRenderer,
  ErrorRenderer,
  QuestionRenderer,
  IntegrationConnectionRenderer
} from './data-renderers'

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  metadata?: {
    type?: "calendar" | "email" | "file" | "confirmation" | "social" | "crm" | "ecommerce" |
           "developer" | "productivity" | "communication" | "integration_not_connected" |
           "error" | "notion_page_hierarchy" | "table" | "json" | "code" | "metrics" | "list" |
           "task" | "warning" | "info" | "question" | "integration_connect"
    data?: any
    requiresConfirmation?: boolean
    integration?: string
    action?: string
    pages?: any[]
    // Additional fields for enhanced renderers
    tableName?: string
    headers?: string[]
    language?: string
    fileName?: string
    emails?: any[]
    files?: any[]
    tasks?: any[]
    metrics?: any[]
    items?: any[]
    code?: string
    rows?: any[]
    // Question fields
    question?: string
    options?: Array<{
      id: string
      label: string
      value: any
      description?: string
      icon?: string
    }>
    questionId?: string
    // Integration connection fields
    provider?: string
    providerName?: string
    oauthUrl?: string
  }
  conversationId?: string
}

export default function AIAssistantContent() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [pendingConfirmation, setPendingConfirmation] = useState<any>(null)
  const [conversationId, setConversationId] = useState<string | undefined>(undefined)
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

  const handleSendMessage = async (messageText?: string, selectedOptionId?: string) => {
    const finalMessage = messageText || input.trim()
    if (!finalMessage || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: finalMessage,
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    if (!messageText) setInput("")  // Only clear input if it came from the input field
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
        
        // First validate user authentication
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()
        
        if (userError || !user) {
          throw new Error("Not authenticated")
        }

        // Then get session for access token
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) {
          throw new Error("Session expired. Please log in again.")
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
            conversationId,
            selectedOptionId
          }),
          signal: abortControllerRef.current.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          const errorText = await response.text()
          logger.error("API Error:", response.status, errorText)
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
          conversationId: data.conversationId
        }

        setMessages(prev => [...prev, assistantMessage])

        // Store conversation ID for subsequent messages
        if (data.conversationId) {
          setConversationId(data.conversationId)
        }

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
        
        logger.error(`Error sending message (attempt ${retryCount + 1}):`, error)
        
        // If this is the last retry, show error
        if (retryCount === maxRetries) {
          let errorMessage = "Failed to send message. Please try again."
          
          if (error instanceof Error) {
            if (error.name === 'AbortError') {
              errorMessage = "Request timed out. Please try again."
            } else if (error.message.includes('API error:')) {
              errorMessage = error.message.replace('API error: ', '')
            } else if (error.message.includes('Not authenticated')) {
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
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()
      
      if (userError || !user) {
        throw new Error("Not authenticated")
      }

      // Then get session for access token
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error("Session expired. Please log in again.")
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
      logger.error("Error confirming action:", error)
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

  // Example prompts that users can click
  const suggestions = [
    { icon: Zap, text: "Show me my upcoming calendar events", category: "Calendar" },
    { icon: Workflow, text: "What workflows do I have active?", category: "Workflows" },
    { icon: Clock, text: "Summarize my recent workflow executions", category: "Analytics" },
    { icon: Mail, text: "What's in my inbox?", category: "Email" },
    { icon: FileText, text: "Show my Notion workspace", category: "Productivity" },
    { icon: MessageSquare, text: "How do I create a workflow?", category: "Help" },
  ]

  const handleSuggestionClick = (text: string) => {
    setInput(text)
    // Auto-send after a brief delay so user sees it populate
    setTimeout(() => {
      handleSendMessage(text)
    }, 100)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-13rem)] -mx-6 -my-6">
      {/* Empty State / Suggestions - Show when no messages */}
      {messages.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
          <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 mt-8">
            <Sparkles className="w-10 h-10 text-primary" />
          </div>
          <h2 className="text-3xl font-semibold mb-3">AI Assistant</h2>
          <p className="text-muted-foreground text-center max-w-2xl mb-12 text-lg">
            I can help you create workflows, troubleshoot issues, and provide insights about your automations. I'll automatically format responses based on the data type!
          </p>

          {/* Suggestion Cards */}
          <div className="w-full max-w-3xl">
            <p className="text-sm font-medium text-center mb-6">Try asking:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {suggestions.map((suggestion, index) => {
                const Icon = suggestion.icon
                return (
                  <Card
                    key={index}
                    className="cursor-pointer hover:bg-accent hover:border-primary/50 transition-all group"
                    onClick={() => handleSuggestionClick(suggestion.text)}
                  >
                    <CardContent className="p-5 flex flex-col items-center text-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center transition-colors">
                        <Icon className="w-6 h-6 text-primary" />
                      </div>
                      <p className="text-sm font-medium leading-snug">{suggestion.text}</p>
                      <Badge variant="secondary" className="text-xs">
                        {suggestion.category}
                      </Badge>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Messages Area - Scrollable - Show when there are messages */}
      {messages.length > 0 && (
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-4xl space-y-6">
          {messages.map((message) => (
            <div
              key={message.id}
              className="flex gap-4 w-full"
            >
              {/* Avatar on the left for both user and assistant */}
              <div className={cn(
                "flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center",
                message.role === "assistant"
                  ? "bg-primary"
                  : "bg-blue-500"
              )}>
                {message.role === "assistant" ? (
                  <Bot className="w-5 h-5 text-primary-foreground" />
                ) : (
                  <User className="w-5 h-5 text-white" />
                )}
              </div>
              <div className="flex-1 max-w-full">
                <div
                  className={cn(
                    "rounded-2xl px-5 py-3",
                    message.role === "user"
                      ? "bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800"
                      : "bg-muted"
                  )}
                >
                  {renderMessageContent(message.content)}

                  {/* Metadata display with new renderers */}
                  {message.metadata && (() => {
                    const { type, data, emails, files, rows, headers, tableName, code, language,
                            fileName, metrics, items, tasks } = message.metadata

                    switch (type) {
                      case "calendar":
                        return data && renderCalendarView(data)

                        case "email":
                          return (emails || data) && (
                            <EmailRenderer emails={emails || data} showBody={true} />
                          )

                        case "file":
                          return (files || data) && (
                            <FileRenderer files={files || data} showThumbnails={true} />
                          )

                        case "table":
                          return rows && (
                            <TableRenderer
                              tableName={tableName}
                              headers={headers}
                              rows={rows}
                              searchable={true}
                              sortable={true}
                            />
                          )

                        case "json":
                          return data && (
                            <JSONRenderer data={data} title={tableName || "JSON Data"} />
                          )

                        case "code":
                          return (code || data) && (
                            <CodeRenderer
                              code={typeof data === 'string' ? data : code || ''}
                              language={language || 'text'}
                              fileName={fileName}
                              lineNumbers={true}
                            />
                          )

                        case "metrics":
                          return (metrics || data) && (
                            <MetricsRenderer
                              metrics={metrics || data}
                              title="Metrics Overview"
                              layout="grid"
                            />
                          )

                        case "list":
                          return (items || data) && (
                            <ListRenderer
                              items={items || data}
                              layout="comfortable"
                            />
                          )

                        case "task":
                          return (tasks || data) && (
                            <TaskRenderer
                              tasks={tasks || data}
                              groupBy="status"
                              showProgress={true}
                            />
                          )

                        case "error":
                          return (
                            <ErrorRenderer
                              error={typeof data === 'string' ? data : message.content}
                              type="error"
                            />
                          )

                        case "warning":
                          return (
                            <ErrorRenderer
                              error={typeof data === 'string' ? data : message.content}
                              type="warning"
                            />
                          )

                        case "info":
                          return (
                            <ErrorRenderer
                              error={typeof data === 'string' ? data : message.content}
                              type="info"
                            />
                          )

                        case "question":
                          return message.metadata.options && (
                            <QuestionRenderer
                              question={message.metadata.question || "Please select an option:"}
                              options={message.metadata.options}
                              onSelect={(optionId) => {
                                // Find the selected option to show what was chosen
                                const selectedOption = message.metadata.options?.find(opt => opt.id === optionId)
                                if (selectedOption) {
                                  handleSendMessage(`Selected: ${selectedOption.label}`, optionId)
                                }
                              }}
                            />
                          )

                        case "integration_connect":
                          return message.metadata.provider && message.metadata.providerName && message.metadata.oauthUrl && (
                            <IntegrationConnectionRenderer
                              provider={message.metadata.provider}
                              providerName={message.metadata.providerName}
                              oauthUrl={message.metadata.oauthUrl}
                              action={message.metadata.action as 'connect' | 'reconnect' | undefined}
                            />
                          )

                        case "social":
                        case "crm":
                        case "ecommerce":
                        case "developer":
                        case "communication":
                          // Use ListRenderer for these types with basic summary
                          return data && Array.isArray(data) && data.length > 0 && (
                            <ListRenderer
                              items={data.map((item: any) => ({
                                title: item.title || item.name || item.subject || 'Item',
                                description: item.description || item.snippet,
                                subtitle: item.date || item.created_at,
                                link: item.url || item.webLink
                              }))}
                              title={
                                type === 'social' ? 'Social Media Posts' :
                                type === 'crm' ? 'CRM Records' :
                                type === 'ecommerce' ? 'E-commerce Orders' :
                                type === 'developer' ? 'Repositories' :
                                'Channels'
                              }
                            />
                          )

                        case "productivity":
                          // Keep existing Notion rendering for now (it's already good)
                          return data && (
                            <div className="mt-3 p-3 bg-background rounded-lg border">
                              <div className="flex items-center gap-2 mb-2">
                                <FileText className="w-4 h-4" />
                                <span className="font-medium">Productivity Items</span>
                              </div>
                              <div className="space-y-3">
                                {data.map((item: any, index: number) => (
                                  <div key={index} className="space-y-2">
                                    {/* Main page */}
                                    <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-md">
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
                                          {item.subpageCount > 0 && (
                                            <span> • {item.subpageCount} subpage{item.subpageCount !== 1 ? 's' : ''}</span>
                                          )}
                                          {item.databaseCount > 0 && (
                                            <span> • {item.databaseCount} database{item.databaseCount !== 1 ? 's' : ''}</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Databases with entries by status */}
                                    {item.databases && item.databases.length > 0 && (
                                      <div className="ml-6 space-y-3">
                                        {item.databases.map((database: any, dbIndex: number) => (
                                          <div key={dbIndex} className="space-y-2">
                                            <div className="flex items-start gap-3 p-2 bg-blue-50 dark:bg-blue-950/20 rounded-md border-l-2 border-blue-200 dark:border-blue-800">
                                              <div className="flex-shrink-0 w-1.5 h-1.5 bg-blue-500 rounded-full mt-2"></div>
                                              <div className="flex-1 min-w-0">
                                                <div className="font-medium text-xs mb-1 text-blue-700 dark:text-blue-300">
                                                  📊 {database.title}
                                                </div>
                                                <div className="text-xs text-blue-600 dark:text-blue-400">
                                                  {database.totalEntries} entries
                                                </div>
                                              </div>
                                            </div>

                                            {/* Status categories */}
                                            {Object.entries(database.entriesByStatus || {}).map(([status, entries]) => (
                                              <div key={status} className="ml-4 space-y-1">
                                                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                                  {status} ({(entries as any[]).length})
                                                </div>
                                                {(entries as any[]).map((entry: any, entryIndex: number) => (
                                                  <div key={entryIndex} className="flex items-start gap-3 p-2 bg-background/50 rounded-md border-l border-muted">
                                                    <div className="flex-shrink-0 w-1 h-1 bg-muted-foreground/30 rounded-full mt-2"></div>
                                                    <div className="flex-1 min-w-0">
                                                      <div className="font-medium text-xs mb-1">
                                                        {entry.url ? (
                                                          <a
                                                            href={entry.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-blue-600 hover:text-blue-800 underline"
                                                          >
                                                            {entry.title}
                                                          </a>
                                                        ) : (
                                                          entry.title
                                                        )}
                                                      </div>
                                                      <div className="text-xs text-muted-foreground">
                                                        {entry.last_edited && (
                                                          <span>Last edited {new Date(entry.last_edited).toLocaleDateString()}</span>
                                                        )}
                                                      </div>
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            ))}
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {/* Subpages */}
                                    {item.subpages && item.subpages.length > 0 && (
                                      <div className="ml-6 space-y-1">
                                        {item.subpages.map((subpage: any, subIndex: number) => (
                                          <div key={subIndex} className="flex items-start gap-3 p-2 bg-background/50 rounded-md border-l-2 border-muted">
                                            <div className="flex-shrink-0 w-1.5 h-1.5 bg-muted-foreground/50 rounded-full mt-2"></div>
                                            <div className="flex-1 min-w-0">
                                              <div className="font-medium text-xs mb-1">
                                                {subpage.url ? (
                                                  <a
                                                    href={subpage.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-600 hover:text-blue-800 underline"
                                                  >
                                                    {subpage.title}
                                                  </a>
                                                ) : (
                                                  subpage.title
                                                )}
                                              </div>
                                              <div className="text-xs text-muted-foreground">
                                                {subpage.type === 'child_database' ? 'Database' : 'Page'}
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )

                        default:
                          return null
                      }
                    })()}
                    
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
                    
                    {message.metadata?.type === "notion_page_hierarchy" && message.metadata.pages && (
                      <div className="mt-3 p-3 bg-background rounded-lg border">
                        <div className="font-medium mb-2 text-lg text-blue-700">Notion Page Hierarchy</div>
                        <ul className="space-y-4">
                          {message.metadata.pages.map((page: any) => (
                            <li key={page.id}>
                              <a
                                href={page.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-lg font-semibold text-blue-500 hover:underline"
                              >
                                {page.title}
                              </a>
                              {page.subpages && page.subpages.length > 0 && (
                                <ul className="ml-6 mt-2 space-y-1 list-disc">
                                  {page.subpages.map((sub: any) => (
                                    <li key={sub.id}>
                                      <a
                                        href={sub.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-400 hover:underline"
                                      >
                                        {sub.title}
                                      </a>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-4 w-full">
              <div className="flex-shrink-0 w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
                <Bot className="w-5 h-5 text-primary-foreground" />
              </div>
              <div className="flex-1 max-w-full">
                <div className="bg-muted rounded-2xl px-5 py-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Thinking...</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>
      )}

      {/* Confirmation Dialog - Fixed above input */}
      {pendingConfirmation && (
        <div className="border-t bg-yellow-50 px-4 py-3">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-yellow-800">Confirm Action</p>
                <p className="text-sm text-yellow-700 mt-1">
                  Are you sure you want to {pendingConfirmation.action}?
                </p>
              </div>
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
            </div>
          </div>
        </div>
      )}

      {/* Input Area - Fixed at Bottom */}
      <div className="border-t bg-card px-4 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-3">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask me anything about your integrations, workflows, or ChainReact..."
              className="flex-1 h-12 text-base"
              disabled={isLoading}
              autoFocus
            />
            <Button
              onClick={handleSendMessage}
              disabled={isLoading || !input.trim()}
              size="lg"
              className="px-6"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            AI responses are automatically formatted based on the data type
          </p>
        </div>
      </div>
    </div>
  )
} 