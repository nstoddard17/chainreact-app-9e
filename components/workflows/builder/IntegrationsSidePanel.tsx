"use client"

import { useState, useMemo, useEffect } from "react"
import { useTheme } from "next-themes"
import { ProfessionalSearch } from "@/components/ui/professional-search"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Brain,
  Workflow,
  GitBranch,
  Clock,
  Database as DatabaseIcon,
  Code2,
  Webhook,
  ChevronRight,
} from "lucide-react"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/nodes"
import type { NodeComponent } from "@/lib/workflows/nodes/types"
import { getIntegrationLogoClasses } from "@/lib/integrations/logoStyles"

interface IntegrationsSidePanelProps {
  isOpen: boolean
  onClose: () => void
  onNodeSelect: (node: NodeComponent) => void
  mode?: 'trigger' | 'action' // Determines if we show only triggers or only actions
}

type Category = 'all' | 'apps' | 'logic' | 'ai' | 'data'

interface Integration {
  id: string
  name: string
  description: string
  logo: string | null
}

export function IntegrationsSidePanel({ isOpen, onClose, onNodeSelect, mode = 'action' }: IntegrationsSidePanelProps) {
  const { theme } = useTheme()
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<Category>('all')
  const [selectedIntegration, setSelectedIntegration] = useState<string | null>(null)

  // Reset to main view (all integrations) when panel is opened
  useEffect(() => {
    if (isOpen) {
      setSelectedCategory('all')
      setSelectedIntegration(null)
      setSearchQuery("")
    }
  }, [isOpen])

  // Group nodes by provider to create integrations list
  // Filter based on mode (triggers vs actions)
  const integrations = useMemo(() => {
    const integrationMap = new Map<string, Integration>()

    ALL_NODE_COMPONENTS
      .filter(node =>
        node.providerId &&
        node.providerId !== 'generic' &&
        node.type !== 'path_condition' &&
        !['logic', 'ai', 'automation', 'misc', 'utility'].includes(node.providerId) &&
        // Filter by mode: only include integrations that have triggers/actions matching the mode
        (mode === 'trigger' ? node.isTrigger : !node.isTrigger)
      )
      .forEach(node => {
        const providerId = node.providerId!
        if (!integrationMap.has(providerId)) {
          integrationMap.set(providerId, {
            id: providerId,
            name: providerId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            description: `Automate ${providerId.replace(/-/g, ' ')} workflows`,
            logo: `/integrations/${providerId}.svg`,
          })
        }
      })

    return Array.from(integrationMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [mode])

  // Get logic nodes
  const logicNodes = useMemo(() =>
    ALL_NODE_COMPONENTS.filter(node =>
      node.providerId === 'logic' ||
      node.providerId === 'automation'
    ),
    []
  )

  // Get AI nodes
  const aiNodes = useMemo(() =>
    ALL_NODE_COMPONENTS.filter(node => node.providerId === 'ai'),
    []
  )

  // Get data/utility nodes
  const dataNodes = useMemo(() =>
    ALL_NODE_COMPONENTS.filter(node =>
      node.providerId === 'misc' ||
      node.providerId === 'utility' ||
      node.type === 'http_request' ||
      node.type === 'webhook'
    ),
    []
  )

  // Get nodes for selected integration
  // Filter by mode to show only triggers or actions
  const selectedIntegrationNodes = useMemo(() => {
    if (!selectedIntegration) return []

    return ALL_NODE_COMPONENTS
      .filter(node =>
        node.providerId === selectedIntegration &&
        (mode === 'trigger' ? node.isTrigger : !node.isTrigger)
      )
      .sort((a, b) => {
        // Sort triggers first, then actions (though with mode filtering, they should all be the same type)
        if (a.isTrigger && !b.isTrigger) return -1
        if (!a.isTrigger && b.isTrigger) return 1
        return a.title.localeCompare(b.title)
      })
  }, [selectedIntegration, mode])

  // Filter integrations based on search and category
  const filteredIntegrations = useMemo(() => {
    let filtered = integrations

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(int =>
        int.name.toLowerCase().includes(query) ||
        int.id.toLowerCase().includes(query)
      )
    }

    return filtered
  }, [integrations, searchQuery])

  // Filter nodes based on search (when viewing integration details or standalone nodes)
  const filterNodesBySearch = (nodes: NodeComponent[]) => {
    if (!searchQuery) return nodes
    const query = searchQuery.toLowerCase()
    return nodes.filter(n =>
      n.title.toLowerCase().includes(query) ||
      n.description?.toLowerCase().includes(query)
    )
  }

  const categories = [
    { id: 'all' as Category, label: 'All', icon: Workflow },
    { id: 'apps' as Category, label: 'Apps', icon: Sparkles },
    { id: 'logic' as Category, label: 'Logic', icon: GitBranch },
    { id: 'ai' as Category, label: 'AI', icon: Brain },
    { id: 'data' as Category, label: 'Data', icon: DatabaseIcon },
  ]

  // Render node item (now clickable instead of draggable)
  const renderNode = (node: NodeComponent) => {
    const NodeIcon = node.icon
    const shouldUseNodeIcon = ['logic', 'ai', 'automation', 'misc', 'utility'].includes(node.providerId || '')
    const providerLogo = !shouldUseNodeIcon && node.providerId ? `/integrations/${node.providerId}.svg` : null

    const handleClick = () => {
      console.log('🔘 [IntegrationsSidePanel] Node clicked:', node.type, node.title)
      onNodeSelect(node)
    }

    return (
      <div
        key={node.type}
        onClick={handleClick}
        className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-900 transition-colors cursor-pointer group border border-transparent hover:border-gray-200 dark:hover:border-slate-800"
      >
        {/* Icon */}
        <div className="shrink-0 w-10 h-10 rounded-lg bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 flex items-center justify-center p-1.5">
          {providerLogo ? (
            <img
              src={providerLogo}
              alt={node.providerId || ''}
              className={getIntegrationLogoClasses(node.providerId || '', 'object-contain')}
              style={{ width: '28px', height: 'auto' }}
            />
          ) : NodeIcon ? (
            <NodeIcon className="w-5 h-5 text-foreground" />
          ) : null}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm leading-tight mb-0.5">
            {node.title}
          </h3>
          <p className="text-xs text-muted-foreground line-clamp-2">
            {node.description || 'No description available'}
          </p>
        </div>
      </div>
    )
  }

  // Render integration list item
  const renderIntegration = (integration: Integration) => (
    <div
      key={integration.id}
      onClick={() => setSelectedIntegration(integration.id)}
      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-900 transition-colors cursor-pointer group border border-transparent hover:border-gray-200 dark:hover:border-slate-800"
    >
      {/* Icon */}
      <div className="shrink-0 w-10 h-10 rounded-lg bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 flex items-center justify-center p-1.5">
        <img
          src={integration.logo || ''}
          alt={integration.name}
          className={getIntegrationLogoClasses(integration.id, 'object-contain')}
          style={{ width: '28px', height: 'auto' }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-sm leading-tight">
          {integration.name}
        </h3>
      </div>

      {/* Arrow */}
      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
    </div>
  )

  return (
    <div className="h-full w-full bg-white dark:bg-slate-950 border-l border-border shadow-lg z-50 flex flex-col">
      {/* Header with Search */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
        {selectedIntegration ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSelectedIntegration(null)}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <ArrowRight className="w-4 h-4" />
          </Button>
        )}
        <div className="flex-1 relative">
          <ProfessionalSearch
            placeholder={selectedIntegration
              ? mode === 'trigger' ? "Search triggers..." : "Search actions..."
              : mode === 'trigger' ? "Search apps and triggers..." : "Search apps and actions..."
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery("")}
            className="h-9"
          />
        </div>
      </div>

      {/* Categories - Only show when not viewing integration details */}
      {!selectedIntegration && (
        <div className="border-b">
          <div className="flex items-center gap-1 px-4 py-2">
            {categories.map((cat) => {
              const Icon = cat.icon
              return (
                <Button
                  key={cat.id}
                  variant={selectedCategory === cat.id ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setSelectedCategory(cat.id)}
                  className="h-8 text-xs whitespace-nowrap flex-1"
                >
                  <Icon className="w-3.5 h-3.5 mr-1.5" />
                  {cat.label}
                </Button>
              )
            })}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-1">
          {/* Viewing integration details */}
          {selectedIntegration ? (
            filterNodesBySearch(selectedIntegrationNodes).length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-sm">No actions found</p>
                <p className="text-xs mt-1">Try adjusting your search</p>
              </div>
            ) : (
              filterNodesBySearch(selectedIntegrationNodes).map(renderNode)
            )
          ) : (
            /* Viewing top-level list */
            <>
              {/* Apps Category */}
              {(selectedCategory === 'all' || selectedCategory === 'apps') && (
                <>
                  {!searchQuery && <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2 mt-2">Apps</h3>}
                  {filteredIntegrations.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p className="text-sm">No apps found</p>
                      <p className="text-xs mt-1">Try adjusting your search</p>
                    </div>
                  ) : (
                    filteredIntegrations.map(renderIntegration)
                  )}
                </>
              )}

              {/* Logic Nodes */}
              {(selectedCategory === 'all' || selectedCategory === 'logic') && (
                <>
                  {!searchQuery && <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2 mt-4">Logic & Flow Control</h3>}
                  {filterNodesBySearch(logicNodes).map(renderNode)}
                </>
              )}

              {/* AI Nodes */}
              {(selectedCategory === 'all' || selectedCategory === 'ai') && (
                <>
                  {!searchQuery && <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2 mt-4">AI & Intelligence</h3>}
                  {filterNodesBySearch(aiNodes).map(renderNode)}
                </>
              )}

              {/* Data Nodes */}
              {(selectedCategory === 'all' || selectedCategory === 'data') && (
                <>
                  {!searchQuery && <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2 mt-4">Data & Utilities</h3>}
                  {filterNodesBySearch(dataNodes).map(renderNode)}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
