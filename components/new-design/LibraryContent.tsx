"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ProfessionalSearch } from "@/components/ui/professional-search"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Sparkles, Clock, Zap, Play, Eye, Check } from "lucide-react"
import { TemplateWorkflowPreview } from "@/components/templates/TemplateWorkflowPreview"
import { ProviderSubstitutionModal } from "@/components/templates/ProviderSubstitutionModal"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useWorkflowStore } from "@/stores/workflowStore"
import { useToast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function LibraryContent() {
  const router = useRouter()
  const { toast } = useToast()
  const { integrations } = useIntegrationStore()
  const { createWorkflowFromTemplate } = useWorkflowStore()

  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Preview modal state
  const [previewTemplate, setPreviewTemplate] = useState<any>(null)
  const [previewModalOpen, setPreviewModalOpen] = useState(false)

  // Substitution modal state
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null)
  const [substitutionModalOpen, setSubstitutionModalOpen] = useState(false)

  const categories = ["all", "AI Automation", "Customer Service", "Sales & CRM", "Social Media", "Productivity"]

  // Prevent React 18 Strict Mode double-fetch
  const hasFetchedRef = useRef(false)

  useEffect(() => {
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true
      fetchTemplates()
    }
  }, [])

  const fetchTemplates = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/templates/predefined')
      const data = await response.json()
      if (data.templates) {
        const filteredTemplates = data.templates.filter((template: any) => {
          const unavailableIntegrations = ['twitter', 'x', 'shopify', 'github']
          return !template.integrations?.some((integration: string) =>
            unavailableIntegrations.includes(integration.toLowerCase())
          )
        })
        setTemplates(filteredTemplates)
      }
    } catch (error) {
      console.error('Error fetching templates:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredTemplates = templates.filter(template => {
    const matchesSearch = searchQuery === "" ||
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = selectedCategory === "all" || template.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  // Get connected integration IDs
  const connectedIntegrations = integrations
    .filter(i => i.status === 'connected')
    .map(i => i.provider)

  const handleUseTemplate = (template: any) => {
    setSelectedTemplate(template)
    setSubstitutionModalOpen(true)
  }

  const handlePreview = (template: any) => {
    setPreviewTemplate(template)
    setPreviewModalOpen(true)
  }

  const handleConfirmSubstitutions = async (substitutions: Record<string, string>) => {
    try {
      // Apply substitutions to template nodes
      const modifiedTemplate = {
        ...selectedTemplate,
        nodes: selectedTemplate.nodes.map((node: any) => {
          if (substitutions[node.id]) {
            return {
              ...node,
              data: {
                ...node.data,
                providerId: substitutions[node.id]
              }
            }
          }
          return node
        })
      }

      // Create workflow from template
      await createWorkflowFromTemplate(modifiedTemplate)

      toast({
        title: "Workflow Created!",
        description: "Your workflow has been created from the template."
      })

      // Navigate to the new workflow
      router.push('/workflows')
    } catch (error) {
      console.error('Error creating workflow from template:', error)
      toast({
        title: "Error",
        description: "Failed to create workflow from template.",
        variant: "destructive"
      })
    }
  }

  // Extract unique integrations from template nodes
  const getTemplateIntegrations = (template: any) => {
    if (!template.nodes) return []

    const providerIds = new Set<string>()
    template.nodes.forEach((node: any) => {
      if (node.data?.providerId) {
        providerIds.add(node.data.providerId)
      }
    })

    return Array.from(providerIds)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Template Library</h1>
        <p className="text-muted-foreground">
          Start with professionally designed workflows. Customize and deploy in minutes.
        </p>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1">
          <ProfessionalSearch
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery('')}
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2">
          {categories.map((category) => (
            <Button
              key={category}
              variant={selectedCategory === category ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(category)}
              className="whitespace-nowrap"
            >
              {category === "all" ? "All Templates" : category}
            </Button>
          ))}
        </div>
      </div>

      {/* Templates Grid */}
      {loading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="h-80 animate-pulse bg-muted" />
          ))}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template) => {
            const templateIntegrations = getTemplateIntegrations(template)
            const hasAllConnected = templateIntegrations.every(p =>
              connectedIntegrations.includes(p)
            )

            return (
              <Card key={template.id} className="group hover:shadow-lg transition-all overflow-hidden">
                <CardContent className="p-0">
                  {/* Preview Area - Mini Workflow Canvas */}
                  <div className="h-48 bg-gradient-to-br from-orange-50 to-rose-50 dark:from-orange-950/20 dark:to-rose-950/20 border-b relative overflow-hidden">
                    {template.nodes && template.nodes.length > 0 ? (
                      <TemplateWorkflowPreview
                        nodes={template.nodes}
                        edges={template.connections || template.edges || []}
                        className="w-full h-full"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <Sparkles className="w-12 h-12 text-orange-500" />
                      </div>
                    )}

                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handlePreview(template)}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        Preview
                      </Button>
                    </div>

                    {hasAllConnected && (
                      <div className="absolute top-2 left-2">
                        <Badge variant="secondary" className="gap-1 bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-100">
                          <Check className="w-3 h-3" />
                          Ready
                        </Badge>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-4 space-y-3">
                    <div>
                      <h3 className="font-semibold mb-1 line-clamp-1">{template.name}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {template.description}
                      </p>
                    </div>

                    {/* Integration Badges */}
                    {templateIntegrations.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {templateIntegrations.slice(0, 3).map(providerId => {
                          const isConnected = connectedIntegrations.includes(providerId)
                          return (
                            <Badge
                              key={providerId}
                              variant={isConnected ? "default" : "outline"}
                              className="text-xs capitalize"
                            >
                              {providerId.replace(/-/g, ' ')}
                            </Badge>
                          )
                        })}
                        {templateIntegrations.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{templateIntegrations.length - 3} more
                          </Badge>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {template.estimatedTime && (
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{template.estimatedTime}</span>
                        </div>
                      )}
                      {template.estimatedTime && <div className="w-px h-3 bg-border"></div>}
                      <Badge variant="outline" className="text-xs">{template.category}</Badge>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => handleUseTemplate(template)}
                      >
                        <Play className="w-4 h-4 mr-1" />
                        Use Template
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredTemplates.length === 0 && (
        <div className="text-center py-16">
          <p className="text-muted-foreground mb-4">No templates found</p>
          <Button variant="outline" onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }}>
            Clear Filters
          </Button>
        </div>
      )}

      {/* Preview Modal */}
      <Dialog open={previewModalOpen} onOpenChange={setPreviewModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{previewTemplate?.name}</DialogTitle>
          </DialogHeader>
          <div className="h-96">
            {previewTemplate?.nodes && (
              <TemplateWorkflowPreview
                nodes={previewTemplate.nodes}
                edges={previewTemplate.connections || previewTemplate.edges || []}
                className="w-full h-full border rounded-lg"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Provider Substitution Modal */}
      <ProviderSubstitutionModal
        open={substitutionModalOpen}
        onOpenChange={setSubstitutionModalOpen}
        template={selectedTemplate}
        onConfirm={handleConfirmSubstitutions}
        connectedIntegrations={connectedIntegrations}
      />
    </div>
  )
}
