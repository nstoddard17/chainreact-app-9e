"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Save, Building2, Users, Shield } from "lucide-react"
import { toast } from "sonner"

import { logger } from '@/lib/utils/logger'

interface Props {
  organization: any
  onUpdate?: (updatedOrg: any) => void
}

export default function OrganizationSettings({ organization, onUpdate }: Props) {
  const [name, setName] = useState(organization.name || "")
  const [description, setDescription] = useState(organization.description || "")
  const [loading, setLoading] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Organization name is required")
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/organizations/${organization.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim()
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update organization')
      }

      const updatedOrg = await response.json()
      toast.success('Organization settings updated successfully!')
      
      // Call the onUpdate callback if provided
      if (onUpdate) {
        onUpdate(updatedOrg)
      }
    } catch (error) {
      logger.error('Error updating organization:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to update organization')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Organization Information */}
      <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-slate-900 flex items-center">
            <Building2 className="w-5 h-5 mr-2 text-blue-600" />
            Organization Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-slate-700">Organization Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter organization name"
              className="bg-white text-black"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description" className="text-slate-700">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your organization"
              rows={3}
              className="bg-white text-black"
            />
          </div>

          <Button
            onClick={handleSave}
            disabled={loading || !name.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Organization Stats */}
      <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-slate-900 flex items-center">
            <Users className="w-5 h-5 mr-2 text-green-600" />
            Organization Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-slate-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{organization.member_count || 1}</div>
              <div className="text-sm text-slate-600">Members</div>
            </div>
            <div className="text-center p-4 bg-slate-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{organization.teams?.length || 0}</div>
              <div className="text-sm text-slate-600">Teams</div>
            </div>
            <div className="text-center p-4 bg-slate-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">{organization.workflow_count || 0}</div>
              <div className="text-sm text-slate-600">Workflows</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Organization Details */}
      <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-slate-900 flex items-center">
            <Shield className="w-5 h-5 mr-2 text-orange-600" />
            Organization Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-slate-100">
            <span className="text-slate-600">Organization ID</span>
            <span className="text-slate-900 font-mono text-sm">{organization.id}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-slate-100">
            <span className="text-slate-600">URL Slug</span>
            <span className="text-slate-900 font-mono text-sm">{organization.slug}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-slate-100">
            <span className="text-slate-600">Created</span>
            <span className="text-slate-900">{new Date(organization.created_at).toLocaleDateString()}</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-slate-600">Last Updated</span>
            <span className="text-slate-900">{new Date(organization.updated_at).toLocaleDateString()}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 