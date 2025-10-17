"use client"

import React, { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useWorkflowStore } from "@/stores/workflowStore"
import { useAuthStore } from "@/stores/authStore"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Workflow,
  Plus,
  PlayCircle,
  PauseCircle,
  FileText,
  Settings,
  Copy,
  Search,
  Zap,
  Clock,
  Loader2,
  LayoutTemplate,
  Puzzle
} from "lucide-react"

export function WorkflowsContentRedesign() {
  const router = useRouter()
  const { workflows, fetchWorkflows, loading } = useWorkflowStore()
  const { user } = useAuthStore()
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused" | "draft">("all")

  useEffect(() => {
    if (user) {
      fetchWorkflows()
    }
  }, [user, fetchWorkflows])

  const filteredWorkflows = workflows.filter(workflow => {
    const matchesSearch = searchQuery === "" ||
      workflow.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      workflow.description?.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesStatus = statusFilter === "all" || workflow.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const stats = {
    total: workflows.length,
    active: workflows.filter(w => w.status === 'active').length,
    paused: workflows.filter(w => w.status === 'paused').length,
    draft: workflows.filter(w => w.status === 'draft').length,
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400'
      case 'paused':
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400'
      case 'draft':
        return 'bg-muted text-muted-foreground'
      default:
        return 'bg-muted text-muted-foreground'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <PlayCircle className="w-4 h-4" />
      case 'paused':
        return <PauseCircle className="w-4 h-4" />
      case 'draft':
        return <FileText className="w-4 h-4" />
      default:
        return <Clock className="w-4 h-4" />
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground mb-2">Workflows</h1>
          <p className="text-muted-foreground">Build and automate your business processes</p>
        </div>
        <Button onClick={() => router.push('/workflows/builder')} size="lg">
          <Plus className="w-5 h-5 mr-2" />
          Create Workflow
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total", value: stats.total, color: "text-foreground" },
          { label: "Active", value: stats.active, color: "text-green-600 dark:text-green-400" },
          { label: "Paused", value: stats.paused, color: "text-yellow-600 dark:text-yellow-400" },
          { label: "Drafts", value: stats.draft, color: "text-muted-foreground" },
        ].map((stat, index) => (
          <Card key={index}>
            <CardContent className="pt-6">
              <div className={`text-3xl font-bold ${stat.color} mb-1`}>{stat.value}</div>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5" />
          <Input
            placeholder="Search workflows by name or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-11 h-11"
          />
        </div>
        <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
          <SelectTrigger className="w-full lg:w-48 h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Workflows ({stats.total})</SelectItem>
            <SelectItem value="active">Active ({stats.active})</SelectItem>
            <SelectItem value="paused">Paused ({stats.paused})</SelectItem>
            <SelectItem value="draft">Drafts ({stats.draft})</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Workflows Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredWorkflows.length === 0 ? (
        <div className="text-center py-16">
          {searchQuery || statusFilter !== "all" ? (
            <>
              <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg text-muted-foreground mb-4">No workflows found</p>
              <Button variant="outline" onClick={() => { setSearchQuery(""); setStatusFilter("all") }}>
                Clear filters
              </Button>
            </>
          ) : (
            <>
              <Workflow className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">No workflows yet</h3>
              <p className="text-muted-foreground mb-6">Create your first automated workflow to get started</p>
              <Button onClick={() => router.push('/workflows/builder')} size="lg">
                <Plus className="w-5 h-5 mr-2" />
                Create Workflow
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredWorkflows.map((workflow: any) => (
            <Card key={workflow.id} className="group hover:shadow-md transition-all">
              <CardHeader>
                <div className="flex items-start justify-between mb-2">
                  <div className="p-2 bg-blue-100 dark:bg-blue-500/10 rounded-lg">
                    <Workflow className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <Badge className={`flex items-center gap-1 ${getStatusColor(workflow.status || 'draft')}`}>
                    {getStatusIcon(workflow.status || 'draft')}
                    {workflow.status || 'draft'}
                  </Badge>
                </div>
                <CardTitle className="text-lg line-clamp-1">{workflow.name}</CardTitle>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {workflow.description || 'No description'}
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => router.push(`/workflows/builder?id=${workflow.id}`)}
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {/* Copy workflow logic */}}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="group hover:shadow-md transition-all cursor-pointer" onClick={() => router.push('/workflows/templates')}>
          <CardHeader>
            <div className="p-3 bg-purple-100 dark:bg-purple-500/10 rounded-lg inline-flex w-fit mb-3">
              <LayoutTemplate className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <CardTitle className="group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
              Browse Templates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Get started quickly with pre-built workflow templates
            </p>
          </CardContent>
        </Card>

        <Card className="group hover:shadow-md transition-all cursor-pointer" onClick={() => router.push('/integrations')}>
          <CardHeader>
            <div className="p-3 bg-green-100 dark:bg-green-500/10 rounded-lg inline-flex w-fit mb-3">
              <Puzzle className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">
              Connect More Apps
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Add more integrations to expand your workflow capabilities
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
