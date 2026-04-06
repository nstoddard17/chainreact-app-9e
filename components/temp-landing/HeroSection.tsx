"use client"

import { ArrowRight } from "lucide-react"
import Link from "next/link"

export function HeroSection() {
  return (
    <section className="relative pt-28 pb-16 sm:pt-36 sm:pb-24 bg-slate-950 overflow-hidden">
      {/* Subtle gradient */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-orange-500/8 via-transparent to-transparent rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-[5fr_7fr] gap-12 lg:gap-16 items-center">
          {/* Left: Text */}
          <div>
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[13px] text-slate-400 mb-8">
              <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse" />
              Free during beta - no credit card required
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-[1.15] mb-6">
              Describe your workflow.
              <br />
              <span className="bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-transparent">
                AI builds it.
              </span>
              <br />
              <span className="bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-transparent">
                You make it better.
              </span>
            </h1>

            {/* Sub-copy */}
            <p className="text-lg sm:text-xl text-slate-400 max-w-lg mb-10 leading-relaxed">
              AI builds your workflow in real time. When it gets something wrong, fix it once and it never makes that mistake again.
            </p>

            {/* CTA */}
            <div className="flex flex-col sm:flex-row items-start gap-3">
              <Link
                href="/auth/register"
                className="inline-flex items-center gap-2 h-11 px-6 rounded-lg bg-white text-slate-900 text-sm font-medium hover:bg-slate-100 transition-colors"
              >
                Start building - free
                <ArrowRight className="w-4 h-4" />
              </Link>
              <button
                onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
                className="inline-flex items-center gap-2 h-11 px-6 rounded-lg text-slate-400 text-sm font-medium hover:text-white transition-colors"
              >
                See how it works
              </button>
            </div>

            <p className="text-xs text-slate-500 mt-4">
              No credit card · First workflow in under 2 minutes
            </p>
          </div>

          {/* Right: Product demo placeholder - larger */}
          <div className="relative">
            <div className="relative rounded-xl overflow-hidden border border-white/10 bg-slate-900/50 shadow-2xl shadow-slate-950/50">
              <div className="aspect-[4/3] flex items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-sm text-slate-500">Product demo video</p>
                  <p className="text-xs text-slate-600 mt-2 max-w-[260px] mx-auto">
                    Screen-record the AI builder: type a prompt, watch nodes appear on canvas
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
