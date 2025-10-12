"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Building2, Users, Check } from "lucide-react"
import { LightningLoader } from '@/components/ui/lightning-loader'
import { toast } from "sonner"

import { logger } from '@/lib/utils/logger'

interface Organization {
  id: string
  name: string
  slug: string
  description?: string
  member_count?: number
  role?: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  workflowId: string
  workflowName: string
  onMoveComplete: () => void
}

export default function AddToOrganizationDialog({ 
  open, 
  onOpenChange, 
  workflowId, 
  workflowName, 
  onMoveComplete 
}: Props) {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [fetchingOrgs, setFetchingOrgs] = useState(false)

  useEffect(() => {
    if (open) {
      fetchOrganizations()
    }
  }, [open])

  const fetchOrganizations = async () => {
    setFetchingOrgs(true)
    try {
      const response = await fetch('/api/organizations')
      if (response.ok) {
        const data = await response.json()
        setOrganizations(data)
      } else {
        logger.error('Failed to fetch organizations')
        toast.error('Failed to load organizations')
      }
    } catch (error) {
      logger.error('Error fetching organizations:', error)
      toast.error('Failed to load organizations')
    } finally {
      setFetchingOrgs(false)
    }
  }

  const handleMoveToOrganization = async () => {
    if (!selectedOrgId) {
      toast.error('Please select an organization')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/workflows/${workflowId}/move-to-organization`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: selectedOrgId })
      })

      if (response.ok) {
        const selectedOrg = organizations.find(org => org.id === selectedOrgId)
        toast.success(`Workflow "${workflowName}" moved to ${selectedOrg?.name}`)
        onMoveComplete()
        onOpenChange(false)
        setSelectedOrgId("")
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to move workflow')
      }
    } catch (error) {
      logger.error('Error moving workflow:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to move workflow')
    } finally {
      setLoading(false)
    }
  }

  const selectedOrg = organizations.find(org => org.id === selectedOrgId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            Move Workflow to Organization
          </DialogTitle>
          <DialogDescription>
            Move "{workflowName}" to an organization where you have admin or editor permissions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {fetchingOrgs ? (
            <div className="flex items-center justify-center py-8">
              <LightningLoader size="lg" color="blue" />
              <span className="ml-2 text-slate-600">Loading organizations...</span>
            </div>
          ) : organizations.length === 0 ? (
            <div className="text-center py-8">
              <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600 mb-2">No organizations available</p>
              <p className="text-sm text-slate-500">
                You need to be a member of an organization to move workflows.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  Select Organization
                </label>
                <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an organization..." />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4" />
                          <span>{org.name}</span>
                          {org.role && (
                            <span className="text-xs text-slate-500">({org.role})</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedOrg && (
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Building2 className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-slate-900">{selectedOrg.name}</h4>
                      {selectedOrg.description && (
                        <p className="text-sm text-slate-600 mt-1">{selectedOrg.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                        <div className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          <span>{selectedOrg.member_count || 0} members</span>
                        </div>
                        {selectedOrg.role && (
                          <div className="flex items-center gap-1">
                            <Check className="w-4 h-4 text-green-500" />
                            <span className="capitalize">{selectedOrg.role}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleMoveToOrganization}
                  disabled={!selectedOrgId || loading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  {loading ? (
                    <>
                      <LightningLoader size="sm" className="mr-2" />
                      Moving...
                    </>
                  ) : (
                    <>
                      <Building2 className="w-4 h-4 mr-2" />
                      Move Workflow
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
} 