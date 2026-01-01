"use client"

import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { FileSignature, ChevronDown, RefreshCw, Plus, Pencil, Trash2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useVariableDropTarget } from '../hooks/useVariableDropTarget'
import { insertVariableIntoTextInput, insertVariableIntoContentEditable, normalizeDraggedVariable } from '@/lib/workflows/variableInsertion'
import { CreateSignatureModal } from './CreateSignatureModal'

import { logger } from '@/lib/utils/logger'
import { sanitizeEmailHtml, createSafeEmailHtmlProps } from '@/lib/utils/sanitize-html'

interface GmailSignature {
  id: string
  name: string
  content: string
  isDefault: boolean
  email?: string
}

interface GmailEmailRichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  error?: string
  userId?: string
  // autoIncludeSignature removed - signatures must be manually added
}

export interface GmailEmailRichTextEditorRef {
  refreshSignatures: () => Promise<void>
}

export const GmailEmailRichTextEditor = forwardRef<GmailEmailRichTextEditorRef, GmailEmailRichTextEditorProps>(({
  value,
  onChange,
  placeholder = "Compose your email...",
  className = "",
  error,
  userId
}, ref) => {
  const [signatures, setSignatures] = useState<GmailSignature[]>([])
  const [selectedSignature, setSelectedSignature] = useState<string>('')
  const [isLoadingSignatures, setIsLoadingSignatures] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [deleteSignature, setDeleteSignature] = useState<GmailSignature | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [editSignature, setEditSignature] = useState<{ id: string; name: string; content: string; email: string } | undefined>(undefined)
  const { toast } = useToast()
  const editorRef = useRef<HTMLDivElement | null>(null)

  const handleVariableInsert = useCallback((rawVariable: string) => {
    if (!editorRef.current) return

    const variableText = normalizeDraggedVariable(rawVariable)
    if (!variableText) return

    const updatedHtml = insertVariableIntoContentEditable(editorRef.current, variableText)
    onChange(updatedHtml)
  }, [onChange])

  const { eventHandlers: dropHandlers, isDragOver } = useVariableDropTarget({
    fieldId: "gmail-email-body",
    fieldLabel: "Email Body",
    elementRef: editorRef,
    onInsert: handleVariableInsert
  })

  // Load Gmail signatures
  const loadGmailSignatures = useCallback(async () => {
    try {
      setIsLoadingSignatures(true)
      const response = await fetch(`/api/integrations/gmail/signatures?userId=${userId}`)

      if (response.ok) {
        const data = await response.json()
        setSignatures(data.signatures || [])

        // Check if any signature is already present in the content
        if (value && value.trim() !== '') {
          // Body has content, check if a signature is already present
          const existingSignature = data.signatures?.find((sig: GmailSignature) => {
            const normalizedContent = sig.content.replace(/\s+/g, ' ').trim()
            const normalizedValue = value.replace(/\s+/g, ' ').trim()
            return normalizedValue.includes(normalizedContent)
          })
          if (existingSignature) {
            setSelectedSignature(existingSignature.id)
          }
        }
        // Don't auto-add signature - user must manually add it using the signature button
      } else {
        logger.error('Failed to load Gmail signatures:', response.status)
      }
    } catch (error) {
      logger.error('Failed to load Gmail signatures:', error)
    } finally {
      setIsLoadingSignatures(false)
    }
  }, [userId, value])

  // Expose refresh function via ref
  useImperativeHandle(ref, () => ({
    refreshSignatures: loadGmailSignatures
  }), [loadGmailSignatures])

  useEffect(() => {
    if (userId) {
      loadGmailSignatures()
    }
  }, [userId, loadGmailSignatures])

  const insertSignature = (signatureId: string) => {
    const signature = signatures.find(s => s.id === signatureId)
    if (signature) {
      // Create a temporary div to parse HTML properly
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = value

      // Check if ANY signature is already present by looking for signature markers
      // Remove all existing signatures first
      signatures.forEach(sig => {
        const sigDiv = document.createElement('div')
        sigDiv.innerHTML = sig.content
        const sigText = sigDiv.textContent || ''

        // Find and remove elements that match the signature content
        const walker = document.createTreeWalker(
          tempDiv,
          NodeFilter.SHOW_TEXT,
          null
        )

        const nodesToRemove: Element[] = []
        let node: Node | null
        while ((node = walker.nextNode())) {
          if (node.textContent && node.textContent.includes(sigText)) {
            // Mark parent element for removal
            let parent = node.parentElement
            if (parent) {
              nodesToRemove.push(parent)
            }
          }
        }

        nodesToRemove.forEach(n => {
          if (n.parentNode) {
            n.parentNode.removeChild(n)
          }
        })
      })

      // Add separator and new signature
      const separator = document.createElement('br')
      const separator2 = document.createElement('br')
      tempDiv.appendChild(separator)
      tempDiv.appendChild(separator2)

      // Create a div for the signature to maintain formatting
      const sigContainer = document.createElement('div')
      sigContainer.innerHTML = signature.content
      tempDiv.appendChild(sigContainer)

      onChange(tempDiv.innerHTML)
      setSelectedSignature(signatureId)

      toast({
        title: "Signature updated",
        description: `${signature.name} signature has been added to your email.`,
      })
    }
  }

  const handleDeleteSignature = async () => {
    if (!deleteSignature || !userId) return

    try {
      setIsDeleting(true)

      const response = await fetch(
        `/api/integrations/gmail/signatures?userId=${userId}&email=${encodeURIComponent(deleteSignature.email || '')}`,
        {
          method: 'DELETE'
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to delete signature')
      }

      toast({
        title: "Signature deleted",
        description: `${deleteSignature.name} has been deleted successfully.`,
      })

      // Clear the deleted signature from selected if it was selected
      if (selectedSignature === deleteSignature.id) {
        setSelectedSignature('')
      }

      // Clear signatures state first to force a refresh
      setSignatures([])

      // Close dialog
      setDeleteSignature(null)

      // Refresh signatures list
      await loadGmailSignatures()

    } catch (error: any) {
      logger.error('Failed to delete Gmail signature:', error)
      toast({
        title: "Failed to delete signature",
        description: error.message || "An error occurred while deleting the signature.",
        variant: "destructive"
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const handleEditSignature = (signature: GmailSignature) => {
    setEditSignature({
      id: signature.id,
      name: signature.name,
      content: signature.content,
      email: signature.email || ''
    })
    setIsCreateModalOpen(true)
  }

  const handleModalClose = () => {
    setIsCreateModalOpen(false)
    setEditSignature(undefined)
  }

  return (
    <>
      <div className={`space-y-4 ${className}`}>
        {/* Gmail-specific toolbar */}
        <div className="flex items-center gap-2 p-2 border rounded-lg bg-gray-50">
          <FileSignature className="h-4 w-4 text-gray-600" />
          <span className="text-sm text-gray-600">Gmail Signatures</span>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" disabled={isLoadingSignatures}>
                {selectedSignature && signatures.length > 0 ?
                  signatures.find(s => s.id === selectedSignature)?.name || 'Select signature'
                  : 'Select signature'
                }
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-96">
              <div className="space-y-2">
                <h4 className="font-medium">Gmail Signatures</h4>
                <ScrollArea className="max-h-60">
                  {isLoadingSignatures ? (
                    <div className="text-center py-8 text-gray-500">
                      <RefreshCw className="h-8 w-8 mx-auto mb-2 animate-spin" />
                      <p className="text-sm">Loading signatures...</p>
                    </div>
                  ) : signatures.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <FileSignature className="h-8 w-8 mx-auto mb-2" />
                      <p className="text-sm">No signatures found</p>
                      <p className="text-xs mt-1">Create signatures in Gmail or use the Create button</p>
                    </div>
                  ) : (
                    signatures.map((signature) => (
                      <div key={signature.id} className="p-3 hover:bg-gray-100 rounded border-b last:border-b-0">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{signature.name}</span>
                          {signature.isDefault && <Badge variant="secondary">Default</Badge>}
                        </div>
                        <div
                          className="text-sm text-gray-600 mb-3 truncate"
                          {...createSafeEmailHtmlProps(signature.content)}
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => insertSignature(signature.id)}
                          >
                            Insert
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditSignature(signature)}
                            title="Edit signature"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteSignature(signature)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            title="Delete signature"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </ScrollArea>
              </div>
            </PopoverContent>
          </Popover>

          {/* Create signature button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditSignature(undefined)
              setIsCreateModalOpen(true)
            }}
            disabled={!userId}
            title="Create new signature"
          >
            <Plus className="h-4 w-4 mr-1" />
            Create
          </Button>

          {/* Refresh button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={loadGmailSignatures}
            disabled={isLoadingSignatures}
            className="ml-auto"
            title="Refresh signatures"
          >
            <RefreshCw className={`h-4 w-4 ${isLoadingSignatures ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Rich text editor for Gmail with HTML support */}
        <div className="relative">
          <div
            ref={editorRef}
            contentEditable
            {...createSafeEmailHtmlProps(value)}
            onInput={(e) => onChange(e.currentTarget.innerHTML)}
            onFocus={dropHandlers.onFocus}
            onBlur={dropHandlers.onBlur}
            onDragOver={dropHandlers.onDragOver}
            onDragLeave={dropHandlers.onDragLeave}
            onDrop={dropHandlers.onDrop}
            className={`w-full min-h-[200px] p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              error ? 'border-red-500' : 'border-gray-300'
            } ${isDragOver ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
            style={{
              whiteSpace: 'pre-wrap',
              fontFamily: 'Arial, sans-serif',
              fontSize: '14px',
              lineHeight: '1.5',
              overflowY: 'auto',
              maxHeight: '400px'
            }}
            suppressContentEditableWarning
          />
          {!value && (
            <div className="absolute top-3 left-3 pointer-events-none text-gray-400">
              {placeholder}
            </div>
          )}
          {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
        </div>
      </div>

      {/* Create/Edit Signature Modal */}
      <CreateSignatureModal
        isOpen={isCreateModalOpen}
        onClose={handleModalClose}
        onSignatureCreated={loadGmailSignatures}
        userId={userId}
        provider="gmail"
        editSignature={editSignature}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteSignature} onOpenChange={(open) => !open && setDeleteSignature(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Signature</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteSignature?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSignature}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
})

GmailEmailRichTextEditor.displayName = 'GmailEmailRichTextEditor'
