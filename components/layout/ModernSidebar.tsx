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
    <aside className="w-60 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 flex flex-col h-screen" aria-label="Main navigation">
      {/* Workspace Switcher */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-700">
        <button className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm font-bold">M</span>
            </div>
            <span className="font-semibold text-slate-900 dark:text-slate-100 truncate text-sm">
              {workspace}
            </span>
          </div>
          <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400 flex-shrink-0" aria-hidden="true" />
        </button>
      </div>

      {/* Quick Actions */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-700 space-y-1">
        <Button
          variant="ghost"
          className="w-full justify-start text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 h-8 text-sm font-medium"
        >
          <Search className="w-4 h-4 mr-2" aria-hidden="true" />
          Quick find
          <kbd className="ml-auto px-1.5 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 rounded">⌘K</kbd>
        </Button>
        <Button className="w-full justify-start bg-orange-500 hover:bg-orange-600 text-white h-8 text-sm font-medium">
          <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
          New workflow
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 overflow-y-auto" role="navigation">
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
                    ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <item.icon className="w-4 h-4" aria-hidden="true" />
                {item.name}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-700">
        <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
          <div className="flex items-center justify-between">
            <span>Plan usage</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300">42%</span>
          </div>
          <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full w-[42%] bg-orange-500 rounded-full"></div>
          </div>
          <div className="text-[10px] text-slate-400 dark:text-slate-500">42 of 100 workflows used</div>
        </div>
      </div>
    </aside>
  )
}
