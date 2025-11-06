"use client"

/**
 * Node Configuration Test Harness
 *
 * This page allows rapid testing of all node configuration menus without
 * needing to create workflows. Uses the SAME ConfigurationModal component
 * as the actual workflow builder, ensuring changes here reflect in production.
 *
 * Features:
 * - View all 247 nodes grouped by provider
 * - Click any node to open its config modal
 * - Filter by provider, trigger/action, or search
 * - See which nodes are missing config schemas
 * - Rapidly iterate on config menu designs
 */

import React, { useState, useMemo } from "react"
import { ALL_NODE_COMPONENTS, NodeComponent } from "@/lib/workflows/availableNodes"
import { ConfigurationModal } from "@/components/workflows/configuration/ConfigurationModal"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Search, Zap, Settings, AlertCircle, CheckCircle, ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { getProviderBrandName } from "@/lib/integrations/brandNames"

// Group nodes by providerId
const groupNodesByProvider = (nodes: NodeComponent[]): Record<string, NodeComponent[]> => {
  const grouped: Record<string, NodeComponent[]> = {}

  nodes.forEach(node => {
    const providerId = node.providerId || 'unknown'
    if (!grouped[providerId]) {
      grouped[providerId] = []
    }
    grouped[providerId].push(node)
  })

  return grouped
}

// Get provider statistics
const getProviderStats = (nodes: NodeComponent[]) => {
  const triggers = nodes.filter(n => n.isTrigger).length
  const actions = nodes.filter(n => !n.isTrigger).length
  const missingConfig = nodes.filter(n =>
    (!n.configSchema || n.configSchema.length === 0) && !(n as any).noConfigRequired
  ).length
  const missingOutput = nodes.filter(n => !n.outputSchema || n.outputSchema.length === 0).length

  return { triggers, actions, missingConfig, missingOutput, total: nodes.length }
}

