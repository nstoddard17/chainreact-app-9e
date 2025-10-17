"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useWorkflowStore } from "@/stores/workflowStore"
import { useAuthStore } from "@/stores/authStore"
import { useIntegrationStore } from "@/stores/integrationStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Search,
  Plus,
  Filter,
  MoreVertical,
  PlayCircle,
  PauseCircle,
  Edit,
  Copy,
  Trash2,
  Zap,
  Sparkles,
  Layers,
  TrendingUp
} from "lucide-react"

export function HomeContent() {
  const router = useRouter()
  const { workflows, fetchWorkflows } = useWorkflowStore()
  const { user } = useAuthStore()
  const { getConnectedProviders } = useIntegrationStore()
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<'all' | 'active' | 'drafts'>('all')

  const connectedCount = getConnectedProviders().length

  useEffect(() => {
    if (user) {
      fetchWorkflows()
    }
  }, [user, fetchWorkflows])

  const filtered = workflows.filter(w => {
    const matchesSearch = w.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesView = viewMode === 'all' ||
      (viewMode === 'active' && w.status === 'active') ||
      (viewMode === 'drafts' && w.status === 'draft')
    return matchesSearch && matchesView
  })

  const stats = {
    active: workflows.filter(w => w.status === 'active').length,
    total: workflows.length,
    drafts: workflows.filter(w => w.status === 'draft').length
  }

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-lg">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm font-medium">{stats.active} active</span>
            </div>
            <div className="w-px h-4 bg-border"></div>
            <span className="text-sm text-muted-foreground">{stats.total} total</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push('/new/library')}>
            <Sparkles className="w-4 h-4 mr-2" />
            Browse Templates
          </Button>
          <Button onClick={() => router.push('/workflows/builder')}>
            <Plus className="w-4 h-4 mr-2" />
            New Workflow
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search workflows..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <div className="flex items-center gap-2 border rounded-lg p-1">
          <Button
            variant={viewMode === 'all' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('all')}
            className="h-7 text-xs"
          >
            All
          </Button>
          <Button
            variant={viewMode === 'active' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('active')}
            className="h-7 text-xs"
          >
            Active
          </Button>
          <Button
            variant={viewMode === 'drafts' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('drafts')}
            className="h-7 text-xs"
          >
            Drafts
          </Button>
        </div>
      </div>

      {/* Empty State */}
      {filtered.length === 0 && workflows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
            <Zap className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-2xl font-semibold mb-2">Create your first workflow</h3>
          <p className="text-muted-foreground text-center max-w-md mb-6">
            Automate tasks by connecting your apps and services. Start from scratch or use a template.
          </p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => router.push('/new/library')}>
              <Layers className="w-4 h-4 mr-2" />
              Explore Templates
            </Button>
            <Button onClick={() => router.push('/workflows/builder')}>
              <Plus className="w-4 h-4 mr-2" />
              Build From Scratch
            </Button>
          </div>

          {connectedCount === 0 && (
            <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg max-w-md">
              <p className="text-sm text-center text-blue-900 dark:text-blue-100">
                <strong>Tip:</strong> Connect your apps first to see available actions
              </p>
              <Button
                variant="link"
                size="sm"
                onClick={() => router.push('/new/apps')}
                className="mt-2 w-full"
              >
                Connect Apps →
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Workflows List */}
      {filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((workflow: any) => (
            <div
              key={workflow.id}
              className="group flex items-center gap-4 p-4 border rounded-xl hover:bg-accent/50 transition-all cursor-pointer"
              onClick={() => router.push(`/workflows/builder?id=${workflow.id}`)}
            >
              {/* Status Indicator */}
              <div className="flex-shrink-0">
                {workflow.status === 'active' ? (
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                ) : (
                  <div className="w-2 h-2 bg-gray-300 dark:bg-gray-700 rounded-full"></div>
                )}
              </div>

              {/* Workflow Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium truncate">{workflow.name}</h3>
                  <Badge variant={workflow.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                    {workflow.status || 'draft'}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground truncate">
                  {workflow.description || 'No description'}
                </p>
              </div>

              {/* Stats */}
              <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4" />
                  <span>0 runs</span>
                </div>
              </div>

              {/* Actions */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/workflows/builder?id=${workflow.id}`) }}>
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                    <Copy className="w-4 h-4 mr-2" />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                    {workflow.status === 'active' ? (
                      <>
                        <PauseCircle className="w-4 h-4 mr-2" />
                        Pause
                      </>
                    ) : (
                      <>
                        <PlayCircle className="w-4 h-4 mr-2" />
                        Activate
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive" onClick={(e) => e.stopPropagation()}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}

      {/* No Results */}
      {filtered.length === 0 && workflows.length > 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No workflows match your filters</p>
          <Button variant="link" onClick={() => { setSearchQuery(''); setViewMode('all'); }}>
            Clear filters
          </Button>
        </div>
      )}
    </div>
  )
}
