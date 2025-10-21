'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  Workflow,
  LayoutGrid,
  Sparkles,
  Plug,
  Clock,
  Settings,
  ChevronDown,
  Plus,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const navigation = [
  { name: 'Home', href: '/home', icon: Home },
  { name: 'Workflows', href: '/workflows', icon: Workflow },
  { name: 'Templates', href: '/templates', icon: LayoutGrid },
  { name: 'AI Studio', href: '/ai-assistant', icon: Sparkles },
  { name: 'Integrations', href: '/integrations', icon: Plug },
  { name: 'Activity', href: '/executions', icon: Clock },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export function ModernSidebar() {
  const pathname = usePathname()
  const [workspace, setWorkspace] = useState('My Workspace')

  return (
    <div className="w-60 bg-slate-50 border-r border-slate-200 flex flex-col h-screen">
      {/* Workspace Switcher */}
      <div className="p-4 border-b border-slate-200">
        <button className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors group">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm font-bold">M</span>
            </div>
            <span className="font-semibold text-slate-900 truncate text-sm">
              {workspace}
            </span>
          </div>
          <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />
        </button>
      </div>

      {/* Quick Actions */}
      <div className="p-3 border-b border-slate-200 space-y-1">
        <Button
          variant="ghost"
          className="w-full justify-start text-slate-700 hover:bg-slate-100 hover:text-slate-900 h-8 text-sm font-medium"
        >
          <Search className="w-4 h-4 mr-2" />
          Quick find
          <kbd className="ml-auto px-1.5 py-0.5 text-xs bg-slate-200 rounded">⌘K</kbd>
        </Button>
        <Button className="w-full justify-start bg-indigo-600 hover:bg-indigo-700 text-white h-8 text-sm font-medium">
          <Plus className="w-4 h-4 mr-2" />
          New workflow
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 overflow-y-auto">
        <div className="space-y-0.5">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-all',
                  isActive
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.name}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-200">
        <div className="text-xs text-slate-500 space-y-1">
          <div className="flex items-center justify-between">
            <span>Plan usage</span>
            <span className="font-semibold text-slate-700">42%</span>
          </div>
          <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full w-[42%] bg-indigo-500 rounded-full"></div>
          </div>
          <div className="text-[10px] text-slate-400">42 of 100 workflows used</div>
        </div>
      </div>
    </div>
  )
}
