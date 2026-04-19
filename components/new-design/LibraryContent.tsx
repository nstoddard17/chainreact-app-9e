"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ProfessionalSearch } from "@/components/ui/professional-search"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Sparkles, Clock, Play, Eye, Check, ArrowRight, Loader2, CheckCircle2, AlertCircle, ArrowUpDown } from "lucide-react"
import { TemplateWorkflowPreview } from "@/components/templates/TemplateWorkflowPreview"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

export function LibraryContent() {
  const router = useRouter()
  const { toast } = useToast()
  const { integrations } = useIntegrationStore()

  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [sortBy, setSortBy] = useState("default")
  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [copying, setCopying] = useState(false)

  // Preview modal state
  const [previewTemplate, setPreviewTemplate] = useState<any>(null)
  const [previewModalOpen, setPreviewModalOpen] = useState(false)

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

  // Derive categories from actual templates
  const categories = ["all", ...Array.from(new Set(templates.map(t => t.category))).sort()]

  // Filter templates
  const filteredTemplates = templates
    .filter(template => {
      const matchesSearch = searchQuery === "" ||
        template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.description.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesCategory = selectedCategory === "all" || template.category === selectedCategory
      return matchesSearch && matchesCategory
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "easiest":
          const diffOrder = { beginner: 0, intermediate: 1, advanced: 2 }
          return (diffOrder[a.difficulty as keyof typeof diffOrder] ?? 1) - (diffOrder[b.difficulty as keyof typeof diffOrder] ?? 1)
        case "advanced":
          const diffOrderRev = { beginner: 2, intermediate: 1, advanced: 0 }
          return (diffOrderRev[a.difficulty as keyof typeof diffOrderRev] ?? 1) - (diffOrderRev[b.difficulty as keyof typeof diffOrderRev] ?? 1)
        case "newest":
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        default:
          return 0
      }
    })

  // Get connected integration IDs
  const connectedIntegrations = integrations
    .filter(i => i.status === 'connected')
    .map(i => i.provider)

  // Extract unique integrations from template nodes
  const getTemplateIntegrations = (template: any) => {
    if (!template.integrations) {
      if (!template.nodes) return []
      const providerIds = new Set<string>()
      template.nodes.forEach((node: any) => {
        if (node.data?.providerId) providerIds.add(node.data.providerId)
      })
      return Array.from(providerIds)
    }
    return template.integrations
  }

  const handleUseTemplate = async (template: any) => {
    try {
      setCopying(true)
      const response = await fetch(`/api/templates/${template.id}/copy`, {
        method: 'POST',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create workflow from template')
      }

      const { workflow } = await response.json()

      toast({
        title: "Workflow created!",
        description: `"${workflow.name}" is ready to configure.`,
      })

      setPreviewModalOpen(false)
      router.push(`/workflows/builder/${workflow.id}`)
    } catch (error) {
      console.error('Error creating workflow from template:', error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create workflow from template.",
        variant: "destructive",
      })
    } finally {
      setCopying(false)
    }
  }

  const handlePreview = (template: any) => {
    setPreviewTemplate(template)
    setPreviewModalOpen(true)
  }

  const getDifficultyStyle = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
      case 'intermediate':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
      case 'advanced':
        return 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400'
      default:
        return ''
    }
  }

  const previewIntegrations = previewTemplate ? getTemplateIntegrations(previewTemplate) : []

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="animate-fade-in-down relative overflow-hidden rounded-xl bg-gradient-to-r from-orange-500/10 via-rose-500/10 to-purple-500/10 dark:from-orange-500/5 dark:via-rose-500/5 dark:to-purple-500/5 p-5 border border-orange-200/50 dark:border-orange-800/30">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-400/5 to-transparent pointer-events-none" />
        <h1 className="text-2xl font-bold mb-1 bg-gradient-to-r from-orange-600 to-rose-600 dark:from-orange-400 dark:to-rose-400 bg-clip-text text-transparent relative">Template Library</h1>
        <p className="text-sm text-muted-foreground relative">
          Start with professionally designed workflows. Customize and deploy in minutes.
        </p>
      </div>

      {/* Search + Sort row */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <ProfessionalSearch
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery('')}
          />
        </div>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[160px] h-10">
            <ArrowUpDown className="w-3.5 h-3.5 mr-1.5 text-muted-foreground shrink-0" />
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Default</SelectItem>
            <SelectItem value="easiest">Easiest First</SelectItem>
            <SelectItem value="advanced">Most Advanced</SelectItem>
            <SelectItem value="newest">Newest</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Category pill filters */}
      <div className="flex flex-wrap gap-2">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={cn(
              "inline-flex items-center h-8 px-3.5 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer",
              selectedCategory === category
                ? "bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300 ring-1 ring-orange-300 dark:ring-orange-700"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            )}
          >
            {category === "all" ? "All Templates" : category}
          </button>
        ))}
      </div>

      {/* Result count */}
      {!loading && (
        <p className="text-xs text-muted-foreground">
          Showing {filteredTemplates.length} {filteredTemplates.length === 1 ? 'template' : 'templates'}
          {selectedCategory !== "all" && ` in ${selectedCategory}`}
        </p>
      )}

      {/* Templates Grid */}
      {loading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="h-72 animate-pulse bg-muted" />
          ))}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredTemplates.map((template, index) => {
            const templateIntegrations = getTemplateIntegrations(template)
            const hasAllConnected = templateIntegrations.every((p: string) =>
              connectedIntegrations.includes(p)
            )

            return (
              <Card
                key={template.id}
                className="group hover:shadow-lg hover:border-orange-200 dark:hover:border-orange-800/50 transition-all duration-300 overflow-hidden animate-fade-in-up cursor-pointer"
                style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}
                onClick={() => handlePreview(template)}
              >
                <CardContent className="p-0">
                  {/* Preview Area */}
                  <div className="h-40 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800/50 border-b relative overflow-hidden">
                    {template.nodes && template.nodes.length > 0 ? (
                      <TemplateWorkflowPreview
                        nodes={template.nodes}
                        edges={template.connections || template.edges || []}
                        className="w-full h-full"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <Sparkles className="w-10 h-10 text-orange-400/60" />
                      </div>
                    )}

                    {hasAllConnected && (
                      <div className="absolute top-2 left-2">
                        <Badge variant="outline" className="gap-1 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-800 text-[11px]">
                          <Check className="w-3 h-3" />
                          Ready
                        </Badge>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-4 space-y-2.5">
                    <div>
                      <h3 className="font-semibold text-[15px] mb-0.5 line-clamp-1 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">{template.name}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                        {template.description}
                      </p>
                    </div>

                    {/* Integration Badges */}
                    {templateIntegrations.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {templateIntegrations.slice(0, 3).map((providerId: string) => {
                          const isConnected = connectedIntegrations.includes(providerId)
                          return (
                            <Badge
                              key={providerId}
                              variant="outline"
                              className={cn(
                                "text-[11px] capitalize",
                                isConnected && "border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400"
                              )}
                            >
                              {providerId.replace(/-/g, ' ').replace(/_/g, ' ')}
                            </Badge>
                          )
                        })}
                        {templateIntegrations.length > 3 && (
                          <Badge variant="outline" className="text-[11px]">
                            +{templateIntegrations.length - 3} more
                          </Badge>
                        )}
                      </div>
                    )}

                    {/* Meta row */}
                    <div className="flex items-center gap-2 pt-0.5">
                      {template.difficulty && (
                        <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full", getDifficultyStyle(template.difficulty))}>
                          {template.difficulty}
                        </span>
                      )}
                      {template.estimatedTime && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {template.estimatedTime}
                        </span>
                      )}
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
        <div className="text-center py-20 animate-fade-in">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-100 to-rose-100 dark:from-orange-900/30 dark:to-rose-900/30 flex items-center justify-center mb-5">
            <Sparkles className="w-8 h-8 text-orange-500 dark:text-orange-400" />
          </div>
          <h3 className="text-lg font-semibold mb-1">No templates found</h3>
          <p className="text-muted-foreground mb-5 max-w-sm mx-auto text-sm">
            Try adjusting your search or filter to find what you need.
          </p>
          <Button variant="outline" size="sm" onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }}>
            Clear Filters
          </Button>
        </div>
      )}

      {/* Template Detail / Preview Modal */}
      <Dialog open={previewModalOpen} onOpenChange={setPreviewModalOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto p-0">
          {previewTemplate && (
            <>
              {/* Workflow Preview */}
              <div className="h-64 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800/50 border-b">
                {previewTemplate.nodes && previewTemplate.nodes.length > 0 ? (
                  <TemplateWorkflowPreview
                    nodes={previewTemplate.nodes}
                    edges={previewTemplate.connections || previewTemplate.edges || []}
                    className="w-full h-full"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <Sparkles className="w-12 h-12 text-orange-400/50" />
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="p-6 space-y-5">
                <DialogHeader className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <DialogTitle className="text-xl">{previewTemplate.name}</DialogTitle>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {previewTemplate.difficulty && (
                        <span className={cn("text-[11px] font-medium px-2.5 py-1 rounded-full", getDifficultyStyle(previewTemplate.difficulty))}>
                          {previewTemplate.difficulty}
                        </span>
                      )}
                      {previewTemplate.estimatedTime && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary px-2.5 py-1 rounded-full">
                          <Clock className="w-3 h-3" />
                          {previewTemplate.estimatedTime}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{previewTemplate.description}</p>
                </DialogHeader>

                {/* Integration Requirements */}
                {previewIntegrations.length > 0 && (
                  <div className="space-y-2.5">
                    <h4 className="text-sm font-medium text-foreground">Required Integrations</h4>
                    <div className="grid gap-2">
                      {previewIntegrations.map((providerId: string) => {
                        const isConnected = connectedIntegrations.includes(providerId)
                        return (
                          <div
                            key={providerId}
                            className={cn(
                              "flex items-center justify-between px-3 py-2 rounded-lg border text-sm",
                              isConnected
                                ? "border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-500/5"
                                : "border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-500/5"
                            )}
                          >
                            <span className="capitalize font-medium">{providerId.replace(/-/g, ' ').replace(/_/g, ' ')}</span>
                            {isConnected ? (
                              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Connected
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs font-medium">
                                <AlertCircle className="w-3.5 h-3.5" />
                                Not connected
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    {previewIntegrations.some((p: string) => !connectedIntegrations.includes(p)) && (
                      <p className="text-xs text-muted-foreground">
                        You can connect integrations after creating the workflow.
                      </p>
                    )}
                  </div>
                )}

                {/* Category & Tags */}
                {previewTemplate.category && (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{previewTemplate.category}</Badge>
                    {previewTemplate.tags?.slice(0, 4).map((tag: string) => (
                      <Badge key={tag} variant="secondary" className="text-[11px]">{tag}</Badge>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-3 pt-2">
                  <Button
                    className="flex-1 bg-orange-600 hover:bg-orange-700 text-white h-10"
                    onClick={() => handleUseTemplate(previewTemplate)}
                    disabled={copying}
                  >
                    {copying ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        Use This Template
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    className="h-10"
                    onClick={() => setPreviewModalOpen(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
