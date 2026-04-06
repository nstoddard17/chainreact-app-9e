"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, Zap, ArrowRight, Layers, ChevronRight } from 'lucide-react'
import { StandardHeader } from '@/components/layout/StandardHeader'

interface Template {
  id: string
  name: string
  description: string
  category: string
  integrations: string[]
  nodes: any[]
  difficulty?: string
  estimated_time?: string
}

const categoryLabels: Record<string, string> = {
  all: 'All',
  marketing: 'Marketing',
  sales: 'Sales',
  operations: 'Operations',
  engineering: 'Engineering',
  support: 'Support',
  hr: 'HR',
  finance: 'Finance',
  productivity: 'Productivity',
}

export default function TemplatesShowcasePage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')

  useEffect(() => {
    fetchTemplates()
  }, [selectedCategory, search])

  const fetchTemplates = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (selectedCategory !== 'all') params.set('category', selectedCategory)
      if (search) params.set('search', search)
      const response = await fetch(`/api/templates/predefined?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setTemplates(data.templates || [])
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  const availableCategories = ['all', ...new Set(templates.map(t => t.category).filter(Boolean))]

  return (
    <div className="min-h-screen bg-slate-950">
      <StandardHeader />

      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="max-w-2xl mb-12">
          <p className="text-sm font-medium text-orange-400 mb-2">Templates</p>
          <h1 className="text-4xl font-bold text-white mb-4">Workflow Templates</h1>
          <p className="text-lg text-slate-400">
            Pre-built automations ready to deploy. Browse, preview, and start automating in seconds.
          </p>
        </div>

        {/* Search + Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates..."
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-900 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {availableCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  selectedCategory === cat
                    ? 'bg-orange-500/10 text-orange-400 border border-orange-500/30'
                    : 'text-slate-400 border border-slate-800 hover:border-slate-700 hover:text-slate-300'
                }`}
              >
                {categoryLabels[cat] || cat}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-slate-900 border border-slate-800 rounded-lg p-5 animate-pulse">
                <div className="h-4 bg-slate-800 rounded w-3/4 mb-3" />
                <div className="h-3 bg-slate-800 rounded w-full mb-2" />
                <div className="h-3 bg-slate-800 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-slate-800 rounded-lg">
            <Layers className="w-10 h-10 text-slate-700 mx-auto mb-3" />
            <h3 className="text-sm font-medium text-white mb-1">No templates found</h3>
            <p className="text-xs text-slate-500">
              {search ? 'Try a different search term.' : 'Templates are being added - check back soon.'}
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => (
              <div
                key={template.id}
                className="group bg-slate-900 border border-slate-800 rounded-lg p-5 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-sm font-semibold text-white group-hover:text-orange-400 transition-colors leading-tight">
                    {template.name}
                  </h3>
                  {template.category && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 ml-2 shrink-0">
                      {categoryLabels[template.category] || template.category}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 leading-relaxed mb-4 line-clamp-3">
                  {template.description || 'No description available.'}
                </p>
                <div className="flex items-center justify-between text-[11px] text-slate-600">
                  {template.nodes && (
                    <span className="flex items-center gap-1">
                      <Zap className="w-3 h-3" />
                      {template.nodes.length} steps
                    </span>
                  )}
                  {template.difficulty && <span>{template.difficulty}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CTA */}
        <div className="mt-16 bg-slate-900 border border-slate-800 rounded-lg p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-lg font-semibold text-white mb-1">Ready to automate?</h2>
            <p className="text-sm text-slate-400">Sign up to deploy templates and build your own workflows with AI.</p>
          </div>
          <button
            onClick={() => router.push('/auth/login')}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
          >
            Get Started Free
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
