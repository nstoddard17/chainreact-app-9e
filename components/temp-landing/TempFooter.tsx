"use client"

import React from 'react'
import Image from 'next/image'

const footerLinks = {
  Product: ["Features", "Integrations", "Templates", "Pricing"],
  Resources: ["Documentation", "API Reference", "Blog", "Community"],
  Company: ["About", "Contact", "Security", "Privacy", "Terms"],
}

export function TempFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="max-w-6xl mx-auto px-6 pt-12 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-10">
          <div>
            <div className="flex items-center gap-2">
              <Image
                src="/logo_transparent.png"
                alt="ChainReact"
                width={24}
                height={24}
              />
              <span className="text-sm font-semibold text-slate-900">
                ChainReact
              </span>
            </div>
            <p className="mt-3 text-sm text-slate-500">
              AI-native workflow automation
            </p>
          </div>

          {Object.entries(footerLinks).map(([heading, links]) => (
            <div key={heading}>
              <h3 className="text-sm font-semibold text-slate-900 mb-3">
                {heading}
              </h3>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm text-slate-500 hover:text-slate-900 transition-colors"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-200 pt-6">
          <p className="text-sm text-slate-400">
            &copy; 2024 ChainReact. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
