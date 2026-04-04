"use client"

import React from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from 'next-themes'

type ThemeOption = 'light' | 'dark' | 'system'

export function FloatingThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  const [visible, setVisible] = React.useState(true)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  // Hide when footer is in view
  React.useEffect(() => {
    const footer = document.querySelector('footer')
    if (!footer) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(!entry.isIntersecting)
      },
      { threshold: 0 }
    )

    observer.observe(footer)
    return () => observer.disconnect()
  }, [])

  if (!mounted) return null

  const options: { value: ThemeOption; icon: React.ElementType; label: string }[] = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Monitor, label: 'System' },
  ]

  return (
    <div
      className={`fixed bottom-6 right-6 z-40 transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      }`}
    >
      <div className="flex items-center gap-0.5 p-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 shadow-lg shadow-slate-900/10 dark:shadow-black/20">
        {options.map(({ value, icon: Icon, label }) => {
          const isActive = theme === value
          return (
            <button
              key={value}
              onClick={() => setTheme(value)}
              aria-label={`${label} theme`}
              className={`relative p-2 rounded-full transition-all duration-200 ${
                isActive
                  ? 'bg-slate-100 dark:bg-slate-700 text-orange-500'
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              <Icon className="w-4 h-4" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
