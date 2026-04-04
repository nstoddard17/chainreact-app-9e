"use client"

import React from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Menu, X, ArrowRight } from "lucide-react"
import { useAuthStore } from "@/stores/authStore"

export function TempHeader() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [scrolled, setScrolled] = React.useState(false)

  React.useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const navItems = [
    { label: "How It Works", target: "how-it-works" },
    { label: "Features", target: "features" },
    { label: "Pricing", target: "pricing" },
    { label: "Integrations", target: "integrations" },
  ]

  const scrollTo = (id: string) => {
    setMenuOpen(false)
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" })
  }

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-300 ease-in-out"
      style={{
        backgroundColor: scrolled ? "rgba(255,255,255,0.8)" : "transparent",
        borderColor: scrolled ? "rgba(226,232,240,0.6)" : "transparent",
        backdropFilter: scrolled ? "blur(24px)" : "none",
        WebkitBackdropFilter: scrolled ? "blur(24px)" : "none",
      }}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between h-14 px-6">
        {/* Logo */}
        <Link href="/temp" className="flex items-center gap-2">
          <Image
            src="/logo_transparent.png"
            alt="ChainReact"
            width={24}
            height={24}
            className={scrolled ? "" : "brightness-0 invert"}
          />
          <span
            className={`text-sm font-semibold tracking-tight transition-colors ${
              scrolled ? "text-slate-900" : "text-white"
            }`}
          >
            ChainReact
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => (
            <button
              key={item.target}
              onClick={() => scrollTo(item.target)}
              className={`px-3 py-1.5 text-[13px] font-medium rounded-md transition-colors ${
                scrolled
                  ? "text-slate-500 hover:text-slate-900"
                  : "text-white/70 hover:text-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <button
              onClick={() => router.push("/workflows")}
              className={`inline-flex items-center gap-1.5 text-[13px] font-medium h-8 px-4 rounded-md transition-colors ${
                scrolled
                  ? "bg-slate-900 text-white hover:bg-slate-800"
                  : "bg-white text-slate-900 hover:bg-slate-100"
              }`}
            >
              Dashboard
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <>
              <Link
                href="/auth/login"
                className={`text-[13px] font-medium transition-colors ${
                  scrolled ? "text-slate-500 hover:text-slate-900" : "text-white/70 hover:text-white"
                }`}
              >
                Sign in
              </Link>
              <button
                onClick={() => router.push("/auth/login")}
                className={`inline-flex items-center gap-1.5 text-[13px] font-medium h-8 px-4 rounded-md transition-colors ${
                  scrolled
                    ? "bg-slate-900 text-white hover:bg-slate-800"
                    : "bg-white text-slate-900 hover:bg-slate-100"
                }`}
              >
                Get started
              </button>
            </>
          )}
        </div>

        {/* Mobile menu button */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className={`md:hidden p-1.5 ${scrolled ? "text-slate-600" : "text-white"}`}
          aria-label="Toggle menu"
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-white border-t border-slate-100 shadow-lg">
          <div className="px-4 py-3 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.target}
                onClick={() => scrollTo(item.target)}
                className="w-full text-left px-3 py-2.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors"
              >
                {item.label}
              </button>
            ))}
            <div className="pt-2 border-t border-slate-100 mt-2">
              <button
                onClick={() => {
                  setMenuOpen(false)
                  router.push(user ? "/workflows" : "/auth/login")
                }}
                className="w-full text-center bg-slate-900 text-white text-sm font-medium py-2.5 rounded-md hover:bg-slate-800 transition-colors"
              >
                {user ? "Dashboard" : "Get started free"}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
