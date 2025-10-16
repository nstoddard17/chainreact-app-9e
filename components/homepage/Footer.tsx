"use client"

import React from 'react'
import { motion } from 'framer-motion'
import { Heart, Twitter, Github, Linkedin, Mail } from 'lucide-react'
import { ChainReactLogo } from './ChainReactLogo'

const footerLinks = {
  Product: [
    { name: 'Features', href: '#features' },
    { name: 'Integrations', href: '#integrations' },
    { name: 'Pricing', href: '#pricing' },
    { name: 'Roadmap', href: '#roadmap' },
  ],
  Resources: [
    { name: 'Documentation', href: '#docs' },
    { name: 'API Reference', href: '#api' },
    { name: 'Templates', href: '#templates' },
    { name: 'Blog', href: '#blog' },
  ],
  Company: [
    { name: 'About', href: '#about' },
    { name: 'Careers', href: '#careers' },
    { name: 'Contact', href: '#contact' },
    { name: 'Partners', href: '#partners' },
  ],
  Legal: [
    { name: 'Privacy', href: '#privacy' },
    { name: 'Terms', href: '#terms' },
    { name: 'Security', href: '#security' },
    { name: 'Cookie Policy', href: '#cookies' },
  ],
}

const socialLinks = [
  { name: 'Twitter', icon: Twitter, href: '#', color: 'hover:text-sky-400' },
  { name: 'GitHub', icon: Github, href: '#', color: 'hover:text-gray-300' },
  { name: 'LinkedIn', icon: Linkedin, href: '#', color: 'hover:text-blue-400' },
  { name: 'Email', icon: Mail, href: '#', color: 'hover:text-green-400' },
]

export function Footer() {
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
                <a
                  key={link.name}
                  href={link.href}
                  className={`text-gray-600 dark:text-white/40 transition-colors ${link.color}`}
                  aria-label={link.name}
                >
                  {React.createElement(link.icon, { className: 'w-5 h-5' })}
                </a>
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
                      className="text-gray-600 dark:text-white/60 text-sm hover:text-gray-900 dark:hover:text-white transition-colors"
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
    </footer>
  )
}