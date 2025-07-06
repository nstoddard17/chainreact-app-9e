"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { HelpCircle, Bot, Zap, Brain, Settings, Target, MessageSquare, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

interface AIAgentConfigModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (config: Record<string, any>) => void
  initialData?: Record<string, any>
  workflowData?: { nodes: any[], edges: any[] }
  currentNodeId?: string
}

// Available tools that the AI Agent can use
const AVAILABLE_TOOLS = [
  { id: "gmail", name: "Gmail", description: "Send and read emails", category: "Communication" },
  { id: "slack", name: "Slack", description: "Send messages and manage channels", category: "Communication" },
  { id: "notion", name: "Notion", description: "Create and update pages", category: "Productivity" },
  { id: "google-sheets", name: "Google Sheets", description: "Read and write spreadsheet data", category: "Productivity" },
  { id: "airtable", name: "Airtable", description: "Manage database records", category: "Productivity" },
  { id: "hubspot", name: "HubSpot", description: "Manage contacts and CRM data", category: "CRM" },
  { id: "github", name: "GitHub", description: "Create issues and manage repositories", category: "Development" },
  { id: "google-calendar", name: "Google Calendar", description: "Schedule and manage events", category: "Productivity" },
  { id: "google-drive", name: "Google Drive", description: "Upload and manage files", category: "Storage" },
  { id: "discord", name: "Discord", description: "Send messages to Discord channels", category: "Communication" },
]

// Memory scope options
const MEMORY_SCOPES = [
  { value: "workflow", label: "Current Workflow", description: "Access to data from the current workflow execution" },
  { value: "session", label: "User Session", description: "Access to data from the current user session" },
  { value: "global", label: "Global Memory", description: "Access to persistent data across all workflows" },
  { value: "none", label: "No Memory", description: "No memory access - stateless execution" },
]

