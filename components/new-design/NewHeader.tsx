"use client"

import React from 'react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { ChainReactLogo } from '@/components/homepage/ChainReactLogo'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

export function NewHeader() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const isDark = theme === 'dark'

  return (
    <nav className="sticky top-0 z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-neutral-200 dark:border-neutral-800 px-4 sm:px-6 lg:px-8 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link href="/new" className="flex items-center">
          <ChainReactLogo />
        </Link>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            className="text-neutral-700 dark:text-white hover:bg-neutral-100 dark:hover:bg-white/10"
            onClick={() => scrollToSection('features')}
          >
            Features
          </Button>
          <Button
            variant="ghost"
            className="text-neutral-700 dark:text-white hover:bg-neutral-100 dark:hover:bg-white/10"
            onClick={() => scrollToSection('integrations')}
          >
            Integrations
          </Button>
          <Button
            variant="ghost"
            className="text-neutral-700 dark:text-white hover:bg-neutral-100 dark:hover:bg-white/10"
            onClick={() => scrollToSection('how-it-works')}
          >
            How it Works
          </Button>

          {mounted && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className="text-neutral-700 dark:text-white hover:bg-neutral-100 dark:hover:bg-white/10"
              aria-label="Toggle theme"
            >
              {isDark ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </Button>
          )}
        </div>
      </div>
    </nav>
  )
}
