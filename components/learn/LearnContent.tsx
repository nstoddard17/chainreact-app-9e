"use client"

import { useState, useEffect } from "react"
import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import {
  BookOpen,
  Video,
  FileText,
  Users,
  ExternalLink,
  GraduationCap,
  Zap,
  Code,
  Workflow,
  Bot,
  Edit,
  Plus,
  Trash2
} from "lucide-react"
import Link from "next/link"
import { useAuthStore } from "@/stores/authStore"
import { hasPermission } from "@/lib/utils/roles"
import { toast } from "sonner"

import { logger } from '@/lib/utils/logger'

interface Resource {
  id: string
  title: string
  description: string
  type: 'documentation' | 'video' | 'tutorial' | 'community'
  url: string
  icon: string
  category: string
  order_index?: number
}

// Fallback resources in case database is empty
const fallbackResources: Resource[] = [
  {
    id: "getting-started",
    title: "Getting Started Guide",
    description: "Learn the basics of ChainReact and create your first workflow",
    type: "documentation",
    url: "https://docs.chainreact.app/getting-started",
    icon: 'BookOpen',
    category: "Basics"
  },
  {
    id: "workflow-fundamentals",
    title: "Workflow Fundamentals",
    description: "Understand nodes, connections, and workflow execution",
    type: "tutorial",
    url: "https://docs.chainreact.app/workflows",
    icon: 'Workflow',
    category: "Basics"
  },
  {
    id: "integration-setup",
    title: "Integration Setup",
    description: "Connect your favorite apps and services to ChainReact",
    type: "documentation",
    url: "https://docs.chainreact.app/integrations",
    icon: 'Zap',
    category: "Integrations"
  },
  {
    id: "ai-agent-config",
    title: "AI Agent Configuration",
    description: "Learn how to configure and use AI agents in your workflows",
    type: "tutorial",
    url: "https://docs.chainreact.app/ai-agents",
    icon: 'Bot',
    category: "Advanced"
  },
  {
    id: "video-tutorials",
    title: "Video Tutorials",
    description: "Watch step-by-step video guides for common use cases",
    type: "video",
    url: "https://youtube.com/@chainreact",
    icon: 'Video',
    category: "Videos"
  },
  {
    id: "api-docs",
    title: "API Documentation",
    description: "Build custom integrations using our REST API",
    type: "documentation",
    url: "https://docs.chainreact.app/api",
    icon: 'Code',
    category: "Developer"
  },
  {
    id: "community-forum",
    title: "Community Forum",
    description: "Join discussions, share workflows, and get help from the community",
    type: "community",
    url: "https://community.chainreact.app",
    icon: 'Users',
    category: "Community"
  },
  {
    id: "best-practices",
    title: "Best Practices",
    description: "Learn workflow design patterns and optimization techniques",
    type: "tutorial",
    url: "https://docs.chainreact.app/best-practices",
    icon: 'FileText',
    category: "Advanced"
  }
]

const categories = ["All", "Basics", "Integrations", "Advanced", "Videos", "Developer", "Community"]

