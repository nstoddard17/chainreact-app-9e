"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Copy, Eye, Loader2, Edit, Play, Plus, Filter, Grid3x3, LayoutList } from "lucide-react"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { useAuthStore } from "@/stores/authStore"
import { useWorkflowStore } from "@/stores/workflowStore"
import { TemplatePreviewWithProvider } from "./TemplatePreview"
import { TemplatePreviewModal } from "./TemplatePreviewModal"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { logger } from '@/lib/utils/logger'

interface Template {
  id: string
  name: string
  description: string
  category: string
  tags: string[]
  workflow_json?: any
  nodes?: any[]
  connections?: any[]
  draft_nodes?: any[]
  draftNodes?: any[]
  draft_connections?: any[]
  draftConnections?: any[]
  draft_default_field_values?: Record<string, any>
  draftDefaultFieldValues?: Record<string, any>
  draft_integration_setup?: any
  draftIntegrationSetup?: any
  draft_setup_overview?: any
  draftSetupOverview?: any
  created_at: string
  creator?: {
    email: string
  }
  is_predefined?: boolean
  difficulty?: string
  estimatedTime?: string
  integrations?: string[]
  airtable_setup?: any
  airtableSetup?: any
  integration_setup?: any
  integrationSetup?: any
  status?: string
  primary_setup_target?: string | null
  published_at?: string | null
  is_public?: boolean
}

const categories = [
  "all",
  "AI Automation",
  "AI Agent Testing",
  "Customer Service",
  "Sales & CRM",
  "Social Media",
  "Productivity",
  "Data Sync",
  "E-commerce",
  "Notifications",
  "HR",
  "DevOps",
  "Marketing",
  "Finance",
]

const capitalizeTag = (tag: string): string => {
  const tagMap: Record<string, string> = {
    'ai-agent': 'AI Agent',
    'ai agent': 'AI Agent',
    'gmail': 'Gmail',
    'email': 'Email',
    'airtable': 'Airtable',
    'discord': 'Discord',
    'slack': 'Slack',
    'notion': 'Notion',
  }

  const lowerTag = tag.toLowerCase()
  return tagMap[lowerTag] || tag.split(' ').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ')
}

const formatStatus = (status?: string | null) => {
  if (!status) return 'Draft'
  return capitalizeTag(status)
}

const getStatusBadgeVariant = (status?: string | null) => {
  switch (status) {
    case 'published':
      return 'default' as const
    case 'ready':
      return 'secondary' as const
    default:
      return 'outline' as const
  }
}

const getTemplateWorkflowData = (
  template: Template,
  options: { preferDraft?: boolean } = {}
) => {
  const preferDraft = Boolean(options.preferDraft)
  const draftNodes = template.draftNodes || template.draft_nodes
  const draftConnections = template.draftConnections || template.draft_connections

  if (preferDraft && Array.isArray(draftNodes) && draftNodes.length > 0) {
    const connections = Array.isArray(draftConnections) ? draftConnections : []
    return {
      nodes: draftNodes,
      connections,
    }
  }

  if (template.nodes && template.connections) {
    return {
      nodes: template.nodes,
      connections: template.connections
    }
  }

  if (template.workflow_json) {
    const nodes = template.workflow_json.nodes || []
    const connections = template.workflow_json.connections || template.workflow_json.edges || []
    return {
      nodes,
      connections
    }
  }

  return { nodes: [], connections: [] }
}

