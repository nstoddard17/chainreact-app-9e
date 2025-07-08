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
import { EnhancedTooltip } from "@/components/ui/enhanced-tooltip"
import { HelpCircle, Bot, Zap, Brain, Settings, Target, MessageSquare, Clock } from "lucide-react"
import { INTEGRATION_CONFIGS } from "@/lib/integrations/availableIntegrations"
import { integrationIcons } from "@/lib/integrations/integration-icons"
import { cn } from "@/lib/utils"

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
  const [config, setConfig] = useState<Record<string, any>>({
    inputNodeId: "",
    memory: "all-storage",
    memoryIntegration: "",
    customMemoryIntegrations: [],
    systemPrompt: "",
    ...initialData,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Reset config when modal opens
  useEffect(() => {
    if (isOpen) {
      setConfig({
        inputNodeId: "",
        memory: "all-storage",
        memoryIntegration: "",
        customMemoryIntegrations: [],
        systemPrompt: "",
        ...initialData,
      })
      setErrors({})
    }
  }, [isOpen, initialData])

  const handleSave = () => {
    const newErrors: Record<string, string> = {}

    // Validate required fields
    if (!config.inputNodeId) {
      newErrors.inputNodeId = "Input node is required"
    } else {
      // Validate that the selected input node produces output
      const selectedNode = workflowData?.nodes.find(node => node.id === config.inputNodeId)
      if (selectedNode) {
        // Import ALL_NODE_COMPONENTS to check if the node produces output
        const { ALL_NODE_COMPONENTS } = require("@/lib/workflows/availableNodes")
        const nodeComponent = ALL_NODE_COMPONENTS.find((c: any) => c.type === selectedNode.data?.type)
        
        if (!nodeComponent?.producesOutput) {
          newErrors.inputNodeId = "The selected node does not produce output data. Please select a node that produces data (like triggers, data retrieval actions, etc.)"
        }
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    onSave(config)
  }

  const handleInputNodeChange = (nodeId: string) => {
    setConfig(prev => ({ ...prev, inputNodeId: nodeId }))
    
    // Update workflow connections if callback is provided
    if (onUpdateConnections && currentNodeId && nodeId) {
      onUpdateConnections(nodeId, currentNodeId)
    }
    
    // Clear error when user selects an input node
    if (errors.inputNodeId) {
      setErrors(prev => ({ ...prev, inputNodeId: "" }))
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl w-full max-h-[95vh] p-0 gap-0 overflow-hidden">
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

              <ScrollArea className="flex-1 max-h-[70vh]">
                <div className="px-6 py-4 space-y-6">
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
                          <SelectTrigger>
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
                                  <SelectItem key={node.id} value={node.id} className="pl-2">
                                    <div className="flex items-center gap-2 -ml-1">
                                      <div className="w-5 h-5 rounded flex items-center justify-center bg-muted/50">
                                        {iconPath ? (
                                          <img 
                                            src={iconPath} 
                                            alt={integration?.name || node.data?.type} 
                                            className="w-4 h-4"
                                          />
                                        ) : (
                                          <span className="text-xs font-medium text-muted-foreground">
                                            {node.data?.type?.charAt(0).toUpperCase() || 'N'}
                                          </span>
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
                        
                        {config.inputNodeId && (
                          <div className="p-3 bg-muted/30 rounded-lg">
                            {(() => {
                              const selectedNode = workflowData?.nodes.find(node => node.id === config.inputNodeId)
                              const { ALL_NODE_COMPONENTS } = require("@/lib/workflows/availableNodes")
                              const nodeComponent = ALL_NODE_COMPONENTS.find((c: any) => c.type === selectedNode?.data?.type)
                              const producesOutput = nodeComponent?.producesOutput
                              
                              return (
                                <>
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className={cn(
                                      "w-2 h-2 rounded-full",
                                      producesOutput ? "bg-green-500" : "bg-yellow-500"
                                    )}></div>
                                    <span className="text-sm font-medium">
                                      {producesOutput ? "Connected" : "Warning"}
                                    </span>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {producesOutput 
                                      ? "The AI Agent will receive data from the selected node and process it using the configured tools and memory."
                                      : "The selected node does not produce output data. The AI Agent may not receive useful input."
                                    }
                                  </p>
                                </>
                              )
                            })()}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-4 border border-dashed rounded-lg text-center">
                        <p className="text-sm text-muted-foreground">
                          No other nodes found in the workflow. Add some nodes first to connect them to the AI Agent.
                        </p>
                      </div>
                    )}
                    
                    {errors.inputNodeId && (
                      <p className="text-sm text-red-600">{errors.inputNodeId}</p>
                    )}
                  </div>



                  {/* Memory Configuration */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Brain className="w-5 h-5 text-primary" />
                      <Label className="text-base font-medium">Memory</Label>
                      <EnhancedTooltip 
                        description="Choose how the AI agent should access memory and context"
                        title="Memory Configuration Information"
                        showExpandButton={false}
                      />
                    </div>
                    <Select
                      value={config.memory || "all-storage"}
                      onValueChange={(value) => setConfig(prev => ({ ...prev, memory: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select memory configuration" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No memory (start fresh each time)</SelectItem>
                        <SelectItem value="single-storage">One storage integration (select below)</SelectItem>
                        <SelectItem value="all-storage">All connected storage integrations</SelectItem>
                        <SelectItem value="custom">Custom selection (choose specific integrations)</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    {/* Single Storage Integration Selection */}
                    {config.memory === "single-storage" && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Memory Integration</Label>
                        <Select
                          value={config.memoryIntegration || ""}
                          onValueChange={(value) => setConfig(prev => ({ ...prev, memoryIntegration: value }))}
                        >
                          <SelectTrigger className="w-full">
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

                  {/* System Prompt */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-5 h-5 text-primary" />
                      <Label className="text-base font-medium">System Prompt (Optional)</Label>
                      <EnhancedTooltip 
                        description="Custom instructions to guide the AI agent's behavior"
                        title="System Prompt Information"
                        showExpandButton={false}
                      />
                    </div>
                    <Textarea
                      value={config.systemPrompt}
                      onChange={(e) => setConfig(prev => ({ ...prev, systemPrompt: e.target.value }))}
                      placeholder="e.g., You are a helpful AI assistant focused on customer service. Always be polite and professional."
                      className="min-h-[100px]"
                    />
                  </div>


                </div>
              </ScrollArea>

              {/* Dialog Footer */}
              <DialogFooter className="px-6 py-4 border-t border-border flex-shrink-0">
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
  )
} 