export default function NodeTestHarnessPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set())
  const [selectedNode, setSelectedNode] = useState<NodeComponent | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [filterType, setFilterType] = useState<"all" | "triggers" | "actions">("all")
  const [showIssuesOnly, setShowIssuesOnly] = useState(false)

  // Suppress browser extension errors (not our code)
  React.useEffect(() => {
    const handleError = (event: PromiseRejectionEvent) => {
      // Suppress "message channel closed" errors from browser extensions
      if (event.reason?.message?.includes('message channel closed')) {
        event.preventDefault()
      }
    }

    window.addEventListener('unhandledrejection', handleError)
    return () => window.removeEventListener('unhandledrejection', handleError)
  }, [])

  // Group all nodes by provider
  const nodesByProvider = useMemo(() => groupNodesByProvider(ALL_NODE_COMPONENTS), [])

  // Get all provider IDs sorted alphabetically
  const providerIds = useMemo(() =>
    Object.keys(nodesByProvider).sort((a, b) =>
      getProviderBrandName(a).localeCompare(getProviderBrandName(b))
    ),
    [nodesByProvider]
  )

  // Filter nodes based on search and type
  const filteredProviders = useMemo(() => {
    let providers = providerIds

    // Filter by selected provider
    if (selectedProvider) {
      providers = providers.filter(p => p === selectedProvider)
    }

    // Filter by search query or type
    return providers.reduce((acc, providerId) => {
      let nodes = nodesByProvider[providerId]

      // Filter by type
      if (filterType === "triggers") {
        nodes = nodes.filter(n => n.isTrigger)
      } else if (filterType === "actions") {
        nodes = nodes.filter(n => !n.isTrigger)
      }

      // Filter by issues
      if (showIssuesOnly) {
        nodes = nodes.filter(n =>
          ((!n.configSchema || n.configSchema.length === 0) && !(n as any).noConfigRequired) ||
          !n.outputSchema ||
          n.outputSchema.length === 0
        )
      }

      // Filter by search
      if (searchQuery) {
        nodes = nodes.filter(n =>
          n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          n.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          n.type.toLowerCase().includes(searchQuery.toLowerCase())
        )
      }

      if (nodes.length > 0) {
        acc[providerId] = nodes
      }

      return acc
    }, {} as Record<string, NodeComponent[]>)
  }, [providerIds, nodesByProvider, selectedProvider, filterType, showIssuesOnly, searchQuery])

  const toggleProvider = (providerId: string) => {
    const newExpanded = new Set(expandedProviders)
    if (newExpanded.has(providerId)) {
      newExpanded.delete(providerId)
    } else {
      newExpanded.add(providerId)
    }
    setExpandedProviders(newExpanded)
  }

  const openNodeConfig = (node: NodeComponent) => {
    setSelectedNode(node)
    setIsModalOpen(true)
  }

  const closeModal = () => {
    // First, trigger the slide-out animation
    setIsModalOpen(false)

    // After animation completes (700ms), unmount the modal
    setTimeout(() => {
      setSelectedNode(null)
    }, 700)
  }

  const handleSave = (config: Record<string, any>) => {
    console.log("Config saved:", config)
    closeModal()
  }

  // Calculate overall statistics
  const overallStats = useMemo(() => {
    const allNodes = Object.values(nodesByProvider).flat()
    return {
      totalProviders: providerIds.length,
      totalNodes: allNodes.length,
      totalTriggers: allNodes.filter(n => n.isTrigger).length,
      totalActions: allNodes.filter(n => !n.isTrigger).length,
      missingConfig: allNodes.filter(n =>
        (!n.configSchema || n.configSchema.length === 0) && !(n as any).noConfigRequired
      ).length,
      missingOutput: allNodes.filter(n => !n.outputSchema || n.outputSchema.length === 0).length,
    }
  }, [nodesByProvider, providerIds])

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Node Configuration Test Harness</h1>
          <p className="text-muted-foreground">
            Test all node configuration menus in one place. Changes here reflect in the Workflow Builder.
          </p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Providers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overallStats.totalProviders}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Nodes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overallStats.totalNodes}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Triggers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overallStats.totalTriggers}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overallStats.totalActions}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Missing Config</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn(
                "text-2xl font-bold",
                overallStats.missingConfig > 0 ? "text-orange-600" : "text-green-600"
              )}>
                {overallStats.missingConfig}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Missing Output</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn(
                "text-2xl font-bold",
                overallStats.missingOutput > 0 ? "text-orange-600" : "text-green-600"
              )}>
                {overallStats.missingOutput}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 flex items-center border border-input rounded-md px-3 bg-background">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              type="text"
              placeholder="Search nodes by name, description, or type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex h-10 w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant={filterType === "all" ? "default" : "outline"}
              onClick={() => setFilterType("all")}
              size="sm"
            >
              All
            </Button>
            <Button
              variant={filterType === "triggers" ? "default" : "outline"}
              onClick={() => setFilterType("triggers")}
              size="sm"
            >
              <Zap className="h-4 w-4 mr-2" />
              Triggers
            </Button>
            <Button
              variant={filterType === "actions" ? "default" : "outline"}
              onClick={() => setFilterType("actions")}
              size="sm"
            >
              <Settings className="h-4 w-4 mr-2" />
              Actions
            </Button>
          </div>

          <Button
            variant={showIssuesOnly ? "default" : "outline"}
            onClick={() => setShowIssuesOnly(!showIssuesOnly)}
            size="sm"
          >
            <AlertCircle className="h-4 w-4 mr-2" />
            Issues Only
          </Button>
        </div>

        {/* Provider List */}
        <div className="space-y-4">
          {Object.entries(filteredProviders).map(([providerId, nodes]) => {
            const stats = getProviderStats(nodes)
            const isExpanded = expandedProviders.has(providerId)

            return (
              <Card key={providerId}>
                <CardHeader
                  className="cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => toggleProvider(providerId)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div>
                        <CardTitle>{getProviderBrandName(providerId)}</CardTitle>
                        <CardDescription>
                          {stats.total} nodes ({stats.triggers} triggers, {stats.actions} actions)
                        </CardDescription>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {stats.missingConfig > 0 && (
                        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                          {stats.missingConfig} missing config
                        </Badge>
                      )}
                      {stats.missingOutput > 0 && (
                        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                          {stats.missingOutput} missing output
                        </Badge>
                      )}
                      {stats.missingConfig === 0 && stats.missingOutput === 0 && (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Complete
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {nodes.map(node => {
                        const hasConfig = node.configSchema && node.configSchema.length > 0
                        const noConfigNeeded = (node as any).noConfigRequired === true
                        const hasOutput = node.outputSchema && node.outputSchema.length > 0
                        const hasIssues = (!hasConfig && !noConfigNeeded) || !hasOutput

                        return (
                          <button
                            key={node.type}
                            onClick={() => openNodeConfig(node)}
                            className={cn(
                              "text-left p-4 rounded-lg border transition-all",
                              "hover:border-primary hover:shadow-md",
                              hasIssues ? "border-orange-200 bg-orange-50/50" : "border-border bg-card"
                            )}
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex-1">
                                <div className="font-medium">{node.title}</div>
                                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                  {node.description}
                                </div>
                              </div>
                              <Badge
                                variant={node.isTrigger ? "default" : "secondary"}
                                className="shrink-0"
                              >
                                {node.isTrigger ? (
                                  <><Zap className="h-3 w-3 mr-1" /> Trigger</>
                                ) : (
                                  <><Settings className="h-3 w-3 mr-1" /> Action</>
                                )}
                              </Badge>
                            </div>

                            <div className="flex gap-2 mt-2">
                              {!hasConfig && !noConfigNeeded && (
                                <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">
                                  No config
                                </Badge>
                              )}
                              {!hasOutput && (
                                <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">
                                  No output
                                </Badge>
                              )}
                              {node.comingSoon && (
                                <Badge variant="outline" className="text-xs">
                                  Coming Soon
                                </Badge>
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>

        {Object.keys(filteredProviders).length === 0 && (
          <Card className="p-8">
            <div className="text-center text-muted-foreground">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No nodes found matching your filters.</p>
            </div>
          </Card>
        )}
      </div>

      {/* Configuration Modal */}
      {selectedNode && (
        <ConfigurationModal
          isOpen={isModalOpen}
          onClose={closeModal}
          onSave={handleSave}
          nodeInfo={selectedNode}
          integrationName={selectedNode.providerId || 'unknown'}
          initialData={{}}
          workflowData={{
            nodes: [],
            edges: [],
            id: 'test-workflow',
            name: 'Test Workflow'
          }}
          currentNodeId="test-node-1"
        />
      )}
    </div>
  )
}
