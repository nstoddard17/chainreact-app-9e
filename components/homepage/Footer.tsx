"use client"

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Heart, Linkedin, Mail, Check, Copy } from 'lucide-react'
import { ChainReactLogo } from './ChainReactLogo'
import { ContactModal } from './ContactModal'

// Custom X (Twitter) icon component
const XIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
)

const footerLinks = {
  Product: [
    { name: 'Features', href: '#features' },
    { name: 'Integrations', href: '#integrations' },
    { name: 'How it Works', href: '#how-it-works' },
  ],
  Resources: [
    { name: 'Templates', href: '/templates' },
  ],
  Company: [
    { name: 'About', href: '/about' },
    { name: 'Contact', href: '/contact' },
  ],
  Legal: [
    { name: 'Privacy Policy', href: '/privacy' },
    { name: 'Terms of Service', href: '/terms' },
  ],
}

export function Footer() {
  const [emailCopied, setEmailCopied] = useState(false)
  const [contactModalOpen, setContactModalOpen] = useState(false)
  const email = 'info@chainreact.app'

  const handleEmailClick = (e: React.MouseEvent) => {
    e.preventDefault()

    // Try to copy to clipboard first
    navigator.clipboard.writeText(email).then(() => {
      setEmailCopied(true)
      setTimeout(() => setEmailCopied(false), 2000)
    }).catch(() => {
      // If copy fails, open email client
      window.location.href = `mailto:${email}`
    })
  }

  const handleContactClick = (e: React.MouseEvent) => {
    e.preventDefault()
    setContactModalOpen(true)
  }

  const socialLinks = [
    {
      name: 'X',
      icon: XIcon,
      href: 'https://x.com/ChainReact_App',
      color: 'hover:text-gray-300',
      isExternal: true
    },
    {
      name: 'LinkedIn',
      icon: Linkedin,
      href: 'https://www.linkedin.com/company/chainreactapp',
      color: 'hover:text-blue-400',
      isExternal: true
    },
    {
      name: 'Email',
      icon: emailCopied ? Check : Mail,
      href: '#',
      color: 'hover:text-green-400',
      onClick: handleEmailClick,
      title: emailCopied ? 'Copied!' : `Copy email or send to ${email}`
    },
  ]

  return (
    <footer className="relative z-10 bg-gray-50 dark:bg-slate-950/50 backdrop-blur-xl border-t border-gray-200 dark:border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
          {/* Brand Column */}
          <div className="md:col-span-1">
            <div className="mb-4">
              <ChainReactLogo />
            </div>
            <p className="text-gray-600 dark:text-white/60 text-sm mb-6">
              Automate your workflows with AI-powered integrations
            </p>
            <div className="flex gap-4">
              {socialLinks.map((link) => (
                <div key={link.name} className="relative">
                  <a
                    href={link.href}
                    onClick={link.onClick}
                    target={link.isExternal ? '_blank' : undefined}
                    rel={link.isExternal ? 'noopener noreferrer' : undefined}
                    className={`block text-gray-600 dark:text-white/40 transition-colors ${link.color}`}
                    aria-label={link.name}
                    title={link.title}
                  >
                    {React.createElement(link.icon, { className: 'w-5 h-5' })}
                  </a>
                  <AnimatePresence>
                    {link.name === 'Email' && emailCopied && (
                      <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 dark:bg-gray-700 text-white text-xs py-1 px-2 rounded whitespace-nowrap pointer-events-none"
                      >
                        Copied!
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </div>

          {/* Links Columns */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3 className="text-gray-900 dark:text-white font-semibold mb-4">{category}</h3>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.name}>
                    <a
                      href={link.href}
                      onClick={link.name === 'Contact' ? handleContactClick : undefined}
                      className="text-gray-600 dark:text-white/60 text-sm hover:text-gray-900 dark:hover:text-white transition-colors cursor-pointer"
                    >
                      {link.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Newsletter Signup */}
        <div className="mt-12 pt-8 border-t border-gray-200 dark:border-white/10">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <h3 className="text-gray-900 dark:text-white font-semibold mb-2">Stay in the loop</h3>
              <p className="text-gray-600 dark:text-white/60 text-sm">
                Get the latest updates, tips, and automation templates delivered to your inbox
              </p>
            </div>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Enter your email"
                className="flex-1 px-4 py-2 bg-white dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-lg text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/40 focus:outline-none focus:border-blue-500 transition-colors"
              />
              <button className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium rounded-lg transition-all duration-300">
                Subscribe
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-8 pt-8 border-t border-gray-200 dark:border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-gray-600 dark:text-white/40 text-sm">
            © 2024 ChainReact. All rights reserved.
          </div>
          <div className="flex items-center gap-2 text-gray-600 dark:text-white/40 text-sm">
            <span>Built with</span>
            <Heart className="w-4 h-4 text-red-400" />
            <span>for automation enthusiasts</span>
          </div>
        </div>
      </div>

      {/* Contact Modal */}
      <ContactModal open={contactModalOpen} onOpenChange={setContactModalOpen} />
    </footer>
  )
}