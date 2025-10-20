'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import {
  Search,
  Plus,
  Filter,
  LayoutGrid,
  LayoutList,
  ArrowUpDown,
  Play,
  Pause,
  Copy,
  Trash2,
  MoreHorizontal,
  Zap,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  Workflow,
  Calendar,
  Tag,
} from 'lucide-react'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { AppHeader } from '@/components/layout/AppHeader'
import { AppFooter } from '@/components/layout/AppFooter'

// Mock data - replace with actual data fetching
const mockWorkflows = [
  {
    id: '1',
    name: 'Customer Onboarding Flow',
    description: 'Automatically send welcome emails and create tasks for new customers',
    status: 'active' as const,
    tags: ['sales', 'automation'],
    lastRun: new Date('2025-01-18T10:30:00'),
    executions: 342,
    successRate: 98.5,
    triggers: ['Gmail', 'HubSpot'],
    actions: ['Slack', 'Notion', 'Gmail'],
  },
  {
    id: '2',
    name: 'Weekly Report Generator',
    description: 'Compile data and send weekly reports to stakeholders',
    status: 'active' as const,
    tags: ['reporting', 'analytics'],
    lastRun: new Date('2025-01-19T09:00:00'),
    executions: 48,
    successRate: 100,
    triggers: ['Schedule'],
    actions: ['Airtable', 'Gmail', 'Google Drive'],
  },
  {
    id: '3',
    name: 'Social Media Cross-Post',
    description: 'Post content across multiple social platforms simultaneously',
    status: 'paused' as const,
    tags: ['social', 'marketing'],
    lastRun: new Date('2025-01-15T14:20:00'),
    executions: 156,
    successRate: 94.2,
    triggers: ['Twitter'],
    actions: ['Facebook', 'LinkedIn', 'Instagram'],
  },
  {
    id: '4',
    name: 'Lead Qualification Pipeline',
    description: 'Score and route leads based on engagement and profile data',
    status: 'draft' as const,
    tags: ['sales', 'leads'],
    lastRun: null,
    executions: 0,
    successRate: 0,
    triggers: ['HubSpot'],
    actions: ['Airtable', 'Slack'],
  },
  {
    id: '5',
    name: 'Invoice Processing',
    description: 'Extract invoice data and update accounting records',
    status: 'active' as const,
    tags: ['finance', 'automation'],
    lastRun: new Date('2025-01-19T16:45:00'),
    executions: 89,
    successRate: 96.6,
    triggers: ['Gmail'],
    actions: ['Stripe', 'Google Sheets', 'Slack'],
  },
]

type ViewMode = 'grid' | 'list'
type SortField = 'name' | 'lastRun' | 'executions' | 'successRate'
type SortDirection = 'asc' | 'desc'
type StatusFilter = 'all' | 'active' | 'paused' | 'draft'

