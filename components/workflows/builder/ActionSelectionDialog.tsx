import React, { useMemo, useEffect, useState, useCallback } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Zap, Search, LinkIcon } from 'lucide-react'
import { LightningLoader } from '@/components/ui/lightning-loader'
import type { NodeComponent } from '@/lib/workflows/nodes'
import type { Node } from '@xyflow/react'
import { INTEGRATION_CONFIGS } from '@/lib/integrations/availableIntegrations'
import { useIntegrationSelection } from '@/hooks/workflows/useIntegrationSelection'
import { openOAuthPopup } from '@/lib/utils/oauth-popup'
import { toast } from '@/components/ui/use-toast'
import { useIntegrationStore } from '@/stores/integrationStore'

interface IntegrationInfo {
  id: string
  name: string
  description: string
  category: string
  color: string
  triggers: NodeComponent[]
  actions: NodeComponent[]
}

interface ActionSelectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedIntegration: IntegrationInfo | null
  setSelectedIntegration: (integration: IntegrationInfo | null) => void
  selectedAction: NodeComponent | null
  setSelectedAction: (action: NodeComponent | null) => void
  searchQuery: string
  setSearchQuery: (query: string) => void
  filterCategory: string
  setFilterCategory: (category: string) => void
  showConnectedOnly: boolean
  setShowConnectedOnly: (show: boolean) => void
  availableIntegrations: IntegrationInfo[]
  categories: string[]
  renderLogo: (id: string, name?: string) => React.ReactNode
  isIntegrationConnected: (id: string) => boolean
  filterIntegrations: (integrations: IntegrationInfo[], query: string, category: string, connected: boolean) => IntegrationInfo[]
  getDisplayedActions: (integration: IntegrationInfo | null, query: string) => NodeComponent[]
  onActionSelect?: (integration: IntegrationInfo, action: NodeComponent) => void
  nodes?: Node[]
  handleActionDialogClose?: () => void
  loadingIntegrations?: boolean
  refreshIntegrations?: () => void
}

