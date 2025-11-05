"use client"

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ALL_NODE_COMPONENTS, NodeComponent } from '@/lib/workflows/nodes'
import { useIntegrationStore } from '@/stores/integrationStore'
import { getIntegrationLogoClasses } from '@/lib/integrations/logoStyles'
import { Badge } from '@/components/ui/badge'
import { Zap, Boxes, Route } from 'lucide-react'

interface InlineNodePickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectNode: (nodeType: string, component: NodeComponent) => void
  position?: { x: number; y: number }
  filterTriggers?: boolean // If true, only show actions and logic
  children: React.ReactNode
}

export function InlineNodePicker({
  open,
  onOpenChange,
  onSelectNode,
  filterTriggers = true, // Default to filtering out triggers since most use cases are adding to existing workflows
  children
}: InlineNodePickerProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const { getIntegrationByProvider } = useIntegrationStore()
  const commandRef = useRef<HTMLDivElement>(null)

  // Reset search when opened
  useEffect(() => {
    if (open) {
      setSearchTerm('')
    }
  }, [open])

  // Check component availability
  const componentAvailability = useMemo(() => {
    const availability: Record<string, boolean> = {}

    for (const component of ALL_NODE_COMPONENTS) {
      if (!component.providerId) {
        availability[component.type] = true
        continue
      }

      const integration = getIntegrationByProvider(component.providerId)
      const grantedScopes = integration?.scopes || []

      availability[component.type] = (component.requiredScopes || []).every((scope) =>
        grantedScopes.includes(scope)
      )
    }

    return availability
  }, [getIntegrationByProvider])

  // Filter and group components
  const groupedComponents = useMemo(() => {
    const lowercasedFilter = searchTerm.toLowerCase()

    let filtered = ALL_NODE_COMPONENTS.filter(
      (component) =>
        component.title.toLowerCase().includes(lowercasedFilter) ||
        component.description.toLowerCase().includes(lowercasedFilter) ||
        component.category.toLowerCase().includes(lowercasedFilter) ||
        component.providerId?.toLowerCase().includes(lowercasedFilter)
    )

    // Filter out triggers if specified
    if (filterTriggers) {
      filtered = filtered.filter(c => !c.isTrigger)
    }

    const groups: Record<string, NodeComponent[]> = {
      Logic: [],
      Actions: [],
    }

    if (!filterTriggers) {
      groups.Triggers = []
    }

    filtered.forEach((component) => {
      if (component.isTrigger && !filterTriggers) {
        groups.Triggers.push(component)
      } else if (component.category === 'Logic') {
        groups.Logic.push(component)
      } else if (!component.isTrigger) {
        groups.Actions.push(component)
      }
    })

    return groups
  }, [searchTerm, filterTriggers])

  const handleSelect = (component: NodeComponent) => {
    if (!componentAvailability[component.type]) {
      return
    }

    onSelectNode(component.type, component)
    onOpenChange(false)
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Triggers':
        return <Zap className="w-4 h-4 text-amber-500" />
      case 'Logic':
        return <Route className="w-4 h-4 text-blue-500" />
      case 'Actions':
        return <Boxes className="w-4 h-4 text-emerald-500" />
      default:
        return null
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[400px]"
        align="start"
        side="bottom"
        sideOffset={8}
      >
        <Command ref={commandRef} className="rounded-lg border-none">
          <CommandInput
            placeholder="Search for a node..."
            value={searchTerm}
            onValueChange={setSearchTerm}
            className="h-10"
          />
          <CommandList className="max-h-[400px]">
            <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
              No nodes found.
            </CommandEmpty>

            {Object.entries(groupedComponents).map(([category, components]) => {
              if (components.length === 0) return null

              return (
                <CommandGroup
                  key={category}
                  heading={
                    <div className="flex items-center gap-2 px-2 py-1.5">
                      {getCategoryIcon(category)}
                      <span className="font-semibold text-xs uppercase tracking-wide">
                        {category}
                      </span>
                      <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
                        {components.length}
                      </Badge>
                    </div>
                  }
                >
                  {components.map((component) => {
                    const available = componentAvailability[component.type]

                    return (
                      <CommandItem
                        key={component.type}
                        value={`${component.type} ${component.title} ${component.description} ${component.providerId || ''}`}
                        onSelect={() => handleSelect(component)}
                        disabled={!available}
                        className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer ${
                          !available ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        <div className="flex-shrink-0">
                          {component.providerId ? (
                            <img
                              src={`/integrations/${component.providerId}.svg`}
                              alt={`${component.title} logo`}
                              className={getIntegrationLogoClasses(component.providerId, 'h-5 w-5 object-contain')}
                            />
                          ) : (
                            <component.icon className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {component.title}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {component.description}
                          </p>
                        </div>
                        {!available && (
                          <Badge variant="destructive" className="text-[9px] px-1.5 py-0 flex-shrink-0">
                            Not Connected
                          </Badge>
                        )}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              )
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
