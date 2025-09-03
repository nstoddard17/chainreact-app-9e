import React, { useState, memo } from 'react'
import { ChevronRight } from 'lucide-react'
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

export const IntegrationItem = memo(({ 
  integration, 
  selectedIntegration, 
  onSelect, 
  renderLogo 
}: {
  integration: IntegrationInfo
  selectedIntegration: IntegrationInfo | null
  onSelect: (integration: IntegrationInfo) => void
  renderLogo: (id: string, name: string) => React.ReactNode
}) => (
  <div
    className={`flex items-center p-3 rounded-md cursor-pointer ${
      selectedIntegration?.id === integration.id 
        ? 'bg-primary/10 ring-1 ring-primary/20' 
        : 'hover:bg-muted/50'
    }`}
    onClick={() => onSelect(integration)}
  >
    {renderLogo(integration.id, integration.name)}
    <span className="font-semibold ml-4 flex-grow">{integration.name}</span>
    <ChevronRight className="w-5 h-5 text-muted-foreground" />
  </div>
))

IntegrationItem.displayName = 'IntegrationItem'

export const VirtualIntegrationList = memo(({ 
  integrations, 
  selectedIntegration, 
  onSelect, 
  renderLogo 
}: {
  integrations: IntegrationInfo[]
  selectedIntegration: IntegrationInfo | null
  onSelect: (integration: IntegrationInfo) => void
  renderLogo: (id: string, name: string) => React.ReactNode
}) => {
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight] = useState(400)
  const itemHeight = 56 // Fixed height for each integration item
  const bufferSize = 5 // Extra items to render for smooth scrolling
  
  const visibleStart = Math.max(0, Math.floor(scrollTop / itemHeight) - bufferSize)
  const visibleEnd = Math.min(
    integrations.length,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + bufferSize
  )
  
  const visibleIntegrations = integrations.slice(visibleStart, visibleEnd)
  
  return (
    <div
      className="overflow-auto"
      style={{ height: containerHeight }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: integrations.length * itemHeight, position: 'relative' }}>
        <div
          style={{
            transform: `translateY(${visibleStart * itemHeight}px)`,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
          }}
        >
          {visibleIntegrations.map((integration) => (
            <div key={integration.id} style={{ height: itemHeight }}>
              <IntegrationItem
                integration={integration}
                selectedIntegration={selectedIntegration}
                onSelect={onSelect}
                renderLogo={renderLogo}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
})

VirtualIntegrationList.displayName = 'VirtualIntegrationList'