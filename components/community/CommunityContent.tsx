"use client"

import { useState, useEffect } from "react"
import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ProfessionalSearch } from "@/components/ui/professional-search"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import {
  MessageSquare,
  Users,
  TrendingUp,
  Calendar,
  Heart,
  Reply,
  Share,
  Bookmark,
  Plus,
  Search,
  Filter,
  Zap,
  FileText,
  Video,
  Star,
  Clock,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Flag,
  Edit,
  Trash2,
  Link,
  Download,
  Play,
  Settings,
  Bot,
  CreditCard,
  HelpCircle,
  AlertTriangle,
  Bug,
  Database,
  Globe,
  Shield,
  Target,
  Trophy,
  Lightbulb,
  Code,
} from "lucide-react"
import { toast } from "sonner"
import { useAuthStore } from "@/stores/authStore"

interface Discussion {
  id: string
  title: string
  content: string
  author: {
    id: string
    name: string
    avatar: string
    role: string
  }
  category: string
  replies: number
  likes: number
  dislikes: number
  views: number
  timeAgo: string
  isAnswered: boolean
  isBookmarked: boolean
  tags: string[]
  created_at: string
  updated_at: string
}

interface DiscussionReply {
  id: string
  discussion_id: string
  author: {
    id: string
    name: string
    avatar: string
    role: string
  }
  content: string
  likes: number
  dislikes: number
  isAccepted: boolean
  created_at: string
}

interface SharedTemplate {
  id: string
  title: string
  description: string
  category: string
  difficulty: "Beginner" | "Intermediate" | "Advanced"
  author: {
    id: string
    name: string
    avatar: string
  }
  downloads: number
  rating: number
  tags: string[]
  created_at: string
  isBookmarked: boolean
}

interface Event {
  id: string
  title: string
  description: string
  date: string
  time: string
  attendees: number
  maxAttendees: number
  type: string
  isRegistered: boolean
  created_at: string
}

