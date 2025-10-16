"use client"

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Filter, Clock, Zap, ChevronRight, Bot, Mail, MessageSquare, Database, ShoppingBag, Bell, Users, BarChart, X, GitBranch, ArrowRight, Eye, Loader2 } from 'lucide-react'
import { templateCategories } from '@/lib/templates/predefinedTemplates'
import { useRouter } from 'next/navigation'
import { StandardHeader } from '@/components/layout/StandardHeader'
import { TemplatePreviewWithProvider } from '@/components/templates/TemplatePreview'
import { TemplatePreviewModal } from '@/components/templates/TemplatePreviewModal'

interface Template {
  id: string
  name: string
  description: string
  category: string
  tags: string[]
  integrations: string[]
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  estimatedTime: string
  workflow_json?: any
  nodes?: any[]
  connections?: any[]
  is_predefined?: boolean
  is_public?: boolean
}

const categoryIcons: Record<string, any> = {
  'AI Automation': Bot,
  'Customer Service': MessageSquare,
  'Sales & CRM': Database,
  'Social Media': Users,
  'Productivity': Clock,
  'Data Sync': GitBranch,
  'E-commerce': ShoppingBag,
  'Notifications': Bell,
  'HR': Users,
  'DevOps': BarChart,
}

const difficultyColors = {
  beginner: 'bg-green-500/20 text-green-400 border-green-500/30',
  intermediate: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  advanced: 'bg-red-500/20 text-red-400 border-red-500/30',
}

// Helper function to get nodes and connections from template (handles both formats)
const getTemplateWorkflowData = (template: Template) => {
  // Try direct nodes/connections first (database templates)
  if (template.nodes && template.connections) {
    return {
      nodes: template.nodes,
      connections: template.connections
    }
  }

  // Try workflow_json (TypeScript templates)
  if (template.workflow_json) {
    const nodes = template.workflow_json.nodes || []
    // Templates can use either 'edges' or 'connections'
    const connections = template.workflow_json.connections || template.workflow_json.edges || []

    return {
      nodes,
      connections
    }
  }

  // No workflow data found
  return { nodes: [], connections: [] }
}

