"use client"

import React, { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Combobox, MultiCombobox } from '@/components/ui/combobox'
import { Plus, RefreshCw, Database, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface ChainReactMemoryPickerProps {
  field: any
  value: any
  onChange: (value: any) => void
  error?: string
}

interface MemoryDocument {
  id: string
  title: string
  description?: string
  doc_type: 'memory' | 'knowledge_base'
  created_at: string
  updated_at: string
}

export function ChainReactMemoryPicker({
  field,
  value,
  onChange,
  error
}: ChainReactMemoryPickerProps) {
  const [loadingDocuments, setLoadingDocuments] = useState(false)
  const [documents, setDocuments] = useState<MemoryDocument[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newDocTitle, setNewDocTitle] = useState('')
  const [newDocDescription, setNewDocDescription] = useState('')
  const [creating, setCreating] = useState(false)

  // Get docType from field config (memory or knowledge_base)
  const docType = field.docType || 'memory'

  // Load documents on mount
  useEffect(() => {
    loadDocuments()
  }, [docType])

  // Load documents from ChainReact Memory API
  const loadDocuments = async (forceRefresh = false) => {
    setLoadingDocuments(true)
    try {
      const response = await fetch(`/api/memory/documents?type=${docType}`)
      if (!response.ok) {
        throw new Error(`Failed to load documents: ${response.statusText}`)
      }

      const data = await response.json()
      setDocuments(data.documents || [])
    } catch (error) {
      console.error('Error loading ChainReact Memory documents:', error)
      setDocuments([])
    } finally {
      setLoadingDocuments(false)
    }
  }

  // Handle refresh
  const handleRefresh = async () => {
    setIsRefreshing(true)
    await loadDocuments(true)
    setIsRefreshing(false)
  }

  // Handle create new document
  const handleCreateNew = () => {
    setNewDocTitle('')
    setNewDocDescription('')
    setShowCreateDialog(true)
  }

  // Submit create new document
  const handleSubmitCreate = async () => {
    if (!newDocTitle.trim()) return

    setCreating(true)
    try {
      const response = await fetch('/api/memory/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docType,
          title: newDocTitle.trim(),
          description: newDocDescription.trim() || undefined,
          content: '',
          scope: 'user'
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create document')
      }

      const data = await response.json()
      const newDoc = data.document

      // Reload documents to get the latest list
      await loadDocuments()

      // Auto-select the newly created document
      if (field.multiSelect) {
        const currentValues = Array.isArray(value) ? value : []
        onChange([...currentValues, newDoc.id])
      } else {
        onChange(newDoc.id)
      }

      setShowCreateDialog(false)
    } catch (error: any) {
      console.error('Error creating document:', error)
      alert(error.message || 'Failed to create document')
    } finally {
      setCreating(false)
    }
  }

  // Handle document selection
  const handleDocumentSelect = (selectedValue: any) => {
    onChange(selectedValue)
  }

  // Convert documents to combobox options
  const documentOptions = useMemo(() => {
    return documents.map(doc => ({
      value: doc.id,
      label: doc.title,
      description: doc.description
    }))
  }, [documents])

  // Get selected documents for display
  const selectedDocuments = useMemo(() => {
    if (!value) return field.multiSelect ? [] : ''

    if (field.multiSelect) {
      return Array.isArray(value) ? value : []
    } else {
      return value
    }
  }, [value, field.multiSelect])

  return (
    <>
      <Card className={cn("transition-all duration-200", error && "border-red-500")}>
        <CardContent className="p-4 space-y-4">
          {/* Header with icon and actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                {docType === 'memory' ? (
                  <Database className="w-4 h-4 text-primary" />
                ) : (
                  <FileText className="w-4 h-4 text-primary" />
                )}
              </div>
              <div>
                <Label className="text-sm font-medium">
                  {docType === 'memory' ? 'AI Memory Storage' : 'Knowledge Base'}
                </Label>
                <p className="text-xs text-muted-foreground">
                  Stored securely in your ChainReact account
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {field.allowCreate && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={handleCreateNew}
                        className="h-8 w-8"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{field.createLabel || 'Create new document'}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleRefresh}
                      disabled={isRefreshing || loadingDocuments}
                      className="h-8 w-8"
                    >
                      <RefreshCw className={cn(
                        "w-4 h-4",
                        (isRefreshing || loadingDocuments) && "animate-spin"
                      )} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Refresh documents</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {/* Document Picker */}
          <div className="space-y-2">
            {field.multiSelect ? (
              <MultiCombobox
                options={documentOptions}
                value={selectedDocuments}
                onChange={handleDocumentSelect}
                placeholder={
                  loadingDocuments
                    ? 'Loading documents...'
                    : field.placeholder || 'Select documents...'
                }
                disabled={loadingDocuments}
              />
            ) : (
              <Combobox
                options={documentOptions}
                value={selectedDocuments}
                onChange={handleDocumentSelect}
                placeholder={
                  loadingDocuments
                    ? 'Loading documents...'
                    : field.placeholder || 'Select document...'
                }
                searchPlaceholder="Search documents..."
                emptyPlaceholder={loadingDocuments ? "Loading..." : "No documents found"}
                disabled={loadingDocuments}
              />
            )}

            {field.help && (
              <p className="text-xs text-muted-foreground">
                {field.help}
              </p>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
        </CardContent>
      </Card>

      {/* Create New Document Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Create New {docType === 'memory' ? 'Memory' : 'Knowledge Base'} Document
            </DialogTitle>
            <DialogDescription>
              {docType === 'memory'
                ? 'Create a new document to store AI learnings from conversations'
                : 'Create a new document to store business policies and guidelines'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="doc-title">Title *</Label>
              <Input
                id="doc-title"
                placeholder={
                  docType === 'memory'
                    ? 'e.g., Email Review Memory'
                    : 'e.g., Email Writing Guidelines'
                }
                value={newDocTitle}
                onChange={(e) => setNewDocTitle(e.target.value)}
                disabled={creating}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="doc-description">Description (optional)</Label>
              <Textarea
                id="doc-description"
                placeholder={
                  docType === 'memory'
                    ? 'Describe what this memory document will store...'
                    : 'Describe what guidelines this document contains...'
                }
                value={newDocDescription}
                onChange={(e) => setNewDocDescription(e.target.value)}
                disabled={creating}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmitCreate}
              disabled={!newDocTitle.trim() || creating}
            >
              {creating ? 'Creating...' : 'Create Document'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
