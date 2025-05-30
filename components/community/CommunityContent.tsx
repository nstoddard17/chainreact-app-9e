"use client"

import AppLayout from "@/components/layout/AppLayout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
} from "lucide-react"

const discussions = [
  {
    id: 1,
    title: "Best practices for error handling in complex workflows",
    author: {
      name: "Alex Chen",
      avatar: "/placeholder.svg?height=40&width=40&text=AC",
      role: "Workflow Expert",
    },
    category: "Best Practices",
    replies: 23,
    likes: 45,
    views: 1200,
    timeAgo: "2 hours ago",
    isAnswered: true,
    tags: ["error-handling", "workflows", "best-practices"],
  },
  {
    id: 2,
    title: "How to integrate with custom APIs that require OAuth 2.0?",
    author: {
      name: "Sarah Johnson",
      avatar: "/placeholder.svg?height=40&width=40&text=SJ",
      role: "Developer",
    },
    category: "Integrations",
    replies: 12,
    likes: 28,
    views: 856,
    timeAgo: "4 hours ago",
    isAnswered: false,
    tags: ["oauth", "api", "integrations"],
  },
  {
    id: 3,
    title: "Sharing my workflow template for automated social media posting",
    author: {
      name: "Mike Rodriguez",
      avatar: "/placeholder.svg?height=40&width=40&text=MR",
      role: "Community Contributor",
    },
    category: "Templates",
    replies: 8,
    likes: 67,
    views: 2100,
    timeAgo: "1 day ago",
    isAnswered: false,
    tags: ["template", "social-media", "automation"],
  },
  {
    id: 4,
    title: "Performance optimization tips for high-volume workflows",
    author: {
      name: "Dr. Emily Watson",
      avatar: "/placeholder.svg?height=40&width=40&text=EW",
      role: "Technical Lead",
    },
    category: "Performance",
    replies: 34,
    likes: 89,
    views: 3400,
    timeAgo: "2 days ago",
    isAnswered: true,
    tags: ["performance", "optimization", "scaling"],
  },
]

const events = [
  {
    title: "Weekly Community Call",
    date: "Tomorrow, 2:00 PM EST",
    attendees: 45,
    type: "Virtual Meeting",
  },
  {
    title: "Workflow Building Workshop",
    date: "Friday, 10:00 AM EST",
    attendees: 23,
    type: "Workshop",
  },
  {
    title: "Integration Showcase",
    date: "Next Monday, 3:00 PM EST",
    attendees: 67,
    type: "Presentation",
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

export default function CommunityContent() {
  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Community</h1>
            <p className="text-slate-600 mt-2">Connect, learn, and share with fellow automation enthusiasts</p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Discussion
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-600" />
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
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-purple-600" />
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Filters */}
            <div className="flex items-center space-x-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search discussions..."
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <Button variant="outline" size="sm">
                <Filter className="w-4 h-4 mr-2" />
                Filter
              </Button>
            </div>

            {/* Discussion Categories */}
            <div className="flex flex-wrap gap-2">
              {["All", "Best Practices", "Integrations", "Templates", "Performance", "Help"].map((category) => (
                <Badge key={category} variant={category === "All" ? "default" : "secondary"} className="cursor-pointer">
                  {category}
                </Badge>
              ))}
            </div>

            {/* Discussions */}
            <div className="space-y-4">
              {discussions.map((discussion) => (
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

                        <h3 className="font-semibold text-slate-900 mb-2 hover:text-blue-600 transition-colors">
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
                            <Button variant="ghost" size="sm">
                              <Bookmark className="w-4 h-4" />
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
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Upcoming Events */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Calendar className="w-5 h-5" />
                  <span>Upcoming Events</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {events.map((event, index) => (
                  <div key={index} className="p-3 border border-slate-200 rounded-lg">
                    <h4 className="font-medium text-slate-900 mb-1">{event.title}</h4>
                    <p className="text-sm text-slate-600 mb-2">{event.date}</p>
                    <div className="flex items-center justify-between text-xs">
                      <Badge variant="outline">{event.type}</Badge>
                      <span className="text-slate-500">{event.attendees} attending</span>
                    </div>
                  </div>
                ))}
                <Button variant="outline" className="w-full">
                  View All Events
                </Button>
              </CardContent>
            </Card>

            {/* Top Contributors */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <TrendingUp className="w-5 h-5" />
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
      </div>
    </AppLayout>
  )
}
