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
    <div className="w-[190px] bg-white border-r border-gray-200 flex flex-col h-screen fixed left-0 top-0">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-gray-200">
        <Link href="/home" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" fill="white" />
          </div>
          <span className="font-bold text-gray-900">chainreact</span>
        </Link>
      </div>

      {/* Create Button */}
      <div className="p-3">
        <Button className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold shadow-sm h-9 rounded-md">
          <Plus className="w-4 h-4 mr-1.5" />
          Create
        </Button>
      </div>

      {/* Primary Navigation */}
      <nav className="flex-1 px-3 py-2 overflow-y-auto">
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
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.name}</span>
                {item.badge && (
                  <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                    {item.badge}
                  </span>
                )}
              </Link>
            )
          })}
        </div>

        <div className="mt-6 pt-6 border-t border-gray-200 space-y-0.5">
          {secondary.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-2 py-2 text-sm font-medium rounded-md transition-colors',
                  isActive
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.name}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-gray-200">
        <div className="text-xs text-gray-500 space-y-1">
          <div>Plan tasks</div>
          <div className="font-semibold text-gray-700">0 / 100</div>
          <div className="text-[11px] text-gray-400">Usage resets in 2 weeks</div>
          <Link href="/settings/billing" className="text-blue-600 hover:text-blue-700 text-xs font-medium block mt-2">
            Manage plan
          </Link>
        </div>
      </div>
    </div>
  )
}
