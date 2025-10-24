"use client"

import { useState, useMemo } from "react"
import Image from "next/image"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import {
  X,
  Zap,
  Play,
  Database,
  Sparkles,
  Grid3x3,
  ArrowRight,
} from "lucide-react"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/availableNodes"
import type { NodeComponent } from "@/lib/workflows/nodes/types"

interface IntegrationsSidePanelProps {
  isOpen: boolean
  onClose: () => void
  onNodeSelect: (node: NodeComponent) => void
}

type Category = 'all' | 'trigger' | 'action' | 'integration' | 'data-enrichment' | 'database'

export function IntegrationsSidePanel({ isOpen, onClose, onNodeSelect }: IntegrationsSidePanelProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<Category>('all')

  // Filter and categorize nodes
  const filteredNodes = useMemo(() => {
    let nodes = ALL_NODE_COMPONENTS.filter(node => node.providerId && node.providerId !== 'generic')

    // Filter by category
    if (selectedCategory === 'trigger') {
      nodes = nodes.filter(n => n.isTrigger)
    } else if (selectedCategory === 'action') {
      nodes = nodes.filter(n => !n.isTrigger)
    } else if (selectedCategory === 'integration') {
      nodes = nodes.filter(n => !['ai', 'logic', 'automation', 'misc'].includes(n.providerId || ''))
    } else if (selectedCategory === 'data-enrichment') {
      nodes = nodes.filter(n =>
        n.type.includes('enrich') ||
        n.type.includes('extract') ||
        n.type.includes('ai_') ||
        n.providerId === 'ai'
      )
    } else if (selectedCategory === 'database') {
      nodes = nodes.filter(n =>
        n.providerId === 'airtable' ||
        n.providerId === 'google-sheets' ||
        n.type.includes('database') ||
        n.type.includes('query')
      )
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      nodes = nodes.filter(n =>
        n.title.toLowerCase().includes(query) ||
        n.providerId?.toLowerCase().includes(query) ||
        (n.description && n.description.toLowerCase().includes(query))
      )
    }

    return nodes
  }, [selectedCategory, searchQuery])

  const categories = [
    { id: 'all' as Category, label: 'All', icon: Grid3x3 },
    { id: 'trigger' as Category, label: 'Trigger', icon: Play },
    { id: 'action' as Category, label: 'Action', icon: Zap },
    { id: 'integration' as Category, label: 'Integration', icon: Sparkles },
    { id: 'data-enrichment' as Category, label: 'Data Enrichment', icon: Sparkles },
    { id: 'database' as Category, label: 'Database', icon: Database },
  ]

  return (
    <div className="h-full w-full bg-background border-l border-border shadow-lg z-50 flex flex-col">
      {/* Header with Search */}
      <div className="flex items-center gap-3 px-4 py-3 border-b">
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
          <ArrowRight className="w-4 h-4" />
        </Button>
        <h2 className="text-base font-semibold whitespace-nowrap">Nodes Catalog</h2>
        <div className="flex-1 relative">
          <Input
            placeholder="Search for node or functionality"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 text-sm px-3"
          />
        </div>
      </div>

      {/* Categories */}
      <div className="border-b">
        <div className="flex items-center justify-between px-4 py-2">
          {categories.map((cat) => {
            const Icon = cat.icon
            return (
              <Button
                key={cat.id}
                variant={selectedCategory === cat.id ? "default" : "ghost"}
                size="sm"
                onClick={() => setSelectedCategory(cat.id)}
                className="flex-1 h-8 text-xs"
              >
                {cat.label}
              </Button>
            )
          })}
        </div>
      </div>

      {/* Nodes List */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-1">
          {filteredNodes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">No nodes found</p>
              <p className="text-xs mt-1">Try adjusting your search or category</p>
            </div>
          ) : (
            filteredNodes.map((node) => {
              const NodeIcon = node.icon
              // For logic and AI nodes, use the unique node icon instead of provider logo
              const shouldUseNodeIcon = ['logic', 'ai'].includes(node.providerId || '')
              const providerLogo = !shouldUseNodeIcon && node.providerId ? `/integrations/${node.providerId}.svg` : null

              const handleDragStart = (e: React.DragEvent) => {
                e.dataTransfer.effectAllowed = 'copy'
                e.dataTransfer.setData('application/reactflow', JSON.stringify({
                  type: 'node',
                  nodeData: node
                }))
              }

              return (
                <div
                  key={node.type}
                  draggable
                  onDragStart={handleDragStart}
                  className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-accent transition-colors cursor-grab active:cursor-grabbing group"
                >
                  {/* Icon */}
                  <div className="shrink-0 w-10 h-10 rounded-lg bg-background border border-border flex items-center justify-center p-1.5">
                    {providerLogo ? (
                      <Image
                        src={providerLogo}
                        alt={node.providerId || ''}
                        width={28}
                        height={28}
                        className="w-full h-full object-contain"
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
                      {node.description}
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
