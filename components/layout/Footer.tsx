"use client"

import React from 'react'
import { getVersion } from '@/lib/config/version'
import { Zap } from 'lucide-react'

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="mt-auto border-t border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center justify-between px-6 py-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Zap className="w-3 h-3" />
          <span>© {currentYear} ChainReact</span>
          <span className="hidden sm:inline">•</span>
          <span className="hidden sm:inline">All rights reserved</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono">{getVersion()}</span>
        </div>
      </div>
    </footer>
  )
}