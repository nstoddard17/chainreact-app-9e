"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ProfessionalSearch } from "@/components/ui/professional-search"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import {
  Calendar,
  Database,
  MessageSquare,
  FileText,
  Users,
  ShoppingCart,
  BarChart3,
  Clock,
  Star,
  Download,
  Play,
  Search,
  Filter,
  Plus,
  Eye,
  Save,
  Trash2,
  Copy,
  CheckCircle,
  XCircle,
  Heart,
  Share2,
  Bookmark,
  Settings,
  Zap,
  Bot,
  CreditCard,
  HelpCircle,
  AlertTriangle,
  Bug,
} from "lucide-react"
import { toast } from "sonner"
import { useAuthStore } from "@/stores/authStore"

interface Template {
  id: string
  title: string
  description: string
  category: string
  difficulty: "Beginner" | "Intermediate" | "Advanced"
  time: string
  rating: number
  downloads: number
  integrations: string[]
  icon: any
  gradient: string
  steps: string[]
  created_by?: string
  is_public: boolean
  is_personal: boolean
  workflow_data?: any
  tags: string[]
  created_at: string
  updated_at: string
}

const defaultTemplates: Template[] = [
  {
    id: "1",
    title: "Slack to Email Notifications",
    description: "Automatically send email notifications when important messages are posted in specific Slack channels",
    category: "Communication",
    difficulty: "Beginner",
    time: "5 min",
    rating: 4.8,
    downloads: 1250,
    integrations: ["Slack", "Gmail"],
    icon: MessageSquare,
    gradient: "from-indigo-500 to-purple-600",
    steps: [
      "Connect Slack workspace",
      "Select channels to monitor",
      "Configure email recipients",
      "Set notification triggers",
    ],
    is_public: true,
    is_personal: false,
    tags: ["slack", "email", "notifications"],
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "2",
    title: "Google Calendar to Trello Cards",
    description: "Create Trello cards automatically when new events are added to your Google Calendar",
    category: "Productivity",
    difficulty: "Beginner",
    time: "3 min",
    rating: 4.9,
    downloads: 980,
    integrations: ["Google Calendar", "Trello"],
    icon: Calendar,
    gradient: "from-purple-500 to-blue-600",
    steps: ["Connect Google Calendar", "Link Trello board", "Map calendar fields to card details", "Test automation"],
    is_public: true,
    is_personal: false,
    tags: ["calendar", "trello", "productivity"],
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "3",
    title: "Lead Generation Pipeline",
    description: "Capture leads from multiple sources and automatically add them to your CRM with follow-up tasks",
    category: "Sales",
    difficulty: "Intermediate",
    time: "15 min",
    rating: 4.7,
    downloads: 2100,
    integrations: ["HubSpot", "Slack", "Gmail"],
    icon: Users,
    gradient: "from-blue-500 to-green-600",
    steps: [
      "Set up lead capture forms",
      "Connect CRM integration",
      "Configure lead scoring",
      "Set up notification workflows",
    ],
    is_public: true,
    is_personal: false,
    tags: ["sales", "crm", "leads"],
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "4",
    title: "E-commerce Order Processing",
    description: "Automate order fulfillment from Shopify to inventory management and customer notifications",
    category: "E-commerce",
    difficulty: "Advanced",
    time: "25 min",
    rating: 4.6,
    downloads: 1800,
    integrations: ["Shopify", "Stripe", "Mailchimp"],
    icon: ShoppingCart,
    gradient: "from-green-500 to-amber-600",
    steps: [
      "Connect Shopify store",
      "Set up payment processing",
      "Configure inventory tracking",
      "Create customer email sequences",
    ],
    is_public: true,
    is_personal: false,
    tags: ["ecommerce", "shopify", "orders"],
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "5",
    title: "Social Media Content Scheduler",
    description: "Schedule and publish content across multiple social media platforms from a single workflow",
    category: "Marketing",
    difficulty: "Intermediate",
    time: "12 min",
    rating: 4.5,
    downloads: 1650,
    integrations: ["Twitter", "Facebook", "LinkedIn"],
    icon: BarChart3,
    gradient: "from-amber-500 to-rose-600",
    steps: [
      "Connect social accounts",
      "Create content calendar",
      "Set posting schedules",
      "Monitor engagement metrics",
    ],
    is_public: true,
    is_personal: false,
    tags: ["social-media", "marketing", "scheduling"],
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "6",
    title: "Document Approval Workflow",
    description: "Streamline document reviews with automated approval chains and notifications",
    category: "Business Process",
    difficulty: "Intermediate",
    time: "18 min",
    rating: 4.8,
    downloads: 920,
    integrations: ["Google Drive", "Slack", "DocuSign"],
    icon: FileText,
    gradient: "from-rose-500 to-indigo-600",
    steps: [
      "Set up document triggers",
      "Define approval hierarchy",
      "Configure notification rules",
      "Add digital signature flow",
    ],
    is_public: true,
    is_personal: false,
    tags: ["documents", "approval", "workflow"],
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "7",
    title: "Customer Support Ticket Routing",
    description: "Automatically route support tickets to the right team members based on priority and expertise",
    category: "Customer Support",
    difficulty: "Advanced",
    time: "20 min",
    rating: 4.7,
    downloads: 1400,
    integrations: ["Zendesk", "Slack", "Teams"],
    icon: MessageSquare,
    gradient: "from-indigo-500 to-blue-600",
    steps: [
      "Connect support platform",
      "Set up routing rules",
      "Configure escalation paths",
      "Create team notifications",
    ],
    is_public: true,
    is_personal: false,
    tags: ["support", "routing", "tickets"],
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "8",
    title: "Data Backup & Sync",
    description: "Automatically backup important files and sync data across multiple cloud storage platforms",
    category: "Data Management",
    difficulty: "Beginner",
    time: "8 min",
    rating: 4.9,
    downloads: 2300,
    integrations: ["Google Drive", "Dropbox", "OneDrive"],
    icon: Database,
    gradient: "from-purple-500 to-green-600",
    steps: [
      "Connect cloud storage accounts",
      "Select files to backup",
      "Set sync schedules",
      "Configure backup notifications",
    ],
    is_public: true,
    is_personal: false,
    tags: ["backup", "sync", "data"],
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
]

const categories = [
  "All",
  "Communication",
  "Productivity",
  "Sales",
  "E-commerce",
  "Marketing",
  "Business Process",
  "Customer Support",
  "Data Management",
]
const difficulties = ["All", "Beginner", "Intermediate", "Advanced"]

export function TemplatesContent() {
  const { profile } = useAuthStore()
  const [templates, setTemplates] = useState<Template[]>(defaultTemplates)
  const [personalTemplates, setPersonalTemplates] = useState<Template[]>([])
  const [selectedCategory, setSelectedCategory] = useState("All")
  const [selectedDifficulty, setSelectedDifficulty] = useState("All")
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState("public")
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [newTemplate, setNewTemplate] = useState({
    title: "",
    description: "",
    category: "Communication",
    difficulty: "Beginner" as const,
    integrations: [] as string[],
    tags: [] as string[],
    steps: [] as string[],
    is_public: false,
  })

  const filteredTemplates = templates.filter((template) => {
    const matchesCategory = selectedCategory === "All" || template.category === selectedCategory
    const matchesDifficulty = selectedDifficulty === "All" || template.difficulty === selectedDifficulty
    const matchesSearch =
      template.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))

    return matchesCategory && matchesDifficulty && matchesSearch
  })

  const filteredPersonalTemplates = personalTemplates.filter((template) => {
    const matchesCategory = selectedCategory === "All" || template.category === selectedCategory
    const matchesDifficulty = selectedDifficulty === "All" || template.difficulty === selectedDifficulty
    const matchesSearch =
      template.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))

    return matchesCategory && matchesDifficulty && matchesSearch
  })

  const handleCreateTemplate = async () => {
    if (!newTemplate.title || !newTemplate.description) {
      toast.error("Please fill in all required fields")
      return
    }

    const template: Template = {
      id: Date.now().toString(),
      ...newTemplate,
      rating: 0,
      downloads: 0,
      time: "5 min",
      icon: Zap,
      gradient: "from-blue-500 to-purple-600",
      created_by: profile?.id,
      is_personal: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    setPersonalTemplates([...personalTemplates, template])
    setNewTemplate({
      title: "",
      description: "",
      category: "Communication",
      difficulty: "Beginner",
      integrations: [],
      tags: [],
      steps: [],
      is_public: false,
    })
    setShowCreateModal(false)
    toast.success("Template created successfully!")
  }

  const handleUseTemplate = (template: Template) => {
    // Navigate to workflow builder with template data
    window.location.href = `/workflows/builder?template=${template.id}`
  }

  const handlePreviewTemplate = (template: Template) => {
    setSelectedTemplate(template)
    setShowPreviewModal(true)
  }

  const handleSaveToPersonal = (template: Template) => {
    const personalTemplate: Template = {
      ...template,
      id: `personal-${Date.now()}`,
      is_personal: true,
      created_by: profile?.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setPersonalTemplates([...personalTemplates, personalTemplate])
    toast.success("Template saved to personal templates!")
  }

  const handleDeletePersonalTemplate = (templateId: string) => {
    setPersonalTemplates(personalTemplates.filter(t => t.id !== templateId))
    toast.success("Template deleted!")
  }

  const renderTemplateCard = (template: Template, isPersonal = false) => {
    const IconComponent = template.icon
    return (
      <Card
        key={template.id}
        className="group hover:shadow-xl transition-all duration-300 border-gray-200 hover:border-indigo-300 bg-white hover:scale-105"
      >
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between mb-4">
            <div className={`p-3 rounded-lg bg-gradient-to-r ${template.gradient} text-white`}>
              <IconComponent className="h-6 w-6" />
            </div>
            <div className="flex items-center gap-1 text-sm text-gray-500">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              {template.rating}
            </div>
          </div>
          <CardTitle className="text-xl font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">
            {template.title}
          </CardTitle>
          <CardDescription className="text-gray-600 line-clamp-2">{template.description}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="bg-indigo-100 text-indigo-700">
              {template.category}
            </Badge>
            <Badge
              variant="outline"
              className={`${
                template.difficulty === "Beginner"
                  ? "border-green-300 text-green-700"
                  : template.difficulty === "Intermediate"
                    ? "border-amber-300 text-amber-700"
                    : "border-red-300 text-red-700"
              }`}
            >
              {template.difficulty}
            </Badge>
            {template.is_personal && (
              <Badge variant="outline" className="border-blue-300 text-blue-700">
                Personal
              </Badge>
            )}
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-1">
            {template.tags.slice(0, 3).map((tag, index) => (
              <span key={index} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                #{tag}
              </span>
            ))}
            {template.tags.length > 3 && (
              <span className="text-xs text-gray-500">+{template.tags.length - 3} more</span>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center justify-between text-sm text-gray-500">
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {template.time} setup
            </div>
            <div className="flex items-center gap-1">
              <Download className="h-4 w-4" />
              {template.downloads.toLocaleString()}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4">
            <Button 
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={() => handleUseTemplate(template)}
            >
              Use Template
            </Button>
            <Button 
              variant="outline" 
              className="border-indigo-300 text-indigo-600 hover:bg-indigo-50"
              onClick={() => handlePreviewTemplate(template)}
            >
              <Eye className="w-4 h-4" />
            </Button>
            {!isPersonal && (
              <Button 
                variant="outline" 
                className="border-green-300 text-green-600 hover:bg-green-50"
                onClick={() => handleSaveToPersonal(template)}
              >
                <Bookmark className="w-4 h-4" />
              </Button>
            )}
            {isPersonal && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="border-red-300 text-red-600 hover:bg-red-50">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Template</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete "{template.title}"? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDeletePersonalTemplate(template.id)}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <section className="relative py-20 bg-gradient-to-br from-indigo-600 via-purple-600 to-blue-700 text-white overflow-hidden">
        <div className="absolute inset-0 bg-black/20"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">Automation Templates</h1>
          <p className="text-xl md:text-2xl mb-8 text-indigo-100 max-w-3xl mx-auto">
            Get started quickly with pre-built workflows. Choose from hundreds of templates designed by automation
            experts.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
              <DialogTrigger asChild>
                <Button className="bg-white text-indigo-600 hover:bg-indigo-50 px-8 py-3 text-lg">
                  <Plus className="mr-2 h-5 w-5" />
                  Create Template
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create New Template</DialogTitle>
                  <DialogDescription>
                    Share your workflow template with the community or keep it private for personal use.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="title">Template Title</Label>
                    <Input
                      id="title"
                      value={newTemplate.title}
                      onChange={(e) => setNewTemplate({ ...newTemplate, title: e.target.value })}
                      placeholder="Enter template title"
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={newTemplate.description}
                      onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                      placeholder="Describe what this template does"
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="category">Category</Label>
                      <Select value={newTemplate.category} onValueChange={(value) => setNewTemplate({ ...newTemplate, category: value })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.slice(1).map((category) => (
                            <SelectItem key={category} value={category}>
                              {category}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="difficulty">Difficulty</Label>
                      <Select value={newTemplate.difficulty} onValueChange={(value: any) => setNewTemplate({ ...newTemplate, difficulty: value })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {difficulties.slice(1).map((difficulty) => (
                            <SelectItem key={difficulty} value={difficulty}>
                              {difficulty}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="tags">Tags (comma-separated)</Label>
                    <Input
                      id="tags"
                      value={newTemplate.tags.join(", ")}
                      onChange={(e) => setNewTemplate({ ...newTemplate, tags: e.target.value.split(",").map(tag => tag.trim()).filter(tag => tag) })}
                      placeholder="slack, email, notifications"
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="is_public"
                      checked={newTemplate.is_public}
                      onChange={(e) => setNewTemplate({ ...newTemplate, is_public: e.target.checked })}
                    />
                    <Label htmlFor="is_public">Make this template public</Label>
                  </div>
                </div>
                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateTemplate}>
                    Create Template
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Button className="border-2 border-white text-white bg-transparent hover:bg-white hover:text-indigo-600 px-8 py-3 text-lg">
              Browse Templates
            </Button>
          </div>
        </div>
      </section>

      {/* Search and Filters */}
      <section className="py-12 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Search */}
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">Search Templates</label>
                <ProfessionalSearch
                  placeholder="Search by name, description, or tags..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onClear={() => setSearchQuery('')}
                  className="w-full"
                />
              </div>

              {/* Category Filter */}
              <div className="lg:w-64">
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <div className="relative">
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full px-4 py-4 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 bg-gray-50 hover:bg-white transition-colors appearance-none cursor-pointer"
                  >
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category === "All" ? "All Categories" : category}
                      </option>
                    ))}
                  </select>
                  <Filter className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5 pointer-events-none" />
                </div>
              </div>

              {/* Difficulty Filter */}
              <div className="lg:w-48">
                <label className="block text-sm font-medium text-gray-700 mb-2">Difficulty</label>
                <div className="relative">
                  <select
                    value={selectedDifficulty}
                    onChange={(e) => setSelectedDifficulty(e.target.value)}
                    className="w-full px-4 py-4 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 bg-gray-50 hover:bg-white transition-colors appearance-none cursor-pointer"
                  >
                    {difficulties.map((difficulty) => (
                      <option key={difficulty} value={difficulty}>
                        {difficulty === "All" ? "All Levels" : difficulty}
                      </option>
                    ))}
                  </select>
                  <BarChart3 className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5 pointer-events-none" />
                </div>
              </div>

              {/* Clear Filters Button */}
              {(selectedCategory !== "All" || selectedDifficulty !== "All" || searchQuery !== "") && (
                <div className="lg:w-auto flex items-end">
                  <Button
                    onClick={() => {
                      setSelectedCategory("All")
                      setSelectedDifficulty("All")
                      setSearchQuery("")
                    }}
                    variant="outline"
                    className="px-6 py-4 border-2 border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                  >
                    Clear All
                  </Button>
                </div>
              )}
            </div>

            {/* Active Filters Display */}
            {(selectedCategory !== "All" || selectedDifficulty !== "All" || searchQuery !== "") && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">Active filters:</span>
                  {searchQuery && (
                    <Badge variant="secondary" className="bg-indigo-100 text-indigo-700 px-3 py-1">
                      Search: "{searchQuery}"
                    </Badge>
                  )}
                  {selectedCategory !== "All" && (
                    <Badge variant="secondary" className="bg-purple-100 text-purple-700 px-3 py-1">
                      Category: {selectedCategory}
                    </Badge>
                  )}
                  {selectedDifficulty !== "All" && (
                    <Badge variant="secondary" className="bg-blue-100 text-blue-700 px-3 py-1">
                      Level: {selectedDifficulty}
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Templates Tabs */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="public">Public Templates ({filteredTemplates.length})</TabsTrigger>
              <TabsTrigger value="personal">My Templates ({filteredPersonalTemplates.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="public" className="space-y-8">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold text-gray-900 mb-4">{filteredTemplates.length} Public Templates Found</h2>
                <p className="text-lg text-gray-600">Choose a template to get started or customize it to fit your needs</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredTemplates.map((template) => renderTemplateCard(template))}
              </div>

              {filteredTemplates.length === 0 && (
                <div className="text-center py-12">
                  <div className="text-gray-400 mb-4">
                    <Filter className="h-16 w-16 mx-auto" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-600 mb-2">No templates found</h3>
                  <p className="text-gray-500">Try adjusting your search criteria or browse all templates</p>
                  <Button
                    onClick={() => {
                      setSelectedCategory("All")
                      setSelectedDifficulty("All")
                      setSearchQuery("")
                    }}
                    className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    Clear Filters
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="personal" className="space-y-8">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold text-gray-900 mb-4">{filteredPersonalTemplates.length} Personal Templates</h2>
                <p className="text-lg text-gray-600">Your saved and created templates</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredPersonalTemplates.map((template) => renderTemplateCard(template, true))}
              </div>

              {filteredPersonalTemplates.length === 0 && (
                <div className="text-center py-12">
                  <div className="text-gray-400 mb-4">
                    <Bookmark className="h-16 w-16 mx-auto" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-600 mb-2">No personal templates yet</h3>
                  <p className="text-gray-500">Save templates from the public gallery or create your own</p>
                  <Button
                    onClick={() => setShowCreateModal(true)}
                    className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    Create Template
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </section>

      {/* Template Preview Modal */}
      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedTemplate && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center space-x-3">
                  <div className={`p-2 rounded-lg bg-gradient-to-r ${selectedTemplate.gradient} text-white`}>
                    <selectedTemplate.icon className="h-5 w-5" />
                  </div>
                  <span>{selectedTemplate.title}</span>
                </DialogTitle>
                <DialogDescription>{selectedTemplate.description}</DialogDescription>
              </DialogHeader>
              
              <div className="space-y-6">
                {/* Template Details */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Category</Label>
                    <p className="text-gray-900">{selectedTemplate.category}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Difficulty</Label>
                    <p className="text-gray-900">{selectedTemplate.difficulty}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Setup Time</Label>
                    <p className="text-gray-900">{selectedTemplate.time}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Rating</Label>
                    <p className="text-gray-900">{selectedTemplate.rating} ⭐</p>
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <Label className="text-sm font-medium text-gray-700">Tags</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedTemplate.tags.map((tag, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Setup Steps */}
                <div>
                  <Label className="text-sm font-medium text-gray-700">Setup Steps</Label>
                  <ol className="list-decimal list-inside space-y-2 mt-2">
                    {selectedTemplate.steps.map((step, index) => (
                      <li key={index} className="text-gray-900">{step}</li>
                    ))}
                  </ol>
                </div>

                {/* Integrations */}
                <div>
                  <Label className="text-sm font-medium text-gray-700">Required Integrations</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedTemplate.integrations.map((integration, index) => (
                      <Badge key={index} variant="outline">
                        {integration}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-6 border-t">
                <Button variant="outline" onClick={() => setShowPreviewModal(false)}>
                  Close
                </Button>
                <Button onClick={() => handleUseTemplate(selectedTemplate)}>
                  Use This Template
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold mb-4">Can't find what you're looking for?</h2>
          <p className="text-xl text-indigo-100 mb-8 max-w-2xl mx-auto">
            Create your own custom automation workflow or request a template from our community
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              className="bg-white text-indigo-600 hover:bg-indigo-50 px-8 py-3 text-lg"
              onClick={() => window.location.href = '/workflows/builder'}
            >
              Create Custom Workflow
            </Button>
            <Button 
              className="border-2 border-white text-white bg-transparent hover:bg-white hover:text-indigo-600 px-8 py-3 text-lg"
              onClick={() => setShowCreateModal(true)}
            >
              Create Template
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}

export default TemplatesContent