export default function AIAgentConfigModal({
  isOpen,
  onClose,
  onSave,
  initialData = {},
  workflowData,
  currentNodeId,
}: AIAgentConfigModalProps) {
  const [config, setConfig] = useState<Record<string, any>>({
    goal: "",
    allowedTools: [],
    memoryScope: "workflow",
    systemPrompt: "",
    maxSteps: 10,
    ...initialData,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Reset config when modal opens
  useEffect(() => {
    if (isOpen) {
      setConfig({
        goal: "",
        allowedTools: [],
        memoryScope: "workflow",
        systemPrompt: "",
        maxSteps: 10,
        ...initialData,
      })
      setErrors({})
    }
  }, [isOpen, initialData])

  const handleSave = () => {
    const newErrors: Record<string, string> = {}

    // Validate required fields
    if (!config.goal.trim()) {
      newErrors.goal = "Goal is required"
    }

    if (config.allowedTools.length === 0) {
      newErrors.allowedTools = "At least one tool must be selected"
    }

    if (config.maxSteps < 1 || config.maxSteps > 50) {
      newErrors.maxSteps = "Max steps must be between 1 and 50"
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    onSave(config)
  }

  const toggleTool = (toolId: string) => {
    setConfig(prev => ({
      ...prev,
      allowedTools: prev.allowedTools.includes(toolId)
        ? prev.allowedTools.filter((id: string) => id !== toolId)
        : [...prev.allowedTools, toolId]
    }))
    // Clear error when user selects a tool
    if (errors.allowedTools) {
      setErrors(prev => ({ ...prev, allowedTools: "" }))
    }
  }

  const getToolCategory = (category: string) => {
    const categoryColors: Record<string, string> = {
      Communication: "bg-blue-100 text-blue-800",
      Productivity: "bg-green-100 text-green-800",
      CRM: "bg-purple-100 text-purple-800",
      Development: "bg-gray-100 text-gray-800",
      Storage: "bg-orange-100 text-orange-800",
    }
    return categoryColors[category] || "bg-gray-100 text-gray-800"
  }

  const renderToolCard = (tool: any) => {
    const isSelected = config.allowedTools.includes(tool.id)
    
    return (
      <Card
        key={tool.id}
        className={cn(
          "cursor-pointer transition-all hover:shadow-md",
          isSelected && "ring-2 ring-primary bg-primary/5"
        )}
        onClick={() => toggleTool(tool.id)}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-medium">{tool.name}</h3>
                <Badge className={getToolCategory(tool.category)} variant="secondary">
                  {tool.category}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{tool.description}</p>
            </div>
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => toggleTool(tool.id)}
              className="ml-2"
            />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <TooltipProvider>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl w-full max-h-[90vh] p-0 gap-0 overflow-hidden">
          <div className="flex h-full">
            {/* Main Configuration Content */}
            <div className="flex-1 flex flex-col">
              <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Bot className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <DialogTitle className="text-lg font-semibold">
                      Configure AI Agent
                    </DialogTitle>
                    <DialogDescription>
                      Set up your AI agent's behavior, goals, and available tools
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <ScrollArea className="flex-1 max-h-[60vh]">
                <div className="px-6 py-4 space-y-6">
                  {/* Goal Configuration */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Target className="w-5 h-5 text-primary" />
                      <Label className="text-base font-medium">Goal</Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                            <HelpCircle className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="text-sm">The main objective the AI agent should accomplish</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Textarea
                      value={config.goal}
                      onChange={(e) => {
                        setConfig(prev => ({ ...prev, goal: e.target.value }))
                        if (errors.goal) setErrors(prev => ({ ...prev, goal: "" }))
                      }}
                      placeholder="e.g., Analyze customer feedback from Gmail, create a summary in Notion, and send a report to Slack"
                      className="min-h-[100px]"
                    />
                    {errors.goal && (
                      <p className="text-sm text-red-600">{errors.goal}</p>
                    )}
                  </div>

                  {/* Allowed Tools */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Zap className="w-5 h-5 text-primary" />
                      <Label className="text-base font-medium">Allowed Tools</Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                            <HelpCircle className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="text-sm">Select which integrations the AI agent can use as tools</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {AVAILABLE_TOOLS.map(renderToolCard)}
                    </div>
                    {errors.allowedTools && (
                      <p className="text-sm text-red-600">{errors.allowedTools}</p>
                    )}
                  </div>

                  {/* Memory Scope */}
                  <div className="space-y-3">
                                         <div className="flex items-center gap-2">
                       <Brain className="w-5 h-5 text-primary" />
                      <Label className="text-base font-medium">Memory Scope</Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                            <HelpCircle className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="text-sm">Define what data the AI agent can access from memory</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Select
                      value={config.memoryScope}
                      onValueChange={(value) => setConfig(prev => ({ ...prev, memoryScope: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select memory scope" />
                      </SelectTrigger>
                      <SelectContent>
                        {MEMORY_SCOPES.map((scope) => (
                          <SelectItem key={scope.value} value={scope.value}>
                            <div>
                              <div className="font-medium">{scope.label}</div>
                              <div className="text-sm text-muted-foreground">{scope.description}</div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* System Prompt */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-5 h-5 text-primary" />
                      <Label className="text-base font-medium">System Prompt (Optional)</Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                            <HelpCircle className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="text-sm">Custom instructions to guide the AI agent's behavior</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Textarea
                      value={config.systemPrompt}
                      onChange={(e) => setConfig(prev => ({ ...prev, systemPrompt: e.target.value }))}
                      placeholder="e.g., You are a helpful AI assistant focused on customer service. Always be polite and professional."
                      className="min-h-[100px]"
                    />
                  </div>

                  {/* Max Steps */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-primary" />
                      <Label className="text-base font-medium">Maximum Steps</Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                            <HelpCircle className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="text-sm">Maximum number of tool calls the AI agent can make</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      type="number"
                      value={config.maxSteps}
                      onChange={(e) => {
                        const value = parseInt(e.target.value)
                        setConfig(prev => ({ ...prev, maxSteps: value }))
                        if (errors.maxSteps) setErrors(prev => ({ ...prev, maxSteps: "" }))
                      }}
                      min="1"
                      max="50"
                      className="w-32"
                    />
                    {errors.maxSteps && (
                      <p className="text-sm text-red-600">{errors.maxSteps}</p>
                    )}
                  </div>
                </div>
              </ScrollArea>

              {/* Dialog Footer */}
              <DialogFooter className="px-6 py-4 border-t border-border flex-shrink-0">
                <div className="flex items-center justify-between w-full">
                  <div className="text-sm text-muted-foreground">
                    {config.allowedTools.length > 0 && (
                      <span>Selected {config.allowedTools.length} tool{config.allowedTools.length !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={onClose}>
                      Cancel
                    </Button>
                    <Button onClick={handleSave}>
                      Save Configuration
                    </Button>
                  </div>
                </div>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
} 