export function TemplateGalleryRedesign() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [predefinedTemplates, setPredefinedTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [copying, setCopying] = useState<string | null>(null)
  const [showPredefined, setShowPredefined] = useState(true)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [creatingTemplate, setCreatingTemplate] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [newTemplateForm, setNewTemplateForm] = useState({
    name: "",
    description: "",
    category: "AI Automation",
    tags: "",
    primarySetupTarget: "airtable",
  })
  const router = useRouter()
  const { toast } = useToast()
  const { profile } = useAuthStore()
  const { addWorkflowToStore } = useWorkflowStore()
  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    fetchTemplates()
    fetchPredefinedTemplates()
  }, [selectedCategory, searchQuery, isAdmin])

  const fetchTemplates = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (selectedCategory !== "all") params.set("category", selectedCategory)
      if (searchQuery) params.set("search", searchQuery)
      if (isAdmin) params.set("scope", "admin")

      const response = await fetch(`/api/templates?${params}`)
      const data = await response.json()

      if (data.templates) {
        setTemplates(data.templates)
      }
    } catch (error) {
      logger.error("Error fetching templates:", error)
      toast({
        title: "Error",
        description: "Failed to fetch templates",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchPredefinedTemplates = async () => {
    try {
      const params = new URLSearchParams()
      if (selectedCategory !== "all") params.set("category", selectedCategory)
      if (searchQuery) params.set("search", searchQuery)

      const response = await fetch(`/api/templates/predefined?${params}`)
      const data = await response.json()

      if (data.templates) {
        const unavailableIntegrations = ['twitter', 'x', 'shopify', 'github']
        const filteredTemplates = data.templates.filter((template: Template) => {
          return !template.integrations?.some((integration: string) =>
            unavailableIntegrations.includes(integration.toLowerCase())
          )
        })
        setPredefinedTemplates(filteredTemplates)
      }
    } catch (error) {
      logger.error("Error fetching predefined templates:", error)
    }
  }

  const handleCreateTemplate = async () => {
    if (!newTemplateForm.name.trim()) {
      toast({
        title: "Name required",
        description: "Enter a template name to continue",
        variant: "destructive",
      })
      return
    }

    try {
      setCreatingTemplate(true)
      const tags = newTemplateForm.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)

      const response = await fetch(`/api/templates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newTemplateForm.name.trim(),
          description: newTemplateForm.description.trim(),
          category: newTemplateForm.category || "AI Automation",
          tags,
          is_public: false,
          primary_setup_target: newTemplateForm.primarySetupTarget || null,
          status: "draft",
          workflow_json: { nodes: [], connections: [] },
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || "Failed to create template")
      }

      const createdTemplate = data?.template
      if (createdTemplate) {
        setTemplates((prev) => [createdTemplate, ...prev])
      }

      toast({
        title: "Template created",
        description: "Finish configuring the template in the builder.",
      })

      setShowCreateDialog(false)
      setNewTemplateForm({
        name: "",
        description: "",
        category: "AI Automation",
        tags: "",
        primarySetupTarget: "airtable",
      })

      if (createdTemplate?.id) {
        router.push(`/workflows/builder?editTemplate=${createdTemplate.id}`)
      }
    } catch (error: any) {
      logger.error("Error creating template:", error)
      toast({
        title: "Error",
        description: error?.message || "Failed to create template",
        variant: "destructive",
      })
    } finally {
      setCreatingTemplate(false)
    }
  }

  const handleCopyTemplate = async (templateId: string) => {
    try {
      setCopying(templateId)
      const response = await fetch(`/api/templates/${templateId}/copy`, {
        method: "POST",
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `Failed to copy template`)
      }

      if (data.workflow && data.workflow.id) {
        addWorkflowToStore(data.workflow)
        toast({
          title: "Success",
          description: "Template copied to your workflows",
        })
        router.push(`/workflows/builder?id=${data.workflow.id}&editTemplate=${templateId}`)
      } else {
        throw new Error("Failed to copy template - no workflow ID returned")
      }
    } catch (error) {
      logger.error("Error copying template:", error)
      const errorMessage = error instanceof Error ? error.message : "Failed to copy template"
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setCopying(null)
    }
  }

  const filteredTemplates = templates.filter((template) => {
    const matchesSearch =
      !searchQuery ||
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesCategory = selectedCategory === "all" || template.category === selectedCategory

    return matchesSearch && matchesCategory
  })

  const deduplicateTemplates = (templates: Template[]) => {
    const seen = new Set<string>()
    return templates.filter(template => {
      if (seen.has(template.id)) {
        return false
      }
      seen.add(template.id)
      return true
    })
  }

  const allTemplates = deduplicateTemplates(
    showPredefined ? [...predefinedTemplates, ...filteredTemplates] : filteredTemplates
  )

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground mb-2">Workflow Templates</h1>
          <p className="text-muted-foreground">Browse and use pre-built automation workflows</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button onClick={() => setShowCreateDialog(true)} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              New Template
            </Button>
          )}
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5" />
          <Input
            placeholder="Search templates by name or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-11 h-11"
          />
        </div>
        <div className="flex gap-2">
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-full lg:w-56 h-11">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category === "all" ? "All Categories" : category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex border rounded-lg">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => setViewMode('grid')}
              className="rounded-r-none"
            >
              <Grid3x3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => setViewMode('list')}
              className="rounded-l-none border-l"
            >
              <LayoutList className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {allTemplates.length} {allTemplates.length === 1 ? 'template' : 'templates'} found
        </p>
      </div>

      {/* Templates Grid/List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className={viewMode === 'grid' ? "grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6" : "space-y-4"}>
          {allTemplates.map((template) => {
            const preferDraft = isAdmin && template.status !== "published"
            const workflowData = getTemplateWorkflowData(template, { preferDraft })

            return (
              <Card key={template.id} className="group hover:shadow-md transition-all overflow-hidden">
                <div className="p-6">
                  {/* Template Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-semibold text-foreground leading-tight">{template.name}</h3>
                        {template.is_predefined && (
                          <Badge className="bg-blue-500">
                            Official
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{template.description}</p>
                    </div>
                  </div>

                  {/* Workflow Preview */}
                  <div className="mb-4 rounded-lg overflow-hidden border bg-muted/30" style={{ height: '160px' }}>
                    <TemplatePreviewWithProvider
                      nodes={workflowData.nodes}
                      connections={workflowData.connections}
                      interactive={false}
                      showControls={false}
                      className=""
                    />
                  </div>

                  {/* Template Meta */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    <Badge variant="secondary">{template.category}</Badge>
                    {template.difficulty && (
                      <Badge variant="outline" className="text-xs">
                        {capitalizeTag(template.difficulty)}
                      </Badge>
                    )}
                    {template.estimatedTime && (
                      <Badge variant="outline" className="text-xs">
                        {template.estimatedTime}
                      </Badge>
                    )}
                    {template.tags?.slice(0, 2).map((tag, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {capitalizeTag(tag)}
                      </Badge>
                    ))}
                  </div>

                  {isAdmin && (
                    <div className="flex flex-wrap items-center gap-2 mb-4 pb-4 border-b">
                      <Badge variant={getStatusBadgeVariant(template.status)}>
                        {formatStatus(template.status)}
                      </Badge>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    {isAdmin && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/workflows/builder?editTemplate=${template.id}`)}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedTemplate(template)
                        setShowPreviewModal(true)
                      }}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Preview
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleCopyTemplate(template.id)}
                      disabled={copying === template.id}
                      className="ml-auto"
                    >
                      {copying === template.id ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      Use Template
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {!loading && allTemplates.length === 0 && (
        <div className="text-center py-16">
          <div className="text-muted-foreground text-lg mb-2">No templates found</div>
          <p className="text-sm text-muted-foreground">Try adjusting your search or filter criteria</p>
        </div>
      )}

      {/* Preview Modal */}
      <TemplatePreviewModal
        template={selectedTemplate ? {
          ...selectedTemplate,
          ...getTemplateWorkflowData(selectedTemplate, {
            preferDraft: isAdmin && selectedTemplate.status !== "published"
          })
        } : null}
        open={showPreviewModal}
        onOpenChange={setShowPreviewModal}
      />

      {/* Create Template Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Template</DialogTitle>
            <DialogDescription>
              Provide initial details for the template. You can configure the workflow in the builder.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                placeholder="Template name"
                value={newTemplateForm.name}
                onChange={(e) => setNewTemplateForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                rows={3}
                placeholder="Describe what this template does"
                value={newTemplateForm.description}
                onChange={(e) => setNewTemplateForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Category</label>
                <Select
                  value={newTemplateForm.category}
                  onValueChange={(value) => setNewTemplateForm((prev) => ({ ...prev, category: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.filter((c) => c !== "all").map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Setup Target</label>
                <Select
                  value={newTemplateForm.primarySetupTarget}
                  onValueChange={(value) => setNewTemplateForm((prev) => ({ ...prev, primarySetupTarget: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="airtable">Airtable</SelectItem>
                    <SelectItem value="google_sheets">Google Sheets</SelectItem>
                    <SelectItem value="gmail">Gmail</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Tags</label>
              <Input
                placeholder="crm, sales, support"
                value={newTemplateForm.tags}
                onChange={(e) => setNewTemplateForm((prev) => ({ ...prev, tags: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Comma-separated list</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} disabled={creatingTemplate}>
              Cancel
            </Button>
            <Button onClick={handleCreateTemplate} disabled={creatingTemplate}>
              {creatingTemplate ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Create & Configure
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
