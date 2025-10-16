"use client"

import React from 'react'
import { motion } from 'framer-motion'
import { Heart, Twitter, Github, Linkedin, Mail } from 'lucide-react'
import { LightChainReactLogo } from './LightChainReactLogo'

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
  { name: 'Twitter', icon: Twitter, href: '#', color: 'hover:text-sky-500' },
  { name: 'GitHub', icon: Github, href: '#', color: 'hover:text-gray-700' },
  { name: 'LinkedIn', icon: Linkedin, href: '#', color: 'hover:text-blue-600' },
  { name: 'Email', icon: Mail, href: '#', color: 'hover:text-green-600' },
]

export function LightFooter() {
  return (
    <footer className="relative z-10 bg-gradient-to-b from-gray-50 to-white border-t border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
          {/* Brand Column */}
          <div className="md:col-span-1">
            <div className="mb-4">
              <LightChainReactLogo />
            </div>
            <p className="text-gray-600 text-sm mb-6">
              Automate your workflows with AI-powered integrations
            </p>
            <div className="flex gap-4">
              {socialLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  className={`text-gray-400 transition-colors ${link.color}`}
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
              <h3 className="text-gray-900 font-semibold mb-4">{category}</h3>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.name}>
                    <a
                      href={link.href}
                      className="text-gray-600 text-sm hover:text-gray-900 transition-colors"
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
        <div className="mt-12 pt-8 border-t border-gray-200">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <h3 className="text-gray-900 font-semibold mb-2">Stay in the loop</h3>
              <p className="text-gray-600 text-sm">
                Get the latest updates, tips, and automation templates delivered to your inbox
              </p>
            </div>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Enter your email"
                className="flex-1 px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              />
              <button className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium rounded-lg transition-all duration-300">
                Subscribe
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-8 pt-8 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-gray-500 text-sm">
            © 2024 ChainReact. All rights reserved.
          </div>
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <span>Built with</span>
            <Heart className="w-4 h-4 text-red-500" />
            <span>for automation enthusiasts</span>
          </div>
        </div>
      </div>
    </footer>
  )
}