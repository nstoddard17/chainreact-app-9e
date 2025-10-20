'use client'

import Link from 'next/link'
import { Github, Twitter, MessageCircle } from 'lucide-react'

export function AppFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="px-6 py-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          {/* Left Side - Links */}
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <Link href="/privacy" className="text-slate-600 hover:text-slate-900 transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-slate-600 hover:text-slate-900 transition-colors">
              Terms of Service
            </Link>
            <Link href="/learn" className="text-slate-600 hover:text-slate-900 transition-colors">
              Documentation
            </Link>
            <Link href="/enterprise" className="text-slate-600 hover:text-slate-900 transition-colors">
              Enterprise
            </Link>
          </div>

          {/* Center - Copyright */}
          <div className="text-sm text-slate-500">
            © 2025 ChainReact. All rights reserved.
          </div>

          {/* Right Side - Social Links */}
          <div className="flex items-center gap-3">
            <a
              href="https://twitter.com"
              target="_blank"
              rel="noopener noreferrer"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              <Twitter className="w-4 h-4" />
            </a>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              <Github className="w-4 h-4" />
            </a>
            <a
              href="https://discord.com"
              target="_blank"
              rel="noopener noreferrer"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
