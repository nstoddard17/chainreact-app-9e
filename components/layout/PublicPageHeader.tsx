"use client"

import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/stores/authStore"
import { ArrowRight } from "lucide-react"

interface PublicPageHeaderProps {
  breadcrumb: string
}

export function PublicPageHeader({ breadcrumb }: PublicPageHeaderProps) {
  const router = useRouter()
  const { user } = useAuthStore()

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
      <div className="max-w-5xl mx-auto flex items-center justify-between h-14 px-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo_transparent.png" alt="ChainReact" width={22} height={22} />
            <span className="text-sm font-semibold text-gray-900">ChainReact</span>
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm text-gray-500">{breadcrumb}</span>
        </div>
        <button
          onClick={() => router.push(user ? "/workflows" : "/auth/login")}
          className="inline-flex items-center gap-1.5 text-xs font-medium h-8 px-4 rounded-md bg-orange-600 text-white hover:bg-orange-700 transition-colors"
        >
          {user ? "Go to Dashboard" : "Get Started"}
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </header>
  )
}