export default function TemplatesPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  // Fetch templates from API and filter out Twitter templates
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const response = await fetch('/api/templates/predefined')
        if (response.ok) {
          const data = await response.json()
          // Filter out templates that use admin-only or unavailable integrations
          const filteredTemplates = (data.templates || []).filter((template: Template) => {
            if (!template?.is_public) {
              return false
            }
            // Hide templates that include twitter, shopify, or other unavailable integrations
            const unavailableIntegrations = ['twitter', 'x', 'shopify', 'github']
            return !template.integrations?.some(integration =>
              unavailableIntegrations.includes(integration.toLowerCase())
            )
          })
          setTemplates(filteredTemplates)
        } else {
          console.error('Failed to fetch templates')
          setTemplates([])
        }
      } catch (error) {
        console.error('Error fetching templates:', error)
        setTemplates([])
      } finally {
        setLoading(false)
      }
    }

    fetchTemplates()
  }, [])

  const filteredTemplates = templates.filter(template => {
    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory
    const matchesSearch = searchQuery === '' ||
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))

    return matchesCategory && matchesSearch
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900">
      {/* Navigation */}
      <StandardHeader />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-600/20 border border-purple-500/30 mb-6">
            <Zap className="w-5 h-5 text-purple-400" />
            <span className="text-sm font-semibold text-purple-300">Workflow Templates</span>
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold text-white mb-6">
            Ready-to-Use Automation Templates
          </h1>
          <p className="text-xl text-blue-200 max-w-3xl mx-auto">
            Start automating in minutes with our professionally designed workflow templates.
            Simply preview, customize, and activate.
          </p>
        </motion.div>

        {/* Search and Filter Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mb-8 space-y-4"
        >
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-16 pr-4 py-3 bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:border-blue-400 transition-colors"
            />
          </div>

          {/* Category Filter */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                selectedCategory === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              All Templates ({templates.length})
            </button>
            {templateCategories.map(category => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                  selectedCategory === category
                    ? 'bg-blue-600 text-white'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
              >
                {React.createElement(categoryIcons[category] || Zap, { className: 'w-4 h-4' })}
                {category}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Loading State */}
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-center items-center py-20"
          >
            <Loader2 className="w-8 h-8 text-white/60 animate-spin" />
            <span className="ml-3 text-white/60">Loading templates...</span>
          </motion.div>
        )}

        {/* Templates Grid */}
        {!loading && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {filteredTemplates.map((template, index) => (
            <motion.div
              key={template.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 + index * 0.05 }}
              className="bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 overflow-hidden hover:bg-white/15 transition-all group"
            >
              {/* Workflow Preview */}
              <div className="h-48 bg-slate-800/50 relative">
                <TemplatePreviewWithProvider
                  nodes={getTemplateWorkflowData(template).nodes}
                  connections={getTemplateWorkflowData(template).connections}
                  interactive={false}
                  showControls={false}
                  className="w-full h-full"
                />
                {/* Eye icon overlay - only show if template has workflow data */}
                {getTemplateWorkflowData(template).nodes.length > 0 && (
                  <button
                    onClick={() => {
                      setSelectedTemplate(template)
                      setShowPreviewModal(true)
                    }}
                    className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 rounded-lg transition-colors"
                  >
                    <Eye className="w-5 h-5 text-white" />
                  </button>
                )}
              </div>

              {/* Card Content */}
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 rounded-lg bg-gradient-to-r from-blue-500 to-purple-500">
                    {React.createElement(categoryIcons[template.category] || Zap, { className: 'w-6 h-6 text-white' })}
                  </div>
                  <div className={`px-2 py-1 rounded text-xs font-medium border ${difficultyColors[template.difficulty]}`}>
                    {template.difficulty}
                  </div>
                </div>

                <h3 className="text-xl font-semibold text-white mb-2">{template.name}</h3>
                <p className="text-blue-200 text-sm mb-4 line-clamp-2">{template.description}</p>

                {/* Template Meta */}
                <div className="flex items-center gap-4 text-xs text-white/60 mb-4">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{template.estimatedTime}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <GitBranch className="w-3 h-3" />
                    <span>{getTemplateWorkflowData(template).nodes.length} nodes</span>
                  </div>
                </div>

                {/* Integrations */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {template.integrations.slice(0, 3).map(integration => (
                    <span
                      key={integration}
                      className="px-2 py-1 bg-white/10 rounded text-xs text-white/70"
                    >
                      {integration}
                    </span>
                  ))}
                  {template.integrations.length > 3 && (
                    <span className="px-2 py-1 bg-white/10 rounded text-xs text-white/70">
                      +{template.integrations.length - 3} more
                    </span>
                  )}
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-1">
                  {template.tags.slice(0, 3).map(tag => (
                    <span
                      key={tag}
                      className="text-xs text-blue-400"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>

              </div>
            </motion.div>
          ))}
        </div>
        )}

        {/* Empty State */}
        {!loading && filteredTemplates.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <Filter className="w-16 h-16 text-white/20 mx-auto mb-4" />
            <p className="text-xl text-white/60 mb-2">No templates found</p>
            <p className="text-white/40">Try adjusting your search or filter criteria</p>
          </motion.div>
        )}

        {/* Template Preview Modal */}
        <TemplatePreviewModal
          template={selectedTemplate ? {
            ...selectedTemplate,
            nodes: getTemplateWorkflowData(selectedTemplate).nodes,
            connections: getTemplateWorkflowData(selectedTemplate).connections
          } : null}
          open={showPreviewModal}
          onOpenChange={setShowPreviewModal}
        />

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="text-center mt-12 bg-gradient-to-r from-blue-600/20 to-purple-600/20 backdrop-blur-lg rounded-2xl border border-white/20 p-8"
        >
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to Start Automating?
          </h2>
          <p className="text-lg text-blue-200 mb-6">
            Join thousands of users who are already saving hours with ChainReact workflows
          </p>
          <button
            onClick={() => router.push('/waitlist')}
            className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-xl shadow-2xl shadow-purple-500/25 hover:shadow-purple-500/40 transition-all duration-300 transform hover:scale-105 group"
          >
            Get Early Access
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </motion.div>
      </div>
    </div>
  )
}
