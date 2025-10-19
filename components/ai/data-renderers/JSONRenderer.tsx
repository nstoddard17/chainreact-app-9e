"use client"

import React, { useState } from "react"
import { FileJson, Copy, Check, ChevronDown, ChevronRight } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface JSONRendererProps {
  data: any
  title?: string
  className?: string
  defaultExpanded?: boolean
  maxHeight?: string
}

export function JSONRenderer({
  data,
  title,
  className,
  defaultExpanded = true,
  maxHeight = "600px"
}: JSONRendererProps) {
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(defaultExpanded)

  const handleCopy = async () => {
    const jsonString = JSON.stringify(data, null, 2)
    await navigator.clipboard.writeText(jsonString)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const renderValue = (value: any, key: string, level: number = 0): JSX.Element => {
    const indent = level * 20

    if (value === null) {
      return (
        <span className="text-gray-500 italic">null</span>
      )
    }

    if (value === undefined) {
      return (
        <span className="text-gray-500 italic">undefined</span>
      )
    }

    if (typeof value === 'boolean') {
      return (
        <span className="text-purple-600 dark:text-purple-400 font-medium">
          {value.toString()}
        </span>
      )
    }

    if (typeof value === 'number') {
      return (
        <span className="text-blue-600 dark:text-blue-400 font-medium">
          {value}
        </span>
      )
    }

    if (typeof value === 'string') {
      // Check if it's a URL
      const isUrl = /^https?:\/\/.+/.test(value)

      return (
        <span className="text-green-600 dark:text-green-400">
          "{isUrl ? (
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-green-700 dark:hover:text-green-300"
            >
              {value}
            </a>
          ) : value}"
        </span>
      )
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return <span className="text-muted-foreground">[]</span>
      }

      return (
        <CollapsibleSection title={`Array (${value.length} items)`} level={level}>
          <div>
            {value.map((item, index) => (
              <div key={index} style={{ paddingLeft: `${indent + 20}px` }} className="py-1">
                <span className="text-muted-foreground mr-2">{index}:</span>
                {renderValue(item, String(index), level + 1)}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )
    }

    if (typeof value === 'object') {
      const keys = Object.keys(value)

      if (keys.length === 0) {
        return <span className="text-muted-foreground">{'{}'}</span>
      }

      return (
        <CollapsibleSection title={`Object (${keys.length} keys)`} level={level}>
          <div>
            {keys.map((objKey) => (
              <div key={objKey} style={{ paddingLeft: `${indent + 20}px` }} className="py-1">
                <span className="text-orange-600 dark:text-orange-400 font-medium mr-2">
                  {objKey}:
                </span>
                {renderValue(value[objKey], objKey, level + 1)}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )
    }

    return <span>{String(value)}</span>
  }

  return (
    <div className={cn("mt-3 space-y-3", className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileJson className="w-5 h-5 text-primary" />
          <span className="font-medium text-lg">{title || "JSON Data"}</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setExpanded(!expanded)}
            className="h-8 text-xs"
          >
            {expanded ? "Collapse All" : "Expand All"}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleCopy}
            className="h-8 text-xs"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 mr-1" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 mr-1" />
                Copy
              </>
            )}
          </Button>
        </div>
      </div>

      {/* JSON Display */}
      <Card className="overflow-hidden">
        <div
          className="p-4 overflow-auto font-mono text-xs bg-slate-50 dark:bg-slate-900"
          style={{ maxHeight }}
        >
          {renderValue(data, 'root', 0)}
        </div>
      </Card>
    </div>
  )
}

interface CollapsibleSectionProps {
  title: string
  level: number
  children: React.ReactNode
}

function CollapsibleSection({ title, level, children }: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(level < 2) // Auto-expand first 2 levels

  return (
    <div>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        <span>{title}</span>
      </button>

      {isExpanded && (
        <div className="mt-1">
          {children}
        </div>
      )}
    </div>
  )
}
