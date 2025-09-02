"use client"

import React, { memo } from 'react'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, Play, Star } from "lucide-react"
import Link from "next/link"

const LandingHero = memo(({ isAuthenticated }: { isAuthenticated: boolean }) => {
  return (
    <section className="relative z-10 px-4 sm:px-6 lg:px-8 pt-32 pb-16 md:pt-40 md:pb-24">
      <div className="max-w-7xl mx-auto text-center">
        <Badge variant="secondary" className="bg-blue-600/20 text-blue-300 border border-blue-500/30 mb-6">
          🚀 Now in Public Beta
        </Badge>
        
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-8 leading-tight">
          Automate your workflow
          <span className="block bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent pb-2">
            effortlessly
          </span>
        </h1>
        
        <p className="text-xl md:text-2xl text-blue-200 mb-10 max-w-4xl mx-auto leading-relaxed">
          Connect your favorite apps and automate repetitive tasks with our powerful visual workflow builder. 
          No coding required.
        </p>

        {!isAuthenticated ? (
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Link href="/auth/register">
              <Button 
                size="lg" 
                className="text-lg px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
              >
                Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Button
              size="lg"
              variant="outline"
              className="text-lg px-8 py-4 border-blue-400 text-blue-400 hover:bg-blue-400/10 rounded-full transition-all duration-300"
            >
              <Play className="mr-2 h-5 w-5" />
              Watch Demo
            </Button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Link href="/dashboard">
              <Button 
                size="lg" 
                className="text-lg px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
              >
                Go to Dashboard <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/workflows">
              <Button
                size="lg"
                variant="outline"
                className="text-lg px-8 py-4 border-blue-400 text-blue-400 hover:bg-blue-400/10 rounded-full transition-all duration-300"
              >
                Create Workflow
              </Button>
            </Link>
          </div>
        )}

        {/* Social Proof - Hidden until we have real stats */}
        {/* <div className="flex flex-col sm:flex-row items-center justify-center gap-8 text-blue-200 mt-4">
          <div className="flex items-center">
            <div className="flex space-x-0.5 mr-3">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-5 w-5 text-yellow-400 fill-current" />
              ))}
            </div>
            <span className="text-sm">4.9/5 from 500+ users</span>
          </div>
          <div className="text-sm">
            ✨ <strong>10,000+</strong> workflows automated
          </div>
          <div className="text-sm">
            🚀 <strong>99.9%</strong> uptime
          </div>
        </div> */}
      </div>
    </section>
  )
})

LandingHero.displayName = 'LandingHero'

export default LandingHero 