export function ActionSelectionDialog({
  open,
  onOpenChange,
  selectedIntegration,
  setSelectedIntegration,
  selectedAction,
  setSelectedAction,
  searchQuery,
  setSearchQuery,
  filterCategory,
  setFilterCategory,
  showConnectedOnly,
  setShowConnectedOnly,
  availableIntegrations,
  categories,
  renderLogo,
  isIntegrationConnected,
  filterIntegrations,
  getDisplayedActions,
  onActionSelect,
  nodes = [],
  handleActionDialogClose,
  loadingIntegrations = false,
  refreshIntegrations
}: ActionSelectionDialogProps) {

  // Get the coming soon integrations from the hook
  const { comingSoonIntegrations } = useIntegrationSelection()
  const [connectingIntegration, setConnectingIntegration] = useState<string | null>(null)
  const [showComingSoon, setShowComingSoon] = useState(false) // Local state for coming soon filter
  
  // Get integration store to check status
  const { getIntegrationByProvider } = useIntegrationStore()

  // Parent handles refreshing integrations before opening to avoid double-fetch races

  // Handle OAuth connection
  const handleConnect = useCallback(async (integrationId: string) => {
    console.log('handleConnect called with:', integrationId)
    setConnectingIntegration(integrationId)
    
    try {
      console.log('Generating OAuth URL for:', integrationId)
      // Generate OAuth URL via API
      const response = await fetch('/api/integrations/auth/generate-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: integrationId,
          forceFresh: false,
        }),
      })
      console.log('OAuth URL response:', response.status)

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate OAuth URL')
      }

      const data = await response.json()
      console.log('OAuth URL data:', data)
      const { url } = data
      
      if (!url) {
        console.error('No OAuth URL in response:', data)
        throw new Error('No OAuth URL returned')
      }

      console.log('Opening OAuth popup with URL:', url)
      const config = INTEGRATION_CONFIGS[integrationId as keyof typeof INTEGRATION_CONFIGS]
      
      openOAuthPopup({
        url,
        name: `${integrationId}_oauth`,
        onSuccess: () => {
          // Refresh integrations to get updated connection status
          if (refreshIntegrations) {
            refreshIntegrations()
          }
          setConnectingIntegration(null)
          toast({
            title: "Connected Successfully",
            description: `${config?.name || integrationId} has been connected to your account.`,
          })
        },
        onError: (error) => {
          setConnectingIntegration(null)
          toast({
            title: "Connection Failed",
            description: error.message || "Failed to connect integration. Please try again.",
            variant: "destructive"
          })
        }
      })
    } catch (error) {
      setConnectingIntegration(null)
      toast({
        title: "Connection Error",
        description: error instanceof Error ? error.message : "Failed to initiate OAuth connection.",
        variant: "destructive"
      })
    }
  }, [refreshIntegrations])

  const filteredIntegrationsForActions = useMemo(() => {
    const filtered = availableIntegrations.filter(int => {
      // Filter out coming soon integrations unless explicitly shown
      if (!showComingSoon && comingSoonIntegrations.has(int.id)) {
        return false
      }

      // Check connection status
      if (showConnectedOnly && !isIntegrationConnected(int.id)) return false
      if (filterCategory !== 'all' && int.category !== filterCategory) return false

      // Always show all integrations - users should be able to connect any integration
      // even if it doesn't have compatible actions with the current trigger
      // Once connected, they might switch triggers or the integration might have actions later

      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesIntegration = int.name.toLowerCase().includes(query) ||
          int.description.toLowerCase().includes(query)
        // Also search in action names/descriptions if there are actions
        const matchesAction = int.actions.some(action =>
          (action.title?.toLowerCase() || '').includes(query) ||
          (action.description?.toLowerCase() || '').includes(query)
        )
        return matchesIntegration || matchesAction
      }

      return true
    })

    return filtered
  }, [availableIntegrations, searchQuery, filterCategory, showConnectedOnly, showComingSoon, isIntegrationConnected, comingSoonIntegrations])

  const displayedActions = useMemo(() => {
    if (!selectedIntegration) return []

    const actions = getDisplayedActions(selectedIntegration, searchQuery)

    // Note: Removed Gmail-specific filter - Gmail actions should work with any trigger
    return actions
  }, [selectedIntegration, searchQuery, getDisplayedActions])

  const handleActionSelectClick = () => {
    if (selectedIntegration && selectedAction && onActionSelect) {
      onActionSelect(selectedIntegration, selectedAction)
    }
  }

  const handleClose = () => {
    if (handleActionDialogClose) {
      handleActionDialogClose()
    } else {
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[900px] h-[90vh] max-h-[90vh] w-full bg-gradient-to-br from-slate-50 to-white border-0 shadow-2xl flex flex-col overflow-hidden">
        <DialogHeader className="pb-3 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg text-white">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                Select an Action
                <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">Action</Badge>
              </DialogTitle>
              <DialogDescription className="text-sm text-slate-600 mt-1">
                Choose an integration and an action to add to your workflow.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        
        <div className="pt-3 pb-3 border-b border-slate-200">
          <div className="space-y-3">
            <div className="flex items-center space-x-4">
              <div className="relative flex-grow">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  placeholder="Search integrations or actions..."
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
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
            </div>
            <div className="flex items-center justify-end">
              <label className="flex items-center space-x-2 text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                <input
                  type="checkbox"
                  checked={showComingSoon}
                  onChange={(e) => setShowComingSoon(e.target.checked)}
                  className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4"
                />
                <span>Show coming soon integrations</span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Integrations List */}
          <ScrollArea className="w-2/5 border-r border-border flex-1">
            <div className="pt-2 pb-3 pl-3 pr-5">
              {loadingIntegrations && showConnectedOnly ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <LightningLoader />
                </div>
              ) : filteredIntegrationsForActions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-sm text-muted-foreground mb-2">
                    {showConnectedOnly ? 'No connected integrations found' : 'No integrations match your search'}
                  </p>
                  {showConnectedOnly && !loadingIntegrations && (
                    <p className="text-xs text-muted-foreground/70">
                      Try unchecking "Show only connected apps"
                    </p>
                  )}
                </div>
              ) : (
                filteredIntegrationsForActions.map((integration) => {
                  const isConnected = isIntegrationConnected(integration.id)
                  const integrationData = getIntegrationByProvider(integration.id)
                  const needsReauth = integrationData?.status === 'needs_reauthorization' || integrationData?.status === 'expired'

                  // Debug logging (commented out to reduce console noise)
                  // console.log(`ActionDialog: ${integration.id}, isConnected: ${isConnected}, needsReauth: ${needsReauth}, status: ${integrationData?.status}, comingSoon: ${comingSoonIntegrations.has(integration.id)}`)

                  // Special debug for Discord (commented out to reduce console noise)
                  // if (integration.id === 'discord') {
                  //   console.log('Discord integration details:', {
                  //     id: integration.id,
                  //     isConnected,
                  //     needsReauth,
                  //     status: integrationData?.status,
                  //     isSystemIntegration: ['core', 'logic', 'webhook', 'scheduler', 'ai', 'manual'].includes(integration.id),
                  //     showConnectButton: (!isConnected || needsReauth) && !['core', 'logic', 'webhook', 'scheduler', 'ai', 'manual'].includes(integration.id)
                  //   })
                  // }
                  
                  return (
                    <div
                      key={integration.id}
                      className={`flex items-center p-3 rounded-md ${
                        comingSoonIntegrations.has(integration.id)
                          ? 'cursor-not-allowed opacity-60'
                          : 'cursor-pointer'
                      } ${
                        selectedIntegration?.id === integration.id 
                          ? 'bg-primary/10 ring-1 ring-primary/20' 
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => {
                        if (!comingSoonIntegrations.has(integration.id)) {
                          setSelectedIntegration(integration)
                          setSelectedAction(null)
                        }
                      }}
                    >
                      {renderLogo(integration.id, integration.name)}
                      <span className="font-semibold ml-4 flex-grow truncate">
                        {integration.name}
                      </span>
                      {comingSoonIntegrations.has(integration.id) ? (
                        <Badge variant="secondary" className="ml-2 shrink-0">
                          Coming soon
                        </Badge>
                      ) : (!isConnected || needsReauth) && integration.id !== 'core' && integration.id !== 'logic' && integration.id !== 'webhook' && integration.id !== 'scheduler' && integration.id !== 'ai' && integration.id !== 'manual' ? (
                        <Button
                          size="sm"
                          variant={needsReauth ? "destructive" : "outline"}
                          className="ml-2 shrink-0"
                          disabled={connectingIntegration === integration.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            console.log(`${needsReauth ? 'Reconnect' : 'Connect'} button clicked for:`, integration.id)
                            handleConnect(integration.id)
                          }}
                        >
                          {connectingIntegration === integration.id ? (
                            <>
                              <LightningLoader className="w-3 h-3 mr-1" />
                              {needsReauth ? 'Reconnecting...' : 'Connecting...'}
                            </>
                          ) : (
                            <>
                              <LinkIcon className="w-3 h-3 mr-1" />
                              {needsReauth ? 'Reconnect' : 'Connect'}
                            </>
                          )}
                        </Button>
                      ) : null}
                    </div>
                  )
                })
              )}
            </div>
          </ScrollArea>

          {/* Actions List */}
          <div className="w-3/5 flex-1">
            <ScrollArea className="h-full">
              <div className="p-4">
                {selectedIntegration ? (
                  (() => {
                    const integrationData = getIntegrationByProvider(selectedIntegration.id)
                    const needsReauth = integrationData?.status === 'needs_reauthorization' || integrationData?.status === 'expired'
                    const showConnectButton = (!isIntegrationConnected(selectedIntegration.id) || needsReauth) && 
                                            selectedIntegration.id !== 'core' && 
                                            selectedIntegration.id !== 'logic' && 
                                            selectedIntegration.id !== 'webhook' && 
                                            selectedIntegration.id !== 'scheduler' && 
                                            selectedIntegration.id !== 'ai' && 
                                            selectedIntegration.id !== 'manual'
                    
                    return showConnectButton ? (
                    // Show message for unconnected integrations
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <div className="text-muted-foreground mb-4">
                        <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-semibold mb-2">
                        {needsReauth ? 'Reconnect' : 'Connect'} {selectedIntegration.name}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        {needsReauth 
                          ? `Your ${selectedIntegration.name} connection has expired. Please reconnect to continue using these actions.`
                          : `You need to connect your ${selectedIntegration.name} account to use these actions.`
                        }
                      </p>
                      <Button
                        variant={needsReauth ? "destructive" : "default"}
                        disabled={connectingIntegration === selectedIntegration.id}
                        onClick={() => handleConnect(selectedIntegration.id)}
                      >
                        {connectingIntegration === selectedIntegration.id ? (
                          <>
                            <LightningLoader className="w-4 h-4 mr-2" />
                            {needsReauth ? 'Reconnecting...' : 'Connecting...'}
                          </>
                        ) : (
                          <>
                            <LinkIcon className="w-4 h-4 mr-2" />
                            {needsReauth ? 'Reconnect' : 'Connect'} {selectedIntegration.name}
                          </>
                        )}
                      </Button>
                    </div>
                  ) : displayedActions.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3">
                      {displayedActions.map((action, index) => {
                        const isActionComingSoon = Boolean((action as any).comingSoon)
                        
                        return (
                          <div
                            key={`${action.type}-${action.title}-${index}`}
                            className={`relative p-4 border rounded-lg transition-all ${
                              isActionComingSoon 
                                ? 'opacity-60 cursor-not-allowed' 
                                : 'cursor-pointer'
                            } ${
                              selectedAction?.type === action.type 
                                ? 'border-primary bg-primary/10 ring-1 ring-primary/20' 
                                : 'border-border hover:border-muted-foreground hover:shadow-sm'
                            }`}
                            onClick={() => {
                              if (!isActionComingSoon) {
                                setSelectedAction(action)
                              }
                            }}
                            onDoubleClick={() => {
                              if (!isActionComingSoon) {
                                setSelectedAction(action)
                                handleActionSelectClick()
                              }
                            }}
                          >
                            <div className="flex items-center gap-2">
                              {/* Integration icon */}
                              <img
                                src={`/integrations/${selectedIntegration.id}.svg`}
                                alt={`${selectedIntegration.name} icon`}
                                className="w-5 h-5 object-contain shrink-0"
                                onError={(e: any) => {
                                  e.currentTarget.style.display = 'none'
                                }}
                              />
                              <p className="font-medium flex-1 min-w-0 truncate">
                                {action.title}
                              </p>
                              {isActionComingSoon && (
                                <Badge variant="secondary" className="ml-2 shrink-0">
                                  Coming soon
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {action.description}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <p className="text-sm text-muted-foreground mb-2">No actions available</p>
                      <p className="text-xs text-muted-foreground/70">
                        {selectedIntegration.name} doesn't have any compatible actions
                      </p>
                    </div>
                  )
                  })()
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <p>Select an integration to see its actions</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
        
        <DialogFooter className="p-4 flex justify-between items-center">
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
              onClick={handleActionSelectClick}
            >
              Continue →
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}