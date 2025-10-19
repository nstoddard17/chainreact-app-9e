"use client"

import React from "react"
import { List, CheckCircle, Circle, ChevronRight, ExternalLink } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface ListItem {
  id?: string
  title: string
  description?: string
  subtitle?: string
  completed?: boolean
  link?: string
  metadata?: Array<{
    label: string
    value: string
  }>
  icon?: React.ReactNode
  badge?: string
  badgeVariant?: 'default' | 'secondary' | 'outline' | 'destructive'
}

interface ListRendererProps {
  items: ListItem[]
  title?: string
  ordered?: boolean
  showNumbers?: boolean
  showCheckboxes?: boolean
  className?: string
  layout?: 'compact' | 'comfortable' | 'spacious'
}

export function ListRenderer({
  items,
  title,
  ordered = false,
  showNumbers = false,
  showCheckboxes = false,
  className,
  layout = 'comfortable'
}: ListRendererProps) {
  if (items.length === 0) {
    return (
      <div className={cn("mt-3 p-4 bg-muted/50 rounded-lg border text-center", className)}>
        <List className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No items found</p>
      </div>
    )
  }

  const paddingClass = layout === 'compact' ? 'p-2' : layout === 'comfortable' ? 'p-3' : 'p-4'
  const gapClass = layout === 'compact' ? 'gap-1' : layout === 'comfortable' ? 'gap-2' : 'gap-3'

  return (
    <div className={cn("mt-3 space-y-3", className)}>
      {/* Header */}
      {title && (
        <div className="flex items-center gap-2">
          <List className="w-5 h-5 text-primary" />
          <span className="font-medium text-lg">{title}</span>
          <Badge variant="secondary" className="ml-auto">{items.length}</Badge>
        </div>
      )}

      {/* List */}
      <div className={cn("space-y-2", ordered && "space-y-0")}>
        {items.map((item, index) => (
          <Card
            key={item.id || index}
            className={cn(
              "transition-all hover:bg-muted/50",
              paddingClass,
              item.completed && "opacity-60"
            )}
          >
            <div className="flex items-start gap-3">
              {/* Number/Checkbox/Icon */}
              <div className="flex-shrink-0">
                {showCheckboxes ? (
                  item.completed ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <Circle className="w-5 h-5 text-muted-foreground" />
                  )
                ) : showNumbers || ordered ? (
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-xs font-medium text-primary">{index + 1}</span>
                  </div>
                ) : item.icon ? (
                  <div className="w-5 h-5 text-primary">
                    {item.icon}
                  </div>
                ) : (
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                )}
              </div>

              {/* Content */}
              <div className={cn("flex-1 min-w-0", gapClass)}>
                {/* Title */}
                <div className="flex items-start justify-between gap-2">
                  <h4 className={cn(
                    "font-medium text-sm",
                    item.completed && "line-through text-muted-foreground"
                  )}>
                    {item.link ? (
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
                      >
                        {item.title}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      item.title
                    )}
                  </h4>

                  {item.badge && (
                    <Badge
                      variant={item.badgeVariant || 'secondary'}
                      className="flex-shrink-0"
                    >
                      {item.badge}
                    </Badge>
                  )}
                </div>

                {/* Subtitle */}
                {item.subtitle && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {item.subtitle}
                  </div>
                )}

                {/* Description */}
                {item.description && (
                  <div className="text-sm text-muted-foreground mt-1">
                    {item.description}
                  </div>
                )}

                {/* Metadata */}
                {item.metadata && item.metadata.length > 0 && (
                  <div className="flex flex-wrap gap-3 mt-2">
                    {item.metadata.map((meta, metaIndex) => (
                      <div key={metaIndex} className="text-xs">
                        <span className="text-muted-foreground">{meta.label}:</span>
                        <span className="ml-1 font-medium">{meta.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
