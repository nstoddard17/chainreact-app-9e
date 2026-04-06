"use client"

import { motion } from 'framer-motion'
import { Shield, Cloud, Users, Zap, Lock, HeadphonesIcon, ArrowRight, Check } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { StandardHeader } from '@/components/layout/StandardHeader'

const enterpriseFeatures = [
  {
    icon: Shield,
    title: 'Security & Compliance',
    description: 'SOC 2 Type II, GDPR, and HIPAA compliance with advanced audit logging, data residency controls, and encryption at every layer.',
  },
  {
    icon: Lock,
    title: 'SSO & SAML',
    description: 'SAML 2.0 and OpenID Connect single sign-on integration with your identity provider. Enforce authentication policies across your organization.',
  },
  {
    icon: Cloud,
    title: 'Flexible Deployment',
    description: 'Deploy in our cloud, your private cloud, or on-premise. Full control over your data and infrastructure with zero-downtime updates.',
  },
  {
    icon: Users,
    title: 'Team Management',
    description: 'Role-based access controls, team workspaces, shared templates, and granular permissions for workflows and integrations.',
  },
  {
    icon: Zap,
    title: 'Enterprise Integrations',
    description: 'Salesforce, Microsoft 365, ServiceNow, SAP, and custom API integrations with dedicated connector support.',
  },
  {
    icon: HeadphonesIcon,
    title: 'Dedicated Support',
    description: 'Priority support with a dedicated account manager, custom SLAs, onboarding assistance, and training for your team.',
  },
]

const planComparison = [
  { feature: 'Workflows', standard: 'Up to 25', enterprise: 'Unlimited' },
  { feature: 'Task executions / month', standard: '10,000', enterprise: 'Unlimited' },
  { feature: 'Team members', standard: 'Up to 5', enterprise: 'Unlimited' },
  { feature: 'Integrations', standard: 'All standard', enterprise: 'All + custom' },
  { feature: 'AI-powered planning', standard: 'Yes', enterprise: 'Yes + priority' },
  { feature: 'SSO / SAML', standard: '-', enterprise: 'Yes' },
  { feature: 'Audit logs', standard: '30 days', enterprise: 'Unlimited' },
  { feature: 'Custom deployment', standard: '-', enterprise: 'Yes' },
  { feature: 'SLA guarantee', standard: '-', enterprise: '99.99%' },
  { feature: 'Dedicated support', standard: '-', enterprise: 'Yes' },
]

export default function EnterprisePage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-orange-900 to-orange-900">
      <StandardHeader />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block px-3 py-1 text-xs font-medium bg-orange-500/20 text-orange-300 rounded-full mb-4">
            Enterprise
          </span>
          <h1 className="text-5xl sm:text-6xl font-bold text-white mb-6">
            Automation at Scale
          </h1>
          <p className="text-xl text-orange-200 max-w-2xl mx-auto mb-8">
            Enterprise-grade security, compliance, and deployment options for teams that need
            full control over their workflow automation infrastructure.
          </p>
          <button
            onClick={() => window.location.href = 'mailto:enterprise@chainreact.app'}
            className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-orange-600 to-rose-600 hover:from-orange-700 hover:to-rose-700 text-white font-semibold rounded-xl shadow-2xl shadow-rose-500/25 hover:shadow-rose-500/40 transition-all duration-300 group"
          >
            Contact Sales
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </motion.div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {enterpriseFeatures.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 * index }}
              className="bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 p-6"
            >
              <feature.icon className="w-8 h-8 text-orange-400 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
              <p className="text-orange-200 text-sm leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </div>

        {/* Plan Comparison */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.7 }}
          className="bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 p-8 mb-16"
        >
          <h2 className="text-2xl font-bold text-white mb-6 text-center">Standard vs Enterprise</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/20">
                  <th className="text-left py-3 text-orange-200 font-medium">Feature</th>
                  <th className="text-center py-3 text-orange-200 font-medium">Standard</th>
                  <th className="text-center py-3 text-orange-200 font-medium">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {planComparison.map((row) => (
                  <tr key={row.feature} className="border-b border-white/10">
                    <td className="py-3 text-white">{row.feature}</td>
                    <td className="py-3 text-center text-slate-400">{row.standard}</td>
                    <td className="py-3 text-center text-orange-300 font-medium">
                      {row.enterprise === 'Yes' ? (
                        <Check className="w-4 h-4 text-green-400 mx-auto" />
                      ) : (
                        row.enterprise
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="text-center"
        >
          <h2 className="text-3xl font-bold text-white mb-4">Ready to Get Started?</h2>
          <p className="text-orange-200 mb-8 max-w-xl mx-auto">
            Talk to our team about your automation needs. We'll help you design a solution
            that fits your organization's requirements.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => window.location.href = 'mailto:enterprise@chainreact.app'}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-orange-600 to-rose-600 hover:from-orange-700 hover:to-rose-700 text-white font-semibold rounded-xl transition-all duration-300"
            >
              Contact Sales
            </button>
            <button
              onClick={() => router.push('/waitlist')}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl border border-white/20 transition-all duration-300"
            >
              Join the Waitlist
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
