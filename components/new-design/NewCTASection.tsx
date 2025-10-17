"use client"

import React from 'react'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'

export function NewCTASection() {
  const router = useRouter()

  return (
    <section className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-24">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-neutral-900 dark:text-white">
            Ready to automate your workflows?
          </h2>
          <p className="text-lg text-neutral-600 dark:text-neutral-400 mb-8">
            Join thousands of teams using ChainReact to automate their operations.
            Start building in minutes.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              size="lg"
              onClick={() => router.push('/waitlist')}
              className="bg-blue-600 text-white hover:bg-blue-700 px-6 rounded-md shadow-sm"
            >
              Get Started Free
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => router.push('/templates')}
              className="border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 hover:bg-white dark:hover:bg-black px-6 rounded-md"
            >
              Browse Templates
            </Button>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-6">
            No credit card required • Free plan available • Cancel anytime
          </p>
        </div>
      </div>
    </section>
  )
}
