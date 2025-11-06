"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useWorkflowStore } from "@/stores/workflowStore"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ProfessionalSearch } from "@/components/ui/professional-search"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Play, Pause, Settings, Users, Globe, Lock, Loader2 } from "lucide-react"

interface Props {
  organizationId: string
  userRole: string
}

export default function OrganizationWorkflows({ organizationId, userRole }: Props) {
  const { workflows, loading, fetchWorkflows, fetchOrganizationWorkflows } = useWorkflowStore()
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [visibilityFilter, setVisibilityFilter] = useState("all")

  useEffect(() => {
    // Fetch organization workflows only
    fetchOrganizationWorkflows(organizationId)
  }, [organizationId, fetchOrganizationWorkflows])

  const filteredWorkflows = workflows.filter((workflow) => {
    const matchesSearch =
      workflow.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      workflow.description?.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesStatus = statusFilter === "all" || workflow.status === statusFilter

    const matchesVisibility = visibilityFilter === "all" || workflow.visibility === visibilityFilter

    return matchesSearch && matchesStatus && matchesVisibility
  })

  const getVisibilityIcon = (visibility: string) => {
    switch (visibility) {
      case "public":
        return <Globe className="w-4 h-4 text-green-600" />
      case "organization":
        return <Users className="w-4 h-4 text-blue-600" />
      case "private":
        return <Lock className="w-4 h-4 text-gray-600" />
      default:
        return <Lock className="w-4 h-4 text-gray-600" />
    }
  }

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-700 border-green-200"
      case "inactive":
        return "bg-yellow-100 text-yellow-700 border-yellow-200"
      case "draft":
        return "bg-gray-100 text-gray-700 border-gray-200"
      default:
        return "bg-gray-100 text-gray-700 border-gray-200"
    }
  }

  const canCreateWorkflows = userRole === "admin" || userRole === "editor"

  return (
    <div className="space-y-6">
      {/* Header and Filters */}
      <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-semibold text-slate-900">Organization Workflows</CardTitle>
            {canCreateWorkflows && (
              <Link href={`/workflows/builder?organizationId=${organizationId}`}>
                <Button className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Workflow
                </Button>
              </Link>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <ProfessionalSearch
                placeholder="Search workflows..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onClear={() => setSearchQuery('')}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
              </SelectContent>
            </Select>
            <Select value={visibilityFilter} onValueChange={setVisibilityFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by visibility" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Visibility</SelectItem>
                <SelectItem value="private">Private</SelectItem>
                <SelectItem value="organization">Organization</SelectItem>
                <SelectItem value="public">Public</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Workflows List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : filteredWorkflows.length === 0 ? (
        <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
          <CardContent className="text-center py-12">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Plus className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">No workflows found</h3>
            <p className="text-slate-500 mb-6">
              {searchQuery || statusFilter !== "all" || visibilityFilter !== "all"
                ? "Try adjusting your filters to see more workflows."
                : "Create your first organization workflow to get started."}
            </p>
            {canCreateWorkflows && (
              <Link href={`/workflows/builder?organizationId=${organizationId}`}>
                <Button className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Workflow
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredWorkflows.map((workflow) => (
            <Card
              key={workflow.id}
              className="bg-white rounded-2xl shadow-lg border border-slate-200 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 group flex flex-col h-full"
            >
              <CardHeader className="pb-3 flex-shrink-0">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg font-semibold text-slate-900 mb-2 group-hover:text-blue-600 transition-colors">{workflow.name}</CardTitle>
                    {workflow.description ? (
                      <p className="text-sm text-slate-600">{workflow.description}</p>
                    ) : (
                      <p className="text-sm text-slate-400 italic">No description</p>
                    )}
                  </div>
                  <div className="flex items-center space-x-1 ml-2">{getVisibilityIcon(workflow.visibility || "private")}</div>
                </div>
              </CardHeader>
              
              {/* Bottom section with status, date, actions, and edit button */}
              <div className="mt-auto">
                <div className="px-6 pb-3">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Badge className={getStatusBadgeColor(workflow.status)}>
                        {workflow.status === "active" && <Play className="w-3 h-3 mr-1" />}
                        {workflow.status === "inactive" && <Pause className="w-3 h-3 mr-1" />}
                        <span className="capitalize">{workflow.status}</span>
                      </Badge>
                      
                      {/* Show workflow readiness for draft workflows */}
                      {workflow.status === "draft" && (
                        <>
                          {!workflow.nodes?.some(n => n.data?.isTrigger) && (
                            <div className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200">
                              ⚠️ Missing trigger
                            </div>
                          )}
                          {workflow.nodes?.some(n => n.data?.isTrigger) && !workflow.nodes?.some(n => !n.data?.isTrigger) && (
                            <div className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200">
                              ⚠️ Missing action
                            </div>
                          )}
                          {workflow.nodes?.length > 1 && !workflow.connections?.length && (
                            <div className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200">
                              ⚠️ Missing connections
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    <span className="text-xs text-slate-500">{workflow.executions_count || 0} executions</span>
                  </div>

                  <div className="text-xs text-slate-500 mb-3">
                    Updated {workflow.updated_at ? new Date(workflow.updated_at).toLocaleDateString() : 'Not yet updated'}
                  </div>

                  <div className="flex items-center space-x-2">
                    <Link href={`/workflows/${workflow.id}`} className="flex-1">
                      <Button variant="outline" className="w-full">
                        View Workflow
                      </Button>
                    </Link>
                    {(canCreateWorkflows || workflow.created_by === "current_user") && (
                      <Link href={`/workflows/builder/${workflow.id}`}>
                        <Button size="sm" variant="outline">
                          <Settings className="w-4 h-4" />
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
                
                {/* Edit Workflow button - always at bottom */}
                <Link
                  href={`/workflows/builder/${workflow.id}`}
                  className="block w-full bg-slate-100 hover:bg-slate-200 p-3 text-center text-sm font-semibold border-t border-slate-200 transition-all duration-200 text-slate-900 hover:text-slate-900"
                >
                  Edit Workflow
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
