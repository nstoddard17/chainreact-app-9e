"use client"

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { TempTheme } from "./TempTheme"
import { cn } from "@/lib/utils"
import { CircleUserRound, LineChart, Home, Workflow, Settings } from "lucide-react"

const navItems = [
  { label: "Overview", href: "/dashboard/temp", icon: Home },
  { label: "Workflows", href: "/workflows/temp", icon: Workflow },
  { label: "Integrations", href: "/integrations/temp", icon: LineChart },
  { label: "Settings", href: "/settings/temp", icon: Settings },
]

interface TempAppShellProps {
  title: string
  description?: string
  children: React.ReactNode
  actions?: React.ReactNode
}

export function TempAppShell({
  title,
  description,
  children,
  actions,
}: TempAppShellProps) {
  const pathname = usePathname()

  return (
    <TempTheme background="light">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 flex-col border-r border-slate-200 bg-white/70 backdrop-blur-lg lg:flex">
          <div className="px-6 pb-6 pt-8">
            <Link
              href="/dashboard/temp"
              className="text-xl font-semibold text-slate-900"
            >
              ChainReact
            </Link>
          </div>
          <nav className="flex-1 space-y-2 px-4">
            {navItems.map((item) => {
              const isActive = pathname === item.href
              const Icon = item.icon
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all",
                    isActive
                      ? "bg-gradient-to-r from-[#2563EB]/15 to-[#7C3AED]/15 text-[#1E293B]"
                      : "text-slate-500 hover:bg-slate-100"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
          <div className="border-t border-slate-200 px-4 py-6">
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3">
              <CircleUserRound className="h-8 w-8 text-slate-400" />
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Alex Martinez
                </p>
                <p className="text-xs text-slate-500">Operations Lead</p>
              </div>
            </div>
          </div>
        </aside>
        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
            <div className="mx-auto flex w-[min(1180px,94%)] items-center justify-between py-6">
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">
                  {title}
                </h1>
                {description && (
                  <p className="mt-1 text-sm text-slate-500">{description}</p>
                )}
              </div>
              {actions}
            </div>
          </header>
          <main className="flex-1 bg-[#F1F5F9] py-10">
            <div className="mx-auto w-[min(1180px,94%)]">{children}</div>
          </main>
        </div>
      </div>
    </TempTheme>
  )
}

