"use client"

import React, { useState, useMemo } from "react"
import { Search, ChevronRight, ChevronDown, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ALL_NODE_COMPONENTS, type NodeComponent } from "@/lib/workflows/nodes"

interface IntegrationsSidebarProps {
  onClose?: () => void
  onNodeDragStart: (nodeType: NodeComponent) => void
  className?: string
}

interface IntegrationGroup {
  providerId: string
  providerName: string
  icon?: React.ComponentType<any>
  triggers: NodeComponent[]
  actions: NodeComponent[]
}

export function IntegrationsSidebar({ onClose, onNodeDragStart, className = "" }: IntegrationsSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set())

  // Group nodes by provider
  const integrationGroups = useMemo(() => {
    const groups = new Map<string, IntegrationGroup>()

    ALL_NODE_COMPONENTS.forEach((node) => {
      // Skip nodes without a provider (like generic logic nodes)
      if (!node.providerId || node.providerId === 'generic' || node.providerId === 'logic') {
        return
      }

      const providerId = node.providerId

      if (!groups.has(providerId)) {
        groups.set(providerId, {
          providerId,
          providerName: node.category || formatProviderName(providerId),
          icon: node.icon,
          triggers: [],
          actions: [],
        })
      }

      const group = groups.get(providerId)!
      if (node.isTrigger) {
        group.triggers.push(node)
      } else {
        group.actions.push(node)
      }
    })

    // Convert to array and sort alphabetically
    return Array.from(groups.values()).sort((a, b) =>
      a.providerName.localeCompare(b.providerName)
    )
  }, [])

  // Filter integrations based on search
  const filteredIntegrations = useMemo(() => {
    if (!searchQuery.trim()) {
      return integrationGroups
    }

    const query = searchQuery.toLowerCase()
    return integrationGroups.filter((group) => {
      // Check provider name
      if (group.providerName.toLowerCase().includes(query)) {
        return true
      }

      // Check if any trigger/action matches
      const hasMatchingNode = [
        ...group.triggers,
        ...group.actions,
      ].some((node) =>
        node.title.toLowerCase().includes(query) ||
        node.description?.toLowerCase().includes(query)
      )

      return hasMatchingNode
    })
  }, [integrationGroups, searchQuery])

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

  const handleDragStart = (e: React.DragEvent, node: NodeComponent) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/reactflow', JSON.stringify({
      type: node.type,
      title: node.title,
      providerId: node.providerId,
      isTrigger: node.isTrigger,
    }))
    onNodeDragStart(node)
  }

  return (
    <div className={`flex flex-col h-full bg-[#0a0a0a] border-l border-zinc-800 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-800">
        <div>
          <h2 className="text-lg font-semibold text-white">Integrations</h2>
          <p className="text-sm text-zinc-400 mt-0.5">Drag onto canvas</p>
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-zinc-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="p-4 border-b border-zinc-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            placeholder="Search integrations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500"
          />
        </div>
      </div>

      {/* Integrations List */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {filteredIntegrations.length === 0 ? (
            <div className="text-center py-8 text-zinc-400">
              <p>No integrations found</p>
            </div>
          ) : (
            filteredIntegrations.map((group) => {
              const isExpanded = expandedProviders.has(group.providerId)
              const totalNodes = group.triggers.length + group.actions.length

              return (
                <div key={group.providerId} className="mb-2">
                  {/* Provider Header */}
                  <button
                    onClick={() => toggleProvider(group.providerId)}
                    className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-zinc-900 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {group.icon && <group.icon className="h-5 w-5 text-zinc-400" />}
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">
                          {group.providerName}
                        </span>
                        <Badge variant="secondary" className="text-xs bg-zinc-800 text-zinc-300">
                          {totalNodes}
                        </Badge>
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-zinc-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-zinc-400" />
                    )}
                  </button>

                  {/* Nodes List */}
                  {isExpanded && (
                    <div className="ml-4 mt-1 space-y-1">
                      {/* Triggers */}
                      {group.triggers.length > 0 && (
                        <div>
                          <div className="text-xs font-medium text-zinc-500 px-3 py-2">
                            Triggers
                          </div>
                          {group.triggers.map((node) => (
                            <div
                              key={node.type}
                              draggable
                              onDragStart={(e) => handleDragStart(e, node)}
                              className="flex items-start gap-2 p-2 rounded-md hover:bg-zinc-900 cursor-move transition-colors group"
                            >
                              <div className="flex-shrink-0 mt-0.5">
                                {node.icon && <node.icon className="h-4 w-4 text-zinc-400 group-hover:text-white transition-colors" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-white group-hover:text-white font-medium">
                                  {node.title}
                                </div>
                                {node.description && (
                                  <div className="text-xs text-zinc-500 line-clamp-2 mt-0.5">
                                    {node.description}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Actions */}
                      {group.actions.length > 0 && (
                        <div>
                          <div className="text-xs font-medium text-zinc-500 px-3 py-2">
                            Actions
                          </div>
                          {group.actions.map((node) => (
                            <div
                              key={node.type}
                              draggable
                              onDragStart={(e) => handleDragStart(e, node)}
                              className="flex items-start gap-2 p-2 rounded-md hover:bg-zinc-900 cursor-move transition-colors group"
                            >
                              <div className="flex-shrink-0 mt-0.5">
                                {node.icon && <node.icon className="h-4 w-4 text-zinc-400 group-hover:text-white transition-colors" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-white group-hover:text-white font-medium">
                                  {node.title}
                                </div>
                                {node.description && (
                                  <div className="text-xs text-zinc-500 line-clamp-2 mt-0.5">
                                    {node.description}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </ScrollArea>

      {/* Footer Hint */}
      <div className="p-4 border-t border-zinc-800 bg-zinc-950">
        <p className="text-xs text-zinc-500 text-center">
          💡 Drag any integration onto the canvas to get started
        </p>
      </div>
    </div>
  )
}

// Helper function to format provider names
function formatProviderName(providerId: string): string {
  // Handle special cases
  const specialCases: Record<string, string> = {
    'ai': 'AI & Automation',
    'gmail': 'Gmail',
    'google-calendar': 'Google Calendar',
    'google-drive': 'Google Drive',
    'google-sheets': 'Google Sheets',
    'google-docs': 'Google Docs',
    'microsoft-excel': 'Microsoft Excel',
    'onedrive': 'OneDrive',
    'onenote': 'OneNote',
    'hubspot': 'HubSpot',
  }

  if (specialCases[providerId]) {
    return specialCases[providerId]
  }

  // Default: capitalize first letter
  return providerId.charAt(0).toUpperCase() + providerId.slice(1)
}
