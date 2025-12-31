"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useOrganizationStore } from "@/stores/organizationStore"
import { useWorkflowStore } from "@/stores/workflowStore"
import { useIntegrationStore } from "@/stores/integrationStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { logger } from '@/lib/utils/logger'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function CreateOrganizationDialog({ open, onOpenChange }: Props) {
  const router = useRouter()
  const { createOrganization } = useOrganizationStore()
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [description, setDescription] = useState("")
  const [loading, setLoading] = useState(false)

  // Get workspace context setters
  const setWorkspaceContext = useWorkflowStore(state => state.setWorkspaceContext)
  const fetchWorkflows = useWorkflowStore(state => state.fetchWorkflows)
  const fetchIntegrations = useIntegrationStore(state => state.fetchIntegrations)

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
  }

  const handleNameChange = (value: string) => {
    setName(value)
    // Auto-update slug when name changes
    setSlug(generateSlug(value))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      logger.debug('Dialog: Starting organization creation...')
      const result = await createOrganization({
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim(),
      })
      logger.debug('Dialog: Organization created successfully:', result)

      // Show success message
      toast.success(`Organization "${result.name}" created successfully!`)

      // Automatically switch to the new organization's workspace
      setWorkspaceContext('organization', result.id)

      // Refresh workflows and integrations in the new workspace context
      await Promise.all([
        fetchWorkflows(true), // Force refresh
        fetchIntegrations(true)
      ])

      // Close dialog and reset form
      onOpenChange(false)
      setName("")
      setSlug("")
      setDescription("")

      // Redirect to the organization page
      router.push('/organization')
      router.refresh()
    } catch (error: any) {
      logger.error("Dialog: Failed to create organization:", {
        message: error.message,
        stack: error.stack,
        error: error
      })

      // Check if error is due to plan restriction
      if (error.message?.includes('Business or Organization plan')) {
        toast.error('You need to upgrade to a Business or Organization plan to create organizations')
        // Close dialog and redirect to billing page
        onOpenChange(false)
        router.push('/settings/billing')
        return
      }

      toast.error(error.message || 'Failed to create organization')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Organization</DialogTitle>
            <DialogDescription>Create a new organization to collaborate with your team on workflows.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Organization Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Enter organization name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">URL Slug</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="organization-slug"
                required
              />
              <p className="text-xs text-slate-500">This will be used in your organization URL: /teams/{slug}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your organization"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !name.trim() || !slug.trim()}
              className="bg-gradient-to-r from-orange-500 to-rose-600 hover:from-orange-600 hover:to-rose-700"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Organization"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}


