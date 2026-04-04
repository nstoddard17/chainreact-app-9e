"use client"

import React from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Check } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: '/month',
    features: [
      '100 task executions/month',
      'Unlimited AI workflow building',
      '35+ integrations',
      '7-day execution history',
    ],
    cta: 'Get Started',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$19',
    period: '/month',
    badge: 'Most Popular',
    features: [
      '750 task executions/month',
      'Unlimited AI workflow building',
      'AI Agent nodes',
      '30-day history',
      'Email support',
    ],
    cta: 'Start Free Trial',
    highlighted: true,
  },
  {
    name: 'Team',
    price: '$49',
    period: '/month',
    features: [
      '2,000 task executions/month',
      'Unlimited AI workflow building',
      '5 team members',
      'Shared workspaces',
      '90-day history',
      'Priority support',
    ],
    cta: 'Start Free Trial',
    highlighted: false,
  },
]

export function PricingPreview() {
  const router = useRouter()
  const { user } = useAuthStore()

  return (
    <section id="pricing" className="relative px-4 sm:px-6 lg:px-8 py-16">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10"
        >
          <h2 className="font-[var(--font-space-grotesk)] text-3xl md:text-4xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-3">
            Simple pricing. No surprises.
          </h2>
          <p className="text-lg text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
            Build unlimited workflows with AI. Free forever. Pay only when you run them.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.08 }}
              className={`relative rounded-2xl border p-6 flex flex-col shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 ${
                plan.highlighted
                  ? 'border-orange-500 ring-1 ring-orange-500/20 bg-white dark:bg-slate-900/60'
                  : 'border-slate-200/60 dark:border-slate-700/40 bg-white dark:bg-slate-900/60'
              }`}
            >
              {plan.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-orange-500 to-rose-500 text-white text-xs font-medium px-3 py-1 rounded-full">
                  {plan.badge}
                </span>
              )}

              <div className="mb-5">
                <h3 className="font-[var(--font-space-grotesk)] text-lg font-semibold text-slate-900 dark:text-white mb-2">
                  {plan.name}
                </h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-slate-900 dark:text-white">
                    {plan.price}
                  </span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    {plan.period}
                  </span>
                </div>
              </div>

              <ul className="space-y-2.5 mb-6 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm text-slate-600 dark:text-slate-400">
                    <Check className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => router.push(user ? '/workflows' : '/auth/login')}
                className={`w-full inline-flex items-center justify-center gap-1.5 text-sm font-medium h-10 rounded-lg transition-colors ${
                  plan.highlighted
                    ? 'bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900'
                    : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {plan.cta}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </div>

        <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6">
          All plans include unlimited AI workflow creation.{' '}
          <span className="font-medium text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 cursor-pointer">
            See full pricing →
          </span>
        </p>
      </div>
    </section>
  )
}
