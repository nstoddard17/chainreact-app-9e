"use client"

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { RichTextSignatureEditor } from './RichTextSignatureEditor'
import { logger } from '@/lib/utils/logger'

interface CreateSignatureModalProps {
  isOpen: boolean
  onClose: () => void
  onSignatureCreated: () => void
  userId?: string
  provider: 'gmail' | 'outlook'
}

export function CreateSignatureModal({
  isOpen,
  onClose,
  onSignatureCreated,
  userId,
  provider
}: CreateSignatureModalProps) {
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const { toast } = useToast()

  const handleCreate = async () => {
    if (!name || !content) {
      toast({
        title: "Missing fields",
        description: "Please provide both a name and content for your signature.",
        variant: "destructive"
      })
      return
    }

    if (!userId) {
      toast({
        title: "Error",
        description: "User ID is required to create a signature.",
        variant: "destructive"
      })
      return
    }

    try {
      setIsCreating(true)

      const response = await fetch(`/api/integrations/${provider}/signatures`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          name,
          content,
          isDefault: true
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to create signature')
      }

      const data = await response.json()

      toast({
        title: "Signature created",
        description: `${name} has been created successfully.`,
      })

      // Reset form
      setName('')
      setContent('')

      // Notify parent to refresh signatures
      onSignatureCreated()

      // Close modal
      onClose()

    } catch (error: any) {
      logger.error(`Failed to create ${provider} signature:`, error)
      toast({
        title: "Failed to create signature",
        description: error.message || "An error occurred while creating your signature.",
        variant: "destructive"
      })
    } finally {
      setIsCreating(false)
    }
  }

  const handleClose = () => {
    setName('')
    setContent('')
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto !bg-white">
        <DialogHeader>
          <DialogTitle>Create New Signature</DialogTitle>
          <DialogDescription>
            Create a new email signature for {provider === 'gmail' ? 'Gmail' : 'Outlook'}. Use the formatting toolbar to customize your signature.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="signature-name">Signature Name</Label>
            <Input
              id="signature-name"
              placeholder="e.g., Work Signature, Personal, Sales Team"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isCreating}
            />
          </div>

          <div className="space-y-2">
            <Label>Signature Design</Label>
            <RichTextSignatureEditor
              value={content}
              onChange={setContent}
              placeholder="Best regards,&#10;Your Name&#10;Your Title&#10;Company Name"
            />
            <p className="text-xs text-muted-foreground">
              Use the toolbar to format your signature. All formatting and line breaks will be preserved.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isCreating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={isCreating || !name || !content}
          >
            {isCreating ? 'Creating...' : 'Create Signature'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
