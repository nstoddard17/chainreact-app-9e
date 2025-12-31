"use client"

import React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { usePathname } from 'next/navigation'

export function Header() {
  const pathname = usePathname()

  // Don't show Back to Home on homepage
  const showBackToHome = pathname !== '/'

  return (
    <nav className="relative z-20 px-4 sm:px-6 lg:px-8 py-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link href="/" className="text-3xl font-bold bg-gradient-to-r from-orange-400 to-rose-400 bg-clip-text text-transparent hover:opacity-80 transition-opacity">
          ChainReact
        </Link>

        <div className="flex items-center gap-4">
          {/* Navigation Links */}
          <Link href="/templates">
            <Button variant="ghost" className="text-white hover:bg-white/10">
              Templates
            </Button>
          </Link>
          <Link href="/about">
            <Button variant="ghost" className="text-white hover:bg-white/10">
              About
            </Button>
          </Link>
          {showBackToHome && (
            <Link href="/">
              <Button variant="ghost" className="text-white hover:bg-white/10">
                Back to Home
              </Button>
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}