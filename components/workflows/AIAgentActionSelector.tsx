"use client"

import React, { useState, useMemo, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ProfessionalSearch } from '@/components/ui/professional-search'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { 
  Search, Bot, Zap, ChevronRight, Info, Sparkles, Settings,
  Wand2, LinkIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { INTEGRATION_CONFIGS } from '@/lib/integrations/availableIntegrations'
import { getIntegrationLogoClasses } from '@/lib/integrations/logoStyles'
import { NodeComponent } from '@/lib/workflows/types'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes/index'
import { useToast } from '@/hooks/use-toast'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useIntegrationSelection } from '@/hooks/workflows/useIntegrationSelection'

interface AIAgentActionSelectorProps {
  isOpen: boolean
  onClose: () => void
  onActionSelect: (
    integration: any,
    action: NodeComponent,
    aiAutoConfig: boolean
  ) => void
  chainId?: string
  chainName?: string
}

export function AIAgentActionSelector({
  isOpen,
  onClose,
  onActionSelect,
  chainId,
  chainName = 'Chain'
}: AIAgentActionSelectorProps) {
  const { toast } = useToast()
  const { integrations, getConnectedProviders } = useIntegrationStore()
  const { comingSoonIntegrations } = useIntegrationSelection()
  
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [showConnectedOnly, setShowConnectedOnly] = useState(false) // Show all integrations by default
  const [selectedIntegration, setSelectedIntegration] = useState<any>(null)
  const [selectedAction, setSelectedAction] = useState<NodeComponent | null>(null)
  const [aiAutoConfig, setAiAutoConfig] = useState(true)

  // Build available integrations from ALL_NODE_COMPONENTS
  const availableIntegrations = useMemo(() => {
    const integrationMap: Record<string, any> = {}
    
    // First create integration entries from INTEGRATION_CONFIGS
    for (const integrationId in INTEGRATION_CONFIGS) {
      const config = INTEGRATION_CONFIGS[integrationId]
      if (config) {
        integrationMap[integrationId] = {
          id: config.id,
          name: config.name,
          description: config.description,
          category: config.category,
          color: config.color,
          actions: [],
          triggers: []
        }
      }
    }
    
    // Add logic integration separately (not in INTEGRATION_CONFIGS)
    integrationMap['logic'] = {
      id: 'logic',
      name: 'Logic',
      description: 'Logic and control flow actions',
      category: 'Core',
      color: '#6B7280',
      actions: [],
      triggers: []
    }
    
    // Then populate with actual node components
    ALL_NODE_COMPONENTS.forEach((node) => {
      // Skip triggers, webhooks, and schedule actions for AI Agent
      if (node.isTrigger || node.type === 'webhook' || node.type === 'schedule') {
        return
      }
      
      // Check if integration exists in map
      if (node.providerId && integrationMap[node.providerId]) {
        integrationMap[node.providerId].actions.push(node)
      }
    })
    
    // Filter out integrations with no actions
    const integrations = Object.values(integrationMap).filter(
      (int: any) => int.actions.length > 0
    )
    
    // Sort integrations - logic first, then alphabetically
    return integrations.sort((a: any, b: any) => {
      if (a.id === 'logic') return -1
      if (b.id === 'logic') return 1
      return a.name.localeCompare(b.name)
    })
  }, [])

  // Check if integration is connected
  const isIntegrationConnected = useCallback((integrationId: string): boolean => {
    // Logic integration is always "connected" since it doesn't require authentication
    if (integrationId === 'logic') return true
    
    // AI Agent is always "connected" since it doesn't require external authentication
    if (integrationId === 'ai') return true
    
    // Use the integration store to check if this integration is connected
    const connectedProviders = getConnectedProviders()
    const isConnected = connectedProviders.includes(integrationId)
    
    return isConnected
  }, [integrations, getConnectedProviders])
  
  // Render integration logo
  const renderLogo = (integrationId: string, integrationName: string) => {
    // Special handling for logic integration
    if (integrationId === 'logic') {
      return (
        <div className="w-10 h-10 flex items-center justify-center bg-gray-100 rounded-lg">
          <Zap className="w-6 h-6 text-gray-600" />
        </div>
      )
    }
    
    const config = INTEGRATION_CONFIGS[integrationId as keyof typeof INTEGRATION_CONFIGS]
    return <img 
      src={config?.logo || `/integrations/${integrationId}.svg`} 
      alt={`${integrationName} logo`} 
      className={getIntegrationLogoClasses(integrationId, "w-10 h-10 object-contain")} 
      style={{ filter: "drop-shadow(0px 1px 2px rgba(0, 0, 0, 0.05))" }}
    />
  }

  // Get unique categories
  const categories = useMemo(() => {
    const allCategories = availableIntegrations.map(int => int.category)
    return ['all', ...Array.from(new Set(allCategories))]
  }, [availableIntegrations])

  // Filter integrations based on search and filters
  const filteredIntegrations = useMemo(() => {
    return availableIntegrations.filter(int => {
      // Remove AI agent from the action selector when inside AI agent config
      if (int.id === 'ai') return false
      
      if (showConnectedOnly && !isIntegrationConnected(int.id)) return false
      if (filterCategory !== 'all' && int.category !== filterCategory) return false
      
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesIntegration = int.name.toLowerCase().includes(query) || 
                                  int.description.toLowerCase().includes(query)
        const matchesAction = int.actions.some((action: any) => 
          (action.title?.toLowerCase() || '').includes(query) || 
          (action.description?.toLowerCase() || '').includes(query)
        )
        return matchesIntegration || matchesAction
      }
      return int.actions.length > 0
    })
  }, [availableIntegrations, showConnectedOnly, filterCategory, searchQuery, isIntegrationConnected])

  const handleActionSelect = () => {
    if (selectedIntegration && selectedAction) {
      onActionSelect(selectedIntegration, selectedAction, aiAutoConfig)
      
      toast({
        title: aiAutoConfig ? "AI-Configured Action Added" : "Action Added",
        description: aiAutoConfig 
          ? `${selectedAction.title} will be configured by AI at runtime`
          : `${selectedAction.title} added - configure it manually`,
      })
      
      // Reset state
      setSelectedIntegration(null)
      setSelectedAction(null)
      setSearchQuery('')
      onClose()
    }
  }

  return (
    <TooltipProvider>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[800px] max-h-[85vh] bg-gradient-to-br from-slate-50 to-white border-0 shadow-2xl flex flex-col overflow-hidden">
          <DialogHeader className="pb-3 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg text-white">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-semibold text-slate-900">
                    Select an Action
                    <Badge variant="secondary" className="ml-2 bg-purple-100 text-purple-700">
                      AI Agent
                    </Badge>
                  </DialogTitle>
                  <DialogDescription className="text-sm text-slate-600 mt-1">
                    Choose an action to add to your AI agent chain.
                  </DialogDescription>
                </div>
              </div>
              {/* AI Auto-Configure Toggle */}
              <div className="flex items-center gap-3 p-2 bg-white rounded-lg border mr-8">
                <div className="flex items-center gap-2">
                  {aiAutoConfig ? (
                    <Sparkles className="w-4 h-4 text-purple-600" />
                  ) : (
                    <Settings className="w-4 h-4 text-gray-600" />
                  )}
                  <Label htmlFor="ai-config" className="text-sm font-medium cursor-pointer">
                    {aiAutoConfig ? 'AI' : 'Manual'}
                  </Label>
                </div>
                <Switch
                  id="ai-config"
                  checked={aiAutoConfig}
                  onCheckedChange={setAiAutoConfig}
                  className="data-[state=checked]:bg-purple-600"
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-sm">
                      <strong>AI:</strong> AI determines configuration at runtime
                    </p>
                    <p className="text-sm mt-1">
                      <strong>Manual:</strong> You configure the action
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </DialogHeader>

          <div className="pt-3 pb-3 border-b border-slate-200">
            <div className="flex items-center space-x-4">
              <div className="relative flex-grow">
                <ProfessionalSearch
                  placeholder="Search integrations or actions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onClear={() => setSearchQuery('')}
                />
              </div>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat}>
                      {cat === 'all' ? 'All Categories' : cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Removed checkbox for connected apps filter */}
            </div>
          </div>

          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* Integrations List */}
            <ScrollArea className="w-2/5 border-r border-border flex-1" style={{ scrollbarGutter: 'stable' }}>
              <div className="pt-2 pb-3 pl-3 pr-5">
                {(() => {
                  if (filteredIntegrations.length === 0 && showConnectedOnly) {
                    return (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <div className="text-muted-foreground mb-2">
                          <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">No connected integrations found</p>
                        <p className="text-xs text-muted-foreground/70">Try unchecking "Show only connected apps"</p>
                      </div>
                    )
                  }

                  if (filteredIntegrations.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <div className="text-muted-foreground mb-2">
                          <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        </div>
                        <p className="text-sm text-muted-foreground">No integrations match your search</p>
                      </div>
                    )
                  }

                  return filteredIntegrations.map((integration) => {
                    const isConnected = isIntegrationConnected(integration.id)
                    const isComingSoon = comingSoonIntegrations.has(integration.id)
                    
                    return (
                      <div
                        key={integration.id}
                        className={`flex items-center p-3 rounded-md ${
                          isComingSoon
                            ? 'cursor-not-allowed opacity-60'
                            : 'cursor-pointer'
                        } ${
                          selectedIntegration?.id === integration.id 
                            ? 'bg-primary/10 ring-1 ring-primary/20' 
                            : 'hover:bg-muted/50'
                        }`}
                        onClick={() => {
                          if (!isComingSoon) {
                            setSelectedIntegration(integration)
                            setSelectedAction(null)
                          }
                        }}
                      >
                        {renderLogo(integration.id, integration.name)}
                        <span className="font-semibold ml-4 flex-grow break-words">
                          {integration.name}
                        </span>
                        {isComingSoon ? (
                          <Badge variant="secondary" className="ml-2 shrink-0">
                            Coming soon
                          </Badge>
                        ) : !isConnected && !['logic', 'core', 'manual', 'schedule', 'webhook'].includes(integration.id) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="ml-2 shrink-0"
                            onClick={(e) => {
                              e.stopPropagation()
                              const config = INTEGRATION_CONFIGS[integration.id as keyof typeof INTEGRATION_CONFIGS]
                              if (config?.oauthUrl) {
                                window.location.href = config.oauthUrl
                              }
                            }}
                          >
                            <LinkIcon className="w-3 h-3 mr-1" />
                            Connect
                          </Button>
                        ) : null}
                      </div>
                    )
                  })
                })()}
              </div>
            </ScrollArea>

            {/* Actions List */}
            <div className="w-3/5 flex-1">
              <ScrollArea className="h-full" style={{ scrollbarGutter: 'stable' }}>
                <div className="p-4">
                  {selectedIntegration ? (
                    !isIntegrationConnected(selectedIntegration.id) && selectedIntegration.id !== 'logic' ? (
                      // Show message for unconnected integrations
                      <div className="flex flex-col items-center justify-center h-full text-center">
                        <div className="text-muted-foreground mb-4">
                          <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-semibold mb-2">Connect {selectedIntegration.name}</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          You need to connect your {selectedIntegration.name} account to use these actions.
                        </p>
                        <Button
                          variant="default"
                          onClick={() => {
                            const config = INTEGRATION_CONFIGS[selectedIntegration.id as keyof typeof INTEGRATION_CONFIGS]
                            if (config?.oauthUrl) {
                              window.location.href = config.oauthUrl
                            }
                          }}
                        >
                          <LinkIcon className="w-4 h-4 mr-2" />
                          Connect {selectedIntegration.name}
                        </Button>
                      </div>
                    ) : (
                      <div className="h-full">
                        <div className="grid grid-cols-1 gap-3">
                        {selectedIntegration.actions
                          .filter((action: any) => {
                            if (searchQuery) {
                              const query = searchQuery.toLowerCase()
                              return (action.title?.toLowerCase() || '').includes(query) || 
                                     (action.description?.toLowerCase() || '').includes(query)
                            }
                            return true
                          })
                          .map((action: any) => {
                            const isComingSoon = action.comingSoon
                            return (
                              <div
                                key={action.type}
                                className={`p-4 border rounded-lg transition-all ${
                                  isComingSoon 
                                    ? 'border-muted bg-muted/30 cursor-not-allowed opacity-60' 
                                    : selectedAction?.type === action.type 
                                      ? 'border-primary bg-primary/10 ring-1 ring-primary/20' 
                                      : 'border-border hover:border-muted-foreground hover:shadow-sm cursor-pointer'
                                }`}
                                onClick={() => {
                                  if (isComingSoon) return
                                  setSelectedAction(action)
                                }}
                                onDoubleClick={() => {
                                  if (isComingSoon) return
                                  setSelectedAction(action)
                                  handleActionSelect()
                                }}
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <p className={`font-medium ${isComingSoon ? 'text-muted-foreground' : ''}`}>
                                        {action.title || 'Unnamed Action'}
                                      </p>
                                      {aiAutoConfig && !isComingSoon && (
                                        <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700">
                                          <Wand2 className="w-3 h-3 mr-1" />
                                          AI
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-sm text-muted-foreground mt-1">
                                      {action.description || 'No description available'}
                                    </p>
                                  </div>
                                  {isComingSoon && (
                                    <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full ml-2">
                                      {/* Icon only on extra small screens */}
                                      <span className="inline sm:hidden">⏳</span>
                                      {/* "Soon" on small screens */}
                                      <span className="hidden sm:inline md:hidden">Soon</span>
                                      {/* "Coming Soon" on medium and larger screens */}
                                      <span className="hidden md:inline">Coming Soon</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      <p>Select an integration to see its actions</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          <div className="p-4 flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              {selectedIntegration && (
                <>
                  <span className="font-medium">Integration:</span> {selectedIntegration.name}
                  {selectedAction && (
                    <span className="ml-4">
                      <span className="font-medium">Action:</span> {selectedAction.title}
                    </span>
                  )}
                </>
              )}
            </div>
            <div className="flex space-x-2">
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button 
                disabled={!selectedAction || !selectedIntegration}
                onClick={handleActionSelect}
                className="gap-2"
              >
                {aiAutoConfig ? (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Add with AI Config
                  </>
                ) : (
                  <>
                    <Settings className="w-4 h-4" />
                    Add for Manual Config
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
