"use client"

import type React from "react"
import { useMemo, useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useIntegrationStore } from "@/stores/integrationStore"
import { ALL_NODE_COMPONENTS, NodeComponent } from "@/lib/workflows/availableNodes"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { isComponentAvailable } from "@/lib/integrations/integrationScopes"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Search } from "lucide-react"

const Node = ({ component, available }: { component: NodeComponent; available: boolean }) => {
  const handleDragStart = (e: React.DragEvent, nodeType: string, available: boolean) => {
    if (!available) {
      e.preventDefault()
      return
    }

    const nodeData = {
      label: component.title,
      provider: component.providerId,
      type: component.type,
    }

    e.dataTransfer.setData("application/reactflow", component.type)
    e.dataTransfer.setData("application/nodedata", JSON.stringify(nodeData))
    e.dataTransfer.effectAllowed = "move"
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            draggable
            onDragStart={(e) => handleDragStart(e, component.type, available)}
            className={`flex cursor-pointer items-center space-x-3 rounded-md border p-3 transition-all hover:bg-accent ${
              !available ? "cursor-not-allowed opacity-50" : ""
            }`}
          >
            {component.providerId ? (
              <img
                src={`/public/integrations/${component.providerId}.svg`}
                alt={`${component.title} logo`}
                className="h-6 w-6 object-contain"
              />
            ) : (
              <component.icon className="h-6 w-6" />
            )}
            <div className="flex-1">
              <p className="font-semibold">{component.title}</p>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" align="center">
          <p>{component.description}</p>
          {!available && <p className="mt-1 text-xs text-destructive">Integration not connected or scopes missing.</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export default function NodePalette() {
  const { getConnectedProviders, loading, getIntegrationByProvider } = useIntegrationStore()
  const [searchTerm, setSearchTerm] = useState("")
  const [componentAvailability, setComponentAvailability] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const checkAvailability = async () => {
      const availability: Record<string, boolean> = {}
      for (const component of ALL_NODE_COMPONENTS) {
        if (!component.providerId) {
          availability[component.type] = true
          continue
        }
        const integration = getIntegrationByProvider(component.providerId)
        const grantedScopes = integration?.scopes || []
        availability[component.type] = (component.requiredScopes || []).every((scope) =>
          grantedScopes.includes(scope),
        )
      }
      setComponentAvailability(availability)
    }

    if (!loading) {
      checkAvailability()
    }
  }, [getConnectedProviders, loading, getIntegrationByProvider])

  const filteredComponents = useMemo(() => {
    const lowercasedFilter = searchTerm.toLowerCase()
    return ALL_NODE_COMPONENTS.filter(
      (component) =>
        component.title.toLowerCase().includes(lowercasedFilter) ||
        component.description.toLowerCase().includes(lowercasedFilter) ||
        component.category.toLowerCase().includes(lowercasedFilter),
    )
  }, [searchTerm])

  const groupedComponents = useMemo(() => {
    const groups: Record<string, NodeComponent[]> = {
      Triggers: [],
      Actions: [],
      Logic: [],
    }

    filteredComponents.forEach((component) => {
      if (component.isTrigger) {
        groups.Triggers.push(component)
      } else if (component.category === "Logic") {
        groups.Logic.push(component)
      } else {
        groups.Actions.push(component)
      }
    })

    return groups
  }, [filteredComponents])

  if (loading) {
    return (
      <div className="w-64 p-4">
        <h3 className="mb-4 text-lg font-semibold">Palette</h3>
        <Skeleton className="mb-4 h-10 w-full" />
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <Card className="flex h-full w-80 flex-col">
      <div className="p-4">
        <h3 className="mb-4 text-xl font-bold">Add Nodes</h3>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
          <Input
            placeholder="Search nodes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 pt-0">
          {Object.entries(groupedComponents).map(([category, components]) => {
            if (components.length === 0) return null
            return (
              <div key={category} className="mb-6">
                <h4 className="mb-3 text-lg font-semibold text-muted-foreground">{category}</h4>
                <div className="space-y-3">
                  {components.map((component) => (
                    <Node
                      key={component.type}
                      component={component}
                      available={componentAvailability[component.type] ?? false}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </Card>
  )
}
