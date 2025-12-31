'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  Workflow,
  Zap,
  LayoutTemplate,
  History,
  Settings,
  BookOpen,
  Sparkles,
  Bell,
  User,
  Menu,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProfessionalSearch } from '@/components/ui/professional-search'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

const navigation = [
  { name: 'Home', href: '/home', icon: Home },
  { name: 'Workflows', href: '/workflows', icon: Workflow },
  { name: 'Templates', href: '/templates', icon: LayoutTemplate },
  { name: 'AI Studio', href: '/ai-assistant', icon: Sparkles },
  { name: 'Integrations', href: '/integrations', icon: Zap },
  { name: 'History', href: '/executions', icon: History },
  { name: 'Learn', href: '/learn', icon: BookOpen },
]

export function ModernNav() {
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-xl bg-white/70 border-b border-rose-100/50 shadow-sm">
      <div className="max-w-[1920px] mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/home" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-600 via-pink-600 to-rose-600 flex items-center justify-center transform group-hover:scale-110 transition-transform shadow-lg shadow-orange-500/30">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <span className="font-black text-xl bg-gradient-to-r from-orange-600 to-rose-600 bg-clip-text text-transparent">
              ChainReact
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-2">
            {navigation.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200',
                    isActive
                      ? 'bg-gradient-to-r from-orange-600 to-rose-600 text-white shadow-lg shadow-orange-500/30'
                      : 'text-slate-700 hover:bg-orange-50 hover:text-orange-700'
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.name}
                </Link>
              )
            })}
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="hidden md:block w-64">
              <ProfessionalSearch
                placeholder="Quick search..."
                className="bg-white/50 border-orange-200 focus:border-orange-400 focus:ring-orange-400/20"
              />
            </div>

            {/* Notifications */}
            <Button
              variant="ghost"
              size="icon"
              className="relative text-slate-600 hover:text-orange-600 hover:bg-orange-50"
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-pink-500 rounded-full animate-pulse"></span>
            </Button>

            {/* Settings */}
            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:flex text-slate-600 hover:text-orange-600 hover:bg-orange-50"
            >
              <Settings className="w-5 h-5" />
            </Button>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 pl-2 pr-3 hover:bg-orange-50">
                  <Avatar className="w-8 h-8 ring-2 ring-orange-200">
                    <AvatarImage src="" />
                    <AvatarFallback className="bg-gradient-to-br from-orange-600 to-rose-600 text-white text-sm font-bold">
                      U
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <User className="w-4 h-4 mr-2" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-600">Log out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobile Menu Toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden py-4 border-t border-rose-100">
            <div className="space-y-1">
              {navigation.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all',
                      isActive
                        ? 'bg-gradient-to-r from-orange-600 to-rose-600 text-white'
                        : 'text-slate-700 hover:bg-orange-50'
                    )}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <item.icon className="w-5 h-5" />
                    {item.name}
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
