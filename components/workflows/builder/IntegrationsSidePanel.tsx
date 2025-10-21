"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import {
  Search,
  X,
  ChevronRight,
  ChevronDown,
  Star,
  Zap,
  Play,
  Database,
  Sparkles,
  Grid3x3,
} from "lucide-react"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/availableNodes"
import type { NodeComponent } from "@/lib/workflows/nodes/types"
import { cn } from "@/lib/utils"

interface IntegrationsSidePanelProps {
  isOpen: boolean
  onClose: () => void
  onNodeSelect: (node: NodeComponent) => void
}

type Category = 'all' | 'triggers' | 'actions' | 'data-enrichment' | 'database' | 'personal'

interface CategorizedNode {
  node: NodeComponent
  category: string
}

export function IntegrationsSidePanel({ isOpen, onClose, onNodeSelect }: IntegrationsSidePanelProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<Category>('all')
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set())
  const [personalNodes, setPersonalNodes] = useState<Set<string>>(new Set())

  // Helper function to format provider names
  const formatProviderName = (providerId: string): string => {
    return providerId
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  // Categorize nodes
  const categorizedNodes = useMemo(() => {
    const nodes: CategorizedNode[] = []

    ALL_NODE_COMPONENTS.forEach((node) => {
      if (!node.providerId || node.providerId === 'generic') {
        return
      }

      // Determine category
      let category = 'actions'

      if (node.isTrigger) {
        category = 'triggers'
      } else if (
        node.type.includes('enrich') ||
        node.type.includes('extract') ||
        node.type.includes('ai_') ||
        node.providerId === 'ai'
      ) {
        category = 'data-enrichment'
      } else if (
        node.providerId === 'airtable' ||
        node.providerId === 'google-sheets' ||
        node.type.includes('database') ||
        node.type.includes('query')
      ) {
        category = 'database'
      }

      nodes.push({ node, category })
    })

    return nodes
  }, [])

  // Group by provider
  const groupedByProvider = useMemo(() => {
    const filtered = categorizedNodes.filter((item) => {
      // Filter by category
      if (selectedCategory === 'personal') {
        return personalNodes.has(item.node.type)
      }
      if (selectedCategory === 'triggers' && !item.node.isTrigger) return false
      if (selectedCategory === 'actions' && item.node.isTrigger) return false
      if (selectedCategory === 'data-enrichment' && item.category !== 'data-enrichment') return false
      if (selectedCategory === 'database' && item.category !== 'database') return false

      // Filter by search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        return (
          item.node.title.toLowerCase().includes(query) ||
          item.node.providerId?.toLowerCase().includes(query)
        )
      }

      return true
    })

    const grouped = new Map<string, NodeComponent[]>()

    filtered.forEach(({ node }) => {
      const providerId = node.providerId || 'other'
      if (!grouped.has(providerId)) {
        grouped.set(providerId, [])
      }
      grouped.get(providerId)!.push(node)
    })

    return Array.from(grouped.entries())
      .map(([providerId, nodes]) => ({
        providerId,
        providerName: formatProviderName(providerId),
        icon: nodes[0].icon,
        triggers: nodes.filter((n) => n.isTrigger),
        actions: nodes.filter((n) => !n.isTrigger),
      }))
      .sort((a, b) => a.providerName.localeCompare(b.providerName))
  }, [categorizedNodes, selectedCategory, searchQuery, personalNodes, formatProviderName])

  const toggleProvider = (providerId: string) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev)
      if (next.has(providerId)) {
        next.delete(providerId)
      } else {
        next.add(providerId)
      }
      return next
    })
  }

  const togglePersonal = (nodeType: string) => {
    setPersonalNodes((prev) => {
      const next = new Set(prev)
      if (next.has(nodeType)) {
        next.delete(nodeType)
      } else {
        next.add(nodeType)
      }
      // Save to localStorage
      localStorage.setItem('personal-nodes', JSON.stringify(Array.from(next)))
      return next
    })
  }

  // Load personal nodes from localStorage on mount
  useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('personal-nodes')
      if (saved) {
        try {
          setPersonalNodes(new Set(JSON.parse(saved)))
        } catch (e) {
          // Ignore
        }
      }
    }
  })

  const categories = [
    { id: 'all' as Category, label: 'All', icon: Grid3x3 },
    { id: 'triggers' as Category, label: 'Triggers', icon: Play },
    { id: 'actions' as Category, label: 'Actions', icon: Zap },
    { id: 'data-enrichment' as Category, label: 'Data Enrichment', icon: Sparkles },
    { id: 'database' as Category, label: 'Database', icon: Database },
    { id: 'personal' as Category, label: 'Personal', icon: Star },
  ]

  if (!isOpen) return null

  return (
    <div className="absolute top-0 right-0 h-full w-[400px] bg-background border-l border-border shadow-lg z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">Add Node</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="p-4 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search integrations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Categories */}
      <div className="p-4 border-b">
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <Button
              key={cat.id}
              variant={selectedCategory === cat.id ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(cat.id)}
              className="flex items-center gap-1"
            >
              <cat.icon className="w-3 h-3" />
              {cat.label}
              {cat.id === 'personal' && personalNodes.size > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1 text-xs">
                  {personalNodes.size}
                </Badge>
              )}
            </Button>
          ))}
        </div>
      </div>

      {/* Integrations List */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
          {groupedByProvider.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {selectedCategory === 'personal' ? (
                <>
                  <Star className="w-12 h-12 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No personal nodes yet</p>
                  <p className="text-xs mt-1">Click the star icon on any node to add it here</p>
                </>
              ) : (
                <>
                  <Search className="w-12 h-12 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No integrations found</p>
                </>
              )}
            </div>
          ) : (
            groupedByProvider.map((group) => (
              <div key={group.providerId} className="border rounded-lg overflow-hidden">
                {/* Provider Header */}
                <button
                  onClick={() => toggleProvider(group.providerId)}
                  className="w-full flex items-center justify-between p-3 hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {group.icon && <span className="text-xl">{group.icon}</span>}
                    <div className="text-left">
                      <h3 className="font-medium">{group.providerName}</h3>
                      <p className="text-xs text-muted-foreground">
                        {group.triggers.length} trigger{group.triggers.length !== 1 ? 's' : ''} • {group.actions.length} action{group.actions.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  {expandedProviders.has(group.providerId) ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>

                {/* Nodes List */}
                {expandedProviders.has(group.providerId) && (
                  <div className="border-t bg-muted/30">
                    {/* Triggers */}
                    {group.triggers.length > 0 && (
                      <div className="p-2">
                        <p className="text-xs font-medium text-muted-foreground px-2 py-1">Triggers</p>
                        {group.triggers.map((node) => (
                          <button
                            key={node.type}
                            onClick={() => {
                              onNodeSelect(node)
                              onClose()
                            }}
                            className="w-full flex items-center justify-between p-2 rounded hover:bg-background transition-colors text-left group"
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              {node.icon && <span className="text-sm">{node.icon}</span>}
                              <span className="text-sm truncate">{node.title}</span>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                togglePersonal(node.type)
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Star
                                className={cn(
                                  "w-3 h-3",
                                  personalNodes.has(node.type) ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground"
                                )}
                              />
                            </button>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    {group.actions.length > 0 && (
                      <div className="p-2">
                        <p className="text-xs font-medium text-muted-foreground px-2 py-1">Actions</p>
                        {group.actions.map((node) => (
                          <button
                            key={node.type}
                            onClick={() => {
                              onNodeSelect(node)
                              onClose()
                            }}
                            className="w-full flex items-center justify-between p-2 rounded hover:bg-background transition-colors text-left group"
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              {node.icon && <span className="text-sm">{node.icon}</span>}
                              <span className="text-sm truncate">{node.title}</span>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                togglePersonal(node.type)
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Star
                                className={cn(
                                  "w-3 h-3",
                                  personalNodes.has(node.type) ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground"
                                )}
                              />
                            </button>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
