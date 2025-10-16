"use client"

import Link from "next/link"
import React from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const navItems = [
  { label: "Product", href: "/temp#product" },
  { label: "Solutions", href: "/temp#solutions" },
  { label: "Pricing", href: "/temp#pricing" },
  { label: "Documentation", href: "/temp#docs" },
]

interface TempNavProps {
  variant?: "marketing" | "app"
}

export function TempNav({ variant = "marketing" }: TempNavProps) {
  const wrapperClasses =
    variant === "marketing"
      ? "bg-[#090E1A]/80 border border-white/10 shadow-[0_10px_50px_rgba(15,23,42,0.25)]"
      : "bg-white/70 backdrop-blur border border-slate-200 text-slate-900"

  return (
    <header
      className={cn(
        "sticky top-0 z-50 mx-auto mt-6 flex w-[min(1180px,94%)] items-center justify-between rounded-full px-6 py-3 transition-all",
        wrapperClasses
      )}
    >
      <Link
        href="/temp"
        className={cn(
          "text-lg font-semibold tracking-tight",
          variant === "marketing" ? "text-white" : "text-slate-900"
        )}
      >
        ChainReact
      </Link>

      {variant === "marketing" && (
        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-200 md:flex">
          {navItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="transition-colors hover:text-white"
            >
              {item.label}
            </a>
          ))}
        </nav>
      )}

      <div className="flex items-center gap-3">
        <Link
          href="/login"
          className={cn(
            "text-sm font-medium transition-colors",
            variant === "marketing"
              ? "text-slate-200 hover:text-white"
              : "text-slate-600 hover:text-slate-900"
          )}
        >
          Sign in
        </Link>
        <Button
          size="sm"
          className={cn(
            "rounded-full px-4 text-sm font-semibold shadow-lg shadow-blue-500/40 transition-all hover:shadow-xl hover:shadow-blue-500/50",
            "bg-gradient-to-r from-[#2563EB] to-[#7C3AED] text-white"
          )}
        >
          Start free trial
        </Button>
      </div>
    </header>
  )
}

