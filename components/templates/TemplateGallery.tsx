"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Search, Copy, Eye, Loader2, Edit } from "lucide-react"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { useAuthStore } from "@/stores/authStore"

interface Template {
  id: string
  name: string
  description: string
  category: string
  tags: string[]
  workflow_json: any
  created_at: string
  creator?: {
    email: string
  }
  is_predefined?: boolean
  difficulty?: string
  estimatedTime?: string
  integrations?: string[]
}

const categories = [
  "all",
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

export function TemplateGallery() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [predefinedTemplates, setPredefinedTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [copying, setCopying] = useState<string | null>(null)
  const [showPredefined, setShowPredefined] = useState(true)
  const router = useRouter()
  const { toast } = useToast()
  const { profile } = useAuthStore()
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
      const response = await fetch(`/api/templates/${templateId}/copy`, {
        method: "POST",
      })

      const data = await response.json()

      if (data.workflow) {
        toast({
          title: "Success",
          description: "Template copied to your workflows",
        })
        router.push(`/workflows/builder?id=${data.workflow.id}`)
      } else {
        throw new Error(data.error || "Failed to copy template")
      }
    } catch (error) {
      console.error("Error copying template:", error)
      toast({
        title: "Error",
        description: "Failed to copy template",
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

  const allTemplates = showPredefined ? [...predefinedTemplates, ...filteredTemplates] : filteredTemplates

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
            <Card key={template.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-start gap-2">
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                      {template.is_predefined && (
                        <Badge className="bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0">
                          Official
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="mt-1">{template.description}</CardDescription>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-3">
                  <Badge variant="secondary">{template.category}</Badge>
                  {template.difficulty && (
                    <Badge variant="outline" className="text-xs">
                      {template.difficulty}
                    </Badge>
                  )}
                  {template.estimatedTime && (
                    <Badge variant="outline" className="text-xs">
                      ⏱️ {template.estimatedTime}
                    </Badge>
                  )}
                  {template.tags?.slice(0, 2).map((tag, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardHeader>

              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-500">
                    by {template.creator?.email?.split("@")[0] || "Anonymous"}
                  </div>

                  <div className="flex gap-2">
                    {isAdmin && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => {
                          // Create a copy of the template and open in workflow builder for editing
                          router.push(`/workflows/builder?template=${template.id}&edit=true`)
                        }}
                        title="Edit Template"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    )}
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" onClick={() => setSelectedTemplate(template)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>{selectedTemplate?.name}</DialogTitle>
                          <DialogDescription>{selectedTemplate?.description}</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <h4 className="font-medium mb-2">Workflow Structure</h4>
                            <div className="bg-gray-50 p-4 rounded-lg">
                              <p className="text-sm text-gray-600">
                                {selectedTemplate?.workflow_json?.nodes?.length || 0} nodes,{" "}
                                {selectedTemplate?.workflow_json?.connections?.length || 0} connections
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              onClick={() => selectedTemplate && handleCopyTemplate(selectedTemplate.id)}
                              disabled={copying === selectedTemplate?.id}
                              className="flex-1"
                            >
                              {copying === selectedTemplate?.id ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Copying...
                                </>
                              ) : (
                                <>
                                  <Copy className="h-4 w-4 mr-2" />
                                  Use Template
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>

                    <Button
                      size="sm"
                      onClick={() => handleCopyTemplate(template.id)}
                      disabled={copying === template.id}
                    >
                      {copying === template.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Copy className="h-4 w-4" />
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
    </div>
  )
}
