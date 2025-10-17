"use client"

import Link from "next/link"
import React from "react"
import { Linkedin, Twitter } from "lucide-react"

const footerLinks = [
  {
    title: "Product",
    items: [
      { label: "Overview", href: "/temp#product" },
      { label: "Automation builder", href: "/temp#workflow" },
      { label: "AI assistants", href: "/temp#assistants" },
    ],
  },
  {
    title: "Company",
    items: [
      { label: "About", href: "/about" },
      { label: "Careers", href: "/careers" },
      { label: "Press", href: "/press" },
    ],
  },
  {
    title: "Resources",
    items: [
      { label: "Documentation", href: "/docs" },
      { label: "Templates", href: "/templates" },
      { label: "Support", href: "/support" },
    ],
  },
]

export function TempFooter() {
  return (
    <footer className="border-t border-white/5 bg-[#0B1220]">
      <div className="mx-auto flex w-[min(1120px,94%)] flex-col gap-10 py-10">
        <div className="grid gap-10 md:grid-cols-[2fr_1fr_1fr_1fr]">
          <div>
            <p className="text-lg font-semibold text-slate-100">ChainReact</p>
            <p className="mt-3 text-sm text-slate-400">
              A unified platform for designing, deploying, and monitoring
              AI-powered automations your team can trust.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <a
                href="https://x.com/ChainReact_App"
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-slate-300 transition hover:border-white/30 hover:text-white"
              >
                <Twitter className="h-4 w-4" />
              </a>
              <a
                href="https://www.linkedin.com/company/chainreactapp"
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-slate-300 transition hover:border-white/30 hover:text-white"
              >
                <Linkedin className="h-4 w-4" />
              </a>
            </div>
          </div>
          {footerLinks.map((column) => (
            <div key={column.title}>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-300">
                {column.title}
              </p>
              <ul className="mt-4 space-y-3 text-sm text-slate-400">
                {column.items.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="transition-colors hover:text-slate-100"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-4 border-t border-white/5 pt-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} ChainReact. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="/privacy" className="transition-colors hover:text-slate-200">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-slate-200">
              Terms
            </Link>
            <Link href="/support" className="transition-colors hover:text-slate-200">
              Support
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
