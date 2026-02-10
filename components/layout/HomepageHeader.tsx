"use client"

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ChainReactLogo } from '@/components/homepage/ChainReactLogo'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Moon, Sun, Menu, X, ChevronDown, User, Settings, HelpCircle, LogOut, Zap, Crown } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useAuthStore } from '@/stores/authStore'
import { useSignedAvatarUrl } from '@/hooks/useSignedAvatarUrl'

export function HomepageHeader() {
  const router = useRouter()
  const { theme, resolvedTheme, setTheme } = useTheme()
  const { user, profile, signOut } = useAuthStore()
  const [mounted, setMounted] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)

  const avatarUrl = profile?.avatar_url || null
  const { signedUrl: avatarSignedUrl } = useSignedAvatarUrl(avatarUrl || undefined)

  // Wait for profile to load before showing username - don't flash email first
  const profileLoaded = !!profile
  const displayName = profile?.username || profile?.full_name || (profileLoaded ? user?.email?.split('@')[0] : null) || "User"
  const isAdmin = profile?.admin === true

  const handleSignOut = async () => {
    setMenuOpen(false)
    router.push("/")
    await signOut()
  }

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const scrollToSection = (sectionId: string) => {
    setMenuOpen(false)
    const element = document.getElementById(sectionId)
    if (element && typeof window !== 'undefined') {
      // Reduced offset to scroll down further and show more of the section
      const yOffset = 0
      const y = element.getBoundingClientRect().top + window.scrollY + yOffset
      window.scrollTo({ top: y, behavior: 'smooth' })
    }
  }

  React.useEffect(() => {
    const closeOnResize = () => {
      if (window.innerWidth >= 768) {
        setMenuOpen(false)
      }
    }
    window.addEventListener('resize', closeOnResize)
    return () => window.removeEventListener('resize', closeOnResize)
  }, [])

  const effectiveTheme = mounted ? (resolvedTheme ?? theme ?? 'light') : 'light'
  const isDark = effectiveTheme === 'dark'
  const navItems = [
    { label: 'Demo', target: 'demo' },
    { label: 'Features', target: 'features' },
    { label: 'Use Cases', target: 'use-cases' },
    { label: 'Integrations', target: 'integrations' },
    { label: 'Roadmap', target: 'roadmap' },
  ]

  return (
    <header className="sticky top-0 z-50 bg-white/80 dark:bg-[#0A1628]/80 backdrop-blur-xl border-b border-gray-200 dark:border-white/10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-2">
          <ChainReactLogo />
        </Link>

        <nav className="hidden md:flex items-center gap-2">
          {navItems.map((item) => (
            <Button
              key={item.target}
              variant="ghost"
              className="text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10"
              onClick={() => scrollToSection(item.target)}
            >
              {item.label}
            </Button>
          ))}

          {mounted && (
            <Button
              variant="outline"
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className="text-gray-700 dark:text-white border-gray-200 dark:border-white/20 hover:bg-gray-100 dark:hover:bg-white/10"
              aria-label="Toggle theme"
            >
              {isDark ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
          )}

          {user && profileLoaded ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="flex items-center gap-2 border-gray-300 dark:border-white/20 text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 h-10 px-3"
                >
                  <Avatar className="w-6 h-6">
                    {avatarSignedUrl && (
                      <AvatarImage
                        src={avatarSignedUrl}
                        alt={`${displayName} avatar`}
                        className="object-cover"
                      />
                    )}
                    <AvatarFallback className="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs">
                      <User className="w-3 h-3" />
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">{displayName}</span>
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5 text-sm">
                  <div className="font-medium">{displayName}</div>
                  <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
                  <div className="text-xs text-muted-foreground capitalize mt-0.5">{profile?.plan || 'free'} plan</div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push('/workflows')}>
                  <Zap className="w-4 h-4 mr-2" />
                  Go to Workflows
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/settings')}>
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/support')}>
                  <HelpCircle className="w-4 h-4 mr-2" />
                  Help & Support
                </DropdownMenuItem>
                {isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => router.push('/admin')}>
                      <Crown className="w-4 h-4 mr-2 text-yellow-500" />
                      Admin Panel
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link href={user ? "/workflows" : "/auth/login"}>
              <Button variant="outline" className="border-gray-300 dark:border-white/20 text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10">
                {user ? "Go to Workflows" : "Sign In"}
              </Button>
            </Link>
          )}
        </nav>

        <div className="md:hidden flex items-center gap-2">
          {mounted && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className="text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10"
              aria-label="Toggle theme"
            >
              {isDark ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10"
            aria-label="Toggle navigation menu"
          >
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>
      </div>

      <div
        className={`md:hidden overflow-hidden transition-[max-height,opacity] duration-200 ease-in-out ${menuOpen ? 'max-h-[32rem] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
          }`}
      >
        <div className="px-4 pb-6 pt-2 space-y-2 border-t border-gray-200 dark:border-white/10 bg-white/95 dark:bg-slate-950/95 rounded-b-2xl shadow-lg shadow-black/5">
          {navItems.map((item) => (
            <button
              key={item.target}
              onClick={() => scrollToSection(item.target)}
              className="w-full text-left px-4 py-3 rounded-xl text-gray-700 dark:text-gray-100 bg-gray-100/60 dark:bg-white/5 hover:bg-gray-200/80 dark:hover:bg-white/10 transition-colors"
            >
              {item.label}
            </button>
          ))}
          {user && profileLoaded ? (
            <>
              {/* User Info Section */}
              <div className="px-4 py-3 rounded-xl bg-gray-100/60 dark:bg-white/5 mb-2">
                <div className="flex items-center gap-3">
                  <Avatar className="w-10 h-10">
                    {avatarSignedUrl && (
                      <AvatarImage
                        src={avatarSignedUrl}
                        alt={`${displayName} avatar`}
                        className="object-cover"
                      />
                    )}
                    <AvatarFallback className="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      <User className="w-5 h-5" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-white truncate">{displayName}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.email}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">{profile?.plan || 'free'} plan</div>
                  </div>
                </div>
              </div>
              {/* Mobile Menu Links */}
              <Link
                href="/workflows"
                onClick={() => setMenuOpen(false)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-700 dark:text-gray-100 bg-gray-100/60 dark:bg-white/5 hover:bg-gray-200/80 dark:hover:bg-white/10 transition-colors"
              >
                <Zap className="w-5 h-5" />
                Go to Workflows
              </Link>
              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-700 dark:text-gray-100 bg-gray-100/60 dark:bg-white/5 hover:bg-gray-200/80 dark:hover:bg-white/10 transition-colors"
              >
                <Settings className="w-5 h-5" />
                Settings
              </Link>
              <Link
                href="/support"
                onClick={() => setMenuOpen(false)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-700 dark:text-gray-100 bg-gray-100/60 dark:bg-white/5 hover:bg-gray-200/80 dark:hover:bg-white/10 transition-colors"
              >
                <HelpCircle className="w-5 h-5" />
                Help & Support
              </Link>
              {isAdmin && (
                <Link
                  href="/admin"
                  onClick={() => setMenuOpen(false)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-yellow-600 dark:text-yellow-400 bg-gray-100/60 dark:bg-white/5 hover:bg-gray-200/80 dark:hover:bg-white/10 transition-colors"
                >
                  <Crown className="w-5 h-5" />
                  Admin Panel
                </Link>
              )}
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-600 dark:text-red-400 bg-gray-100/60 dark:bg-white/5 hover:bg-gray-200/80 dark:hover:bg-white/10 transition-colors"
              >
                <LogOut className="w-5 h-5" />
                Sign Out
              </button>
            </>
          ) : (
            <Link
              href={user ? "/workflows" : "/auth/login"}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-gray-300 dark:border-white/20 text-gray-700 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-white/10 font-semibold transition-colors"
            >
              {user ? "Go to Workflows" : "Sign In"}
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
