"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import {
  Send,
  Sparkles,
  Loader2,
  CheckCircle,
  AlertCircle,
  Zap,
  Link as LinkIcon,
  Plus,
  ChevronLeft,
  ChevronRight,
  FileText,
  X
} from "lucide-react"
import { cn } from "@/lib/utils"
import { logger } from "@/lib/utils/logger"
import { useAuthStore } from "@/stores/authStore"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/nodes"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  status?: 'pending' | 'complete' | 'error'
  actionType?: 'plan_workflow' | 'add_node' | 'connect_app' | 'configure_node'
  metadata?: {
    nodeId?: string
    nodeName?: string
    provider?: string
    appConnected?: boolean
    workflowSteps?: Array<{
      nodeType: string
      nodeName: string
      description: string
    }>
  }
}

interface WorkflowNode {
  id: string
  type: string
  data: {
    title: string
    type: string
    providerId?: string
    config?: any
  }
}

interface AIWorkflowBuilderChatProps {
  workflowId?: string
  nodes?: WorkflowNode[]
  onNodeAdd?: (nodeType: string, config: any) => void
  onIntegrationPrompt?: (provider: string) => void
  connectedIntegrations?: string[]
  className?: string
  isCollapsed?: boolean
  onToggleCollapse?: () => void
  initialWelcomeMessage?: string
  initialPrompt?: string // Auto-send this prompt on mount
}

// Create a lookup map for quick node catalog access
const NODE_CATALOG_MAP = new Map(
  ALL_NODE_COMPONENTS.map((node) => [node.type, node])
)

// Helper to get outputSchema for a node type from the catalog
function getOutputSchemaForNode(nodeType: string) {
  const catalogNode = NODE_CATALOG_MAP.get(nodeType)
  if (!catalogNode?.outputSchema) return undefined

  // Return simplified output schema for AI consumption
  return catalogNode.outputSchema.map(field => ({
    name: field.name,
    label: field.label,
    type: field.type,
    description: field.description
  }))
}

