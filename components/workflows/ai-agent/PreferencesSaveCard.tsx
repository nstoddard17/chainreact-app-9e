'use client'

import React, { useState } from 'react'
import Image from 'next/image'
import { Check, Save, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { saveSelectedPreferences } from '@/stores/workflowPreferencesStore'
import { getProviderDisplayName } from '@/lib/workflows/ai-agent/providerDisambiguation'

interface PreferenceSelection {
  id: string
  category: string
  provider: string
  providerName: string
  channel?: {
    providerId: string
    channelId: string
    channelName: string
  }
  nodeConfig?: {
    nodeType: string
    nodeDisplayName: string
    config: Record<string, any>
  }
}

interface PreferencesSaveCardProps {
  selections: PreferenceSelection[]
  onComplete: () => void
  onSkip: () => void
}

/**
 * Maps provider IDs to their actual icon filenames
 */
function getProviderIconPath(providerId: string): string {
  const iconMap: Record<string, string> = {
    'outlook': 'microsoft-outlook',
    'yahoo-mail': 'yahoo-mail',
  }
  return `/integrations/${iconMap[providerId] || providerId}.svg`
}

export function PreferencesSaveCard({
  selections,
  onComplete,
  onSkip,
}: PreferencesSaveCardProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(selections.map(s => s.id))
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleSelectAll = () => {
    setSelectedIds(new Set(selections.map(s => s.id)))
  }

  const handleSelectNone = () => {
    setSelectedIds(new Set())
  }

  const handleSave = async () => {
    if (selectedIds.size === 0) {
      onComplete()
      return
    }

    setSaving(true)

    try {
      // Build the save payload from selected items
      const selectionsToSave = selections
        .filter(s => selectedIds.has(s.id))
        .map(s => ({
          category: s.category,
          provider: s.provider,
          channel: s.channel,
          nodeConfig: s.nodeConfig,
        }))

      await saveSelectedPreferences(selectionsToSave)
      setSaved(true)

      // Brief delay to show success state
      setTimeout(() => {
        onComplete()
      }, 800)
    } catch (error) {
      console.error('Failed to save preferences:', error)
      // Still proceed even if save fails
      onComplete()
    } finally {
      setSaving(false)
    }
  }

  if (selections.length === 0) {
    onComplete()
    return null
  }

  return (
    <div className="py-3 w-full">
      <div className="rounded-lg border bg-card p-4 space-y-4">
        {/* Header */}
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Save className="h-4 w-4 text-primary" />
            Save as Defaults?
          </h4>
          <p className="text-xs text-muted-foreground">
            Select which choices to remember for future workflows
          </p>
        </div>

        {/* Selection list */}
        <div className="space-y-2">
          {selections.map(selection => (
            <div
              key={selection.id}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                selectedIds.has(selection.id)
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-border bg-muted/30'
              }`}
            >
              <Checkbox
                id={selection.id}
                checked={selectedIds.has(selection.id)}
                onCheckedChange={() => toggleSelection(selection.id)}
              />
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="flex items-center justify-center w-6 h-6 rounded-md bg-background shrink-0">
                  <Image
                    src={getProviderIconPath(selection.provider)}
                    alt={selection.providerName}
                    width={16}
                    height={16}
                    className="shrink-0"
                  />
                </div>
                <Label
                  htmlFor={selection.id}
                  className="text-sm font-medium cursor-pointer truncate"
                >
                  {selection.providerName}
                  {selection.channel && (
                    <span className="text-muted-foreground font-normal">
                      {' → '}{selection.channel.channelName}
                    </span>
                  )}
                </Label>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {selection.category}
              </span>
            </div>
          ))}
        </div>

        {/* Quick select buttons */}
        {selections.length > 1 && (
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={handleSelectAll}
              className="text-primary hover:underline"
            >
              Select all
            </button>
            <span className="text-muted-foreground">·</span>
            <button
              onClick={handleSelectNone}
              className="text-muted-foreground hover:text-foreground"
            >
              Select none
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={onSkip}
            disabled={saving || saved}
            className="text-muted-foreground gap-1.5"
          >
            <X className="h-3.5 w-3.5" />
            Don't Save
          </Button>

          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || saved}
            className="gap-1.5"
          >
            {saved ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Saved!
              </>
            ) : saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" />
                Save {selectedIds.size > 0 ? `(${selectedIds.size})` : 'Selected'}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
