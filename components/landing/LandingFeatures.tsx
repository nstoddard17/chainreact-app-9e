"use client"

import React, { memo } from 'react'
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Zap,
  Shield,
  Users,
  BarChart3,
  Workflow,
  Clock,
  Github,
  Slack,
  Calendar,
  Mail,
  Database,
  Globe,
  Smartphone,
  Code,
} from "lucide-react"

const FeatureCard = memo(({ icon: Icon, title, description }: { 
  icon: any; 
  title: string; 
  description: string;
}) => (
  <Card className="p-6 bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-all duration-300 transform hover:scale-105">
    <CardContent className="p-0 text-center">
      <div className="mb-4 p-3 bg-orange-600/20 rounded-full w-fit mx-auto">
        <Icon className="h-8 w-8 text-orange-400" />
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
      <p className="text-orange-200">{description}</p>
    </CardContent>
  </Card>
))

const IntegrationIcon = memo(({ icon: Icon, name }: { icon: any; name: string }) => (
  <div className="group flex flex-col items-center p-4 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 hover:bg-white/10 transition-all duration-300 transform hover:scale-105">
    <div className="mb-2 p-3 bg-orange-600/20 rounded-full">
      <Icon className="h-6 w-6 text-orange-400" />
    </div>
    <span className="text-sm text-orange-200 group-hover:text-white transition-colors">{name}</span>
  </div>
))

const LandingFeatures = memo(() => {
  return (
    <>
      {/* Features Section */}
      <section id="features" className="relative z-10 px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="bg-orange-600/20 text-orange-300 border border-orange-500/30 mb-4">
              Features
            </Badge>
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
              Everything you need to automate
            </h2>
            <p className="text-xl text-orange-200 max-w-3xl mx-auto">
              From simple task automation to complex workflow orchestration, ChainReact provides all the tools you need.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
            <FeatureCard
              icon={Zap}
              title="Lightning Fast"
              description="Execute workflows in milliseconds with our optimized engine built for speed and reliability."
            />
            <FeatureCard
              icon={Shield}
              title="Enterprise Security"
              description="Bank-grade encryption and compliance with SOC 2, GDPR, and other industry standards."
            />
            <FeatureCard
              icon={Users}
              title="Team Collaboration"
              description="Work together on workflows with real-time collaboration and role-based permissions."
            />
            <FeatureCard
              icon={BarChart3}
              title="Advanced Analytics"
              description="Get insights into your workflows with detailed analytics and performance metrics."
            />
            <FeatureCard
              icon={Workflow}
              title="Visual Builder"
              description="Create complex workflows with our intuitive drag-and-drop interface."
            />
            <FeatureCard
              icon={Clock}
              title="24/7 Monitoring"
              description="Monitor your workflows around the clock with alerts and notifications."
            />
          </div>

          {/* Popular Integrations */}
          <div className="text-center mb-12">
            <h3 className="text-2xl md:text-3xl font-bold text-white mb-6">
              Connect with your favorite tools
            </h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
            <IntegrationIcon icon={Github} name="GitHub" />
            <IntegrationIcon icon={Slack} name="Slack" />
            <IntegrationIcon icon={Calendar} name="Calendar" />
            <IntegrationIcon icon={Mail} name="Gmail" />
            <IntegrationIcon icon={Database} name="Database" />
            <IntegrationIcon icon={Globe} name="Webhooks" />
            <IntegrationIcon icon={Smartphone} name="SMS" />
            <IntegrationIcon icon={Code} name="API" />
          </div>
        </div>
      </section>
    </>
  )
})

FeatureCard.displayName = 'FeatureCard'
IntegrationIcon.displayName = 'IntegrationIcon'
LandingFeatures.displayName = 'LandingFeatures'

export default LandingFeatures 