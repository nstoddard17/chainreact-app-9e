"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
} from "lucide-react"
import { useState } from "react"

const templates = [
  {
    id: 1,
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
  },
  {
    id: 2,
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
  },
  {
    id: 3,
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
  },
  {
    id: 4,
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
  },
  {
    id: 5,
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
  },
  {
    id: 6,
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
  },
  {
    id: 7,
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
  },
  {
    id: 8,
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
  const [selectedCategory, setSelectedCategory] = useState("All")
  const [selectedDifficulty, setSelectedDifficulty] = useState("All")
  const [searchQuery, setSearchQuery] = useState("")

  const filteredTemplates = templates.filter((template) => {
    const matchesCategory = selectedCategory === "All" || template.category === selectedCategory
    const matchesDifficulty = selectedDifficulty === "All" || template.difficulty === selectedDifficulty
    const matchesSearch =
      template.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase())

    return matchesCategory && matchesDifficulty && matchesSearch
  })

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
            <Button className="bg-white text-indigo-600 hover:bg-indigo-50 px-8 py-3 text-lg">
              <Play className="mr-2 h-5 w-5" />
              Browse Templates
            </Button>
            <Button className="border-2 border-white text-white bg-transparent hover:bg-white hover:text-indigo-600 px-8 py-3 text-lg">
              Create Custom Workflow
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
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                  <input
                    type="text"
                    placeholder="Search by name, description, or integration..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 placeholder-gray-500 bg-gray-50 hover:bg-white transition-colors"
                  />
                </div>
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

      {/* Templates Grid */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">{filteredTemplates.length} Templates Found</h2>
            <p className="text-lg text-gray-600">Choose a template to get started or customize it to fit your needs</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredTemplates.map((template) => {
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
                    </div>

                    {/* Integrations */}
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-700">Integrations:</p>
                      <div className="flex flex-wrap gap-1">
                        {template.integrations.map((integration, index) => (
                          <span key={index} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                            {integration}
                          </span>
                        ))}
                      </div>
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
                      <Button className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white">Use Template</Button>
                      <Button variant="outline" className="border-indigo-300 text-indigo-600 hover:bg-indigo-50">
                        Preview
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
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
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold mb-4">Can't find what you're looking for?</h2>
          <p className="text-xl text-indigo-100 mb-8 max-w-2xl mx-auto">
            Create your own custom automation workflow or request a template from our community
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button className="bg-white text-indigo-600 hover:bg-indigo-50 px-8 py-3 text-lg">
              Create Custom Workflow
            </Button>
            <Button className="border-2 border-white text-white bg-transparent hover:bg-white hover:text-indigo-600 px-8 py-3 text-lg">
              Request Template
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}

export default TemplatesContent
