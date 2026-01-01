'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  Compass,
  Zap,
  Table,
  LayoutTemplate,
  Bot,
  Palette,
  Users,
  Plug,
  History,
  MoreHorizontal,
  Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const navigation = [
  { name: 'Home', href: '/home', icon: Home },
  { name: 'Discover', href: '/templates', icon: Compass },
  { name: 'Workflows', href: '/workflows', icon: Zap },
  { name: 'Tables', href: '/tables', icon: Table },
  { name: 'Interfaces', href: '/interfaces', icon: LayoutTemplate },
  { name: 'Chatbots', href: '/chatbots', icon: Bot, badge: 'Beta' },
  { name: 'Canvas', href: '/canvas', icon: Palette },
  { name: 'Agents', href: '/agents', icon: Users, badge: 'Beta' },
]

const secondary = [
  { name: 'App Connections', href: '/integrations', icon: Plug },
  { name: 'Workflow History', href: '/executions', icon: History },
  { name: 'More', href: '/settings', icon: MoreHorizontal },
]

export function ZapierSidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-[190px] bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700 flex flex-col h-screen fixed left-0 top-0" aria-label="Main navigation">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-gray-200 dark:border-slate-700">
        <Link href="/home" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" fill="white" aria-hidden="true" />
          </div>
          <span className="font-bold text-gray-900 dark:text-slate-100">chainreact</span>
        </Link>
      </div>

      {/* Create Button */}
      <div className="p-3">
        <Button className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold shadow-sm h-9 rounded-md">
          <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />
          Create
        </Button>
      </div>

      {/* Primary Navigation */}
      <nav className="flex-1 px-3 py-2 overflow-y-auto" role="navigation">
        <div className="space-y-0.5">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-2 py-2 text-sm font-medium rounded-md transition-colors',
                  isActive
                    ? 'bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-slate-100'
                    : 'text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-100'
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <item.icon className="w-4 h-4" aria-hidden="true" />
                <span>{item.name}</span>
                {item.badge && (
                  <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded">
                    {item.badge}
                  </span>
                )}
              </Link>
            )
          })}
        </div>

        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-slate-700 space-y-0.5">
          {secondary.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-2 py-2 text-sm font-medium rounded-md transition-colors',
                  isActive
                    ? 'bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-slate-100'
                    : 'text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-100'
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <item.icon className="w-4 h-4" aria-hidden="true" />
                <span>{item.name}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-gray-200 dark:border-slate-700">
        <div className="text-xs text-gray-500 dark:text-slate-400 space-y-1">
          <div>Plan tasks</div>
          <div className="font-semibold text-gray-700 dark:text-slate-300">0 / 100</div>
          <div className="text-[11px] text-gray-400 dark:text-slate-500">Usage resets in 2 weeks</div>
          <Link href="/settings/billing" className="text-orange-500 hover:text-orange-600 dark:text-orange-400 dark:hover:text-orange-300 text-xs font-medium block mt-2">
            Manage plan
          </Link>
        </div>
      </div>
    </aside>
  )
}