export function AIWorkflowBuilderChat({
  workflowId,
  nodes = [],
  onNodeAdd,
  onIntegrationPrompt,
  connectedIntegrations = [],
  className,
  isCollapsed = false,
  onToggleCollapse,
  initialWelcomeMessage,
  initialPrompt
}: AIWorkflowBuilderChatProps) {
  const { user } = useAuthStore()

  // Debug logging
  logger.info('[AIWorkflowBuilderChat] Component mounted/updated', {
    workflowId,
    hasInitialPrompt: !!initialPrompt,
    initialPrompt,
    isCollapsed
  })

  const defaultWelcomeMessage = "Hi! I'm React Agent, your AI workflow assistant. I can help you build workflows using natural language. Try saying something like 'When I get a new email, send it to Slack' or choose a template below!"

  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: initialWelcomeMessage || defaultWelcomeMessage,
      timestamp: new Date(),
      status: 'complete'
    }
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showContextDialog, setShowContextDialog] = useState(false)
  const [contextNodes, setContextNodes] = useState<WorkflowNode[]>([])
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [hasProcessedInitialPrompt, setHasProcessedInitialPrompt] = useState(false)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    }
  }, [messages])

  // Auto-send initial prompt if provided
  useEffect(() => {
    logger.info('[AIWorkflowBuilderChat] useEffect triggered', {
      hasInitialPrompt: !!initialPrompt,
      initialPrompt,
      hasProcessedInitialPrompt,
      isLoading,
      isCollapsed,
      messagesLength: messages.length,
      firstMessageRole: messages[0]?.role
    })

    // Don't process if collapsed - wait until it opens
    if (isCollapsed) {
      logger.info('[AIWorkflowBuilderChat] Skipping - chat is collapsed')
      return
    }

    // Only process if we have an initial prompt and haven't processed it yet
    if (!initialPrompt || hasProcessedInitialPrompt || isLoading) {
      logger.info('[AIWorkflowBuilderChat] Early return from useEffect', {
        reason: !initialPrompt ? 'no initial prompt' : hasProcessedInitialPrompt ? 'already processed' : 'is loading'
      })
      return
    }

    // Make sure we only have the welcome message (no user messages yet)
    if (messages.length !== 1 || messages[0].role !== 'assistant') {
      logger.info('[AIWorkflowBuilderChat] Early return - wrong message state', {
        messagesLength: messages.length,
        firstMessageRole: messages[0]?.role
      })
      return
    }

    logger.info('[AIWorkflowBuilderChat] Processing initial prompt:', initialPrompt)
    setHasProcessedInitialPrompt(true)

    // Manually trigger the send logic
    const sendInitialMessage = async () => {
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: initialPrompt,
        timestamp: new Date()
      }

      setMessages(prev => [...prev, userMessage])
      setInput(initialPrompt) // Show in input for visibility
      setIsLoading(true)

      try {
        logger.info('[AIWorkflowBuilderChat] Sending to API:', { workflowId, initialPrompt })

        // Build context from existing workflow nodes so AI knows what variables are available
        const existingNodesContext = nodes.map(node => ({
          id: node.id,
          type: node.data.type,
          title: node.data.title,
          providerId: node.data.providerId,
          config: node.data.config,
          outputSchema: getOutputSchemaForNode(node.data.type),
          isTrigger: NODE_CATALOG_MAP.get(node.data.type)?.isTrigger ?? false
        }))

        const response = await fetch('/api/ai/workflow-builder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: initialPrompt,
            workflowId,
            connectedIntegrations,
            conversationHistory: [],
            contextNodes: existingNodesContext
          })
        })

        if (!response.ok) throw new Error('Failed to get AI response')

        const data = await response.json()
        logger.info('[AIWorkflowBuilderChat] Received AI response:', data)

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.message,
          timestamp: new Date(),
          status: data.status || 'complete',
          actionType: data.actionType,
          metadata: data.metadata
        }

        setMessages(prev => [...prev, assistantMessage])

        // If AI wants to add a node, call the handler
        if (data.actionType === 'add_node' && data.nodeType && onNodeAdd) {
          logger.info('[AIWorkflowBuilderChat] Adding node:', data.nodeType)
          onNodeAdd(data.nodeType, data.config || {})
        }

        // If AI wants to connect app
        if (data.actionType === 'connect_app' && data.provider && onIntegrationPrompt) {
          logger.info('[AIWorkflowBuilderChat] Prompting app connection:', data.provider)
          onIntegrationPrompt(data.provider)
        }

      } catch (error) {
        logger.error('[AIWorkflowBuilderChat] Error sending initial message:', error)
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'system',
          content: "I'm sorry, I encountered an error processing your request. Please try again.",
          timestamp: new Date(),
          status: 'error'
        }
        setMessages(prev => [...prev, errorMessage])
      } finally {
        setIsLoading(false)
      }
    }

    // Small delay to ensure UI is ready
    setTimeout(sendInitialMessage, 300)
  }, [initialPrompt, hasProcessedInitialPrompt, isLoading, isCollapsed, messages, workflowId, connectedIntegrations, onNodeAdd, onIntegrationPrompt])

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      // Call AI workflow builder API
      const response = await fetch('/api/ai/workflow-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input,
          workflowId,
          connectedIntegrations,
          conversationHistory: messages.slice(-5), // Last 5 messages for context
          contextNodes: contextNodes.map(node => ({
            id: node.id,
            type: node.data.type,
            title: node.data.title,
            providerId: node.data.providerId,
            config: node.data.config,
            outputSchema: getOutputSchemaForNode(node.data.type),
            isTrigger: NODE_CATALOG_MAP.get(node.data.type)?.isTrigger ?? false
          }))
        })
      })

      if (!response.ok) throw new Error('Failed to get AI response')

      const data = await response.json()

      // Add AI response
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message,
        timestamp: new Date(),
        status: data.status || 'complete',
        actionType: data.actionType,
        metadata: data.metadata
      }

      setMessages(prev => [...prev, assistantMessage])

      // Handle actions
      if (data.actionType === 'add_node' && onNodeAdd) {
        onNodeAdd(data.nodeType, data.config)
      } else if (data.actionType === 'connect_app' && onIntegrationPrompt) {
        onIntegrationPrompt(data.provider)
      }

    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'system',
        content: "I'm sorry, I encountered an error. Please try again.",
        timestamp: new Date(),
        status: 'error'
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleTemplateClick = async (template: string) => {
    setInput(template)
    // Auto-send after brief delay to show the template
    setTimeout(() => {
      handleSendMessage()
    }, 100)
  }

  const templates = [
    {
      id: 'email-to-slack',
      icon: '📧→💬',
      title: 'Email to Slack',
      description: 'Forward emails to Slack',
      prompt: 'When I receive an email in Gmail, send it to a Slack channel',
      category: 'email'
    },
    {
      id: 'form-to-sheet',
      icon: '📝→📊',
      title: 'Form to Sheet',
      description: 'Save form responses',
      prompt: 'When someone fills out a form, add their response to a Google Sheet',
      category: 'productivity'
    },
    {
      id: 'schedule-post',
      icon: '⏰→📱',
      title: 'Schedule Posts',
      description: 'Auto-post on schedule',
      prompt: 'Every day at 9am, post to Twitter and LinkedIn',
      category: 'social'
    },
    {
      id: 'new-customer',
      icon: '🎉→📬',
      title: 'New Customer',
      description: 'Welcome new customers',
      prompt: 'When I get a new Stripe customer, send them a welcome email and add them to my CRM',
      category: 'crm'
    },
    {
      id: 'meeting-notes',
      icon: '📅→📝',
      title: 'Meeting Notes',
      description: 'Auto-create meeting notes',
      prompt: 'When a Google Calendar meeting ends, create a Notion page with meeting notes',
      category: 'productivity'
    },
    {
      id: 'task-reminder',
      icon: '✅→🔔',
      title: 'Task Reminders',
      description: 'Get task reminders',
      prompt: 'When a task is due in Notion, send me a Slack reminder',
      category: 'productivity'
    },
    {
      id: 'email-digest',
      icon: '📬→📋',
      title: 'Email Digest',
      description: 'Daily email summary',
      prompt: 'Every morning at 8am, send me a digest of important emails from yesterday',
      category: 'email'
    },
    {
      id: 'social-backup',
      icon: '📱→💾',
      title: 'Social Backup',
      description: 'Backup social posts',
      prompt: 'When I post on Twitter, save it to Google Sheets as a backup',
      category: 'social'
    },
    {
      id: 'lead-nurture',
      icon: '🎯→📧',
      title: 'Lead Nurture',
      description: 'Follow up with leads',
      prompt: 'When a new lead is added to Airtable, wait 2 days then send a follow-up email',
      category: 'crm'
    },
    {
      id: 'content-calendar',
      icon: '📅→✍️',
      title: 'Content Calendar',
      description: 'Automate content posting',
      prompt: 'Every Monday, get content ideas from Notion and schedule them across social media',
      category: 'social'
    },
    {
      id: 'invoice-tracker',
      icon: '💰→📊',
      title: 'Invoice Tracker',
      description: 'Track payments',
      prompt: 'When a new invoice is paid in Stripe, add it to Google Sheets and send a thank you email',
      category: 'business'
    },
    {
      id: 'bug-triage',
      icon: '🐛→📋',
      title: 'Bug Triage',
      description: 'Auto-triage bugs',
      prompt: 'When a new issue is created on GitHub, analyze it and add appropriate labels and assignees',
      category: 'dev'
    }
  ]

  // Collapsed view
  if (isCollapsed) {
    return (
      <div className={cn("flex flex-col h-full bg-card border-r", className)} style={{ width: '48px' }}>
        <div className="p-3 border-b">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="w-full"
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="rotate-90 whitespace-nowrap text-xs font-medium text-muted-foreground">
            React Agent
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col h-full bg-card border-r", className)}>
      {/* Header */}
      <div className="p-4 border-b bg-gradient-to-r from-primary/10 to-rose-500/10">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/20">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-sm">React Agent</h3>
            <p className="text-xs text-muted-foreground">Build workflows with natural language</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Templates Section */}
      <div className="p-4 border-b bg-muted/30">
        <p className="text-xs font-medium text-muted-foreground mb-3">Quick Start Templates</p>
        <div className="grid grid-cols-2 gap-2">
          {templates.slice(0, 4).map((template) => (
            <button
              key={template.id}
              onClick={() => handleTemplateClick(template.prompt)}
              className="group p-3 rounded-lg border-2 border-border hover:border-primary/50 bg-card hover:bg-accent transition-all text-left"
            >
              <div className="text-lg mb-1">{template.icon}</div>
              <div className="text-xs font-semibold mb-0.5 group-hover:text-primary transition-colors">
                {template.title}
              </div>
              <div className="text-[10px] text-muted-foreground line-clamp-1">
                {template.description}
              </div>
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-2 text-xs"
          onClick={() => {
            // TODO: Open full template library
          }}
        >
          View All Templates →
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex gap-3",
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {message.role !== 'user' && (
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                  message.role === 'assistant' ? 'bg-primary/20' : 'bg-yellow-500/20'
                )}>
                  {message.role === 'assistant' ? (
                    <Sparkles className="w-4 h-4 text-primary" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-yellow-600" />
                  )}
                </div>
              )}

              <div
                className={cn(
                  "max-w-[80%] rounded-xl p-3 text-sm",
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : message.role === 'assistant'
                    ? 'bg-muted'
                    : 'bg-yellow-500/10 border border-yellow-500/20'
                )}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>

                {/* Action indicators */}
                {message.metadata && (
                  <div className="mt-2 pt-2 border-t border-border/50 space-y-1.5">
                    {message.actionType === 'add_node' && (
                      <div className="flex items-center gap-2 text-xs">
                        <Plus className="w-3 h-3" />
                        <span className="font-medium">Added: {message.metadata.nodeName}</span>
                        {message.status === 'complete' && (
                          <CheckCircle className="w-3 h-3 text-green-500 ml-auto" />
                        )}
                      </div>
                    )}
                    {message.actionType === 'connect_app' && (
                      <div className="flex items-center gap-2 text-xs">
                        <LinkIcon className="w-3 h-3" />
                        <span className="font-medium">
                          {message.metadata.appConnected
                            ? `Connected: ${message.metadata.provider}`
                            : `Connect ${message.metadata.provider}`
                          }
                        </span>
                        {message.metadata.appConnected && (
                          <CheckCircle className="w-3 h-3 text-green-500 ml-auto" />
                        )}
                      </div>
                    )}

                    {/* Continue Button for Workflow Plan */}
                    {message.actionType === 'plan_workflow' && message.metadata?.workflowSteps && (
                      <div className="mt-4">
                        <Button
                          onClick={async () => {
                            // Send confirmation message to continue building
                            setInput("Yes, continue building the workflow")
                            // Trigger the send after a brief delay to ensure state is updated
                            setTimeout(() => {
                              handleSendMessage()
                            }, 50)
                          }}
                          className="bg-primary hover:bg-primary/90 text-primary-foreground"
                          disabled={isLoading}
                        >
                          <Sparkles className="w-4 h-4 mr-2" />
                          Continue Building
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Timestamp */}
                <p className="text-[10px] text-muted-foreground mt-2">
                  {message.timestamp.toLocaleTimeString()}
                </p>
              </div>

              {message.role === 'user' && (
                <div className="w-8 h-8 rounded-full shrink-0 overflow-hidden bg-gradient-to-br from-primary to-rose-600 flex items-center justify-center text-primary-foreground text-xs font-bold">
                  {user?.user_metadata?.avatar_url ? (
                    <img
                      src={user.user_metadata.avatar_url}
                      alt="User avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>{user?.email?.charAt(0).toUpperCase() || 'U'}</span>
                  )}
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div className="bg-muted rounded-xl p-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Thinking...</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t bg-muted/30">
        {/* Context Nodes Display */}
        {contextNodes.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {contextNodes.map((node) => (
              <Badge
                key={node.id}
                variant="secondary"
                className="pl-2 pr-1 py-1 gap-2"
              >
                <FileText className="w-3 h-3" />
                <span className="text-xs">{node.data.title}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 p-0 hover:bg-transparent"
                  onClick={() => {
                    setContextNodes(prev => prev.filter(n => n.id !== node.id))
                  }}
                >
                  <X className="w-3 h-3" />
                </Button>
              </Badge>
            ))}
          </div>
        )}

        {/* Add Context Button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full mb-2"
          onClick={() => setShowContextDialog(true)}
          disabled={!nodes || nodes.length === 0}
        >
          <Plus className="w-3 h-3 mr-2" />
          Add Context
          {contextNodes.length > 0 && (
            <Badge variant="secondary" className="ml-auto">
              {contextNodes.length}
            </Badge>
          )}
        </Button>

        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSendMessage()
              }
            }}
            placeholder="Describe your workflow..."
            className="flex-1"
            disabled={isLoading}
          />
          <Button
            onClick={handleSendMessage}
            disabled={!input.trim() || isLoading}
            size="icon"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>

      {/* Context Selection Dialog */}
      <Dialog open={showContextDialog} onOpenChange={setShowContextDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Workflow Nodes to Context</DialogTitle>
            <DialogDescription>
              Select nodes to provide context to the AI. The AI will be able to read the configuration and values from these nodes.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[400px] pr-4">
            <div className="space-y-2">
              {nodes && nodes.length > 0 ? (
                nodes.map((node) => {
                  const isSelected = contextNodes.some(n => n.id === node.id)
                  return (
                    <div
                      key={node.id}
                      className={cn(
                        "p-3 rounded-lg border-2 cursor-pointer transition-all",
                        isSelected
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50 hover:bg-accent"
                      )}
                      onClick={() => {
                        if (isSelected) {
                          setContextNodes(prev => prev.filter(n => n.id !== node.id))
                        } else {
                          setContextNodes(prev => [...prev, node])
                        }
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5",
                          isSelected ? "bg-primary border-primary" : "border-muted-foreground"
                        )}>
                          {isSelected && <CheckCircle className="w-4 h-4 text-primary-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{node.data.title}</p>
                            {node.data.providerId && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {node.data.providerId}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{node.data.type}</p>
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">No nodes in workflow yet</p>
                  <p className="text-xs mt-1">Add nodes to your workflow to use them as context</p>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="flex justify-between items-center pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              {contextNodes.length} node{contextNodes.length !== 1 ? 's' : ''} selected
            </p>
            <Button onClick={() => setShowContextDialog(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
