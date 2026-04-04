"use client"

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChainReactLogo } from '@/components/homepage/ChainReactLogo'
import { Menu, X, ArrowRight } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'

export function TempHeader() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [scrolled, setScrolled] = React.useState(false)

  React.useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  React.useEffect(() => {
    const closeOnResize = () => {
      if (window.innerWidth >= 768) setMenuOpen(false)
    }
    window.addEventListener('resize', closeOnResize)
    return () => window.removeEventListener('resize', closeOnResize)
  }, [])

  const navItems = [
    { label: 'How It Works', target: 'how-it-works' },
    { label: 'Features', target: 'features' },
    { label: 'Pricing', target: 'pricing' },
    { label: 'Integrations', target: 'integrations' },
  ]

  const scrollToSection = (sectionId: string) => {
    setMenuOpen(false)
    const element = document.getElementById(sectionId)
    if (element) {
      const y = element.getBoundingClientRect().top + window.scrollY
      window.scrollTo({ top: y, behavior: 'smooth' })
    }
  }

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/90 dark:bg-slate-950/90 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-800/80'
          : 'bg-black/20 backdrop-blur-md border-b border-white/5'
      }`}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8">
        {/* Logo — brighten on dark hero, normal when scrolled */}
        <Link href="/temp" className={`flex items-center gap-2 transition-all duration-300 ${
          scrolled ? '' : 'brightness-[2] contrast-[0.85]'
        }`} style={scrolled ? undefined : { filter: 'brightness(2) contrast(0.85)' }}>
          <ChainReactLogo />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-1">
          {navItems.map((item) => (
            <button
              key={item.target}
              onClick={() => scrollToSection(item.target)}
              className={`px-3 py-2 text-sm font-medium transition-colors rounded-lg ${
                scrolled
                  ? 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                  : 'text-slate-300/90 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Desktop right */}
        <div className="hidden lg:flex items-center gap-3">
          {user ? (
            <button
              onClick={() => router.push('/workflows')}
              className={`inline-flex items-center gap-1.5 text-sm font-medium h-9 px-4 rounded-lg transition-colors ${
                scrolled
                  ? 'bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900'
                  : 'bg-white hover:bg-slate-100 text-slate-900'
              }`}
            >
              Go to Workflows
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <>
              <Link
                href="/auth/login"
                className={`text-sm font-medium transition-colors ${
                  scrolled
                    ? 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    : 'text-slate-300/80 hover:text-white'
                }`}
              >
                Sign In
              </Link>
              <button
                onClick={() => router.push('/auth/login')}
                className={`inline-flex items-center gap-1.5 text-sm font-medium h-9 px-4 rounded-lg transition-colors ${
                  scrolled
                    ? 'bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900'
                    : 'bg-white hover:bg-slate-100 text-slate-900'
                }`}
              >
                Get Started Free
              </button>
            </>
          )}
        </div>

        {/* Mobile right */}
        <div className="lg:hidden flex items-center gap-2">
          <button
            onClick={() => setMenuOpen((prev) => !prev)}
            className={`p-2 ${scrolled ? 'text-slate-600 dark:text-slate-400' : 'text-slate-300'}`}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        className={`lg:hidden transition-all duration-200 ease-in-out overflow-hidden ${
          menuOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
        }`}
      >
        <div className="px-4 pb-6 pt-2 space-y-1 bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl border-t border-slate-200/50 dark:border-slate-800/50">
          {navItems.map((item) => (
            <button
              key={item.target}
              onClick={() => scrollToSection(item.target)}
              className="w-full text-left px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg transition-colors"
            >
              {item.label}
            </button>
          ))}
          <div className="pt-3 border-t border-slate-200/50 dark:border-slate-800/50">
            <button
              onClick={() => { setMenuOpen(false); router.push(user ? '/workflows' : '/auth/login') }}
              className="w-full inline-flex items-center justify-center gap-1.5 bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium py-2.5 rounded-lg transition-colors"
            >
              {user ? 'Go to Workflows' : 'Get Started Free'}
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
