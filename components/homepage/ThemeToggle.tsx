"use client"

import React from 'react'
import { motion } from 'framer-motion'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = theme === 'dark'

  const handleThemeToggle = React.useCallback(() => {
    setTheme(isDark ? 'light' : 'dark')
  }, [isDark, setTheme])

  if (!mounted) {
    return (
      <div className="fixed bottom-8 right-8 w-14 h-14 rounded-full bg-gray-200 dark:bg-gray-800 animate-pulse" />
    )
  }

  return (
    <motion.button
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onClick={handleThemeToggle}
      className={`
        fixed bottom-8 right-8 z-50 p-4 rounded-full
        ${isDark
          ? 'bg-slate-800/90 border border-white/20 hover:bg-slate-700/90'
          : 'bg-white/90 border border-gray-200 hover:bg-gray-50/90 shadow-xl'
        }
        backdrop-blur-lg transition-all duration-300
      `}
      aria-label="Toggle theme"
    >
      <motion.div
        initial={false}
        animate={{ rotate: isDark ? 0 : 180 }}
        transition={{ duration: 0.5, ease: "easeInOut" }}
        className="relative"
      >
        {isDark ? (
          <Sun className="w-6 h-6 text-yellow-400" />
        ) : (
          <Moon className="w-6 h-6 text-indigo-600" />
        )}
      </motion.div>
      <div className={`absolute -top-12 right-0 px-3 py-1 rounded-lg text-xs font-medium opacity-0 hover:opacity-100 transition-opacity pointer-events-none ${
        isDark ? 'bg-gray-800 text-gray-200' : 'bg-gray-900 text-white'
      }`}>
        Switch to {isDark ? 'Light' : 'Dark'} Mode
      </div>
    </motion.button>
  )
}