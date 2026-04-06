"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { PanelLeftClose } from "lucide-react"
import { cn } from "@/lib/utils"
import type { NavSection } from "@/lib/navigation/nav-config"

interface NavPanelProps {
  section: NavSection | null
  isPanelOpen: boolean
  onClose: () => void
}

export function NavPanel({ section, isPanelOpen, onClose }: NavPanelProps) {
  const pathname = usePathname()

  if (!section || !isPanelOpen) return null

  const isItemActive = (href: string) => {
    if (href === "/workflows") {
      return pathname === "/workflows"
    }
    return pathname === href || pathname?.startsWith(href + "/")
  }

  return (
    <div className="flex flex-col h-full w-[220px] bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 shrink-0 transition-all duration-200">
      {/* Panel header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {section.label}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <PanelLeftClose className="h-5 w-5" />
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        <div className="space-y-0.5">
          {section.children.map((item) => {
            const Icon = item.icon
            const active = isItemActive(item.href)

            return (
              <Link
                key={item.id}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 h-10 px-3 rounded-md text-[15px] transition-colors relative",
                  active
                    ? "bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 font-medium"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-900"
                )}
              >
                {active && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 bg-orange-500 rounded-r-full" />
                )}
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="truncate">{item.label}</span>
                {item.badge && (
                  <span className="ml-auto text-[11px] px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 font-medium">
                    {item.badge}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
