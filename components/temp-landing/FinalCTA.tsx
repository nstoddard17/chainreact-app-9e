"use client"

import React from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export function FinalCTA() {
  return (
    <section className="bg-slate-950 py-20 px-6">
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-3xl font-bold tracking-tight text-white">
          Your first AI-built workflow is 60 seconds away
        </h2>
        <p className="mt-4 text-lg text-slate-400">
          Join the beta - completely free, no credit card required.
        </p>
        <div className="mt-8">
          <Link
            href="/auth/register"
            className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-100"
          >
            Start building - free
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}
