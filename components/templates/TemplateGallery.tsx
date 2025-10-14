"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Copy, Eye, Loader2, Edit, ArrowRight, Play } from "lucide-react"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { useAuthStore } from "@/stores/authStore"
import { useWorkflowStore } from "@/stores/workflowStore"
import { TemplatePreviewWithProvider } from "./TemplatePreview"
import { TemplatePreviewModal } from "./TemplatePreviewModal"

interface Template {
  id: string
  name: string
  description: string
  category: string
  tags: string[]
  workflow_json?: any
  nodes?: any[]
  connections?: any[]
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

// Helper function to properly capitalize tags
const capitalizeTag = (tag: string): string => {
  const tagMap: Record<string, string> = {
    'ai-agent': 'AI Agent',
    'ai agent': 'AI Agent',
    'ai-message': 'AI Message',
    'ai message': 'AI Message',
    'gmail': 'Gmail',
    'email': 'Email',
    'airtable': 'Airtable',
    'discord': 'Discord',
    'slack': 'Slack',
    'notion': 'Notion',
    'hubspot': 'HubSpot',
    'salesforce': 'Salesforce',
    'stripe': 'Stripe',
    'shopify': 'Shopify',
    'google-sheets': 'Google Sheets',
    'google sheets': 'Google Sheets',
    'google-drive': 'Google Drive',
    'google drive': 'Google Drive',
    'onedrive': 'OneDrive',
    'dropbox': 'Dropbox',
    'trello': 'Trello',
    'asana': 'Asana',
    'leads': 'Leads',
    'crm': 'CRM',
    'sales automation': 'Sales Automation',
    'email automation': 'Email Automation',
    'test': 'Test',
    'advanced': 'Advanced',
    'intermediate': 'Intermediate',
    'beginner': 'Beginner',
  }

  const lowerTag = tag.toLowerCase()
  return tagMap[lowerTag] || tag.split(' ').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ')
}

// Helper function to get nodes and connections from template (handles both formats)
const getTemplateWorkflowData = (template: Template) => {
  // Try direct nodes/connections first
  if (template.nodes && template.connections) {
    console.log('Using direct nodes/connections:', template.nodes.length, template.connections.length)
    return {
      nodes: template.nodes,
      connections: template.connections
    }
  }

  // Try workflow_json
  if (template.workflow_json) {
    const nodes = template.workflow_json.nodes || []
    const connections = template.workflow_json.connections || template.workflow_json.edges || []
    console.log('Using workflow_json:', nodes.length, connections.length)
    return {
      nodes,
      connections
    }
  }

  console.log('No workflow data found for template')
  return { nodes: [], connections: [] }
}

export function TemplateGallery() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [predefinedTemplates, setPredefinedTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [copying, setCopying] = useState<string | null>(null)
  const [showPredefined, setShowPredefined] = useState(true)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const router = useRouter()
  const { toast } = useToast()
  const { profile } = useAuthStore()
  const { addWorkflowToStore } = useWorkflowStore()
  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    fetchTemplates()
    fetchPredefinedTemplates()
  }, [selectedCategory, searchQuery])

  const fetchTemplates = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (selectedCategory !== "all") params.set("category", selectedCategory)
      if (searchQuery) params.set("search", searchQuery)

      const response = await fetch(`/api/templates?${params}`)
      const data = await response.json()

      if (data.templates) {
        setTemplates(data.templates)
      }
    } catch (error) {
      console.error("Error fetching templates:", error)
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
        setPredefinedTemplates(data.templates)
      }
    } catch (error) {
      console.error("Error fetching predefined templates:", error)
    }
  }

  const handleCopyTemplate = async (templateId: string) => {
    try {
      setCopying(templateId)
      console.log(`Copying template ${templateId}...`)

      const response = await fetch(`/api/templates/${templateId}/copy`, {
        method: "POST",
      })

      const data = await response.json()
      console.log("Copy response:", data)

      if (!response.ok) {
        console.error("Copy failed with status:", response.status, data)
        throw new Error(data.error || `Failed to copy template (${response.status})`)
      }

      if (data.workflow && data.workflow.id) {
        console.log(`Workflow created with ID: ${data.workflow.id}, adding to store...`)

        // Add the workflow to the store immediately to avoid cache issues
        addWorkflowToStore(data.workflow)

        toast({
          title: "Success",
          description: "Template copied to your workflows",
        })

        console.log(`Navigating to workflow builder...`)
        router.push(`/workflows/builder?id=${data.workflow.id}&editTemplate=${templateId}`)
      } else {
        console.error("No workflow ID in response:", data)
        throw new Error(data.error || "Failed to copy template - no workflow ID returned")
      }
    } catch (error) {
      console.error("Error copying template:", error)
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

  // Deduplicate templates by ID to avoid duplicate key errors
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Workflow Templates</h2>
          <p className="text-gray-600">Get started quickly with pre-built workflows</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-full sm:w-48">
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
      </div>

      {/* Templates Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {allTemplates.map((template) => (
            <Card key={template.id} className="hover:shadow-lg transition-shadow flex flex-col">
              <CardHeader className="flex-shrink-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 mb-2">
                      <CardTitle className="text-lg leading-tight">{template.name}</CardTitle>
                      {template.is_predefined && (
                        <Badge className="bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0 flex-shrink-0">
                          Official
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="mt-2 line-clamp-2">{template.description}</CardDescription>
                  </div>
                </div>

                {/* Mini workflow preview */}
                <div className="mt-4 rounded-lg overflow-hidden border bg-gray-50" style={{ height: '200px', width: '100%' }}>
                  <TemplatePreviewWithProvider
                    nodes={getTemplateWorkflowData(template).nodes}
                    connections={getTemplateWorkflowData(template).connections}
                    interactive={false}
                    showControls={false}
                    className=""
                  />
                </div>

                <div className="flex flex-wrap gap-2 mt-4">
                  <Badge variant="secondary">{template.category}</Badge>
                  {template.difficulty && (
                    <Badge variant="outline" className="text-xs">
                      {capitalizeTag(template.difficulty)}
                    </Badge>
                  )}
                  {template.estimatedTime && (
                    <Badge variant="outline" className="text-xs">
                      ⏱️ {template.estimatedTime}
                    </Badge>
                  )}
                  {template.tags?.slice(0, 2).map((tag, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {capitalizeTag(tag)}
                    </Badge>
                  ))}
                </div>
              </CardHeader>

              <CardContent className="mt-auto pt-0">
                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="text-sm text-gray-500">
                    by ChainReact
                  </div>

                  <div className="flex gap-2 flex-shrink-0">
                    {isAdmin && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          router.push(`/workflows/builder?editTemplate=${template.id}`)
                        }}
                        title="Edit Template"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedTemplate(template)
                        setShowPreviewModal(true)
                      }}
                      title="Preview Template"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>

                    <Button
                      size="sm"
                      onClick={() => handleCopyTemplate(template.id)}
                      disabled={copying === template.id}
                      title="Use Template"
                    >
                      {copying === template.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && allTemplates.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-500 mb-4">No templates found</div>
          <p className="text-sm text-gray-400">Try adjusting your search criteria or browse all templates</p>
        </div>
      )}

      {/* Interactive Preview Modal */}
      <TemplatePreviewModal
        template={selectedTemplate ? {
          ...selectedTemplate,
          ...getTemplateWorkflowData(selectedTemplate)
        } : null}
        open={showPreviewModal}
        onOpenChange={setShowPreviewModal}
      />
    </div>
  )
}
