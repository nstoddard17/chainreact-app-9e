"use client"

import React from 'react'
import { useTheme } from 'next-themes'

export function AnimatedBackground() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  const isDark = resolvedTheme === 'dark'

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      {/* Base background color */}
      <div className={`absolute inset-0 ${isDark ? 'bg-slate-950' : 'bg-white'}`} />

      {/* Animated mesh gradient background */}
      <div className="absolute inset-0">
        {isDark ? (
          <>
            {/* Dark mode: Vibrant blues and purples with movement */}
            <div className="absolute top-0 -left-4 w-[600px] h-[600px] bg-purple-600 rounded-full mix-blend-normal filter blur-[120px] opacity-30 animate-blob" />
            <div className="absolute top-0 -right-4 w-[600px] h-[600px] bg-blue-600 rounded-full mix-blend-normal filter blur-[120px] opacity-30 animate-blob" style={{ animationDelay: '2s' }} />
            <div className="absolute -bottom-8 left-20 w-[600px] h-[600px] bg-indigo-600 rounded-full mix-blend-normal filter blur-[120px] opacity-25 animate-blob" style={{ animationDelay: '4s' }} />
            <div className="absolute bottom-20 right-20 w-[600px] h-[600px] bg-violet-600 rounded-full mix-blend-normal filter blur-[120px] opacity-25 animate-blob" style={{ animationDelay: '6s' }} />

            {/* Additional accent blobs */}
            <div className="absolute top-1/3 left-1/3 w-[700px] h-[700px] bg-cyan-500 rounded-full mix-blend-normal filter blur-[130px] opacity-20 animate-blob-slow" />
            <div className="absolute bottom-1/3 right-1/3 w-[700px] h-[700px] bg-pink-500 rounded-full mix-blend-normal filter blur-[130px] opacity-20 animate-blob-slow" style={{ animationDelay: '3s' }} />
          </>
        ) : (
          <>
            {/* Light mode: Vibrant pastels with movement */}
            <div className="absolute top-0 -left-4 w-[600px] h-[600px] bg-purple-400 rounded-full mix-blend-multiply filter blur-[120px] opacity-40 animate-blob" />
            <div className="absolute top-0 -right-4 w-[600px] h-[600px] bg-blue-400 rounded-full mix-blend-multiply filter blur-[120px] opacity-40 animate-blob" style={{ animationDelay: '2s' }} />
            <div className="absolute -bottom-8 left-20 w-[600px] h-[600px] bg-pink-400 rounded-full mix-blend-multiply filter blur-[120px] opacity-40 animate-blob" style={{ animationDelay: '4s' }} />
            <div className="absolute bottom-20 right-20 w-[600px] h-[600px] bg-indigo-400 rounded-full mix-blend-multiply filter blur-[120px] opacity-40 animate-blob" style={{ animationDelay: '6s' }} />

            {/* Additional accent blobs */}
            <div className="absolute top-1/3 left-1/3 w-[700px] h-[700px] bg-cyan-300 rounded-full mix-blend-multiply filter blur-[130px] opacity-35 animate-blob-slow" />
            <div className="absolute bottom-1/3 right-1/3 w-[700px] h-[700px] bg-violet-300 rounded-full mix-blend-multiply filter blur-[130px] opacity-35 animate-blob-slow" style={{ animationDelay: '3s' }} />
          </>
        )}
      </div>
    </div>
  )
}
