"use client"

import React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function StandardHeader() {
  return (
    <nav className="relative z-20 px-4 sm:px-6 lg:px-8 py-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link href="/" className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent hover:opacity-80 transition-opacity">
          ChainReact
        </Link>

        <Link href="/">
          <Button variant="ghost" className="text-white hover:bg-white/10">
            Back to Home
          </Button>
        </Link>
      </div>
    </nav>
  )
}
