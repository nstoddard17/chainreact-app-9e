import React, { useMemo, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Bell, Search, LinkIcon } from 'lucide-react'
import { LightningLoader } from '@/components/ui/lightning-loader'
import type { NodeComponent } from '@/lib/workflows/nodes'
import { INTEGRATION_CONFIGS } from '@/lib/integrations/availableIntegrations'
import { useIntegrationSelection } from '@/hooks/workflows/useIntegrationSelection'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useShallow } from 'zustand/react/shallow'

interface IntegrationInfo {
  id: string
  name: string
  description: string
  category: string
  color: string
  triggers: NodeComponent[]
  actions: NodeComponent[]
}

interface TriggerSelectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedIntegration: IntegrationInfo | null
  setSelectedIntegration: (integration: IntegrationInfo | null) => void
  selectedTrigger: NodeComponent | null
  setSelectedTrigger: (trigger: NodeComponent | null) => void
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
  getDisplayedTriggers: (integration: IntegrationInfo | null, query: string) => NodeComponent[]
  onTriggerSelect?: (integration: IntegrationInfo, trigger: NodeComponent) => void
  loadingIntegrations?: boolean
  refreshIntegrations?: () => void
}

export function TriggerSelectionDialog({
  open,
  onOpenChange,
  selectedIntegration,
  setSelectedIntegration,
  selectedTrigger,
  setSelectedTrigger,
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
  getDisplayedTriggers,
  onTriggerSelect,
  loadingIntegrations = false,
  refreshIntegrations
}: TriggerSelectionDialogProps) {

  // Get the coming soon integrations from the hook
  const { comingSoonIntegrations } = useIntegrationSelection()
  const [showComingSoon, setShowComingSoon] = React.useState(false) // Local state for coming soon filter

  // Get integration store functions - same as IntegrationCard
  const { getIntegrationByProvider, connectIntegration, reconnectIntegration, loadingStates } = useIntegrationStore(
    useShallow(state => ({
      getIntegrationByProvider: state.getIntegrationByProvider,
      connectIntegration: state.connectIntegration,
      reconnectIntegration: state.reconnectIntegration,
      loadingStates: state.loadingStates
    }))
  )

  // Refresh integrations when dialog opens
  useEffect(() => {
    if (open && refreshIntegrations) {
      refreshIntegrations()
    }
  }, [open, refreshIntegrations])

  // Handle OAuth connection - mirrors IntegrationCard logic
  const handleConnect = React.useCallback((integrationId: string) => {
    // Just call the store function - it handles the OAuth flow via popup
    // Success/error is handled by the store's onSuccess/onError callbacks
    connectIntegration(integrationId)
  }, [connectIntegration])

  // Handle reconnection - mirrors IntegrationCard logic
  const handleReconnect = React.useCallback((integrationId: string) => {
    const integration = getIntegrationByProvider(integrationId)
    if (!integration) return

    // Just call the store function - it handles the OAuth flow via popup
    // Success/error is handled by the store's onSuccess/onError callbacks
    reconnectIntegration(integration.id)
  }, [getIntegrationByProvider, reconnectIntegration])

  const filteredIntegrations = useMemo(() => {
    // First filter by coming soon
    const baseFiltered = availableIntegrations.filter(int => {
      if (!showComingSoon && comingSoonIntegrations.has(int.id)) {
        return false
      }
      return true
    })
    // Then apply the standard filters
    return filterIntegrations(baseFiltered, searchQuery, filterCategory, showConnectedOnly)
  }, [availableIntegrations, searchQuery, filterCategory, showConnectedOnly, showComingSoon, filterIntegrations, comingSoonIntegrations])

  const displayedTriggers = useMemo(() => {
    return getDisplayedTriggers(selectedIntegration, searchQuery)
  }, [selectedIntegration, searchQuery, getDisplayedTriggers])

  const handleTriggerSelect = () => {
    if (selectedIntegration && selectedTrigger && onTriggerSelect) {
      onTriggerSelect(selectedIntegration, selectedTrigger)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] h-[90vh] max-h-[90vh] w-full bg-gradient-to-br from-slate-50 to-white border-0 shadow-2xl flex flex-col overflow-hidden">
        <DialogHeader className="pb-3 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg text-white">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                Select a Trigger
                <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200">Trigger</Badge>
              </DialogTitle>
              <DialogDescription className="text-sm text-slate-600 mt-1">
                Choose an integration and a trigger to start your workflow.
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
                  placeholder="Search integrations or triggers..."
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
              ) : filteredIntegrations.length === 0 ? (
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
                filteredIntegrations.map((integration) => {
                  const isConnected = isIntegrationConnected(integration.id)
                  const integrationData = getIntegrationByProvider(integration.id)
                  const needsReauth = integrationData?.status === 'needs_reauthorization' || integrationData?.status === 'expired'
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
                          setSelectedTrigger(null)
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
                      ) : (!isConnected || needsReauth) && integration.id !== 'core' && integration.id !== 'logic' && integration.id !== 'webhook' && integration.id !== 'scheduler' && integration.id !== 'ai' && integration.id !== 'manual' ? (
                        <Button
                          size="sm"
                          variant={needsReauth ? "destructive" : "outline"}
                          className="ml-2 shrink-0"
                          disabled={loadingStates[`connect-${integration.id}`] || false}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (needsReauth) {
                              handleReconnect(integration.id)
                            } else {
                              handleConnect(integration.id)
                            }
                          }}
                        >
                          {loadingStates[`connect-${integration.id}`] ? (
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

          {/* Triggers List */}
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
                          ? `Your ${selectedIntegration.name} connection has expired. Please reconnect to continue using these triggers.`
                          : `You need to connect your ${selectedIntegration.name} account to use these triggers.`
                        }
                      </p>
                      <Button
                        variant={needsReauth ? "destructive" : "default"}
                        disabled={loadingStates[`connect-${selectedIntegration.id}`] || false}
                        onClick={() => {
                          if (needsReauth) {
                            handleReconnect(selectedIntegration.id)
                          } else {
                            handleConnect(selectedIntegration.id)
                          }
                        }}
                      >
                        {loadingStates[`connect-${selectedIntegration.id}`] ? (
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
                  ) : displayedTriggers.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3">
                      {displayedTriggers.map((trigger, index) => {
                        const isTriggerComingSoon = Boolean((trigger as any).comingSoon)
                        
                        return (
                          <div
                            key={`${trigger.type}-${trigger.title}-${index}`}
                            className={`relative p-4 border rounded-lg transition-all ${
                              isTriggerComingSoon 
                                ? 'opacity-60 cursor-not-allowed' 
                                : 'cursor-pointer'
                            } ${
                              selectedTrigger?.type === trigger.type 
                                ? 'border-primary bg-primary/10 ring-1 ring-primary/20' 
                                : 'border-border hover:border-muted-foreground hover:shadow-sm'
                            }`}
                            onClick={() => {
                              if (!isTriggerComingSoon) {
                                setSelectedTrigger(trigger)
                              }
                            }}
                            onDoubleClick={() => {
                              if (!isTriggerComingSoon) {
                                setSelectedTrigger(trigger)
                                handleTriggerSelect()
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
                              <p className="font-medium flex-1 min-w-0 break-words">
                                {trigger.title}
                              </p>
                              {isTriggerComingSoon && (
                                <Badge variant="secondary" className="ml-2 shrink-0">
                                  Coming soon
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {trigger.description}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <p className="text-sm text-muted-foreground mb-2">No triggers available</p>
                      <p className="text-xs text-muted-foreground/70">
                        {selectedIntegration.name} doesn't have any triggers defined yet
                      </p>
                    </div>
                  )
                  })()
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <p>Select an integration to see its triggers</p>
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
                {selectedTrigger && (
                  <span className="ml-4">
                    <span className="font-medium">Trigger:</span> {selectedTrigger.title}
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
              disabled={!selectedTrigger || !selectedIntegration}
              onClick={handleTriggerSelect}
            >
              Continue →
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}