const discussions: Discussion[] = [
  {
    id: "1",
    title: "Best practices for error handling in complex workflows",
    content: "I've been working on some complex workflows and I'm looking for best practices on error handling. What strategies do you use to ensure your workflows are robust and can handle unexpected errors gracefully?",
    author: {
      id: "user1",
      name: "Alex Chen",
      avatar: "/placeholder.svg?height=40&width=40&text=AC",
      role: "Workflow Expert",
    },
    category: "Best Practices",
    replies: 23,
    likes: 45,
    dislikes: 2,
    views: 1200,
    timeAgo: "2 hours ago",
    isAnswered: true,
    isBookmarked: false,
    tags: ["error-handling", "workflows", "best-practices"],
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "2",
    title: "How to integrate with custom APIs that require OAuth 2.0?",
    content: "I'm trying to integrate with a third-party API that uses OAuth 2.0 authentication. Has anyone successfully implemented this in ChainReact? I'd love to see some examples or get guidance on the best approach.",
    author: {
      id: "user2",
      name: "Sarah Johnson",
      avatar: "/placeholder.svg?height=40&width=40&text=SJ",
      role: "Developer",
    },
    category: "Integrations",
    replies: 12,
    likes: 28,
    dislikes: 1,
    views: 856,
    timeAgo: "4 hours ago",
    isAnswered: false,
    isBookmarked: true,
    tags: ["oauth", "api", "integrations"],
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "3",
    title: "Sharing my workflow template for automated social media posting",
    content: "I've created a comprehensive workflow template for automated social media posting across multiple platforms. It includes content scheduling, hashtag optimization, and engagement tracking. Happy to share and get feedback!",
    author: {
      id: "user3",
      name: "Mike Rodriguez",
      avatar: "/placeholder.svg?height=40&width=40&text=MR",
      role: "Community Contributor",
    },
    category: "Templates",
    replies: 8,
    likes: 67,
    dislikes: 0,
    views: 2100,
    timeAgo: "1 day ago",
    isAnswered: false,
    isBookmarked: false,
    tags: ["template", "social-media", "automation"],
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "4",
    title: "Performance optimization tips for high-volume workflows",
    content: "We're running workflows that process thousands of records daily. Looking for tips on optimizing performance, reducing execution time, and handling large datasets efficiently. What strategies have worked for you?",
    author: {
      id: "user4",
      name: "Dr. Emily Watson",
      avatar: "/placeholder.svg?height=40&width=40&text=EW",
      role: "Technical Lead",
    },
    category: "Performance",
    replies: 34,
    likes: 89,
    dislikes: 3,
    views: 3400,
    timeAgo: "2 days ago",
    isAnswered: true,
    isBookmarked: false,
    tags: ["performance", "optimization", "scaling"],
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
]

const sharedTemplates: SharedTemplate[] = [
  {
    id: "1",
    title: "E-commerce Order Processing",
    description: "Complete workflow for processing e-commerce orders with inventory management and customer notifications",
    category: "E-commerce",
    difficulty: "Intermediate",
    author: {
      id: "user1",
      name: "Alex Chen",
      avatar: "/placeholder.svg?height=40&width=40&text=AC",
    },
    downloads: 1250,
    rating: 4.8,
    tags: ["ecommerce", "orders", "inventory"],
    created_at: "2024-01-01T00:00:00Z",
    isBookmarked: false,
  },
  {
    id: "2",
    title: "Lead Generation Pipeline",
    description: "Automated lead capture and CRM integration with follow-up sequences",
    category: "Sales",
    difficulty: "Advanced",
    author: {
      id: "user2",
      name: "Sarah Johnson",
      avatar: "/placeholder.svg?height=40&width=40&text=SJ",
    },
    downloads: 890,
    rating: 4.9,
    tags: ["sales", "leads", "crm"],
    created_at: "2024-01-01T00:00:00Z",
    isBookmarked: true,
  },
  {
    id: "3",
    title: "Social Media Content Scheduler",
    description: "Multi-platform social media scheduling with content optimization",
    category: "Marketing",
    difficulty: "Beginner",
    author: {
      id: "user3",
      name: "Mike Rodriguez",
      avatar: "/placeholder.svg?height=40&width=40&text=MR",
    },
    downloads: 2100,
    rating: 4.7,
    tags: ["social-media", "scheduling", "marketing"],
    created_at: "2024-01-01T00:00:00Z",
    isBookmarked: false,
  },
]

const events: Event[] = [
  {
    id: "1",
    title: "Weekly Community Call",
    description: "Join us for our weekly community call where we discuss new features, share tips, and answer questions",
    date: "Tomorrow",
    time: "2:00 PM EST",
    attendees: 45,
    maxAttendees: 100,
    type: "Virtual Meeting",
    isRegistered: false,
    created_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "2",
    title: "Workflow Building Workshop",
    description: "Hands-on workshop where you'll build a complete workflow from scratch with expert guidance",
    date: "Friday",
    time: "10:00 AM EST",
    attendees: 23,
    maxAttendees: 30,
    type: "Workshop",
    isRegistered: true,
    created_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "3",
    title: "Integration Showcase",
    description: "See the latest integrations and learn how to use them effectively in your workflows",
    date: "Next Monday",
    time: "3:00 PM EST",
    attendees: 67,
    maxAttendees: 150,
    type: "Presentation",
    isRegistered: false,
    created_at: "2024-01-01T00:00:00Z",
  },
]

const topContributors = [
  {
    name: "Alex Chen",
    avatar: "/placeholder.svg?height=40&width=40&text=AC",
    points: 2450,
    badge: "Expert",
  },
  {
    name: "Sarah Johnson",
    avatar: "/placeholder.svg?height=40&width=40&text=SJ",
    points: 1890,
    badge: "Helper",
  },
  {
    name: "Mike Rodriguez",
    avatar: "/placeholder.svg?height=40&width=40&text=MR",
    points: 1650,
    badge: "Contributor",
  },
]

const categories = ["All", "Best Practices", "Integrations", "Templates", "Performance", "Help", "General"]
const templateCategories = ["All", "E-commerce", "Sales", "Marketing", "Productivity", "Data Management", "Customer Support"]

export default function CommunityContent() {
  const { profile } = useAuthStore()
  const [allDiscussions, setAllDiscussions] = useState<Discussion[]>(discussions)
  const [allSharedTemplates, setAllSharedTemplates] = useState<SharedTemplate[]>(sharedTemplates)
  const [allEvents, setAllEvents] = useState<Event[]>(events)
  const [selectedCategory, setSelectedCategory] = useState("All")
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState("discussions")
  const [showCreateDiscussionModal, setShowCreateDiscussionModal] = useState(false)
  const [showShareTemplateModal, setShowShareTemplateModal] = useState(false)
  const [selectedDiscussion, setSelectedDiscussion] = useState<Discussion | null>(null)
  const [showDiscussionModal, setShowDiscussionModal] = useState(false)
  const [newDiscussion, setNewDiscussion] = useState({
    title: "",
    content: "",
    category: "General",
    tags: [] as string[],
  })
  const [newTemplate, setNewTemplate] = useState({
    title: "",
    description: "",
    category: "Productivity",
    difficulty: "Beginner" as const,
    tags: [] as string[],
  })

  const filteredDiscussions = allDiscussions.filter((discussion) => {
    const matchesCategory = selectedCategory === "All" || discussion.category === selectedCategory
    const matchesSearch =
      discussion.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      discussion.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      discussion.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))

    return matchesCategory && matchesSearch
  })

  const filteredTemplates = allSharedTemplates.filter((template) => {
    const matchesCategory = selectedCategory === "All" || template.category === selectedCategory
    const matchesSearch =
      template.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))

    return matchesCategory && matchesSearch
  })

  const handleCreateDiscussion = () => {
    if (!newDiscussion.title || !newDiscussion.content) {
      toast.error("Please fill in all required fields")
      return
    }

    const discussion: Discussion = {
      id: Date.now().toString(),
      ...newDiscussion,
      author: {
        id: profile?.id || "user",
        name: profile?.full_name || "Anonymous",
        avatar: "/placeholder.svg?height=40&width=40&text=U",
        role: "Community Member",
      },
      replies: 0,
      likes: 0,
      dislikes: 0,
      views: 0,
      timeAgo: "Just now",
      isAnswered: false,
      isBookmarked: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    setAllDiscussions([discussion, ...allDiscussions])
    setNewDiscussion({
      title: "",
      content: "",
      category: "General",
      tags: [],
    })
    setShowCreateDiscussionModal(false)
    toast.success("Discussion created successfully!")
  }

  const handleShareTemplate = () => {
    if (!newTemplate.title || !newTemplate.description) {
      toast.error("Please fill in all required fields")
      return
    }

    const template: SharedTemplate = {
      id: Date.now().toString(),
      ...newTemplate,
      author: {
        id: profile?.id || "user",
        name: profile?.full_name || "Anonymous",
        avatar: "/placeholder.svg?height=40&width=40&text=U",
      },
      downloads: 0,
      rating: 0,
      created_at: new Date().toISOString(),
      isBookmarked: false,
    }

    setAllSharedTemplates([template, ...allSharedTemplates])
    setNewTemplate({
      title: "",
      description: "",
      category: "Productivity",
      difficulty: "Beginner",
      tags: [],
    })
    setShowShareTemplateModal(false)
    toast.success("Template shared successfully!")
  }

  const handleLikeDiscussion = (discussionId: string) => {
    setAllDiscussions(allDiscussions.map(discussion =>
      discussion.id === discussionId
        ? { ...discussion, likes: discussion.likes + 1 }
        : discussion
    ))
  }

  const handleBookmarkDiscussion = (discussionId: string) => {
    setAllDiscussions(allDiscussions.map(discussion =>
      discussion.id === discussionId
        ? { ...discussion, isBookmarked: !discussion.isBookmarked }
        : discussion
    ))
    toast.success("Discussion bookmarked!")
  }

  const handleBookmarkTemplate = (templateId: string) => {
    setAllSharedTemplates(allSharedTemplates.map(template =>
      template.id === templateId
        ? { ...template, isBookmarked: !template.isBookmarked }
        : template
    ))
    toast.success("Template bookmarked!")
  }

  const handleRegisterEvent = (eventId: string) => {
    setAllEvents(allEvents.map(event =>
      event.id === eventId
        ? { ...event, isRegistered: !event.isRegistered, attendees: event.isRegistered ? event.attendees - 1 : event.attendees + 1 }
        : event
    ))
    toast.success("Event registration updated!")
  }

  const handleUseTemplate = (template: SharedTemplate) => {
    // Navigate to workflow builder with template data
    window.location.href = `/workflows/builder?template=${template.id}`
  }

  return (
    <NewAppLayout title="Community" subtitle="Connect, learn, and share with fellow automation enthusiasts">
      <div className="space-y-8">
        {/* Search and Filters */}
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 relative">
            <ProfessionalSearch
              placeholder="Search discussions, templates, and events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClear={() => setSearchQuery('')}
            />
          </div>
          <div className="flex gap-2">
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Dialog open={showCreateDiscussionModal} onOpenChange={setShowCreateDiscussionModal}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  New Discussion
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create New Discussion</DialogTitle>
                  <DialogDescription>
                    Start a conversation with the community about workflows, integrations, or any automation topic.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="title">Title</Label>
                    <Input
                      id="title"
                      value={newDiscussion.title}
                      onChange={(e) => setNewDiscussion({ ...newDiscussion, title: e.target.value })}
                      placeholder="Enter discussion title"
                    />
                  </div>
                  <div>
                    <Label htmlFor="content">Content</Label>
                    <Textarea
                      id="content"
                      value={newDiscussion.content}
                      onChange={(e) => setNewDiscussion({ ...newDiscussion, content: e.target.value })}
                      placeholder="Describe your question or topic..."
                      rows={4}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="category">Category</Label>
                      <Select value={newDiscussion.category} onValueChange={(value) => setNewDiscussion({ ...newDiscussion, category: value })}>
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
                      <Label htmlFor="tags">Tags (comma-separated)</Label>
                      <Input
                        id="tags"
                        value={newDiscussion.tags.join(", ")}
                        onChange={(e) => setNewDiscussion({ ...newDiscussion, tags: e.target.value.split(",").map(tag => tag.trim()).filter(tag => tag) })}
                        placeholder="workflows, automation, tips"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setShowCreateDiscussionModal(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateDiscussion}>
                    Create Discussion
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-600">Active Members</p>
                  <p className="text-2xl font-bold text-slate-900">12.5k</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-600">Discussions</p>
                  <p className="text-2xl font-bold text-slate-900">3.2k</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-rose-100 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-600">Solutions Shared</p>
                  <p className="text-2xl font-bold text-slate-900">8.9k</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-600">Events This Month</p>
                  <p className="text-2xl font-bold text-slate-900">12</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="discussions">Discussions ({filteredDiscussions.length})</TabsTrigger>
            <TabsTrigger value="templates">Shared Templates ({filteredTemplates.length})</TabsTrigger>
            <TabsTrigger value="events">Events ({allEvents.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="discussions" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">Community Discussions</h2>
              <Dialog open={showCreateDiscussionModal} onOpenChange={setShowCreateDiscussionModal}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    New Discussion
                  </Button>
                </DialogTrigger>
                {/* Same dialog content as above */}
              </Dialog>
            </div>

            {/* Discussion Categories */}
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <Badge 
                  key={category} 
                  variant={category === selectedCategory ? "default" : "secondary"} 
                  className="cursor-pointer"
                  onClick={() => setSelectedCategory(category)}
                >
                  {category}
                </Badge>
              ))}
            </div>

            {/* Discussions */}
            <div className="space-y-4">
              {filteredDiscussions.map((discussion) => (
                <Card key={discussion.id} className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-6">
                    <div className="flex items-start space-x-4">
                      <Avatar>
                        <AvatarImage src={discussion.author.avatar || "/placeholder.svg"} />
                        <AvatarFallback>
                          {discussion.author.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-2">
                          <Badge variant="outline">{discussion.category}</Badge>
                          {discussion.isAnswered && (
                            <Badge variant="default" className="bg-green-100 text-green-800">
                              Answered
                            </Badge>
                          )}
                        </div>

                        <h3 className="font-semibold text-slate-900 mb-2 hover:text-orange-600 transition-colors">
                          {discussion.title}
                        </h3>

                        <div className="flex items-center space-x-4 text-sm text-slate-600 mb-3">
                          <span>{discussion.author.name}</span>
                          <span>•</span>
                          <span>{discussion.author.role}</span>
                          <span>•</span>
                          <span>{discussion.timeAgo}</span>
                        </div>

                        <div className="flex flex-wrap gap-2 mb-4">
                          {discussion.tags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-xs">
                              #{tag}
                            </Badge>
                          ))}
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-6 text-sm text-slate-600">
                            <div className="flex items-center space-x-1">
                              <Reply className="w-4 h-4" />
                              <span>{discussion.replies} replies</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Heart className="w-4 h-4" />
                              <span>{discussion.likes} likes</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <span>{discussion.views} views</span>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleBookmarkDiscussion(discussion.id)
                              }}
                            >
                              <Bookmark className={`w-4 h-4 ${discussion.isBookmarked ? 'fill-current text-orange-600' : ''}`} />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleLikeDiscussion(discussion.id)
                              }}
                            >
                              <Heart className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm">
                              <Share className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="templates" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">Shared Templates</h2>
              <Dialog open={showShareTemplateModal} onOpenChange={setShowShareTemplateModal}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Share Template
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Share Your Template</DialogTitle>
                    <DialogDescription>
                      Share your workflow template with the community to help others.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="template-title">Template Title</Label>
                      <Input
                        id="template-title"
                        value={newTemplate.title}
                        onChange={(e) => setNewTemplate({ ...newTemplate, title: e.target.value })}
                        placeholder="Enter template title"
                      />
                    </div>
                    <div>
                      <Label htmlFor="template-description">Description</Label>
                      <Textarea
                        id="template-description"
                        value={newTemplate.description}
                        onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                        placeholder="Describe what this template does..."
                        rows={3}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="template-category">Category</Label>
                        <Select value={newTemplate.category} onValueChange={(value) => setNewTemplate({ ...newTemplate, category: value })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {templateCategories.slice(1).map((category) => (
                              <SelectItem key={category} value={category}>
                                {category}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="template-difficulty">Difficulty</Label>
                        <Select value={newTemplate.difficulty} onValueChange={(value: any) => setNewTemplate({ ...newTemplate, difficulty: value })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Beginner">Beginner</SelectItem>
                            <SelectItem value="Intermediate">Intermediate</SelectItem>
                            <SelectItem value="Advanced">Advanced</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="template-tags">Tags (comma-separated)</Label>
                      <Input
                        id="template-tags"
                        value={newTemplate.tags.join(", ")}
                        onChange={(e) => setNewTemplate({ ...newTemplate, tags: e.target.value.split(",").map(tag => tag.trim()).filter(tag => tag) })}
                        placeholder="automation, workflow, integration"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end space-x-2">
                    <Button variant="outline" onClick={() => setShowShareTemplateModal(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleShareTemplate}>
                      Share Template
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTemplates.map((template) => (
                <Card key={template.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between mb-4">
                      <div className="p-3 rounded-lg bg-gradient-to-r from-orange-500 to-rose-600 text-white">
                        <Zap className="h-6 w-6" />
                      </div>
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                        {template.rating}
                      </div>
                    </div>
                    <CardTitle className="text-lg font-bold text-slate-900">
                      {template.title}
                    </CardTitle>
                    <p className="text-sm text-slate-600 line-clamp-2">{template.description}</p>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary" className="bg-orange-100 text-orange-700">
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
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {template.tags.slice(0, 3).map((tag, index) => (
                        <span key={index} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                          #{tag}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center justify-between text-sm text-slate-500">
                      <div className="flex items-center gap-1">
                        <Download className="h-4 w-4" />
                        {template.downloads.toLocaleString()}
                      </div>
                      <div className="flex items-center gap-1">
                        <span>by {template.author.name}</span>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-4">
                      <Button
                        className="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
                        onClick={() => handleUseTemplate(template)}
                      >
                        Use Template
                      </Button>
                      <Button
                        variant="outline"
                        className="border-orange-300 text-orange-600 hover:bg-orange-50"
                        onClick={() => handleBookmarkTemplate(template.id)}
                      >
                        <Bookmark className={`w-4 h-4 ${template.isBookmarked ? 'fill-current' : ''}`} />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">Community Events</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {allEvents.map((event) => (
                <Card key={event.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="p-3 rounded-lg bg-gradient-to-r from-green-500 to-orange-600 text-white">
                        <Calendar className="h-6 w-6" />
                      </div>
                      <Badge variant="outline">{event.type}</Badge>
                    </div>
                    <CardTitle className="text-lg font-bold text-slate-900">
                      {event.title}
                    </CardTitle>
                    <p className="text-sm text-slate-600">{event.description}</p>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between text-sm text-slate-600">
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        <span>{event.date}, {event.time}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        <span>{event.attendees}/{event.maxAttendees}</span>
                      </div>
                    </div>

                    <Button
                      className={`w-full ${event.isRegistered ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-600 hover:bg-orange-700'}`}
                      onClick={() => handleRegisterEvent(event.id)}
                    >
                      {event.isRegistered ? 'Registered' : 'Register'}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          {/* Community Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <TrendingUp className="w-5 h-5" />
                <span>Community Stats</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Active Members</span>
                <span className="font-semibold">12.5k</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Discussions</span>
                <span className="font-semibold">{allDiscussions.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Shared Templates</span>
                <span className="font-semibold">{allSharedTemplates.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Events This Month</span>
                <span className="font-semibold">{allEvents.length}</span>
              </div>
            </CardContent>
          </Card>

          {/* Top Contributors */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Trophy className="w-5 h-5" />
                <span>Top Contributors</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {topContributors.map((contributor, index) => (
                <div key={index} className="flex items-center space-x-3">
                  <div className="text-sm font-medium text-slate-500 w-4">#{index + 1}</div>
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={contributor.avatar || "/placeholder.svg"} />
                    <AvatarFallback>
                      {contributor.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 text-sm">{contributor.name}</p>
                    <div className="flex items-center space-x-2">
                      <Badge variant="secondary" className="text-xs">
                        {contributor.badge}
                      </Badge>
                      <span className="text-xs text-slate-500">{contributor.points} pts</span>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </NewAppLayout>
  )
}
