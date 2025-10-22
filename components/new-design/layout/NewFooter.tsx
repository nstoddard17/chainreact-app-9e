"use client"

import Link from "next/link"
import { ExternalLink } from "lucide-react"
import { getVersion } from "@/lib/config/version"

export function NewFooter() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-gray-50 dark:bg-gray-950 mt-auto">
      <div className="w-full py-4 pl-3 pr-6">
        <div className="flex items-center justify-between relative">
          {/* Left Side - Copyright */}
          <div className="text-sm text-muted-foreground whitespace-nowrap">
            &copy; {currentYear} ChainReact. All rights reserved.
          </div>

          {/* Center - Links (centered between copyright and version) */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-4 text-sm">
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
          <div className="text-sm text-muted-foreground font-mono whitespace-nowrap">
            {getVersion()}
          </div>
        </div>
      </div>
    </footer>
  )
}
