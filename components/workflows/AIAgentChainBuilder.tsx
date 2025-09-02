"use client"

import React, { useState, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Plus, Trash2, Settings, ChevronDown, ChevronUp, Copy, 
  Wand2, Link, Zap, Bot, Workflow, ArrowRight, Layers,
  GripVertical, AlertCircle, CheckCircle, Info, Play,
  Edit3, Save, X, Sparkles, PlusCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { motion, AnimatePresence, Reorder } from 'framer-motion'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'
import { useIntegrationStore } from '@/stores/integrationStore'
import { ChainActionConfigModal } from './ChainActionConfigModal'

// Types
export interface ChainAction {
  id: string
  nodeType: string
  providerId: string
  config: Record<string, any>
  aiAutoConfig: boolean
  position: number
}

export interface Chain {
  id: string
  name: string
  description?: string
  condition?: string
  actions: ChainAction[]
  enabled: boolean
  color?: string
}

interface AIAgentChainBuilderProps {
  chains: Chain[]
  onChainsChange: (chains: Chain[]) => void
  onPreviewUpdate?: (chains: Chain[]) => void
  workflowData?: { nodes: any[], edges: any[] }
  currentNodeId?: string
}

// Chain Templates
const CHAIN_TEMPLATES = [
  {
    id: 'customer-support',
    name: 'Customer Support',
    description: 'Handle support tickets efficiently',
    icon: '🎫',
    actions: [
      { type: 'airtable_action_create_record', provider: 'airtable', name: 'Create Ticket' },
      { type: 'gmail_action_send_email', provider: 'gmail', name: 'Notify Team' },
      { type: 'discord_action_send_message', provider: 'discord', name: 'Update User' }
    ]
  },
  {
    id: 'lead-capture',
    name: 'Lead Capture',
    description: 'Capture and nurture leads',
    icon: '🎯',
    actions: [
      { type: 'hubspot_action_create_contact', provider: 'hubspot', name: 'Add to CRM' },
      { type: 'slack_action_send_message', provider: 'slack', name: 'Notify Sales' },
      { type: 'gmail_action_send_email', provider: 'gmail', name: 'Send Welcome Email' }
    ]
  },
  {
    id: 'content-publishing',
    name: 'Content Publishing',
    description: 'Publish content across platforms',
    icon: '📝',
    actions: [
      { type: 'notion_action_create_page', provider: 'notion', name: 'Create Draft' },
      { type: 'twitter_action_post_tweet', provider: 'twitter', name: 'Share on Twitter' },
      { type: 'linkedin_action_create_post', provider: 'linkedin', name: 'Share on LinkedIn' }
    ]
  }
]

// Chain color presets
const CHAIN_COLORS = [
  { name: 'Blue', value: 'blue', class: 'bg-blue-500' },
  { name: 'Green', value: 'green', class: 'bg-green-500' },
  { name: 'Purple', value: 'purple', class: 'bg-purple-500' },
  { name: 'Orange', value: 'orange', class: 'bg-orange-500' },
  { name: 'Pink', value: 'pink', class: 'bg-pink-500' },
  { name: 'Indigo', value: 'indigo', class: 'bg-indigo-500' }
]

export function AIAgentChainBuilder({ 
  chains, 
  onChainsChange, 
  onPreviewUpdate,
  workflowData,
  currentNodeId 
}: AIAgentChainBuilderProps) {
  const { toast } = useToast()
  const { integrations } = useIntegrationStore()
  
  const [selectedChain, setSelectedChain] = useState<string | null>(chains[0]?.id || null)
  const [editingChain, setEditingChain] = useState<string | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showActionSelector, setShowActionSelector] = useState<{ chainId: string, position?: number } | null>(null)
  const [configuringAction, setConfiguringAction] = useState<ChainAction | null>(null)

  // Get available actions based on connected integrations
  const availableActions = useMemo(() => {
    const actions = ALL_NODE_COMPONENTS.filter(node => 
      !node.isTrigger && 
      node.type !== 'ai_agent' && 
      integrations?.some(int => int.provider_id === node.providerId && int.is_connected)
    )
    return actions
  }, [integrations])

  // Create a new chain
  const createChain = useCallback((template?: typeof CHAIN_TEMPLATES[0]) => {
    const newChain: Chain = {
      id: `chain-${Date.now()}`,
      name: template?.name || 'New Chain',
      description: template?.description || '',
      actions: [],
      enabled: true,
      color: CHAIN_COLORS[chains.length % CHAIN_COLORS.length].value
    }

    if (template) {
      // Add template actions (but only if integration is connected)
      newChain.actions = template.actions
        .filter(action => integrations?.some(int => int.provider_id === action.provider && int.is_connected))
        .map((action, index) => ({
          id: `action-${Date.now()}-${index}`,
          nodeType: action.type,
          providerId: action.provider,
          config: {},
          aiAutoConfig: true,
          position: index
        }))
    }

    const updatedChains = [...chains, newChain]
    onChainsChange(updatedChains)
    setSelectedChain(newChain.id)
    
    toast({
      title: "Chain Created",
      description: template ? `Created ${template.name} chain` : "Created new chain"
    })
  }, [chains, integrations, onChainsChange, toast])

  // Delete a chain
  const deleteChain = useCallback((chainId: string) => {
    const updatedChains = chains.filter(c => c.id !== chainId)
    onChainsChange(updatedChains)
    
    if (selectedChain === chainId) {
      setSelectedChain(updatedChains[0]?.id || null)
    }
    
    toast({
      title: "Chain Deleted",
      description: "Chain has been removed"
    })
  }, [chains, selectedChain, onChainsChange, toast])

  // Add action to chain
  const addActionToChain = useCallback((chainId: string, action: any, position?: number) => {
    const chain = chains.find(c => c.id === chainId)
    if (!chain) return

    const newAction: ChainAction = {
      id: `action-${Date.now()}`,
      nodeType: action.type,
      providerId: action.providerId,
      config: {},
      aiAutoConfig: false,
      position: position !== undefined ? position : chain.actions.length
    }

    // Update positions if inserting
    const updatedActions = [...chain.actions]
    if (position !== undefined && position < updatedActions.length) {
      // Shift positions of actions after insertion point
      updatedActions.forEach(a => {
        if (a.position >= position) {
          a.position += 1
        }
      })
      updatedActions.splice(position, 0, newAction)
    } else {
      updatedActions.push(newAction)
    }

    const updatedChain = { ...chain, actions: updatedActions }
    const updatedChains = chains.map(c => c.id === chainId ? updatedChain : c)
    
    onChainsChange(updatedChains)
    setShowActionSelector(null)
    
    toast({
      title: "Action Added",
      description: `Added ${action.title} to chain`
    })
  }, [chains, onChainsChange, toast])

  // Remove action from chain
  const removeActionFromChain = useCallback((chainId: string, actionId: string) => {
    const chain = chains.find(c => c.id === chainId)
    if (!chain) return

    const updatedActions = chain.actions.filter(a => a.id !== actionId)
    // Update positions
    updatedActions.forEach((action, index) => {
      action.position = index
    })

    const updatedChain = { ...chain, actions: updatedActions }
    const updatedChains = chains.map(c => c.id === chainId ? updatedChain : c)
    
    onChainsChange(updatedChains)
    
    toast({
      title: "Action Removed",
      description: "Action has been removed from chain"
    })
  }, [chains, onChainsChange, toast])

  // Toggle AI auto-config for action
  const toggleAIAutoConfig = useCallback((chainId: string, actionId: string) => {
    const chain = chains.find(c => c.id === chainId)
    if (!chain) return

    const updatedActions = chain.actions.map(a => 
      a.id === actionId ? { ...a, aiAutoConfig: !a.aiAutoConfig } : a
    )

    const updatedChain = { ...chain, actions: updatedActions }
    const updatedChains = chains.map(c => c.id === chainId ? updatedChain : c)
    
    onChainsChange(updatedChains)
  }, [chains, onChainsChange])

  // Update chain details
  const updateChain = useCallback((chainId: string, updates: Partial<Chain>) => {
    const updatedChains = chains.map(c => 
      c.id === chainId ? { ...c, ...updates } : c
    )
    onChainsChange(updatedChains)
  }, [chains, onChainsChange])

  // Update action configuration
  const updateActionConfig = useCallback((actionId: string, config: Record<string, any>) => {
    const updatedChains = chains.map(chain => ({
      ...chain,
      actions: chain.actions.map(action => 
        action.id === actionId ? { ...action, config, aiAutoConfig: false } : action
      )
    }))
    onChainsChange(updatedChains)
    setConfiguringAction(null)
  }, [chains, onChainsChange])

  const currentChain = chains.find(c => c.id === selectedChain)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Layers className="w-5 h-5" />
              AI Action Chains
            </h3>
            <p className="text-sm text-muted-foreground">
              Create automated workflows that execute after AI analysis
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTemplates(!showTemplates)}
          >
            <Wand2 className="w-4 h-4 mr-2" />
            Templates
          </Button>
        </div>
      </div>

      {/* Templates */}
      <AnimatePresence>
        {showTemplates && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b"
          >
            <div className="p-4 bg-muted/30">
              <div className="grid grid-cols-3 gap-3">
                {CHAIN_TEMPLATES.map(template => (
                  <Card
                    key={template.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => {
                      createChain(template)
                      setShowTemplates(false)
                    }}
                  >
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <span className="text-2xl">{template.icon}</span>
                        {template.name}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {template.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex flex-wrap gap-1">
                        {template.actions.map((action, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {action.name}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Chain List Sidebar */}
        <div className="w-64 border-r flex flex-col">
          <div className="p-4 border-b">
            <Button
              onClick={() => createChain()}
              className="w-full"
              size="sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Chain
            </Button>
          </div>
          
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-2">
              {chains.map(chain => (
                <Card
                  key={chain.id}
                  className={cn(
                    "cursor-pointer transition-all",
                    selectedChain === chain.id && "ring-2 ring-primary"
                  )}
                  onClick={() => setSelectedChain(chain.id)}
                >
                  <CardHeader className="p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <div className={cn(
                            "w-3 h-3 rounded-full",
                            `bg-${chain.color}-500`
                          )} />
                          {chain.name}
                        </CardTitle>
                        {chain.description && (
                          <CardDescription className="text-xs mt-1">
                            {chain.description}
                          </CardDescription>
                        )}
                      </div>
                      <Badge variant={chain.enabled ? "default" : "secondary"} className="text-xs">
                        {chain.actions.length}
                      </Badge>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Chain Editor */}
        <div className="flex-1 flex flex-col">
          {currentChain ? (
            <>
              {/* Chain Header */}
              <div className="p-4 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {editingChain === currentChain.id ? (
                      <Input
                        value={currentChain.name}
                        onChange={(e) => updateChain(currentChain.id, { name: e.target.value })}
                        className="w-48"
                        autoFocus
                        onBlur={() => setEditingChain(null)}
                        onKeyDown={(e) => e.key === 'Enter' && setEditingChain(null)}
                      />
                    ) : (
                      <h4 className="font-semibold flex items-center gap-2">
                        <div className={cn(
                          "w-4 h-4 rounded-full",
                          `bg-${currentChain.color}-500`
                        )} />
                        {currentChain.name}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingChain(currentChain.id)}
                        >
                          <Edit3 className="w-3 h-3" />
                        </Button>
                      </h4>
                    )}
                    
                    <Switch
                      checked={currentChain.enabled}
                      onCheckedChange={(enabled) => updateChain(currentChain.id, { enabled })}
                    />
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Select
                      value={currentChain.color}
                      onValueChange={(color) => updateChain(currentChain.id, { color })}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CHAIN_COLORS.map(color => (
                          <SelectItem key={color.value} value={color.value}>
                            <div className="flex items-center gap-2">
                              <div className={cn("w-3 h-3 rounded-full", color.class)} />
                              {color.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteChain(currentChain.id)}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
                
                {/* Chain Description */}
                <div className="mt-3">
                  <Textarea
                    placeholder="Add a description for this chain..."
                    value={currentChain.description || ''}
                    onChange={(e) => updateChain(currentChain.id, { description: e.target.value })}
                    className="h-16 resize-none"
                  />
                </div>
                
                {/* Conditional Execution */}
                <div className="mt-3">
                  <Label className="text-sm">Execution Condition (Optional)</Label>
                  <Input
                    placeholder="e.g., {{ai.category}} == 'support'"
                    value={currentChain.condition || ''}
                    onChange={(e) => updateChain(currentChain.id, { condition: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>

              {/* Actions List */}
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-3">
                  {currentChain.actions.length === 0 ? (
                    <Alert>
                      <Info className="w-4 h-4" />
                      <AlertDescription>
                        No actions in this chain yet. Add actions to build your automation workflow.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="space-y-2">
                      {currentChain.actions
                        .sort((a, b) => a.position - b.position)
                        .map((action, index) => {
                          const nodeComponent = ALL_NODE_COMPONENTS.find(
                            n => n.type === action.nodeType
                          )
                          
                          return (
                            <React.Fragment key={action.id}>
                              {/* Insert Action Button */}
                              {index === 0 && (
                                <div className="flex justify-center py-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowActionSelector({ 
                                      chainId: currentChain.id, 
                                      position: 0 
                                    })}
                                    className="h-6 opacity-0 hover:opacity-100 transition-opacity"
                                  >
                                    <PlusCircle className="w-4 h-4 mr-1" />
                                    Insert Action
                                  </Button>
                                </div>
                              )}
                              
                              {/* Action Card */}
                              <Card className="relative">
                                <CardHeader className="pb-3">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <GripVertical className="w-4 h-4 text-muted-foreground cursor-move" />
                                      <Badge variant="outline">
                                        {nodeComponent?.providerId}
                                      </Badge>
                                      <span className="font-medium text-sm">
                                        {nodeComponent?.title || action.nodeType}
                                      </span>
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                      {/* AI Auto Config Toggle */}
                                      <div className="flex items-center gap-2">
                                        <Label className="text-xs">AI Config</Label>
                                        <Switch
                                          checked={action.aiAutoConfig}
                                          onCheckedChange={() => toggleAIAutoConfig(currentChain.id, action.id)}
                                        />
                                      </div>
                                      
                                      {/* Configure Button */}
                                      {!action.aiAutoConfig && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => setConfiguringAction(action)}
                                        >
                                          <Settings className="w-3 h-3 mr-1" />
                                          Configure
                                        </Button>
                                      )}
                                      
                                      {/* Remove Button */}
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removeActionFromChain(currentChain.id, action.id)}
                                      >
                                        <X className="w-3 h-3 text-red-500" />
                                      </Button>
                                    </div>
                                  </div>
                                </CardHeader>
                                
                                {action.aiAutoConfig && (
                                  <CardContent className="pt-0">
                                    <Alert className="bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
                                      <Sparkles className="w-4 h-4 text-purple-600" />
                                      <AlertDescription className="text-xs">
                                        AI will automatically configure this action based on the workflow context
                                      </AlertDescription>
                                    </Alert>
                                  </CardContent>
                                )}
                              </Card>
                              
                              {/* Insert Action Button Between */}
                              <div className="flex justify-center py-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setShowActionSelector({ 
                                    chainId: currentChain.id, 
                                    position: index + 1 
                                  })}
                                  className="h-6 opacity-0 hover:opacity-100 transition-opacity"
                                >
                                  <PlusCircle className="w-4 h-4 mr-1" />
                                  Insert Action
                                </Button>
                              </div>
                            </React.Fragment>
                          )
                        })}
                    </div>
                  )}
                  
                  {/* Add Action Button */}
                  {currentChain.actions.length === 0 && (
                    <div className="flex justify-center pt-4">
                      <Button
                        onClick={() => setShowActionSelector({ chainId: currentChain.id })}
                        variant="outline"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add First Action
                      </Button>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Workflow className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h4 className="font-semibold mb-2">No Chains Yet</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Create your first chain to start building automated workflows
                </p>
                <Button onClick={() => createChain()}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create First Chain
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Selector Modal */}
      {showActionSelector && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-[600px] max-h-[80vh] overflow-hidden">
            <CardHeader>
              <CardTitle>Select Action</CardTitle>
              <CardDescription>
                Choose an action to add to the chain
              </CardDescription>
            </CardHeader>
            <ScrollArea className="h-[400px]">
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {availableActions.map(action => (
                    <Card
                      key={action.type}
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => addActionToChain(
                        showActionSelector.chainId, 
                        action, 
                        showActionSelector.position
                      )}
                    >
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {action.providerId}
                          </Badge>
                          {action.title}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          {action.description}
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </ScrollArea>
            <CardContent className="border-t">
              <Button
                variant="outline"
                onClick={() => setShowActionSelector(null)}
                className="w-full"
              >
                Cancel
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Action Configuration Modal */}
      <ChainActionConfigModal
        action={configuringAction}
        isOpen={!!configuringAction}
        onClose={() => setConfiguringAction(null)}
        onSave={updateActionConfig}
      />
    </div>
  )
}