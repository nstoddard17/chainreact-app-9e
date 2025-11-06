"use client"

import { useState, useMemo } from "react"
import { ProfessionalSearch } from "@/components/ui/professional-search"
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
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/nodes"
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
    let nodes = ALL_NODE_COMPONENTS.filter(node =>
      node.providerId &&
      node.providerId !== 'generic' &&
      node.type !== 'path_condition' // Path Condition nodes are auto-created by Path Router
    )

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
    <div className="h-full w-full bg-white dark:bg-slate-950 border-l border-border shadow-lg z-50 flex flex-col">
      {/* Header with Search */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-muted-foreground hover:text-foreground">
          <ArrowRight className="w-4 h-4" />
        </Button>
        <h2 className="text-base font-semibold whitespace-nowrap">Nodes Catalog</h2>
        <div className="flex-1 relative">
          <ProfessionalSearch
            placeholder="Search for node or functionality"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery("")}
            className="h-9"
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
      <div className="flex-1 overflow-y-auto">
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

              const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
                e.dataTransfer.effectAllowed = 'copy'
                e.dataTransfer.setData('application/reactflow', JSON.stringify({
                  type: 'node',
                  nodeData: node
                }))

                // Create a pill-style drag preview
                const dragElement = document.createElement('div')
                dragElement.style.position = 'absolute'
                dragElement.style.top = '-1000px'
                dragElement.style.padding = '8px 16px'
                dragElement.style.background = 'rgba(255, 255, 255, 0.95)'
                dragElement.style.border = '2px solid #e5e7eb'
                dragElement.style.borderRadius = '24px'
                dragElement.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)'
                dragElement.style.display = 'flex'
                dragElement.style.alignItems = 'center'
                dragElement.style.gap = '8px'
                dragElement.style.fontSize = '14px'
                dragElement.style.fontWeight = '500'
                dragElement.style.color = '#1f2937'
                dragElement.style.whiteSpace = 'nowrap'
                dragElement.style.pointerEvents = 'none'

                // Add icon
                if (providerLogo) {
                  const iconImg = document.createElement('img')
                  iconImg.src = providerLogo
                  iconImg.style.width = '20px'
                  iconImg.style.height = '20px'
                  iconImg.style.objectFit = 'contain'
                  dragElement.appendChild(iconImg)
                } else if (NodeIcon) {
                  const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
                  iconSvg.setAttribute('width', '20')
                  iconSvg.setAttribute('height', '20')
                  iconSvg.setAttribute('viewBox', '0 0 24 24')
                  iconSvg.setAttribute('fill', 'none')
                  iconSvg.setAttribute('stroke', 'currentColor')
                  iconSvg.setAttribute('stroke-width', '2')
                  dragElement.appendChild(iconSvg)
                }

                // Add text
                const text = document.createElement('span')
                text.textContent = node.title
                dragElement.appendChild(text)

                document.body.appendChild(dragElement)

                e.dataTransfer.setDragImage(dragElement, 40, 20)

                // Clean up the temporary element after drag starts
                setTimeout(() => document.body.removeChild(dragElement), 0)
              }

              return (
                <div
                  key={node.type}
                  draggable
                  onDragStart={handleDragStart}
                  className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-900 transition-colors cursor-grab active:cursor-grabbing group border border-transparent hover:border-gray-200 dark:hover:border-slate-800"
                >
                  {/* Icon */}
                  <div className="shrink-0 w-10 h-10 rounded-lg bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 flex items-center justify-center p-1.5">
                    {providerLogo ? (
                      <img
                        src={providerLogo}
                        alt={node.providerId || ''}
                        className="object-contain"
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
                    {/* Provider/Category subtitle */}
                    {(node.providerId || node.category) && (
                      <div className="text-xs text-muted-foreground/70 mb-1 capitalize">
                        {node.providerId ?
                          node.providerId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) :
                          node.category
                        }
                        {node.isTrigger ? ' • Trigger' : ' • Action'}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {node.description || 'No description available'}
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