export default function LearnContent() {
  const [selectedCategory, setSelectedCategory] = useState("All")
  const [resources, setResources] = useState<Resource[]>([])
  const [editingResource, setEditingResource] = useState<Resource | null>(null)
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { profile } = useAuthStore()

  const isAdmin = profile?.admin === true

  useEffect(() => {
    fetchResources()
  }, [])

  const fetchResources = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/learning')
      const data = await response.json()

      if (data.resources && data.resources.length > 0) {
        setResources(data.resources)
      } else {
        // Use fallback resources if database is empty
        setResources(fallbackResources)
      }
    } catch (error) {
      logger.error('Error fetching resources:', error)
      toast.error('Failed to load learning resources')
      setResources(fallbackResources)
    } finally {
      setLoading(false)
    }
  }

  const filteredResources = selectedCategory === "All"
    ? resources
    : resources.filter(r => r.category === selectedCategory)

  const getTypeColor = (type: Resource['type']) => {
    switch(type) {
      case 'documentation':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300'
      case 'video':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300'
      case 'tutorial':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
      case 'community':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300'
    }
  }

  const getIconComponent = (iconName: string) => {
    switch(iconName) {
      case 'Workflow':
        return <Workflow className="w-5 h-5" />
      case 'BookOpen':
        return <BookOpen className="w-5 h-5" />
      case 'Video':
        return <Video className="w-5 h-5" />
      case 'Zap':
        return <Zap className="w-5 h-5" />
      case 'Bot':
        return <Bot className="w-5 h-5" />
      case 'Code':
        return <Code className="w-5 h-5" />
      case 'Users':
        return <Users className="w-5 h-5" />
      case 'FileText':
        return <FileText className="w-5 h-5" />
      default:
        return <BookOpen className="w-5 h-5" />
    }
  }

  const getIconForType = (type: string) => {
    switch(type) {
      case 'Workflow':
        return <Workflow className="w-5 h-5" />
      case 'BookOpen':
        return <BookOpen className="w-5 h-5" />
      case 'Video':
        return <Video className="w-5 h-5" />
      case 'Zap':
        return <Zap className="w-5 h-5" />
      case 'Bot':
        return <Bot className="w-5 h-5" />
      case 'Code':
        return <Code className="w-5 h-5" />
      case 'Users':
        return <Users className="w-5 h-5" />
      case 'FileText':
        return <FileText className="w-5 h-5" />
      default:
        return <BookOpen className="w-5 h-5" />
    }
  }

  const handleSaveResource = async () => {
    if (!editingResource) return

    setSaving(true)
    try {
      if (isAddingNew) {
        // Create new resource
        const response = await fetch('/api/learning', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: editingResource.title,
            description: editingResource.description,
            type: editingResource.type,
            url: editingResource.url,
            icon: editingResource.icon,
            category: editingResource.category,
          }),
        })

        if (!response.ok) {
          throw new Error('Failed to create resource')
        }

        toast.success('Resource created successfully')
      } else {
        // Update existing resource
        const response = await fetch('/api/learning', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: editingResource.id,
            title: editingResource.title,
            description: editingResource.description,
            type: editingResource.type,
            url: editingResource.url,
            icon: editingResource.icon,
            category: editingResource.category,
          }),
        })

        if (!response.ok) {
          throw new Error('Failed to update resource')
        }

        toast.success('Resource updated successfully')
      }

      // Refresh resources
      await fetchResources()
      setEditingResource(null)
      setIsAddingNew(false)
    } catch (error) {
      logger.error('Error saving resource:', error)
      toast.error('Failed to save resource')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteResource = async (id: string) => {
    if (!confirm('Are you sure you want to delete this resource?')) {
      return
    }

    try {
      const response = await fetch(`/api/learning?id=${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete resource')
      }

      toast.success('Resource deleted successfully')
      await fetchResources()
    } catch (error) {
      logger.error('Error deleting resource:', error)
      toast.error('Failed to delete resource')
    }
  }

  const handleAddNew = () => {
    const newResource: Resource = {
      id: `temp-${Date.now()}`,
      title: "",
      description: "",
      type: "documentation",
      url: "",
      icon: 'BookOpen',
      category: "Basics"
    }
    setEditingResource(newResource)
    setIsAddingNew(true)
  }

  if (loading) {
    return (
      <NewAppLayout title="Learn" subtitle="Explore resources to master ChainReact workflows">
        <div className="space-y-6">
          <div className="animate-pulse">
            <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded-lg mb-6"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-48 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </NewAppLayout>
    )
  }

  return (
    <NewAppLayout title="Learn" subtitle="Explore resources to master ChainReact workflows">
      <div className="space-y-6">
        {/* Quick Start Section - Moved to Top */}
        <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
          <CardHeader>
            <div className="flex items-center gap-3">
              <GraduationCap className="w-6 h-6 text-primary" />
              <CardTitle>New to ChainReact?</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Start with our interactive tutorial to learn the basics in just 10 minutes!
            </p>
            <div className="flex gap-3">
              <Button asChild>
                <Link href="/workflows?tutorial=true">
                  Start Tutorial
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <a href="https://docs.chainreact.app" target="_blank" rel="noopener noreferrer">
                  Read Documentation
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Category Filter with Admin Add Button */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(category)}
                className="transition-all"
              >
                {category}
              </Button>
            ))}
          </div>
          {isAdmin && (
            <Button
              size="sm"
              onClick={handleAddNew}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Resource
            </Button>
          )}
        </div>

        {/* Resources Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredResources.map((resource) => (
            <Card key={resource.id} className="hover:shadow-lg transition-shadow group relative">
              {isAdmin && (
                <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.preventDefault()
                      setEditingResource(resource)
                      setIsAddingNew(false)
                    }}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="destructive"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.preventDefault()
                      handleDeleteResource(resource.id)
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              )}
              <a
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block h-full"
                onClick={(e) => {
                  if (isAdmin && (e.target as HTMLElement).closest('button')) {
                    e.preventDefault()
                  }
                }}
              >
                <CardHeader>
                  <div className="flex items-start justify-between mb-2">
                    <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                      {getIconComponent(resource.icon)}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${getTypeColor(resource.type)}`}>
                      {resource.type}
                    </span>
                  </div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    {resource.title}
                    <ExternalLink className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{resource.description}</CardDescription>
                </CardContent>
              </a>
            </Card>
          ))}
        </div>

        {/* Edit Dialog */}
        <Dialog open={!!editingResource} onOpenChange={() => {
          setEditingResource(null)
          setIsAddingNew(false)
        }}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>
                {isAddingNew ? 'Add New Resource' : 'Edit Resource'}
              </DialogTitle>
              <DialogDescription>
                {isAddingNew
                  ? 'Create a new learning resource for the platform.'
                  : 'Make changes to the learning resource.'}
              </DialogDescription>
            </DialogHeader>
            {editingResource && (
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={editingResource.title}
                    onChange={(e) => setEditingResource({
                      ...editingResource,
                      title: e.target.value
                    })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={editingResource.description}
                    onChange={(e) => setEditingResource({
                      ...editingResource,
                      description: e.target.value
                    })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="url">URL</Label>
                  <Input
                    id="url"
                    type="url"
                    value={editingResource.url}
                    onChange={(e) => setEditingResource({
                      ...editingResource,
                      url: e.target.value
                    })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="type">Type</Label>
                  <Select
                    value={editingResource.type}
                    onValueChange={(value: Resource['type']) => setEditingResource({
                      ...editingResource,
                      type: value
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="documentation">Documentation</SelectItem>
                      <SelectItem value="video">Video</SelectItem>
                      <SelectItem value="tutorial">Tutorial</SelectItem>
                      <SelectItem value="community">Community</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={editingResource.category}
                    onValueChange={(value) => setEditingResource({
                      ...editingResource,
                      category: value
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.filter(c => c !== "All").map(category => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="icon">Icon</Label>
                  <Select
                    value={editingResource.icon || "BookOpen"}
                    onValueChange={(value) => setEditingResource({
                      ...editingResource,
                      icon: value
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BookOpen">Book</SelectItem>
                      <SelectItem value="Video">Video</SelectItem>
                      <SelectItem value="FileText">File Text</SelectItem>
                      <SelectItem value="Users">Users</SelectItem>
                      <SelectItem value="Zap">Lightning</SelectItem>
                      <SelectItem value="Code">Code</SelectItem>
                      <SelectItem value="Workflow">Workflow</SelectItem>
                      <SelectItem value="Bot">Bot</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setEditingResource(null)
                setIsAddingNew(false)
              }}>
                Cancel
              </Button>
              <Button onClick={handleSaveResource} disabled={saving}>
                {saving ? 'Saving...' : (isAddingNew ? 'Add Resource' : 'Save Changes')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </NewAppLayout>
  )
}