"use client"

import { useState, useEffect, useCallback } from "react"
import { loadNodeConfig, saveNodeConfig } from "@/lib/workflows/configPersistence"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContentWithoutClose, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { EnhancedTooltip } from "@/components/ui/enhanced-tooltip"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Slider } from "@/components/ui/slider"
import { ScrollArea } from "@/components/ui/scroll-area"
import { HelpCircle, Bot, Zap, Brain, Settings, Target, MessageSquare, Clock, Sparkles, Database, Play, Save, AlertCircle } from "lucide-react"
import { INTEGRATION_CONFIGS } from "@/lib/integrations/availableIntegrations"
import { integrationIcons } from "@/lib/integrations/integration-icons"
import { cn } from "@/lib/utils"
import { SmartComposeField } from "@/components/ai/SmartComposeField"
import { useWorkflowTestStore } from "@/stores/workflowTestStore"
import { useIntegrationStore } from "@/stores/integrationStore"


interface AIAgentConfigModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (config: Record<string, any>) => void
  onUpdateConnections?: (sourceNodeId: string, targetNodeId: string) => void
  initialData?: Record<string, any>
  workflowData?: { nodes: any[], edges: any[] }
  currentNodeId?: string
}

export default function AIAgentConfigModal({
  isOpen,
  onClose,
  onSave,
  onUpdateConnections,
  initialData = {},
  workflowData,
  currentNodeId,
}: AIAgentConfigModalProps) {
  // Get workflow ID from the URL or context
  const getWorkflowId = useCallback(() => {
    if (typeof window === "undefined") return ""
    
    // Extract workflow ID from URL (e.g., /workflows/builder/[id])
    const pathParts = window.location.pathname.split('/')
    const builderIndex = pathParts.indexOf('builder')
    
    if (builderIndex !== -1 && pathParts.length > builderIndex + 1) {
      return pathParts[builderIndex + 1]
    }
    
    return ""
  }, [])
  
  // Initialize config with persisted data or initialData
  const [config, setConfig] = useState<Record<string, any>>(() => {
    // Default configuration
    const defaultConfig = {
      inputNodeId: "",
      memory: "all-storage",
      memoryIntegration: "",
      customMemoryIntegrations: [],
      systemPrompt: "",
      template: "none",
      customTemplate: "",
      contentType: "email",
      tone: "neutral",
      responseLength: 50,
      model: "gpt-4",
      temperature: 0.7,
      maxTokens: 1000,
      outputFormat: "text",
      ...initialData,
    }
    
    // Only try to load saved config if we have a valid node ID (not a pending node)
    if (currentNodeId && currentNodeId !== 'pending-action' && currentNodeId !== 'pending-trigger') {
      const workflowId = getWorkflowId()
      if (workflowId) {
        const savedNodeData = loadNodeConfig(workflowId, currentNodeId, "ai_agent")
        if (savedNodeData) {
          console.log('📋 Loaded saved configuration for AI agent node:', currentNodeId)
          
          // If we have saved dynamic options, restore them
          if (savedNodeData.dynamicOptions) {
            console.log('📋 Restoring saved dynamic options for AI agent')
            // Use setTimeout to ensure this happens after initial render
            setTimeout(() => {
              const options = savedNodeData.dynamicOptions;
              
              // Restore selectedVariables if available
              if (options.selectedVariables) {
                setSelectedVariables(options.selectedVariables);
              }
              
              // Restore variableValues if available
              if (options.variableValues) {
                setVariableValues(options.variableValues);
              }
              
              // Restore useStaticValues if available
              if (options.useStaticValues) {
                setUseStaticValues(options.useStaticValues);
              }
            }, 0)
          }
          
          return { ...defaultConfig, ...savedNodeData.config }
        }
      }
    }
    return defaultConfig
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState("basic")
  
  // Variable selection state
  const [selectedVariables, setSelectedVariables] = useState<Record<string, boolean>>({})
  const [hasTriggeredData, setHasTriggeredData] = useState(false)
  const [generatedResponse, setGeneratedResponse] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [variableValues, setVariableValues] = useState<Record<string, string>>({})
  const [useStaticValues, setUseStaticValues] = useState<Record<string, boolean>>({})
  
  // Input node output configuration
  const [outputConfig, setOutputConfig] = useState<Record<string, any>>({})
  const [inputNodeData, setInputNodeData] = useState<any>(null)

  // Add workflow test store for node output data
  const { getNodeInputOutput } = useWorkflowTestStore()
  
  // Get connected integrations for memory configuration
  const { getConnectedProviders } = useIntegrationStore()

  // Get realistic trigger outputs based on trigger type
  const getTriggerOutputsByType = (nodeType: string, providerId?: string) => {
    const outputs: Array<{
      name: string
      label: string
      type: string
      description?: string
      example?: any
    }> = []

    // Gmail triggers
    if (nodeType === 'gmail_trigger_new_email') {
      outputs.push(
        { name: 'from', label: 'From', type: 'string', description: 'Sender email address', example: 'sender@example.com' },
        { name: 'body', label: 'Body', type: 'string', description: 'Email content', example: 'Hi, let\'s meet tomorrow at 2 PM.' },
        { name: 'receivedAt', label: 'Received At', type: 'string', description: 'When the email was received', example: '2024-01-15T10:30:00Z' }
      )
    } else if (nodeType === 'gmail_trigger_new_attachment') {
      outputs.push(
        { name: 'id', label: 'Message ID', type: 'string', description: 'Unique identifier for the email', example: '17c123456789abcd' },
        { name: 'from', label: 'From', type: 'string', description: 'Sender email address', example: 'sender@example.com' },
        { name: 'subject', label: 'Subject', type: 'string', description: 'Email subject line', example: 'Document attached' },
        { name: 'body', label: 'Body', type: 'string', description: 'Email content', example: 'Please find the attached document.' },
        { name: 'receivedAt', label: 'Received At', type: 'string', description: 'When the email was received', example: '2024-01-15T10:30:00Z' },
        { name: 'attachments', label: 'Attachments', type: 'array', description: 'Email attachments', example: [{ filename: 'document.pdf', size: 1024000 }] }
      )
    }
    // Discord triggers
    else if (nodeType === 'discord_trigger_new_message') {
      outputs.push(
        { name: 'messageId', label: 'Message ID', type: 'string', description: 'Unique identifier for the message', example: '1234567890123456789' },
        { name: 'content', label: 'Content', type: 'string', description: 'Message content', example: 'Hello everyone!' },
        { name: 'authorId', label: 'Author ID', type: 'string', description: 'ID of the message author', example: '123456789012345678' },
        { name: 'authorName', label: 'Author Name', type: 'string', description: 'Name of the message author', example: 'John Doe' },
        { name: 'authorUsername', label: 'Author Username', type: 'string', description: 'Username of the message author', example: 'johndoe' },
        { name: 'channelId', label: 'Channel ID', type: 'string', description: 'ID of the channel', example: '1234567890123456789' },
        { name: 'channelName', label: 'Channel Name', type: 'string', description: 'Name of the channel', example: 'general' },
        { name: 'guildId', label: 'Server ID', type: 'string', description: 'ID of the Discord server', example: '1234567890123456789' },
        { name: 'guildName', label: 'Server Name', type: 'string', description: 'Name of the Discord server', example: 'My Server' },
        { name: 'timestamp', label: 'Timestamp', type: 'string', description: 'When the message was sent', example: '2024-01-15T10:30:00Z' },
        { name: 'attachments', label: 'Attachments', type: 'array', description: 'Message attachments', example: [] },
        { name: 'embeds', label: 'Embeds', type: 'array', description: 'Message embeds', example: [] }
      )
    }
    // Generic fallback for any trigger
    else {
      // Add provider-specific common outputs as fallback
      if (providerId === 'gmail') {
        outputs.push(
          { name: 'id', label: 'Message ID', type: 'string', description: 'Unique identifier for the email', example: '17c123456789abcd' },
          { name: 'from', label: 'From', type: 'string', description: 'Sender email address', example: 'sender@example.com' },
          { name: 'to', label: 'To', type: 'string', description: 'Recipient email address', example: 'recipient@example.com' },
          { name: 'subject', label: 'Subject', type: 'string', description: 'Email subject line', example: 'Meeting tomorrow' },
          { name: 'body', label: 'Body', type: 'string', description: 'Email content', example: 'Hi, let\'s meet tomorrow at 2 PM.' },
          { name: 'timestamp', label: 'Timestamp', type: 'string', description: 'When the email was received', example: '2024-01-15T10:30:00Z' }
        )
      } else if (providerId === 'slack' || providerId === 'discord') {
        outputs.push(
          { name: 'messageId', label: 'Message ID', type: 'string', description: 'Unique identifier for the message', example: '1234567890.123456' },
          { name: 'content', label: 'Content', type: 'string', description: 'Message content', example: 'Hello everyone!' },
          { name: 'senderId', label: 'Sender ID', type: 'string', description: 'ID of the message sender', example: 'U1234567890' },
          { name: 'senderName', label: 'Sender Name', type: 'string', description: 'Name of the message sender', example: 'John Doe' },
          { name: 'channelId', label: 'Channel ID', type: 'string', description: 'ID of the channel', example: 'C1234567890' },
          { name: 'channelName', label: 'Channel Name', type: 'string', description: 'Name of the channel', example: 'general' },
          { name: 'timestamp', label: 'Timestamp', type: 'string', description: 'When the message was sent', example: '2024-01-15T10:30:00Z' }
        )
      } else {
        // Generic outputs for any trigger
        outputs.push(
          { name: 'id', label: 'ID', type: 'string', description: 'Unique identifier', example: '1234567890' },
          { name: 'type', label: 'Type', type: 'string', description: 'Type of the event', example: nodeType },
          { name: 'timestamp', label: 'Timestamp', type: 'string', description: 'When the event occurred', example: '2024-01-15T10:30:00Z' },
          { name: 'data', label: 'Data', type: 'object', description: 'Event data', example: { 'key': 'value' } }
        )
      }
    }

    return outputs
  }

  // Reset config when modal opens
  useEffect(() => {
    if (isOpen) {
      setConfig({
        inputNodeId: "",
        memory: "all-storage",
        memoryIntegration: "",
        customMemoryIntegrations: [],
        systemPrompt: "",
        tone: "neutral",
        responseLength: 50,
        model: "gpt-4",
        temperature: 0.7,
        maxTokens: 1000,
        outputFormat: "text",
        ...initialData,
      })
      setErrors({})
      setOutputConfig({})
      setInputNodeData(null)
      setSelectedVariables(initialData.selectedVariables || {})
      setVariableValues({})
      setUseStaticValues({})
      setHasTriggeredData(false)
      setGeneratedResponse("")
    }
  }, [isOpen, initialData])
  
  // Fetch input node data when selected
  useEffect(() => {
    if (config.inputNodeId && workflowData?.nodes) {
      const selectedNode = workflowData.nodes.find(node => node.id === config.inputNodeId)
      if (selectedNode) {
        setInputNodeData(selectedNode)
        // Initialize output config with default values
        const defaultOutputConfig: Record<string, any> = {}
        if (selectedNode.data?.config) {
          // Extract available fields from the node's config
          Object.keys(selectedNode.data.config).forEach(key => {
            if (selectedNode.data.config[key] && typeof selectedNode.data.config[key] !== 'object') {
              defaultOutputConfig[key] = {
                include: true,
                alias: key,
                transform: 'none'
              }
            }
          })
        }
        setOutputConfig(defaultOutputConfig)
      }
    } else {
      setInputNodeData(null)
      setOutputConfig({})
    }
  }, [config.inputNodeId, workflowData?.nodes])

  const handleSave = () => {
    const newErrors: Record<string, string> = {}

    if (!config.inputNodeId) {
      newErrors.inputNodeId = "Please select an input node"
    }
    
    if (!config.systemPrompt.trim()) {
      newErrors.systemPrompt = "Please enter a system prompt"
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    const selectedVars = Object.keys(selectedVariables).filter(key => selectedVariables[key])
    
    const configToSave = {
      ...config,
      selectedVariables,
      variableValues,
      useStaticValues,
      hasTriggeredData,
      inputVariables: selectedVars.map(varName => ({
        name: varName,
        useStatic: useStaticValues[varName] || false,
        staticValue: useStaticValues[varName] ? variableValues[varName] : undefined
      }))
    }
    
    // Save configuration to persistent storage if we have a valid node ID
    if (currentNodeId && currentNodeId !== 'pending-action' && currentNodeId !== 'pending-trigger') {
      const workflowId = getWorkflowId()
      if (workflowId) {
        console.log('📋 Saving configuration for AI agent node:', currentNodeId)
        // Save both config and dynamic options
        const dynamicOptions = {
          // Save any dynamic options needed for AI agent
          "selectedVariables": selectedVariables,
          "variableValues": variableValues,
          "useStaticValues": useStaticValues
        }
        saveNodeConfig(workflowId, currentNodeId, "ai_agent", configToSave, dynamicOptions)
      }
    }
    
    onSave(configToSave)
    onClose()
  }

  const handleInputNodeChange = (nodeId: string) => {
    setConfig(prev => ({ ...prev, inputNodeId: nodeId }))
    setSelectedVariables({})
    setVariableValues({})
    setUseStaticValues({})
    setHasTriggeredData(false)
    setGeneratedResponse("")
    
    if (onUpdateConnections && currentNodeId) {
      onUpdateConnections(nodeId, currentNodeId)
    }
  }

  const handleGenerate = async () => {
    setIsGenerating(true)
    try {
      // Simulate AI generation with sample data
      const mockResponse = `Based on the input data, here's a ${config.tone} response with approximately ${config.responseLength} words...`
      setGeneratedResponse(mockResponse)
    } catch (error) {
      console.error('Error generating response:', error)
    } finally {
      setIsGenerating(false)
    }
  }

  const canGenerate = () => {
    const selected = Object.keys(selectedVariables).filter(key => selectedVariables[key])
    if (selected.length === 0) return false

    // Get real node output data if available
    let realNodeOutput: Record<string, any> | null = null
    if (config.inputNodeId) {
      const nodeIO = getNodeInputOutput(config.inputNodeId)
      realNodeOutput = nodeIO?.output || null
    }

    // For each selected variable:
    // - If static: must have a value
    // - If auto: must be present in realNodeOutput and not empty/null/undefined
    return selected.every(key => {
      if (useStaticValues[key]) {
        return variableValues[key] && variableValues[key].trim() !== ""
      } else {
        return realNodeOutput && realNodeOutput[key] !== undefined && realNodeOutput[key] !== null && String(realNodeOutput[key]).trim() !== ""
      }
    })
  }

  const getInputVariables = () => {
    if (!inputNodeData) return []
    
    // Get the node component definition to access its output schema
    const { ALL_NODE_COMPONENTS } = require("@/lib/workflows/availableNodes")
    const nodeComponent = ALL_NODE_COMPONENTS.find((c: any) => c.type === inputNodeData.data?.type)
    
    // Use the node's outputSchema if available, otherwise fall back to trigger outputs
    if (nodeComponent?.outputSchema && nodeComponent.outputSchema.length > 0) {
      return nodeComponent.outputSchema.map((output: any) => ({
        name: output.name,
        label: output.label,
        type: output.type,
        description: output.description,
        example: output.example,
        selected: selectedVariables[output.name] || false
      }))
    }
    
    // Fallback to trigger-specific outputs for backward compatibility
    const outputs = getTriggerOutputsByType(inputNodeData.data?.type, inputNodeData.data?.providerId)
    return outputs.map(output => ({
      ...output,
      selected: selectedVariables[output.name] || false
    }))
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContentWithoutClose className="sm:max-w-[1400px] max-h-[95vh] w-full bg-gradient-to-br from-slate-50 to-white border-0 shadow-2xl" style={{ paddingRight: '2rem' }}>
        <div className="flex flex-col h-full">
          {/* Main Configuration Content */}
          <DialogHeader className="pb-3 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg text-white">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                    Configure AI Agent
                    <Badge variant="secondary" className="bg-purple-100 text-purple-800 border-purple-200">AI</Badge>
                  </DialogTitle>
                  <DialogDescription className="text-sm text-slate-600 mt-1">
                    Set up your AI agent's behavior, goals, and available tools
                  </DialogDescription>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600 rounded-full transition-all duration-200 group"
              >
                <svg className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Button>
            </div>
          </DialogHeader>

          {/* Configuration Form */}
          <ScrollArea className="h-[calc(80vh-220px)] pr-4 overflow-visible">
            <div className="pt-3 space-y-6 pb-6 px-2">
              {/* Tabs */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="mb-4">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="basic">Basic</TabsTrigger>
                    <TabsTrigger value="advanced">Advanced</TabsTrigger>
                  </TabsList>
                </div>
                
                <TabsContent value="basic" className="space-y-6 mt-6">
                  {/* Input Node Configuration */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Target className="w-5 h-5 text-primary" />
                      <Label className="text-base font-medium">Input Node</Label>
                      <EnhancedTooltip 
                        description="Select which node in the workflow should provide input to the AI Agent"
                        title="Input Node Information"
                        showExpandButton={false}
                      />
                    </div>
                    
                    {workflowData?.nodes && workflowData.nodes.length > 0 ? (
                      <div className="space-y-2">
                        <Select
                          value={config.inputNodeId}
                          onValueChange={handleInputNodeChange}
                        >
                          <SelectTrigger className="w-full focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                            <SelectValue placeholder="Select a node to provide input..." />
                          </SelectTrigger>
                          <SelectContent>
                            {workflowData.nodes
                              .filter(node => 
                                node.id !== currentNodeId && // Exclude current AI Agent node
                                node.type === 'custom' && // Only include custom nodes (not addAction nodes)
                                node.data?.type && // Ensure node has a type
                                (node.data?.isTrigger !== undefined || node.data?.config) // Only include nodes that have been configured
                              )
                              .map((node) => {
                                // Get the integration info for this node
                                const integrationId = node.data?.providerId || node.data?.type
                                const integration = INTEGRATION_CONFIGS[integrationId as keyof typeof INTEGRATION_CONFIGS]
                                const iconPath = integrationIcons[integrationId as keyof typeof integrationIcons]
                                
                                // Check if this node produces output
                                const { ALL_NODE_COMPONENTS } = require("@/lib/workflows/availableNodes")
                                const nodeComponent = ALL_NODE_COMPONENTS.find((c: any) => c.type === node.data?.type)
                                const producesOutput = nodeComponent?.producesOutput
                                
                                return (
                                  <SelectItem key={node.id} value={node.id}>
                                    <div className="flex items-center gap-3 w-full">
                                      <div className="flex-shrink-0">
                                        {iconPath ? (
                                          <img src={iconPath} alt={integration?.name || node.data?.type} className="w-5 h-5" />
                                        ) : (
                                          <div className="w-5 h-5 bg-muted rounded flex items-center justify-center">
                                            <Settings className="w-3 h-3" />
                                          </div>
                                        )}
                                      </div>
                                      
                                      <div className="flex-1 min-w-0">
                                        <div className="font-medium truncate flex items-center gap-2">
                                          {node.data?.title || integration?.name || node.data?.type}
                                          {!producesOutput && (
                                            <Badge variant="secondary" className="text-xs px-1 py-0 h-4">
                                              No Output
                                            </Badge>
                                          )}
                                        </div>
                                        <div className="text-xs text-muted-foreground truncate">
                                          {node.data?.description || integration?.description || 'No description'}
                                        </div>
                                      </div>
                                    </div>
                                  </SelectItem>
                                )
                              })}
                          </SelectContent>
                        </Select>
                        
                        {errors.inputNodeId && (
                          <p className="text-sm text-red-600">{errors.inputNodeId}</p>
                        )}
                      </div>
                    ) : (
                      <div className="p-4 border border-dashed rounded-lg text-center">
                        <p className="text-sm text-muted-foreground">
                          No other nodes found in the workflow. Add some nodes first to connect them to the AI Agent.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Template Selection */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-5 h-5 text-primary" />
                      <Label className="text-base font-medium">Template</Label>
                    </div>
                    <Select
                      value={config.template}
                      onValueChange={(value) => {
                        setConfig(prev => ({ ...prev, template: value }))
                        // Auto-populate system prompt based on template selection
                        const templatePrompts: Record<string, string> = {
                          none: "",
                          summarize: "You are an AI assistant specialized in summarizing content. Your task is to create concise, accurate summaries of the provided information. Focus on key points, main ideas, and essential details while maintaining clarity and readability. Provide summaries that are informative yet concise.",
                          extract: "You are an AI assistant specialized in extracting specific information from text. Your task is to identify and extract relevant data points, facts, or information based on the user's requirements. Be precise and thorough in your extraction, ensuring you capture all relevant information.",
                          sentiment: "You are an AI assistant specialized in sentiment analysis. Your task is to analyze the emotional tone and sentiment of the provided text. Provide detailed sentiment analysis including the overall sentiment (positive, negative, neutral) and specific emotional indicators present in the text.",
                          translate: "You are an AI assistant specialized in translation. Your task is to translate text between languages while preserving the original meaning, tone, and context. Ensure accurate translation that maintains the intent and style of the original text.",
                          generate: "You are an AI assistant specialized in content generation. Your task is to create high-quality, relevant content based on the provided input and requirements. Generate content that is engaging, informative, and tailored to the specified format and audience.",
                          classify: "You are an AI assistant specialized in content classification. Your task is to categorize and classify content based on provided criteria. Provide clear classification results with confidence levels and reasoning for your categorization decisions.",
                          email_response: "You are an AI assistant specialized in crafting professional email responses. Your task is to create appropriate, well-structured email responses that are courteous, clear, and address the recipient's needs effectively. Maintain professional tone and format.",
                          data_analysis: "You are an AI assistant specialized in data analysis. Your task is to analyze provided data and extract meaningful insights, patterns, and conclusions. Present your analysis in a clear, structured manner with actionable recommendations.",
                          content_creation: "You are an AI assistant specialized in creative content creation. Your task is to generate engaging, original content that captures attention and delivers value. Create content that is creative, informative, and tailored to the target audience.",
                          customer_support: "You are an AI assistant specialized in customer support. Your task is to provide helpful, empathetic, and solution-oriented responses to customer inquiries. Focus on understanding the customer's needs and providing clear, actionable solutions."
                        }
                        if (templatePrompts[value]) {
                          setConfig(prev => ({ ...prev, systemPrompt: templatePrompts[value] }))
                        }
                      }}
                    >
                      <SelectTrigger className="w-full focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                        <SelectValue placeholder="Select a template..." />
                      </SelectTrigger>
                      <SelectContent 
                        position="popper" 
                        side="bottom" 
                        align="start"
                        className="max-h-[300px] overflow-y-auto"
                      >
                        <SelectItem value="none">No template (use default behavior)</SelectItem>
                        <SelectItem value="summarize">Summarize Content</SelectItem>
                        <SelectItem value="extract">Extract Information</SelectItem>
                        <SelectItem value="sentiment">Sentiment Analysis</SelectItem>
                        <SelectItem value="translate">Translate Text</SelectItem>
                        <SelectItem value="generate">Generate Content</SelectItem>
                        <SelectItem value="classify">Classify Content</SelectItem>
                        <SelectItem value="email_response">Email Response</SelectItem>
                        <SelectItem value="data_analysis">Data Analysis</SelectItem>
                        <SelectItem value="content_creation">Content Creation</SelectItem>
                        <SelectItem value="customer_support">Customer Support</SelectItem>
                        <SelectItem value="custom">Custom Template</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Memory Configuration */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Database className="w-5 h-5 text-primary" />
                      <Label className="text-base font-medium">Memory & Storage</Label>
                    </div>
                    <Select
                      value={config.memory}
                      onValueChange={(value) => setConfig(prev => ({ ...prev, memory: value }))}
                    >
                      <SelectTrigger className="w-full focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                        <SelectValue placeholder="Select memory option..." />
                      </SelectTrigger>
                                                <SelectContent 
                            position="popper" 
                            side="bottom" 
                            align="start"
                          >
                            <SelectItem value="none">No memory (start fresh each time)</SelectItem>
                            <SelectItem value="all-storage">All connected storage integrations</SelectItem>
                            <SelectItem value="single-storage">Specific storage integration</SelectItem>
                          </SelectContent>
                    </Select>
                    
                    {config.memory === "single-storage" && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Select Storage Integration</Label>
                        <Select
                          value={config.memoryIntegration}
                          onValueChange={(value) => setConfig(prev => ({ ...prev, memoryIntegration: value }))}
                        >
                          <SelectTrigger className="w-full focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                            <SelectValue placeholder="Choose a storage integration..." />
                          </SelectTrigger>
                          <SelectContent 
                            position="popper" 
                            side="bottom" 
                            align="start"
                            className="max-h-[300px] overflow-y-auto"
                          >
                            {(() => {
                              const connectedProviders = getConnectedProviders()
                              const storageIntegrations = [
                                { id: 'google-drive', name: 'Google Drive' },
                                { id: 'onedrive', name: 'OneDrive' },
                                { id: 'dropbox', name: 'Dropbox' },
                                { id: 'box', name: 'Box' },
                                { id: 'notion', name: 'Notion' },
                                { id: 'airtable', name: 'Airtable' },
                                { id: 'google-sheets', name: 'Google Sheets' }
                              ]
                              
                              return storageIntegrations
                                .filter(integration => connectedProviders.includes(integration.id))
                                .map(integration => (
                                  <SelectItem key={integration.id} value={integration.id}>
                                    {integration.name}
                                  </SelectItem>
                                ))
                            })()}
                          </SelectContent>
                        </Select>
                        {(() => {
                          const connectedProviders = getConnectedProviders()
                          const storageIntegrations = ['google-drive', 'onedrive', 'dropbox', 'box', 'notion', 'airtable', 'google-sheets']
                          const connectedStorage = storageIntegrations.filter(id => connectedProviders.includes(id))
                          
                          if (connectedStorage.length === 0) {
                            return (
                              <p className="text-sm text-muted-foreground">
                                No storage integrations connected. Connect a storage integration to use memory features.
                              </p>
                            )
                          }
                          return null
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Custom Template Prompt */}
                  {config.template === "custom" && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-primary" />
                        <Label className="text-base font-medium">Prompt</Label>
                      </div>
                      <Textarea
                        value={config.customTemplate}
                        onChange={(e) => setConfig(prev => ({ ...prev, customTemplate: e.target.value }))}
                        placeholder="Write your custom prompt here..."
                        className="min-h-[120px]"
                      />
                    </div>
                  )}

                  {/* Content Type (for Generate template) */}
                  {config.template === "generate" && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-primary" />
                        <Label className="text-base font-medium">Content Type</Label>
                      </div>
                      <Select
                        value={config.contentType}
                        onValueChange={(value) => setConfig(prev => ({ ...prev, contentType: value }))}
                      >
                        <SelectTrigger className="w-full focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="report">Report</SelectItem>
                          <SelectItem value="summary">Summary</SelectItem>
                          <SelectItem value="response">Response</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* System Prompt */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-5 h-5 text-primary" />
                      <Label className="text-base font-medium">System Prompt</Label>
                    </div>
                    <Textarea
                      value={config.systemPrompt}
                      onChange={(e) => setConfig(prev => ({ ...prev, systemPrompt: e.target.value }))}
                      placeholder="e.g., You are a helpful AI assistant. Respond to the user's message in a helpful and professional manner."
                      className="min-h-[120px]"
                    />
                  </div>

                  {/* Tone */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-primary" />
                      <Label className="text-base font-medium">Tone</Label>
                    </div>
                    <Select
                      value={config.tone}
                      onValueChange={(value) => setConfig(prev => ({ ...prev, tone: value }))}
                    >
                      <SelectTrigger className="w-full focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="neutral">Neutral</SelectItem>
                        <SelectItem value="professional">Professional</SelectItem>
                        <SelectItem value="casual">Casual</SelectItem>
                        <SelectItem value="enthusiastic">Enthusiastic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Response Length */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-primary" />
                      <Label className="text-base font-medium">Response Length</Label>
                      <span className="text-sm text-muted-foreground">({config.responseLength} words)</span>
                    </div>
                    <Slider
                      value={[config.responseLength]}
                      onValueChange={([value]) => setConfig(prev => ({ ...prev, responseLength: value }))}
                      max={200}
                      min={10}
                      step={10}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Short</span>
                      <span>Long</span>
                    </div>
                  </div>

                  {/* Input Variables Selection */}
                  {config.inputNodeId && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Database className="w-5 h-5 text-primary" />
                          <Label className="text-base font-medium">Available Output Variables</Label>
                          <EnhancedTooltip 
                            description="These are the output variables available from the selected input node. Select which variables you want to pass to the AI Agent."
                            title="Available Output Variables"
                            showExpandButton={false}
                          />
                        </div>
                        {!hasTriggeredData && getInputVariables().length > 0 && (
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                // Auto-select variables that have actual data available or are commonly useful
                                const allVariables = getInputVariables()
                                const nodeIO = getNodeInputOutput(config.inputNodeId)
                                const realNodeOutput = nodeIO?.output || null
                                const newSelection: Record<string, boolean> = {}
                                const newValues: Record<string, string> = { ...variableValues }
                                const newStaticValues: Record<string, boolean> = { ...useStaticValues }
                                
                                allVariables.forEach(v => {
                                  // Auto-select if data is available or if it's a commonly useful field
                                  const hasData = realNodeOutput && realNodeOutput[v.name] !== undefined && realNodeOutput[v.name] !== null && String(realNodeOutput[v.name]).trim() !== ""
                                  const isCommonField = ['content', 'message', 'text', 'body', 'subject', 'title', 'name', 'description', 'email', 'from', 'to'].includes(v.name.toLowerCase())
                                  const shouldSelect = hasData || isCommonField
                                  
                                  newSelection[v.name] = shouldSelect
                                  newStaticValues[v.name] = false // Default to automatic values
                                  if (!(v.name in newValues)) newValues[v.name] = ""
                                })
                                setSelectedVariables(newSelection)
                                setVariableValues(newValues)
                                setUseStaticValues(newStaticValues)
                              }}
                              className="text-xs h-7"
                            >
                              Smart Select
                            </Button>
                            <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const allVariables = getInputVariables()
                              const allSelected = allVariables.every(v => selectedVariables[v.name])
                              if (allSelected) {
                                setSelectedVariables({})
                                setVariableValues({})
                                setUseStaticValues({})
                              } else {
                                const newSelection: Record<string, boolean> = {}
                                const newValues: Record<string, string> = { ...variableValues }
                                const newStaticValues: Record<string, boolean> = { ...useStaticValues }
                                allVariables.forEach(v => {
                                  newSelection[v.name] = true
                                  // Default to automatic values (not static)
                                  newStaticValues[v.name] = false
                                  if (!(v.name in newValues)) newValues[v.name] = ""
                                })
                                setSelectedVariables(newSelection)
                                setVariableValues(newValues)
                                setUseStaticValues(newStaticValues)
                              }
                            }}
                          >
                            {getInputVariables().every(v => selectedVariables[v.name]) ? "Deselect All" : "Select All"}
                            </Button>
                          </div>
                        )}
                      </div>
                      
                      {getInputVariables().length === 0 ? (
                        <div className="p-4 border border-dashed rounded-lg text-center">
                          <p className="text-sm text-muted-foreground">
                            No output variables available from the selected node. The node might not have any configured outputs or might not be fully set up yet.
                          </p>
                        </div>
                      ) : (
                        <>
                          {(() => {
                            // Check if we're using outputSchema (dynamic) vs trigger outputs (hardcoded)
                            const { ALL_NODE_COMPONENTS } = require("@/lib/workflows/availableNodes")
                            const nodeComponent = ALL_NODE_COMPONENTS.find((c: any) => c.type === inputNodeData?.data?.type)
                            const usingOutputSchema = nodeComponent?.outputSchema && nodeComponent.outputSchema.length > 0
                            
                            return (
                              <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded text-sm">
                                <p className="text-blue-800">
                                  {usingOutputSchema ? (
                                    <>
                                      ✨ <strong>Dynamic Variables:</strong> These variables are automatically detected from the selected node's output schema.
                                    </>
                                  ) : (
                                    <>
                                      📋 <strong>Predefined Variables:</strong> These are common variables for this trigger type. Use "Smart Select" to choose relevant ones.
                                    </>
                                  )}
                                </p>
                              </div>
                            )
                          })()}
                          
                          <div className="space-y-2">
                            {getInputVariables().map((variable) => (
                          <div key={variable.name} className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
                            <Checkbox
                              id={`variable-${variable.name}`}
                              checked={selectedVariables[variable.name] || false}
                              onCheckedChange={(checked) => {
                                setSelectedVariables(prev => ({
                                  ...prev,
                                  [variable.name]: checked as boolean
                                }))
                                if (!checked) {
                                  setVariableValues(prev => {
                                    const copy = { ...prev }
                                    delete copy[variable.name]
                                    return copy
                                  })
                                  setUseStaticValues(prev => {
                                    const copy = { ...prev }
                                    delete copy[variable.name]
                                    return copy
                                  })
                                } else {
                                  setVariableValues(prev => ({ ...prev, [variable.name]: prev[variable.name] || "" }))
                                  // Default to automatic values (not static)
                                  setUseStaticValues(prev => ({ ...prev, [variable.name]: false }))
                                }
                              }}
                            />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <Label htmlFor={`variable-${variable.name}`} className="text-sm font-medium cursor-pointer">
                                  {variable.label}
                                </Label>
                                <Badge variant="outline" className="text-xs">
                                  {variable.type}
                                </Badge>
                                {(() => {
                                  // Check if this variable has actual data available
                                  const nodeIO = getNodeInputOutput(config.inputNodeId)
                                  const realNodeOutput = nodeIO?.output || null
                                  const hasData = realNodeOutput && realNodeOutput[variable.name] !== undefined && realNodeOutput[variable.name] !== null && String(realNodeOutput[variable.name]).trim() !== ""
                                  
                                  if (hasData) {
                                    return (
                                      <Badge variant="default" className="text-xs bg-green-100 text-green-800 border-green-200">
                                        Data Available
                                      </Badge>
                                    )
                                  }
                                  return null
                                })()}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {variable.description || 'No description available'}
                              </div>
                              
                              {/* Show toggle and input for selected variables */}
                              {selectedVariables[variable.name] && (
                                <div className="mt-3 space-y-2">
                                  <div className="flex items-center gap-2">
                                    <Switch
                                      id={`static-${variable.name}`}
                                      checked={useStaticValues[variable.name] || false}
                                      onCheckedChange={(checked) => {
                                        setUseStaticValues(prev => ({
                                          ...prev,
                                          [variable.name]: checked
                                        }))
                                        if (checked) {
                                          setVariableValues(prev => ({
                                            ...prev,
                                            [variable.name]: ""
                                          }))
                                        }
                                      }}
                                    />
                                    <Label htmlFor={`static-${variable.name}`} className="text-xs">
                                      Use static value
                                    </Label>
                                  </div>
                                  
                                  {useStaticValues[variable.name] && (
                                    <Input
                                      className="text-xs"
                                      placeholder={variable.example?.toString() || 'Enter value'}
                                      value={variableValues[variable.name] || ''}
                                      onChange={e => setVariableValues(prev => ({ ...prev, [variable.name]: e.target.value }))}
                                    />
                                  )}
                                  
                                  {!useStaticValues[variable.name] && (
                                    <div className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                                      Will use automatic value from {inputNodeData?.data?.title || 'trigger'}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                            ))}
                          </div>
                        </>
                      )}

                      {!canGenerate() && (
                        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                            <div className="text-sm">
                              <p className="font-medium text-yellow-900">No variables selected or missing static values</p>
                              <p className="text-yellow-700">
                                Select at least one input variable to enable generation. Variables using static values must have a value entered.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Generate Button */}
                  <div className="flex gap-3 pt-4">
                    <Button
                      onClick={handleGenerate}
                      disabled={!canGenerate() || isGenerating}
                      className="flex-1"
                    >
                      {isGenerating ? (
                        <>
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          Generate
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Generated Response Preview */}
                  {generatedResponse && (
                    <div className="space-y-3">
                      <Label className="text-base font-medium">Generated Response</Label>
                      <div className="p-4 border rounded-lg bg-muted/30">
                        <p className="text-sm whitespace-pre-wrap">{generatedResponse}</p>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="advanced" className="space-y-6 mt-6">
                  {/* Model Configuration */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Brain className="w-5 h-5 text-primary" />
                      <Label className="text-base font-medium">Model</Label>
                    </div>
                    <Select
                      value={config.model}
                      onValueChange={(value) => setConfig(prev => ({ ...prev, model: value }))}
                    >
                      <SelectTrigger className="w-full focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gpt-4">GPT-4</SelectItem>
                        <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                        <SelectItem value="claude-3-opus">Claude 3 Opus</SelectItem>
                        <SelectItem value="claude-3-sonnet">Claude 3 Sonnet</SelectItem>
                        <SelectItem value="claude-3-haiku">Claude 3 Haiku</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Temperature */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Zap className="w-5 h-5 text-primary" />
                      <Label className="text-base font-medium">Temperature</Label>
                      <span className="text-sm text-muted-foreground">({config.temperature})</span>
                    </div>
                    <Slider
                      value={[config.temperature]}
                      onValueChange={([value]) => setConfig(prev => ({ ...prev, temperature: value }))}
                      max={2}
                      min={0}
                      step={0.1}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Focused</span>
                      <span>Creative</span>
                    </div>
                  </div>

                  {/* Max Tokens */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-primary" />
                      <Label className="text-base font-medium">Max Tokens</Label>
                      <span className="text-sm text-muted-foreground">({config.maxTokens})</span>
                    </div>
                    <Slider
                      value={[config.maxTokens]}
                      onValueChange={([value]) => setConfig(prev => ({ ...prev, maxTokens: value }))}
                      max={4000}
                      min={100}
                      step={100}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Short</span>
                      <span>Long</span>
                    </div>
                  </div>

                  {/* Output Format */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Settings className="w-5 h-5 text-primary" />
                      <Label className="text-base font-medium">Output Format</Label>
                    </div>
                    <Select
                      value={config.outputFormat}
                      onValueChange={(value) => setConfig(prev => ({ ...prev, outputFormat: value }))}
                    >
                      <SelectTrigger className="w-full focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Plain Text</SelectItem>
                        <SelectItem value="json">JSON</SelectItem>
                        <SelectItem value="markdown">Markdown</SelectItem>
                        <SelectItem value="html">HTML</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Memory Configuration */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Brain className="w-5 h-5 text-primary" />
                      <Label className="text-base font-medium">Memory</Label>
                      <EnhancedTooltip
                        description="Choose how the AI agent should access memory and context"
                        title="Memory Configuration"
                        showExpandButton={false}
                      />
                    </div>
                    
                    <Select
                      value={config.memory || "all-storage"}
                      onValueChange={(value) => setConfig(prev => ({ ...prev, memory: value }))}
                    >
                      <SelectTrigger className="w-full focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                        <SelectValue placeholder="Select memory configuration" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No memory (start fresh each time)</SelectItem>
                        <SelectItem value="single-storage">One storage integration (select below)</SelectItem>
                        <SelectItem value="all-storage">All connected storage integrations</SelectItem>
                        <SelectItem value="custom">Custom selection (choose specific integrations)</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    {/* Memory Integration Selection */}
                    {config.memory === "single-storage" && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Memory Integration</Label>
                        <Select
                          value={config.memoryIntegration || ""}
                          onValueChange={(value) => setConfig(prev => ({ ...prev, memoryIntegration: value }))}
                        >
                          <SelectTrigger className="w-full focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                            <SelectValue placeholder="Select a storage integration for memory..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="google-drive">Google Drive</SelectItem>
                            <SelectItem value="onedrive">OneDrive</SelectItem>
                            <SelectItem value="dropbox">Dropbox</SelectItem>
                            <SelectItem value="box">Box</SelectItem>
                            <SelectItem value="notion">Notion</SelectItem>
                            <SelectItem value="airtable">Airtable</SelectItem>
                            <SelectItem value="google-sheets">Google Sheets</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    
                    {/* Custom Memory Integrations Selection */}
                    {config.memory === "custom" && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Custom Memory Integrations</Label>
                        <div className="grid grid-cols-3 gap-3 p-3 border rounded-lg bg-muted/30">
                          {[
                            { value: "gmail", label: "Gmail", category: "Communication" },
                            { value: "slack", label: "Slack", category: "Communication" },
                            { value: "discord", label: "Discord", category: "Communication" },
                            { value: "teams", label: "Microsoft Teams", category: "Communication" },
                            { value: "notion", label: "Notion", category: "Productivity" },
                            { value: "google-sheets", label: "Google Sheets", category: "Productivity" },
                            { value: "google-calendar", label: "Google Calendar", category: "Productivity" },
                            { value: "airtable", label: "Airtable", category: "Productivity" },
                            { value: "hubspot", label: "HubSpot", category: "CRM" },
                            { value: "github", label: "GitHub", category: "Development" },
                            { value: "google-drive", label: "Google Drive", category: "Storage" },
                            { value: "onedrive", label: "OneDrive", category: "Storage" },
                            { value: "dropbox", label: "Dropbox", category: "Storage" },
                            { value: "box", label: "Box", category: "Storage" }
                          ].map((integration) => (
                            <div key={integration.value} className="flex items-center space-x-2 p-2 rounded hover:bg-muted/50 transition-colors">
                              <Checkbox
                                id={`memory-${integration.value}`}
                                checked={config.customMemoryIntegrations?.includes(integration.value) || false}
                                onCheckedChange={(checked) => {
                                  setConfig(prev => ({
                                    ...prev,
                                    customMemoryIntegrations: checked
                                      ? [...(prev.customMemoryIntegrations || []), integration.value]
                                      : (prev.customMemoryIntegrations || []).filter((id: string) => id !== integration.value)
                                  }))
                                }}
                              />
                              <Label htmlFor={`memory-${integration.value}`} className="text-sm cursor-pointer">
                                {integration.label}
                              </Label>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Select which integrations the AI agent should access for memory and context
                        </p>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </ScrollArea>
        </div>

        {/* Dialog Footer */}
        <DialogFooter className="px-6 py-4 border-t border-border flex-shrink-0 bg-background relative z-10">
          <div className="flex items-center justify-between w-full">
            <div className="text-sm text-muted-foreground">
              {config.inputNodeId && (
                (() => {
                  const selectedNode = workflowData?.nodes.find(node => node.id === config.inputNodeId)
                  const { ALL_NODE_COMPONENTS } = require("@/lib/workflows/availableNodes")
                  const nodeComponent = ALL_NODE_COMPONENTS.find((c: any) => c.type === selectedNode?.data?.type)
                  const producesOutput = nodeComponent?.producesOutput
                  
                  return (
                    <span className={cn(
                      producesOutput ? "text-muted-foreground" : "text-yellow-600"
                    )}>
                      {producesOutput ? "Connected to input node" : "Warning: Selected node may not produce output"}
                    </span>
                  )
                })()
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave}>
                Save Configuration
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContentWithoutClose>
    </Dialog>
  )
} 