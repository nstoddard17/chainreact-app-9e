import React, { useMemo, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Bell, Search } from 'lucide-react'
import { LightningLoader } from '@/components/ui/lightning-loader'
import type { NodeComponent } from '@/lib/workflows/nodes'

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
  
  const comingSoonIntegrations = useMemo(() => new Set([
    'beehiiv',
    'manychat',
    'gumroad',
    'kit',
    'paypal',
    'shopify',
    'blackbaud',
    'box',
  ]), [])

  // Only refresh integrations once when dialog first opens
  useEffect(() => {
    if (open && refreshIntegrations) {
      refreshIntegrations()
    }
  }, [open]) // Intentionally omit refreshIntegrations to prevent loops

  const filteredIntegrations = useMemo(() => {
    return filterIntegrations(availableIntegrations, searchQuery, filterCategory, showConnectedOnly)
  }, [availableIntegrations, searchQuery, filterCategory, showConnectedOnly, filterIntegrations])

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
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="connected-apps" 
                checked={showConnectedOnly} 
                onCheckedChange={(checked) => setShowConnectedOnly(Boolean(checked))} 
              />
              <Label htmlFor="connected-apps" className="whitespace-nowrap">
                Show only connected apps
              </Label>
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
                filteredIntegrations.map((integration) => (
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
                        setSelectedTrigger(null)
                      }
                    }}
                  >
                    {renderLogo(integration.id, integration.name)}
                    <span className="font-semibold ml-4 flex-grow truncate">
                      {integration.name}
                    </span>
                    {comingSoonIntegrations.has(integration.id) && (
                      <Badge variant="secondary" className="ml-2 shrink-0">
                        Coming soon
                      </Badge>
                    )}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {/* Triggers List */}
          <div className="w-3/5 flex-1">
            <ScrollArea className="h-full">
              <div className="p-4">
                {selectedIntegration ? (
                  displayedTriggers.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3">
                      {displayedTriggers.map((trigger, index) => {
                        const isTriggerComingSoon = Boolean((trigger as any).comingSoon) || 
                          comingSoonIntegrations.has(selectedIntegration.id)
                        
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
                              <p className="font-medium flex-1 min-w-0 truncate">
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