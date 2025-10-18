"use client"

import React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ChainReactLogo } from '@/components/homepage/ChainReactLogo'
import { Moon, Sun, Menu, X, ArrowRight } from 'lucide-react'
import { useTheme } from 'next-themes'

export function HomepageHeader() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const scrollToSection = (sectionId: string) => {
    setMenuOpen(false)
    const element = document.getElementById(sectionId)
    if (element && typeof window !== 'undefined') {
      const yOffset = -80
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
    { label: 'Overview', target: 'overview' },
    { label: 'How it Works', target: 'how-it-works' },
    { label: 'Automation', target: 'workflow-animation' },
    { label: 'Features', target: 'features' },
    { label: 'Integrations', target: 'integrations' },
  ]

  return (
    <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-gray-200 dark:border-white/10 px-4 sm:px-6 lg:px-8">
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
        className={`md:hidden overflow-hidden transition-all duration-300 ease-out ${menuOpen ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
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
          <Link
            href="/waitlist"
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold hover:from-blue-700 hover:to-purple-700 transition-colors"
          >
            Join Waitlist
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </header>
  )
}
