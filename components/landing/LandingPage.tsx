"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  ArrowRight,
  Zap,
  Shield,
  Users,
  BarChart3,
  Workflow,
  Clock,
  CheckCircle,
  Star,
  Github,
  Slack,
  Calendar,
  Mail,
  Database,
  Globe,
  Smartphone,
  Code,
  Play,
  Menu,
  X,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white/95 backdrop-blur-sm border-b border-slate-200 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <h1 className="text-2xl font-bold text-slate-900">ChainReact</h1>
              </div>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:block">
              <div className="ml-10 flex items-baseline space-x-4">
                <a href="#features" className="text-slate-600 hover:text-slate-900 px-3 py-2 text-sm font-medium">
                  Features
                </a>
                <a href="#integrations" className="text-slate-600 hover:text-slate-900 px-3 py-2 text-sm font-medium">
                  Integrations
                </a>
                <a href="#pricing" className="text-slate-600 hover:text-slate-900 px-3 py-2 text-sm font-medium">
                  Pricing
                </a>
                <a href="#about" className="text-slate-600 hover:text-slate-900 px-3 py-2 text-sm font-medium">
                  About
                </a>
              </div>
            </div>

            <div className="hidden md:flex items-center space-x-4">
              <Link href="/auth/login">
                <Button variant="ghost">Sign In</Button>
              </Link>
              <Link href="/auth/register">
                <Button>Get Started</Button>
              </Link>
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="text-slate-600 hover:text-slate-900"
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-white border-t border-slate-200">
              <a href="#features" className="text-slate-600 hover:text-slate-900 block px-3 py-2 text-base font-medium">
                Features
              </a>
              <a
                href="#integrations"
                className="text-slate-600 hover:text-slate-900 block px-3 py-2 text-base font-medium"
              >
                Integrations
              </a>
              <a href="#pricing" className="text-slate-600 hover:text-slate-900 block px-3 py-2 text-base font-medium">
                Pricing
              </a>
              <a href="#about" className="text-slate-600 hover:text-slate-900 block px-3 py-2 text-base font-medium">
                About
              </a>
              <div className="pt-4 pb-3 border-t border-slate-200">
                <Link href="/auth/login" className="block px-3 py-2">
                  <Button variant="ghost" className="w-full">
                    Sign In
                  </Button>
                </Link>
                <Link href="/auth/register" className="block px-3 py-2">
                  <Button className="w-full">Get Started</Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="pt-24 pb-16 bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <Badge variant="secondary" className="mb-4">
              🚀 Now in Beta - Join thousands of users automating their workflows
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-6">
              Automate Your Workflows
              <span className="text-blue-600 block">With Ease</span>
            </h1>
            <p className="text-xl text-slate-600 mb-8 max-w-3xl mx-auto">
              Connect your favorite apps, automate repetitive tasks, and boost productivity with ChainReact's powerful
              workflow automation platform. No coding required.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/auth/register">
                <Button size="lg" className="text-lg px-8 py-3">
                  Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="text-lg px-8 py-3">
                <Play className="mr-2 h-5 w-5" />
                Watch Demo
              </Button>
            </div>
            <p className="text-sm text-slate-500 mt-4">Free 14-day trial • No credit card required • Cancel anytime</p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Everything you need to automate</h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Powerful features designed to make workflow automation simple, reliable, and scalable.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card className="p-6 bg-white border border-slate-200 hover:shadow-lg transition-shadow">
              <CardContent className="p-0">
                <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center mb-4">
                  <Workflow className="h-6 w-6 text-slate-700" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-2">Visual Workflow Builder</h3>
                <p className="text-black">
                  Drag and drop interface to create complex workflows without writing a single line of code.
                </p>
              </CardContent>
            </Card>

            <Card className="p-6 bg-white border border-slate-200 hover:shadow-lg transition-shadow">
              <CardContent className="p-0">
                <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center mb-4">
                  <Zap className="h-6 w-6 text-slate-700" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-2">Lightning Fast</h3>
                <p className="text-black">Execute workflows in milliseconds with our optimized automation engine.</p>
              </CardContent>
            </Card>

            <Card className="p-6 bg-white border border-slate-200 hover:shadow-lg transition-shadow">
              <CardContent className="p-0">
                <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center mb-4">
                  <Shield className="h-6 w-6 text-slate-700" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-2">Enterprise Security</h3>
                <p className="text-black">Bank-grade encryption, SOC 2 compliance, and advanced security controls.</p>
              </CardContent>
            </Card>

            <Card className="p-6 bg-white border border-slate-200 hover:shadow-lg transition-shadow">
              <CardContent className="p-0">
                <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center mb-4">
                  <Users className="h-6 w-6 text-slate-700" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-2">Team Collaboration</h3>
                <p className="text-black">Share workflows, collaborate in real-time, and manage team permissions.</p>
              </CardContent>
            </Card>

            <Card className="p-6 bg-white border border-slate-200 hover:shadow-lg transition-shadow">
              <CardContent className="p-0">
                <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center mb-4">
                  <BarChart3 className="h-6 w-6 text-slate-700" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-2">Advanced Analytics</h3>
                <p className="text-black">Monitor performance, track success rates, and optimize your workflows.</p>
              </CardContent>
            </Card>

            <Card className="p-6 bg-white border border-slate-200 hover:shadow-lg transition-shadow">
              <CardContent className="p-0">
                <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center mb-4">
                  <Clock className="h-6 w-6 text-slate-700" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-2">Smart Scheduling</h3>
                <p className="text-black">Schedule workflows, set triggers, and automate based on time or events.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Integrations Section */}
      <section id="integrations" className="py-16 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Connect with your favorite tools</h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Integrate with 500+ popular apps and services. From productivity tools to social media platforms.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-8 mb-12">
            {[
              { icon: Github, name: "GitHub" },
              { icon: Slack, name: "Slack" },
              { icon: Calendar, name: "Google" },
              { icon: Mail, name: "Gmail" },
              { icon: Database, name: "Notion" },
              { icon: Globe, name: "Shopify" },
              { icon: Smartphone, name: "Discord" },
              { icon: Code, name: "GitLab" },
            ].map((integration, index) => (
              <div
                key={index}
                className="flex flex-col items-center p-4 bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow-md transition-shadow"
              >
                <integration.icon className="h-8 w-8 text-black mb-2" />
                <span className="text-sm font-medium text-black">{integration.name}</span>
              </div>
            ))}
          </div>

          <div className="text-center">
            <p className="text-slate-600 mb-4">And 500+ more integrations</p>
            <Button variant="outline">View All Integrations</Button>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Simple, transparent pricing</h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Start free and scale as you grow. No hidden fees, no surprises.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Free Plan */}
            <Card className="p-8 bg-white border-2 border-slate-200">
              <CardContent className="p-0">
                <div className="text-center">
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">Free</h3>
                  <div className="text-4xl font-bold text-slate-900 mb-4">
                    $0<span className="text-lg font-normal text-slate-600">/month</span>
                  </div>
                  <p className="text-black mb-6">Perfect for getting started</p>

                  <ul className="space-y-3 mb-8 text-left">
                    <li className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                      <span className="text-black">100 workflow executions/month</span>
                    </li>
                    <li className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                      <span className="text-black">5 active workflows</span>
                    </li>
                    <li className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                      <span className="text-black">Basic integrations</span>
                    </li>
                    <li className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                      <span className="text-black">Community support</span>
                    </li>
                  </ul>

                  <Link href="/auth/register">
                    <Button variant="outline" className="w-full">
                      Get Started Free
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* Pro Plan */}
            <Card className="p-8 bg-white border-2 border-blue-500 relative">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                <Badge className="bg-blue-500 text-white">Most Popular</Badge>
              </div>
              <CardContent className="p-0">
                <div className="text-center">
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">Pro</h3>
                  <div className="text-4xl font-bold text-slate-900 mb-4">
                    $29<span className="text-lg font-normal text-slate-600">/month</span>
                  </div>
                  <p className="text-black mb-6">For growing teams</p>

                  <ul className="space-y-3 mb-8 text-left">
                    <li className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                      <span className="text-black">10,000 workflow executions/month</span>
                    </li>
                    <li className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                      <span className="text-black">Unlimited workflows</span>
                    </li>
                    <li className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                      <span className="text-black">All integrations</span>
                    </li>
                    <li className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                      <span className="text-black">Priority support</span>
                    </li>
                    <li className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                      <span className="text-black">Advanced analytics</span>
                    </li>
                  </ul>

                  <Link href="/auth/register">
                    <Button className="w-full">Start Free Trial</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* Enterprise Plan */}
            <Card className="p-8 bg-white border-2 border-slate-200">
              <CardContent className="p-0">
                <div className="text-center">
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">Enterprise</h3>
                  <div className="text-4xl font-bold text-slate-900 mb-4">Custom</div>
                  <p className="text-black mb-6">For large organizations</p>

                  <ul className="space-y-3 mb-8 text-left">
                    <li className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                      <span className="text-black">Unlimited executions</span>
                    </li>
                    <li className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                      <span className="text-black">Custom integrations</span>
                    </li>
                    <li className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                      <span className="text-black">SSO & advanced security</span>
                    </li>
                    <li className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                      <span className="text-black">Dedicated support</span>
                    </li>
                    <li className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                      <span className="text-black">SLA guarantee</span>
                    </li>
                  </ul>

                  <Button variant="outline" className="w-full">
                    Contact Sales
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-16 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Loved by thousands of users</h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              See what our customers are saying about ChainReact.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                name: "Sarah Johnson",
                role: "Marketing Director",
                company: "TechCorp",
                content:
                  "ChainReact has transformed how we handle our marketing workflows. We've saved 20+ hours per week on repetitive tasks.",
                rating: 5,
              },
              {
                name: "Mike Chen",
                role: "Operations Manager",
                company: "StartupXYZ",
                content:
                  "The visual workflow builder is incredibly intuitive. Our entire team was up and running in minutes, not hours.",
                rating: 5,
              },
              {
                name: "Emily Rodriguez",
                role: "Product Manager",
                company: "InnovateCo",
                content:
                  "The integrations are seamless and the analytics help us optimize our processes continuously. Highly recommended!",
                rating: 5,
              },
            ].map((testimonial, index) => (
              <Card key={index} className="p-6 bg-white border border-slate-200">
                <CardContent className="p-0">
                  <div className="flex mb-4">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="h-5 w-5 text-yellow-400 fill-current" />
                    ))}
                  </div>
                  <p className="text-black mb-4">"{testimonial.content}"</p>
                  <div>
                    <div className="font-semibold text-slate-900">{testimonial.name}</div>
                    <div className="text-sm text-black">
                      {testimonial.role} at {testimonial.company}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-blue-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Ready to automate your workflows?</h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Join thousands of teams already using ChainReact to boost productivity and eliminate manual work.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/auth/register">
              <Button size="lg" variant="secondary" className="text-lg px-8 py-3">
                Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Button
              size="lg"
              variant="outline"
              className="text-lg px-8 py-3 text-white border-white hover:bg-white hover:text-blue-600"
            >
              Schedule Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-2xl font-bold mb-4">ChainReact</h3>
              <p className="text-slate-400 mb-4">
                Automate your workflows with ease. Connect apps, save time, and boost productivity.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-slate-400">
                <li>
                  <a href="#features" className="hover:text-white">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#integrations" className="hover:text-white">
                    Integrations
                  </a>
                </li>
                <li>
                  <a href="#pricing" className="hover:text-white">
                    Pricing
                  </a>
                </li>
                <li>
                  <a href="/templates" className="hover:text-white">
                    Templates
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-slate-400">
                <li>
                  <a href="#about" className="hover:text-white">
                    About
                  </a>
                </li>
                <li>
                  <a href="/community" className="hover:text-white">
                    Community
                  </a>
                </li>
                <li>
                  <a href="/learn" className="hover:text-white">
                    Learn
                  </a>
                </li>
                <li>
                  <a href="/enterprise" className="hover:text-white">
                    Enterprise
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-slate-400">
                <li>
                  <Link href="/privacy" className="hover:text-white">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="hover:text-white">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <a href="/security" className="hover:text-white">
                    Security
                  </a>
                </li>
                <li>
                  <a href="/contact" className="hover:text-white">
                    Contact
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-800 mt-8 pt-8 text-center text-slate-400">
            <p>&copy; 2024 ChainReact. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