export default function WorkflowsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortField, setSortField] = useState<SortField>('lastRun')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  // Calculate stats
  const stats = useMemo(() => {
    const active = mockWorkflows.filter(w => w.status === 'active').length
    const totalExecutions = mockWorkflows.reduce((sum, w) => sum + w.executions, 0)
    const avgSuccessRate = mockWorkflows.length > 0
      ? mockWorkflows.reduce((sum, w) => sum + w.successRate, 0) / mockWorkflows.length
      : 0

    return {
      total: mockWorkflows.length,
      active,
      totalExecutions,
      avgSuccessRate: avgSuccessRate.toFixed(1),
    }
  }, [])

  // Get all unique tags
  const allTags = useMemo(() => {
    const tags = new Set<string>()
    mockWorkflows.forEach(w => w.tags.forEach(t => tags.add(t)))
    return Array.from(tags).sort()
  }, [])

  // Filter and sort workflows
  const filteredWorkflows = useMemo(() => {
    let filtered = mockWorkflows

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(w => w.status === statusFilter)
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        w =>
          w.name.toLowerCase().includes(query) ||
          w.description.toLowerCase().includes(query) ||
          w.tags.some(t => t.toLowerCase().includes(query))
      )
    }

    // Tag filter
    if (selectedTags.length > 0) {
      filtered = filtered.filter(w =>
        selectedTags.some(tag => w.tags.includes(tag))
      )
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      let aVal: any = a[sortField]
      let bVal: any = b[sortField]

      if (sortField === 'lastRun') {
        aVal = a.lastRun?.getTime() ?? 0
        bVal = b.lastRun?.getTime() ?? 0
      }

      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1
      } else {
        return aVal < bVal ? 1 : -1
      }
    })

    return filtered
  }, [searchQuery, statusFilter, selectedTags, sortField, sortDirection])

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  }

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <AppSidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <AppHeader />

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          {/* Page Header */}
          <div className="bg-white border-b border-slate-200">
            <div className="px-8 py-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-3xl font-bold text-slate-900">Workflows</h1>
                  <p className="text-slate-600 mt-1">
                    Automate your processes with powerful integrations
                  </p>
                </div>
                <Button size="lg" className="gap-2 bg-blue-600 hover:bg-blue-700">
                  <Plus className="w-4 h-4" />
                  Create Workflow
                </Button>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-white rounded-xl p-5 border-2 border-blue-100 shadow-sm">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Workflow className="w-5 h-5 text-blue-600" />
                    </div>
                    <span className="text-sm font-semibold text-slate-700">Total Workflows</span>
                  </div>
                  <div className="text-3xl font-bold text-slate-900">{stats.total}</div>
                </div>

                <div className="bg-white rounded-xl p-5 border-2 border-green-100 shadow-sm">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                      <Zap className="w-5 h-5 text-green-600" />
                    </div>
                    <span className="text-sm font-semibold text-slate-700">Active</span>
                  </div>
                  <div className="text-3xl font-bold text-slate-900">{stats.active}</div>
                </div>

                <div className="bg-white rounded-xl p-5 border-2 border-purple-100 shadow-sm">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-purple-600" />
                    </div>
                    <span className="text-sm font-semibold text-slate-700">Total Runs</span>
                  </div>
                  <div className="text-3xl font-bold text-slate-900">
                    {stats.totalExecutions.toLocaleString()}
                  </div>
                </div>

                <div className="bg-white rounded-xl p-5 border-2 border-emerald-100 shadow-sm">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    </div>
                    <span className="text-sm font-semibold text-slate-700">Success Rate</span>
                  </div>
                  <div className="text-3xl font-bold text-slate-900">{stats.avgSuccessRate}%</div>
                </div>
              </div>

              {/* Filters and Controls */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Search workflows..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-10 bg-white border-slate-300"
                  />
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2 border-slate-300">
                      <Filter className="w-4 h-4" />
                      <span className="text-slate-700">Status</span>
                      {statusFilter !== 'all' && (
                        <Badge variant="secondary" className="ml-1 bg-blue-100 text-blue-700">
                          1
                        </Badge>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => setStatusFilter('all')}>
                      All Workflows
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setStatusFilter('active')}>
                      <Zap className="w-4 h-4 mr-2 text-green-600" />
                      Active
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStatusFilter('paused')}>
                      <Pause className="w-4 h-4 mr-2 text-amber-600" />
                      Paused
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStatusFilter('draft')}>
                      <Clock className="w-4 h-4 mr-2 text-slate-600" />
                      Draft
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2 border-slate-300">
                      <Tag className="w-4 h-4" />
                      <span className="text-slate-700">Tags</span>
                      {selectedTags.length > 0 && (
                        <Badge variant="secondary" className="ml-1 bg-blue-100 text-blue-700">
                          {selectedTags.length}
                        </Badge>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {allTags.map(tag => (
                      <DropdownMenuCheckboxItem
                        key={tag}
                        checked={selectedTags.includes(tag)}
                        onCheckedChange={() => toggleTag(tag)}
                      >
                        {tag}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2 border-slate-300">
                      <ArrowUpDown className="w-4 h-4" />
                      <span className="text-slate-700">Sort</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => setSortField('name')}>
                      Name
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSortField('lastRun')}>
                      Last Run
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSortField('executions')}>
                      Executions
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSortField('successRate')}>
                      Success Rate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() =>
                        setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
                      }
                    >
                      {sortDirection === 'asc' ? 'Ascending' : 'Descending'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <div className="flex items-center gap-1 border border-slate-300 rounded-lg p-1 bg-white">
                  <Button
                    variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('grid')}
                    className="px-3"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('list')}
                    className="px-3"
                  >
                    <LayoutList className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Content Area */}
          <div className="px-8 py-6">
            {filteredWorkflows.length === 0 ? (
              <EmptyState
                hasFilters={searchQuery !== '' || statusFilter !== 'all' || selectedTags.length > 0}
                onClearFilters={() => {
                  setSearchQuery('')
                  setStatusFilter('all')
                  setSelectedTags([])
                }}
              />
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {filteredWorkflows.map(workflow => (
                  <WorkflowCard key={workflow.id} workflow={workflow} />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredWorkflows.map(workflow => (
                  <WorkflowListItem key={workflow.id} workflow={workflow} />
                ))}
              </div>
            )}
          </div>
        </main>

        {/* Footer */}
        <AppFooter />
      </div>
    </div>
  )
}

