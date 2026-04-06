"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  MessageSquare, Users, TrendingUp, ThumbsUp, Eye, Clock,
  HelpCircle, Lightbulb, Code, Bot, Layers, Star, ArrowRight, LogIn
} from 'lucide-react'
import { PublicPageHeader } from '@/components/layout/PublicPageHeader'
import { TempFooter } from '@/components/temp-landing/TempFooter'
import { useAuthStore } from '@/stores/authStore'

interface Discussion {
  id: string
  title: string
  category: string
  replies: number
  likes: number
  views: number
  timeAgo: string
  isAnswered: boolean
  author: string
}

const categories: Record<string, { icon: React.ElementType; label: string }> = {
  'help-wanted': { icon: HelpCircle, label: 'Help' },
  'feature-request': { icon: Lightbulb, label: 'Feature Request' },
  showcase: { icon: Star, label: 'Showcase' },
  integrations: { icon: Code, label: 'Integrations' },
  ai: { icon: Bot, label: 'AI' },
  templates: { icon: Layers, label: 'Templates' },
  general: { icon: MessageSquare, label: 'General' },
}

const sampleDiscussions: Discussion[] = [
  { id: '1', title: 'How to chain Gmail triggers with Slack notifications?', category: 'help-wanted', replies: 8, likes: 12, views: 234, timeAgo: '2h ago', isAnswered: true, author: 'sarah.k' },
  { id: '2', title: 'Feature request: Conditional branching with multiple paths', category: 'feature-request', replies: 15, likes: 42, views: 567, timeAgo: '1d ago', isAnswered: false, author: 'dev_marcus' },
  { id: '3', title: 'My automated customer onboarding - 3 hours saved daily', category: 'showcase', replies: 6, likes: 28, views: 412, timeAgo: '3d ago', isAnswered: false, author: 'automation_pro' },
  { id: '4', title: 'Best practices for Stripe rate limits', category: 'integrations', replies: 4, likes: 9, views: 189, timeAgo: '4d ago', isAnswered: true, author: 'fintech_julia' },
  { id: '5', title: 'Using AI nodes to auto-classify support tickets', category: 'ai', replies: 11, likes: 35, views: 678, timeAgo: '5d ago', isAnswered: true, author: 'ml_engineer' },
  { id: '6', title: 'Template: Weekly team digest from GitHub + Slack + Notion', category: 'templates', replies: 3, likes: 19, views: 301, timeAgo: '1w ago', isAnswered: false, author: 'team_lead_alex' },
]

export default function CommunityPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [selectedCategory, setSelectedCategory] = useState('all')

  const filtered = selectedCategory === 'all'
    ? sampleDiscussions
    : sampleDiscussions.filter(d => d.category === selectedCategory)

  return (
    <div className="min-h-screen bg-white">
      <PublicPageHeader breadcrumb="Community" />

      <main className="max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex items-start justify-between mb-10">
          <div>
            <p className="text-sm font-medium text-orange-500 mb-2">Community</p>
            <h1 className="text-3xl font-bold text-gray-900 mb-3">Discussions</h1>
            <p className="text-gray-600">Ask questions, share workflows, and learn from other builders.</p>
          </div>
          {user ? (
            <button className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors shrink-0 mt-2">
              <MessageSquare className="w-4 h-4" />
              New Discussion
            </button>
          ) : null}
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Members', value: '2,400+', icon: Users },
            { label: 'Discussions', value: '850+', icon: MessageSquare },
            { label: 'Templates Shared', value: '120+', icon: Layers },
            { label: 'Answer Rate', value: '94%', icon: TrendingUp },
          ].map((stat) => (
            <div key={stat.label} className="bg-white border border-gray-200 rounded-lg p-3 text-center">
              <stat.icon className="w-4 h-4 text-gray-400 mx-auto mb-1.5" />
              <p className="text-lg font-semibold text-gray-900">{stat.value}</p>
              <p className="text-[11px] text-gray-500">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Sign in banner */}
        {!user && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg px-5 py-3.5 flex items-center justify-between mb-6">
            <p className="text-sm text-gray-600">
              <LogIn className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
              Sign in to join discussions and share templates.
            </p>
            <button
              onClick={() => router.push('/auth/login')}
              className="text-sm font-medium text-orange-600 hover:text-orange-700 transition-colors flex items-center gap-1"
            >
              Sign In <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Category filters */}
        <div className="flex flex-wrap gap-1.5 mb-6">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              selectedCategory === 'all'
                ? 'bg-orange-50 text-orange-600 border border-orange-200'
                : 'text-gray-500 border border-gray-200 hover:border-gray-300'
            }`}
          >
            All
          </button>
          {Object.entries(categories).map(([key, { icon: Icon, label }]) => (
            <button
              key={key}
              onClick={() => setSelectedCategory(key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                selectedCategory === key
                  ? 'bg-orange-50 text-orange-600 border border-orange-200'
                  : 'text-gray-500 border border-gray-200 hover:border-gray-300'
              }`}
            >
              <Icon className="w-3 h-3" />
              {label}
            </button>
          ))}
        </div>

        {/* Discussions list */}
        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
          {filtered.map((d) => {
            const cat = categories[d.category] || categories.general
            const CatIcon = cat.icon
            return (
              <div
                key={d.id}
                className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => { if (!user) router.push('/auth/login') }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                      <CatIcon className="w-2.5 h-2.5" />
                      {cat.label}
                    </span>
                    {d.isAnswered && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-50 text-green-600">
                        Answered
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-medium text-gray-900 truncate">{d.title}</h3>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400">
                    <span>{d.author}</span>
                    <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{d.timeAgo}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-[11px] text-gray-400 shrink-0">
                  <span className="flex items-center gap-1"><ThumbsUp className="w-3 h-3" />{d.likes}</span>
                  <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{d.replies}</span>
                  <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{d.views}</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* CTA */}
        {!user && (
          <div className="mt-12 text-center">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Join the conversation</h2>
            <p className="text-sm text-gray-600 mb-5">Connect with thousands of automation builders.</p>
            <button
              onClick={() => router.push('/auth/login')}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Sign Up Free
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </main>

      <TempFooter />
    </div>
  )
}
