"use client"

import React, { memo } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle } from "lucide-react"
import Link from "next/link"

const PricingCard = memo(({ 
  title, 
  price, 
  period, 
  features, 
  buttonText, 
  buttonHref, 
  isPopular = false 
}: {
  title: string
  price: string
  period?: string
  features: string[]
  buttonText: string
  buttonHref: string
  isPopular?: boolean
}) => (
  <Card className={`p-8 bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-all duration-300 transform hover:scale-105 ${isPopular ? 'ring-2 ring-blue-500' : ''}`}>
    {isPopular && (
      <div className="text-center mb-4">
        <Badge className="bg-blue-600 text-white">Most Popular</Badge>
      </div>
    )}
    <CardContent className="p-0 text-center">
      <h3 className="text-2xl font-bold text-white mb-2">{title}</h3>
      <div className="text-4xl font-bold text-blue-400 mb-4">
        {price}
        {period && <span className="text-lg text-blue-200">{period}</span>}
      </div>
      <ul className="space-y-3 mb-8 text-blue-200">
        {features.map((feature, index) => (
          <li key={index} className="flex items-center">
            <CheckCircle className="h-5 w-5 text-green-400 mr-2 flex-shrink-0" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <Link href={buttonHref}>
        <Button className={`w-full text-white transition-all duration-300 ${
          isPopular 
            ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700' 
            : 'bg-white/10 hover:bg-white/20 border border-white/20'
        }`}>
          {buttonText}
        </Button>
      </Link>
    </CardContent>
  </Card>
))

const LandingPricing = memo(({ isAuthenticated }: { isAuthenticated: boolean }) => {
  return (
    <section id="pricing" className="relative z-10 px-4 sm:px-6 lg:px-8 py-16 md:py-24">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <Badge variant="secondary" className="bg-blue-600/20 text-blue-300 border border-blue-500/30 mb-4">
            Pricing
          </Badge>
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
            Choose your plan
          </h2>
          <p className="text-xl text-blue-200 max-w-3xl mx-auto">
            Start free and scale as you grow. No hidden fees, cancel anytime.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {/* Free Plan */}
          <PricingCard
            title="Starter"
            price="Free"
            features={[
              "5 workflows",
              "100 executions/month",
              "Basic integrations",
              "Email support"
            ]}
            buttonText={isAuthenticated ? "Current Plan" : "Get Started"}
            buttonHref={isAuthenticated ? "/dashboard" : "/auth/register"}
          />

          {/* Pro Plan */}
          <PricingCard
            title="Professional"
            price="$29"
            period="/month"
            features={[
              "Unlimited workflows",
              "10,000 executions/month",
              "All integrations",
              "Priority support"
            ]}
            buttonText={isAuthenticated ? "Upgrade" : "Start Free Trial"}
            buttonHref={isAuthenticated ? "/settings/billing" : "/auth/register"}
            isPopular={true}
          />

          {/* Business Plan */}
          <PricingCard
            title="Business"
            price="$99"
            period="/month"
            features={[
              "Unlimited workflows",
              "100,000 executions/month",
              "Advanced integrations",
              "Team collaboration",
              "Priority support",
              "Custom branding"
            ]}
            buttonText={isAuthenticated ? "Upgrade to Business" : "Start Business Trial"}
            buttonHref={isAuthenticated ? "/settings/billing" : "/auth/register"}
          />
        </div>
      </div>
    </section>
  )
})

PricingCard.displayName = 'PricingCard'
LandingPricing.displayName = 'LandingPricing'

export default LandingPricing 