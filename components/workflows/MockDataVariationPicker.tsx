"use client"

import React, { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Database, Eye, EyeOff, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  getTriggerVariations,
  getTriggerMockDescription,
  getMockTriggerData
} from "@/lib/services/testMode/mockTriggerData"

interface MockDataVariationPickerProps {
  triggerType: string
  selectedVariation?: string
  onVariationChange: (variation: string | undefined) => void
  className?: string
  /** Compact mode - just shows the select dropdown without the card wrapper */
  compact?: boolean
}

export function MockDataVariationPicker({
  triggerType,
  selectedVariation,
  onVariationChange,
  className,
  compact = false
}: MockDataVariationPickerProps) {
  const [variations, setVariations] = useState<string[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const [previewData, setPreviewData] = useState<any>(null)

  useEffect(() => {
    // Load variations for this trigger type
    const availableVariations = getTriggerVariations(triggerType)
    setVariations(availableVariations)

    // Load preview data
    const data = getMockTriggerData(triggerType, selectedVariation)
    setPreviewData(data)
  }, [triggerType, selectedVariation])

  const handleVariationChange = (value: string) => {
    if (value === 'default') {
      onVariationChange(undefined)
    } else {
      onVariationChange(value)
    }
  }

  const description = getTriggerMockDescription(triggerType, selectedVariation)

  // Don't render if no variations available
  if (variations.length === 0) {
    return null
  }

  // Compact mode - just the select dropdown
  if (compact) {
    return (
      <div className={cn("space-y-2", className)}>
        <Select
          value={selectedVariation || 'default'}
          onValueChange={handleVariationChange}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="Select mock data scenario" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">
              Default (Standard scenario)
            </SelectItem>
            {variations.map((variation) => (
              <SelectItem key={variation} value={variation}>
                {variation}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
    )
  }

  // Full card mode
  return (
    <Card className={cn("border-purple-200 dark:border-purple-900", className)}>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Database className="w-4 h-4 text-purple-500" />
          Mock Data Variation
        </CardTitle>
        <CardDescription className="text-xs">
          Choose a specific test scenario for {triggerType}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Variation Selector */}
        <div className="space-y-2">
          <Label htmlFor="variation" className="text-xs">
            Data Scenario
          </Label>
          <Select
            value={selectedVariation || 'default'}
            onValueChange={handleVariationChange}
          >
            <SelectTrigger id="variation" className="h-9 text-sm">
              <SelectValue placeholder="Select mock data scenario" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">
                Default (Standard scenario)
              </SelectItem>
              {variations.map((variation) => (
                <SelectItem key={variation} value={variation}>
                  {variation}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Description */}
        {description && (
          <div className="p-3 bg-purple-50 dark:bg-purple-950/20 rounded text-xs">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
              <p className="text-purple-900 dark:text-purple-100">{description}</p>
            </div>
          </div>
        )}

        {/* Preview Toggle */}
        <div className="flex items-center justify-between">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowPreview(!showPreview)}
            className="h-8 text-xs"
          >
            {showPreview ? (
              <>
                <EyeOff className="w-3 h-3 mr-1" />
                Hide Preview
              </>
            ) : (
              <>
                <Eye className="w-3 h-3 mr-1" />
                Show Data Preview
              </>
            )}
          </Button>
          <Badge variant="secondary" className="text-xs">
            Mock Data
          </Badge>
        </div>

        {/* Data Preview */}
        {showPreview && previewData && (
          <div className="space-y-2">
            <Label className="text-xs">Preview (Mock Data)</Label>
            <ScrollArea className="h-[200px] w-full rounded border p-3 bg-gray-50 dark:bg-gray-900">
              <pre className="text-xs font-mono">
                {JSON.stringify(previewData, null, 2)}
              </pre>
            </ScrollArea>
          </div>
        )}

        {/* Available Variations Badge */}
        {variations.length > 0 && (
          <div className="text-xs text-muted-foreground">
            {variations.length} variation(s) available
          </div>
        )}
      </CardContent>
    </Card>
  )
}
