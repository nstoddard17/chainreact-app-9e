"use client"

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Plus, Trash2, Settings, Loader2, Check, X } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useIntegrationStore } from '@/stores/integrationStore'
import { cn } from '@/lib/utils'

interface GmailLabel {
  id: string
  name: string
  type: 'system' | 'user'
  messagesTotal?: number
  messagesUnread?: number
  threadsTotal?: number
  threadsUnread?: number
}

interface GmailLabelManagerProps {
  existingLabels?: Array<{ value: string; label: string; [key: string]: any }>
  onLabelsChange?: () => void
}

export function GmailLabelManager({ existingLabels = [], onLabelsChange }: GmailLabelManagerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [labels, setLabels] = useState<GmailLabel[]>([])
  const [newLabelName, setNewLabelName] = useState('')
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set())
  const [creatingLabel, setCreatingLabel] = useState(false)
  const [deletingLabels, setDeletingLabels] = useState<Set<string>>(new Set())
  
  const { toast } = useToast()
  const { getIntegrationByProvider } = useIntegrationStore()

  // Load Gmail labels from existing data when modal opens or existingLabels change
  useEffect(() => {
    if (existingLabels.length > 0) {
      // Convert existing labels to our format
      const formattedLabels: GmailLabel[] = existingLabels.map((label: any) => {
        // Determine if it's a system label based on common system label names
        const systemLabelNames = ['INBOX', 'SENT', 'DRAFT', 'SPAM', 'TRASH', 'IMPORTANT', 'STARRED', 'UNREAD', 'CATEGORY_PERSONAL', 'CATEGORY_SOCIAL', 'CATEGORY_PROMOTIONS', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS']
        const isSystemLabel = systemLabelNames.includes(label.value) || systemLabelNames.includes(label.id)
        
        return {
          id: label.value || label.id,
          name: label.label || label.name,
          type: isSystemLabel ? 'system' : 'user'
        }
      })
      
      console.log('✅ Labels updated from parent:', formattedLabels)
      setLabels(formattedLabels)
    }
  }, [existingLabels])


  const createLabel = async () => {
    if (!newLabelName.trim()) return

    setCreatingLabel(true)
    try {
      const integration = getIntegrationByProvider('gmail')
      if (!integration) throw new Error('No Gmail integration found')

      const response = await fetch('/api/gmail/labels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          integrationId: integration.id,
          name: newLabelName.trim()
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create label')
      }

      const data = await response.json()
      
      setNewLabelName('')
      
      toast({
        title: "Label created",
        description: `Successfully created label "${data.name}"`,
      })

      // Add the new label directly to our local state (no API call needed)
      const newLabel: GmailLabel = {
        id: data.id,
        name: data.name,
        type: 'user'
      }
      
      console.log('✅ Adding new label to local state:', newLabel.name)
      setLabels(prev => [...prev, newLabel])
      
      // Notify parent that labels changed - this will refresh the dropdown
      console.log('🔄 Calling onLabelsChange after creating label:', data.name)
      onLabelsChange?.()
      
    } catch (error) {
      console.error('Error creating label:', error)
      toast({
        title: "Error creating label",
        description: error instanceof Error ? error.message : "Failed to create label",
        variant: "destructive",
      })
    } finally {
      setCreatingLabel(false)
    }
  }

  const deleteSelectedLabels = async () => {
    if (selectedLabels.size === 0) return

    const labelsToDelete = Array.from(selectedLabels)
    console.log('🗑️ Starting deletion process for labels:', labelsToDelete.map(id => labels.find(l => l.id === id)?.name || id))
    
    setDeletingLabels(new Set(labelsToDelete))
    
    try {
      const integration = getIntegrationByProvider('gmail')
      if (!integration) throw new Error('No Gmail integration found')

      console.log('🔑 Found Gmail integration:', integration.id)

      // Delete labels one by one
      console.log('🗑️ Sending delete requests to Gmail API...')
      const results = await Promise.allSettled(
        labelsToDelete.map(async (labelId) => {
          console.log(`🗑️ Deleting label ${labelId}...`)
          
          const response = await fetch('/api/gmail/labels', {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              integrationId: integration.id,
              labelId
            }),
          })

          if (!response.ok) {
            // If it's a 404, the label might already be deleted - treat as success
            if (response.status === 404) {
              console.log(`✅ Label ${labelId} already deleted or not found - treating as success`)
              return labelId
            }
            
            const errorData = await response.json()
            console.error(`❌ Failed to delete label ${labelId}:`, errorData)
            throw new Error(errorData.error || `Failed to delete label ${labelId}`)
          }

          console.log(`✅ Successfully deleted label ${labelId}`)
          return labelId
        })
      )

      // Process results
      const successful: string[] = []
      const failed: string[] = []

      console.log('📊 Processing deletion results...')
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successful.push(labelsToDelete[index])
          console.log(`✅ Deletion successful for: ${labelsToDelete[index]}`)
        } else {
          failed.push(labelsToDelete[index])
          console.error(`❌ Deletion failed for ${labelsToDelete[index]}:`, result.reason)
        }
      })

      console.log('📊 Deletion summary:', { successful: successful.length, failed: failed.length })

      // Remove successfully deleted labels from the list
      if (successful.length > 0) {
        console.log('🔄 Updating local state - removing deleted labels from UI')
        const successfulNames = successful.map(id => labels.find(l => l.id === id)?.name || id)
        console.log('🗑️ Labels successfully deleted:', successfulNames)
        
        setSelectedLabels(new Set())
        
        toast({
          title: "Labels deleted",
          description: `Successfully deleted ${successful.length} label(s)`,
        })

        // Remove the deleted labels directly from our local state (no API call needed)
        console.log('✅ Removing deleted labels from local state:', successfulNames)
        console.log('🔍 Current labels before deletion:', labels.map(l => l.name))
        console.log('🔍 Successful label IDs to remove:', successful)
        console.log('🔍 Labels state before update:', labels.length, 'labels')
        
        setLabels(prev => {
          const filtered = prev.filter(label => !successful.includes(label.id))
          console.log('🔍 Labels after filtering:', filtered.length, 'labels remain')
          console.log('🔍 Remaining label names:', filtered.map(l => l.name))
          return filtered
        })
        
        // Notify parent that labels changed - this will refresh the dropdown
        console.log('🔄 Calling onLabelsChange after deleting labels:', successfulNames)
        onLabelsChange?.()
      }

      // Show errors for failed deletions
      if (failed.length > 0) {
        toast({
          title: "Some labels couldn't be deleted",
          description: `Failed to delete ${failed.length} label(s). They may be system labels or in use.`,
          variant: "destructive",
        })
      }

    } catch (error) {
      console.error('Error deleting labels:', error)
      toast({
        title: "Error deleting labels",
        description: error instanceof Error ? error.message : "Failed to delete labels",
        variant: "destructive",
      })
    } finally {
      setDeletingLabels(new Set())
    }
  }

  const toggleLabelSelection = (labelId: string) => {
    setSelectedLabels(prev => {
      const newSet = new Set(prev)
      if (newSet.has(labelId)) {
        newSet.delete(labelId)
      } else {
        newSet.add(labelId)
      }
      return newSet
    })
  }

  const userLabels = labels.filter(label => label.type === 'user')

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open)
      // When modal is closed, ensure parent dropdown gets refreshed with latest data
      if (!open) {
        console.log('🔄 Modal closed, notifying parent to refresh dropdown')
        onLabelsChange?.()
      }
    }}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full text-xs"
        >
          <Settings className="h-3 w-3 mr-1" />
          Manage Gmail Labels
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Manage Gmail Labels
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-hidden">
          {/* Create new label */}
          <div className="space-y-2 flex-shrink-0">
            <Label htmlFor="new-label">Create New Label</Label>
            <div className="flex gap-2">
              <Input
                id="new-label"
                value={newLabelName}
                onChange={(e) => setNewLabelName(e.target.value)}
                placeholder="Enter label name..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    createLabel()
                  }
                }}
                disabled={creatingLabel}
              />
              <Button
                onClick={createLabel}
                disabled={!newLabelName.trim() || creatingLabel}
                size="sm"
              >
                {creatingLabel ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Plus className="h-3 w-3" />
                )}
              </Button>
            </div>
          </div>

          {/* Delete selected labels */}
          {selectedLabels.size > 0 && (
            <div className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-md flex-shrink-0">
              <span className="text-sm text-red-700">
                {selectedLabels.size} label(s) selected
              </span>
              <Button
                variant="destructive"
                size="sm"
                onClick={deleteSelectedLabels}
                disabled={deletingLabels.size > 0}
              >
                {deletingLabels.size > 0 ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Trash2 className="h-3 w-3 mr-1" />
                )}
                Delete Selected
              </Button>
            </div>
          )}

          {/* Labels list */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {userLabels.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-slate-500">
                <p>No custom labels found. Create your first label above.</p>
              </div>
            ) : (
              <ScrollArea className="h-full pr-4">
                <div className="space-y-4 pb-4">
                  {/* User Labels */}
                  <div className="space-y-2">
                    {userLabels.map((label) => (
                          <div
                            key={label.id}
                            className={cn(
                              "flex items-center justify-between p-3 border rounded-md cursor-pointer transition-colors min-h-[2.5rem]",
                              selectedLabels.has(label.id) 
                                ? "bg-blue-50 border-blue-200" 
                                : "bg-white border-slate-200 hover:bg-slate-50",
                              deletingLabels.has(label.id) && "opacity-50"
                            )}
                            onClick={() => toggleLabelSelection(label.id)}
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                                {selectedLabels.has(label.id) ? (
                                  <Check className="h-3 w-3 text-blue-600" />
                                ) : (
                                  <div className="w-3 h-3 border border-slate-300 rounded" />
                                )}
                              </div>
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 truncate">
                                {label.name}
                              </Badge>
                            </div>
                            {deletingLabels.has(label.id) && (
                              <Loader2 className="h-3 w-3 animate-spin flex-shrink-0" />
                            )}
                          </div>
                    ))}
                  </div>
                </div>
              </ScrollArea>
            )}
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 border-t pt-4">
          <Button variant="outline" onClick={() => {
            console.log('🔄 Close button clicked, refreshing parent dropdown')
            setIsOpen(false)
            onLabelsChange?.()
          }}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}