// Workflow Card Component (Grid View)
function WorkflowCard({ workflow }: { workflow: typeof mockWorkflows[0] }) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      className="group bg-white rounded-xl border-2 border-slate-200 p-6 hover:shadow-xl hover:border-blue-300 transition-all duration-200 cursor-pointer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-lg text-slate-900 truncate mb-1">
            {workflow.name}
          </h3>
          <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed">
            {workflow.description}
          </p>
        </div>
        <StatusBadge status={workflow.status} />
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-2 mb-4">
        {workflow.tags.map(tag => (
          <Badge key={tag} variant="secondary" className="text-xs bg-slate-100 text-slate-700 hover:bg-slate-200">
            {tag}
          </Badge>
        ))}
      </div>

      {/* Integrations Preview */}
      <div className="flex items-center gap-2 mb-5 pb-5 border-b-2 border-slate-100">
        <div className="flex -space-x-2">
          {workflow.triggers.slice(0, 3).map((trigger, i) => (
            <div
              key={i}
              className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 border-2 border-white shadow-sm flex items-center justify-center text-xs font-bold text-white"
              title={trigger}
            >
              {trigger[0]}
            </div>
          ))}
        </div>
        <div className="text-slate-400 font-bold">→</div>
        <div className="flex -space-x-2">
          {workflow.actions.slice(0, 3).map((action, i) => (
            <div
              key={i}
              className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 border-2 border-white shadow-sm flex items-center justify-center text-xs font-bold text-white"
              title={action}
            >
              {action[0]}
            </div>
          ))}
        </div>
        {workflow.actions.length > 3 && (
          <span className="text-sm font-medium text-slate-600">
            +{workflow.actions.length - 3}
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div>
          <div className="text-xs font-semibold text-slate-500 mb-1">Runs</div>
          <div className="text-lg font-bold text-slate-900">
            {workflow.executions.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-slate-500 mb-1">Success</div>
          <div className="text-lg font-bold text-slate-900">
            {workflow.successRate}%
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-slate-500 mb-1">Last Run</div>
          <div className="text-sm font-bold text-slate-900">
            {workflow.lastRun ? formatRelativeTime(workflow.lastRun) : 'Never'}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div
        className={`flex items-center gap-2 transition-opacity duration-200 ${
          isHovered ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <Button size="sm" variant="outline" className="flex-1 gap-2 border-slate-300 text-slate-700">
          <Play className="w-4 h-4" />
          Run
        </Button>
        <Button size="sm" variant="outline" className="gap-2 border-slate-300 text-slate-700">
          <Copy className="w-4 h-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="border-slate-300 text-slate-700">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Edit</DropdownMenuItem>
            <DropdownMenuItem>Duplicate</DropdownMenuItem>
            <DropdownMenuItem>View History</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-600">
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

// Workflow List Item Component (List View)
function WorkflowListItem({ workflow }: { workflow: typeof mockWorkflows[0] }) {
  return (
    <div className="group bg-white rounded-xl border-2 border-slate-200 p-5 hover:shadow-lg hover:border-blue-300 transition-all duration-200 cursor-pointer">
      <div className="flex items-center gap-4">
        {/* Status Indicator */}
        <div className="flex-shrink-0">
          <StatusBadge status={workflow.status} />
        </div>

        {/* Main Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-bold text-base text-slate-900 truncate">
              {workflow.name}
            </h3>
            <div className="flex gap-1.5">
              {workflow.tags.map(tag => (
                <Badge key={tag} variant="secondary" className="text-xs bg-slate-100 text-slate-700">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
          <p className="text-sm text-slate-600 truncate">{workflow.description}</p>
        </div>

        {/* Stats */}
        <div className="hidden lg:flex items-center gap-8">
          <div className="text-center">
            <div className="text-xs font-semibold text-slate-500 mb-1">Runs</div>
            <div className="text-base font-bold text-slate-900">
              {workflow.executions.toLocaleString()}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs font-semibold text-slate-500 mb-1">Success</div>
            <div className="text-base font-bold text-slate-900">
              {workflow.successRate}%
            </div>
          </div>
          <div className="text-center min-w-[80px]">
            <div className="text-xs font-semibold text-slate-500 mb-1">Last Run</div>
            <div className="text-sm font-bold text-slate-900">
              {workflow.lastRun ? formatRelativeTime(workflow.lastRun) : 'Never'}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button size="sm" variant="outline" className="gap-2 border-slate-300 text-slate-700">
            <Play className="w-4 h-4" />
            Run
          </Button>
          <Button size="sm" variant="outline" className="border-slate-300 text-slate-700">
            <Copy className="w-4 h-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="border-slate-300 text-slate-700">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Edit</DropdownMenuItem>
              <DropdownMenuItem>Duplicate</DropdownMenuItem>
              <DropdownMenuItem>View History</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}

// Status Badge Component
function StatusBadge({ status }: { status: 'active' | 'paused' | 'draft' }) {
  const config = {
    active: {
      label: 'Active',
      icon: Zap,
      className: 'bg-green-100 text-green-700 border-green-300',
    },
    paused: {
      label: 'Paused',
      icon: Pause,
      className: 'bg-amber-100 text-amber-700 border-amber-300',
    },
    draft: {
      label: 'Draft',
      icon: Clock,
      className: 'bg-slate-100 text-slate-700 border-slate-300',
    },
  }

  const { label, icon: Icon, className } = config[status]

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border-2 ${className}`}>
      <Icon className="w-3.5 h-3.5" />
      {label}
    </div>
  )
}

// Empty State Component
function EmptyState({
  hasFilters,
  onClearFilters,
}: {
  hasFilters: boolean
  onClearFilters: () => void
}) {
  if (hasFilters) {
    return (
      <div className="text-center py-16 bg-white rounded-xl border-2 border-slate-200">
        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Search className="w-10 h-10 text-slate-400" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 mb-2">
          No workflows found
        </h3>
        <p className="text-slate-600 mb-6">
          Try adjusting your filters or search query
        </p>
        <Button variant="outline" onClick={onClearFilters} className="border-slate-300 text-slate-700">
          Clear Filters
        </Button>
      </div>
    )
  }

  return (
    <div className="text-center py-16 bg-white rounded-xl border-2 border-slate-200">
      <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <Workflow className="w-10 h-10 text-blue-600" />
      </div>
      <h3 className="text-xl font-bold text-slate-900 mb-2">
        Create your first workflow
      </h3>
      <p className="text-slate-600 mb-6 max-w-md mx-auto">
        Automate repetitive tasks and connect your favorite apps with powerful
        workflows
      </p>
      <Button size="lg" className="gap-2 bg-blue-600 hover:bg-blue-700">
        <Plus className="w-5 h-5" />
        Create Workflow
      </Button>
    </div>
  )
}

// Utility function for relative time
function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) return 'Just now'
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`
  return date.toLocaleDateString()
}
