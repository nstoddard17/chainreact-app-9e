"use client"

import Link from "next/link"
import { ExternalLink } from "lucide-react"

export function NewFooter() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="border-t bg-background mt-auto">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Left Side - Copyright */}
          <div className="text-sm text-muted-foreground">
            &copy; {currentYear} ChainReact. All rights reserved.
          </div>

          {/* Center - Links */}
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/privacy"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Terms
            </Link>
            <a
              href="https://docs.chainreact.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              Docs
              <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href="https://status.chainreact.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              Status
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Right Side - Version */}
          <div className="text-sm text-muted-foreground">
            v1.0.0
          </div>
        </div>
      </div>
    </footer>
  )
}
