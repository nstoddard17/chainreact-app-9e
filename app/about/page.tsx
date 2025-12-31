"use client"

import { motion } from 'framer-motion'
import { ArrowRight, Zap, Shield, Globe, Users, Sparkles, Target } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { StandardHeader } from '@/components/layout/StandardHeader'

export default function AboutPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-orange-900 to-orange-900">
      {/* Navigation */}
      <StandardHeader />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h1 className="text-5xl sm:text-6xl font-bold text-white mb-6">
            About ChainReact
          </h1>
          <p className="text-xl text-orange-200 max-w-3xl mx-auto">
            We're on a mission to democratize automation and make powerful workflow tools accessible to everyone,
            regardless of technical expertise.
          </p>
        </motion.div>

        {/* Mission Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl border border-white/20 p-8 mb-12"
        >
          <div className="flex items-center gap-3 mb-6">
            <Target className="w-8 h-8 text-orange-400" />
            <h2 className="text-3xl font-bold text-white">Our Mission</h2>
          </div>
          <p className="text-orange-200 text-lg leading-relaxed">
            At ChainReact, we believe that automation shouldn't require a computer science degree.
            Our visual workflow builder, powered by cutting-edge AI, enables anyone to create sophisticated
            automations that save time, reduce errors, and unlock new possibilities for productivity.
          </p>
        </motion.div>

        {/* Values Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="grid md:grid-cols-3 gap-6 mb-12"
        >
          <div className="bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 p-6">
            <Zap className="w-10 h-10 text-yellow-400 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-3">Speed & Efficiency</h3>
            <p className="text-orange-200">
              Automate repetitive tasks 10x faster than traditional methods, freeing you to focus on what matters most.
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 p-6">
            <Shield className="w-10 h-10 text-green-400 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-3">Security First</h3>
            <p className="text-orange-200">
              Enterprise-grade security with encrypted connections, OAuth authentication, and full compliance standards.
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 p-6">
            <Globe className="w-10 h-10 text-rose-400 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-3">Universal Integration</h3>
            <p className="text-orange-200">
              Connect with 20+ popular services and counting, with new integrations added regularly based on user feedback.
            </p>
          </div>
        </motion.div>

        {/* Team Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl border border-white/20 p-8 mb-12"
        >
          <div className="flex items-center gap-3 mb-6">
            <Users className="w-8 h-8 text-orange-400" />
            <h2 className="text-3xl font-bold text-white">Our Team</h2>
          </div>
          <p className="text-orange-200 text-lg leading-relaxed mb-6">
            We're a passionate team of developers, designers, and automation enthusiasts who believe in the power
            of technology to transform how people work. Our diverse backgrounds in enterprise software, AI research,
            and user experience design come together to create a platform that's both powerful and intuitive.
          </p>
          <p className="text-orange-200 text-lg leading-relaxed">
            Founded in 2024, ChainReact emerged from our frustration with existing automation tools that were either
            too complex for non-developers or too limited for serious work. We set out to build the automation
            platform we wished existed – one that anyone could use to build sophisticated workflows without writing code.
          </p>
        </motion.div>

        {/* Vision Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="bg-gradient-to-r from-orange-600/20 to-rose-600/20 backdrop-blur-lg rounded-2xl shadow-2xl border border-white/20 p-8 mb-12"
        >
          <div className="flex items-center gap-3 mb-6">
            <Sparkles className="w-8 h-8 text-rose-400" />
            <h2 className="text-3xl font-bold text-white">Our Vision</h2>
          </div>
          <p className="text-orange-200 text-lg leading-relaxed mb-6">
            We envision a future where AI-powered automation is as natural as sending an email. Where businesses
            of all sizes can compete on equal footing, powered by intelligent workflows that adapt and learn.
            Where creativity and strategy take precedence over repetitive manual tasks.
          </p>
          <p className="text-orange-200 text-lg leading-relaxed">
            ChainReact is more than a tool – it's a catalyst for transformation. We're building the infrastructure
            for the next generation of work, where human creativity and AI efficiency combine to unlock unprecedented
            productivity and innovation.
          </p>
        </motion.div>

        {/* CTA Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="text-center"
        >
          <h2 className="text-3xl font-bold text-white mb-6">Ready to Transform Your Workflow?</h2>
          <p className="text-xl text-orange-200 mb-8">
            Join thousands of users who are already automating their work with ChainReact.
          </p>
          <button
            onClick={() => router.push('/waitlist')}
            className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-orange-600 to-rose-600 hover:from-orange-700 hover:to-rose-700 text-white font-semibold rounded-xl shadow-2xl shadow-rose-500/25 hover:shadow-rose-500/40 transition-all duration-300 transform hover:scale-105 group"
          >
            Join the Waitlist
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </motion.div>
      </div>
    </div>
  )
}