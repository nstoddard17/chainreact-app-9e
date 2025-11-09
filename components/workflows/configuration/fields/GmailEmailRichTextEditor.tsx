"use client"

import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FileSignature, ChevronDown, RefreshCw, Plus } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useVariableDropTarget } from '../hooks/useVariableDropTarget'
import { insertVariableIntoTextInput, insertVariableIntoContentEditable, normalizeDraggedVariable } from '@/lib/workflows/variableInsertion'
import { CreateSignatureModal } from './CreateSignatureModal'

import { logger } from '@/lib/utils/logger'

interface GmailSignature {
  id: string
  name: string
  content: string
  isDefault: boolean
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

  return (
    <>
      <div className={`space-y-4 ${className}`}>
        {/* Gmail-specific toolbar */}
        <div className="flex items-center gap-2 p-2 border rounded-lg bg-gray-50">
          <FileSignature className="h-4 w-4 text-gray-600" />
          <span className="text-sm text-gray-600">Gmail Signatures</span>

          {signatures.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" disabled={isLoadingSignatures}>
                  {selectedSignature ?
                    signatures.find(s => s.id === selectedSignature)?.name || 'Select signature'
                    : 'Select signature'
                  }
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="space-y-2">
                  <h4 className="font-medium">Gmail Signatures</h4>
                  <ScrollArea className="max-h-60">
                    {signatures.map((signature) => (
                      <div key={signature.id} className="p-2 hover:bg-gray-100 rounded cursor-pointer">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{signature.name}</span>
                          {signature.isDefault && <Badge variant="secondary">Default</Badge>}
                        </div>
                        <div
                          className="text-sm text-gray-600 mt-1 truncate"
                          dangerouslySetInnerHTML={{ __html: signature.content }}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          onClick={() => insertSignature(signature.id)}
                        >
                          Insert
                        </Button>
                      </div>
                    ))}
                  </ScrollArea>
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Create signature button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsCreateModalOpen(true)}
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
            dangerouslySetInnerHTML={{ __html: value }}
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

      {/* Create Signature Modal */}
      <CreateSignatureModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSignatureCreated={loadGmailSignatures}
        userId={userId}
        provider="gmail"
      />
    </>
  )
})

GmailEmailRichTextEditor.displayName = 'GmailEmailRichTextEditor'
