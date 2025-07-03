"use client"

import React, { memo } from 'react'
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"
import Link from "next/link"
import { CollapsibleFooterSection } from "@/components/ui/collapsible-footer-section"

const LandingFooter = memo(({ isAuthenticated }: { isAuthenticated: boolean }) => {
  return (
    <>
      {/* CTA Section */}
      {!isAuthenticated && (
        <section className="relative z-10 px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
              Ready to automate your workflow?
            </h2>
            <p className="text-xl text-blue-200 mb-8 max-w-2xl mx-auto">
              Join thousands of teams already using ChainReact to streamline their processes and boost productivity.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/auth/register">
                <Button 
                  size="lg" 
                  className="text-lg px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
                >
                  Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/support">
                <Button
                  size="lg"
                  variant="outline"
                  className="text-lg px-8 py-4 border-blue-400 text-blue-400 hover:bg-blue-400/10 rounded-full transition-all duration-300"
                >
                  Talk to Sales
                </Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="relative z-10 bg-slate-950/50 backdrop-blur-sm border-t border-white/10 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Company Info - Always visible */}
            <div>
              <h3 className="text-2xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                ChainReact
              </h3>
              <p className="text-blue-200 mb-4">
                Automate your workflows with ease. Connect apps, save time, and boost productivity.
              </p>
            </div>

            {/* Product Section - Collapsible on mobile */}
            <CollapsibleFooterSection 
              title="Product" 
              className="md:block"
            >
              <ul className="space-y-2 text-blue-200">
                <li>
                  <Link href="#features" className="hover:text-white transition-colors duration-200">
                    Features
                  </Link>
                </li>
                <li>
                  <Link href="/integrations" className="hover:text-white transition-colors duration-200">
                    Integrations
                  </Link>
                </li>
                <li>
                  <Link href="#pricing" className="hover:text-white transition-colors duration-200">
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link href="/templates" className="hover:text-white transition-colors duration-200">
                    Templates
                  </Link>
                </li>
              </ul>
            </CollapsibleFooterSection>

            {/* Company Section - Collapsible on mobile */}
            <CollapsibleFooterSection 
              title="Company" 
              className="md:block"
            >
              <ul className="space-y-2 text-blue-200">
                <li>
                  <Link href="/community" className="hover:text-white transition-colors duration-200">
                    Community
                  </Link>
                </li>
                <li>
                  <Link href="/learn" className="hover:text-white transition-colors duration-200">
                    Learn
                  </Link>
                </li>
                <li>
                  <Link href="/enterprise" className="hover:text-white transition-colors duration-200">
                    Enterprise
                  </Link>
                </li>
                <li>
                  <Link href="/support" className="hover:text-white transition-colors duration-200">
                    Support
                  </Link>
                </li>
              </ul>
            </CollapsibleFooterSection>

            {/* Legal Section - Collapsible on mobile */}
            <CollapsibleFooterSection 
              title="Legal" 
              className="md:block"
            >
              <ul className="space-y-2 text-blue-200">
                <li>
                  <Link href="/privacy" className="hover:text-white transition-colors duration-200">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="hover:text-white transition-colors duration-200">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link href="/sub-processors" className="hover:text-white transition-colors duration-200">
                    Sub-processors
                  </Link>
                </li>
              </ul>
            </CollapsibleFooterSection>
          </div>

          <div className="border-t border-white/10 mt-8 pt-8 text-center text-blue-200">
            <p>&copy; 2025 ChainReact. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </>
  )
})

LandingFooter.displayName = 'LandingFooter'

export default LandingFooter 