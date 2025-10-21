"use client"

import React, { useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Check, AlertCircle, Sparkles } from "lucide-react"
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/availableNodes'

interface ProviderSubstitutionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: any
  onConfirm: (substitutions: Record<string, string>) => void
  connectedIntegrations: string[]
}

// Define provider categories and their compatible alternatives
const PROVIDER_CATEGORIES: Record<string, string[]> = {
  messaging: ['slack', 'discord', 'teams', 'whatsapp'],
  email: ['gmail', 'microsoft-outlook', 'outlook'],
  crm: ['hubspot', 'salesforce', 'pipedrive'],
  database: ['airtable', 'notion', 'google-sheets', 'microsoft-excel'],
  storage: ['google-drive', 'dropbox', 'onedrive'],
  social: ['twitter', 'facebook', 'linkedin', 'instagram']
}

export function ProviderSubstitutionModal({
  open,
  onOpenChange,
  template,
  onConfirm,
  connectedIntegrations
}: ProviderSubstitutionModalProps) {
  const [substitutions, setSubstitutions] = useState<Record<string, string>>({})

  // Analyze template nodes to find provider-swappable actions
  const swappableActions = useMemo(() => {
    if (!template?.nodes) return []

    const actions: Array<{
      nodeId: string
      title: string
      currentProvider: string
      category: string
      alternatives: string[]
      isConnected: boolean
    }> = []

    template.nodes.forEach((node: any) => {
      const nodeType = node.data?.type
      const providerId = node.data?.providerId || ''

      // Find which category this provider belongs to
      const category = Object.entries(PROVIDER_CATEGORIES).find(([_, providers]) =>
        providers.includes(providerId)
      )?.[0]

      if (category) {
        const alternatives = PROVIDER_CATEGORIES[category].filter(p => p !== providerId)

        actions.push({
          nodeId: node.id,
          title: node.data?.title || 'Action',
          currentProvider: providerId,
          category,
          alternatives,
          isConnected: connectedIntegrations.includes(providerId)
        })
      }
    })

    return actions
  }, [template, connectedIntegrations])

  // Auto-suggest connected alternatives
  const autoSubstitute = () => {
    const newSubstitutions: Record<string, string> = {}

    swappableActions.forEach(action => {
      if (!action.isConnected) {
        // Find a connected alternative
        const connectedAlt = action.alternatives.find(alt =>
          connectedIntegrations.includes(alt)
        )

        if (connectedAlt) {
          newSubstitutions[action.nodeId] = connectedAlt
        }
      }
    })

    setSubstitutions(prev => ({ ...prev, ...newSubstitutions }))
  }

  const handleConfirm = () => {
    onConfirm(substitutions)
    onOpenChange(false)
  }

  const getProviderDisplay = (providerId: string) => {
    const provider = ALL_NODE_COMPONENTS.find(n => n.providerId === providerId)
    return provider?.title || providerId.charAt(0).toUpperCase() + providerId.slice(1)
  }

  const needsSubstitution = swappableActions.some(a => !a.isConnected)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Customize Template</DialogTitle>
          <DialogDescription>
            Choose which apps to use for each action. We'll automatically suggest connected apps.
          </DialogDescription>
        </DialogHeader>

        {needsSubstitution && (
          <Alert>
            <AlertCircle className="w-4 h-4" />
            <AlertDescription>
              Some integrations in this template aren't connected yet.{" "}
              <Button
                variant="link"
                className="p-0 h-auto font-semibold"
                onClick={autoSubstitute}
              >
                Auto-select connected alternatives
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          {swappableActions.map((action) => {
            const selectedProvider = substitutions[action.nodeId] || action.currentProvider
            const allOptions = [action.currentProvider, ...action.alternatives]

            return (
              <div
                key={action.nodeId}
                className="border rounded-lg p-4 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-medium">{action.title}</h4>
                    <p className="text-sm text-muted-foreground">
                      {action.category.charAt(0).toUpperCase() + action.category.slice(1)} action
                    </p>
                  </div>

                  {action.isConnected ? (
                    <Badge variant="outline" className="gap-1">
                      <Check className="w-3 h-3" />
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Not Connected</Badge>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Choose App</Label>
                  <Select
                    value={selectedProvider}
                    onValueChange={(value) => {
                      setSubstitutions(prev => ({
                        ...prev,
                        [action.nodeId]: value
                      }))
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {allOptions.map((providerId) => {
                        const isConnected = connectedIntegrations.includes(providerId)
                        return (
                          <SelectItem key={providerId} value={providerId}>
                            <div className="flex items-center gap-2">
                              <span>{getProviderDisplay(providerId)}</span>
                              {isConnected && (
                                <Check className="w-3 h-3 text-green-600" />
                              )}
                            </div>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>

                  {!connectedIntegrations.includes(selectedProvider) && (
                    <p className="text-xs text-amber-600 dark:text-amber-500">
                      You'll need to connect {getProviderDisplay(selectedProvider)} before using this workflow
                    </p>
                  )}
                </div>
              </div>
            )
          })}

          {swappableActions.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>This template uses fixed integrations - no customization needed!</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            Create Workflow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
