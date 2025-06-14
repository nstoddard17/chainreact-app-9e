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
  Settings,
  LogOut,
} from "lucide-react"
import Link from "next/link"
import { useAuth } from "@/hooks/use-auth"
import { useAuthStore } from "@/stores/authStore"

export default function LandingPage() {
  const { isAuthenticated, user, isReady } = useAuth()
  const { signOut } = useAuthStore()

  // Show loading state while auth is initializing
  if (!isReady) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation Bar for Logged In Users */}
      {isAuthenticated && (
        <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center">
                <h1 className="text-xl font-bold text-indigo-600">ChainReact</h1>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-slate-600">Welcome back, {user?.name || user?.email}</span>
                <Link href="/dashboard">
                  <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700">
                    <Workflow className="h-4 w-4 mr-2" />
                    Dashboard
                  </Button>
                </Link>
                <Link href="/settings">
                  <Button size="sm" variant="outline">
                    <Settings className="h-4 w-4" />
                  </Button>
                </Link>
                <Button size="sm" variant="outline" onClick={() => signOut()}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </nav>
      )}

      {/* Hero Section */}
      <section className="pt-24 pb-16 bg-gradient-to-br from-indigo-50 via-purple-50 to-blue-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            {isAuthenticated ? (
              <>
                <Badge variant="secondary" className="mb-4 bg-green-100 text-green-800 hover:bg-green-200">
                  ✅ Welcome back! You're logged in
                </Badge>
                <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-6">
                  Ready to Build
                  <span className="text-indigo-600 block">Amazing Workflows?</span>
                </h1>
                <p className="text-xl text-slate-600 mb-8 max-w-3xl mx-auto">
                  Welcome back, {user?.name || user?.email?.split("@")[0]}! Continue building powerful workflows and
                  automating your tasks.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link href="/dashboard">
                    <Button size="lg" className="text-lg px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white">
                      Go to Dashboard <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Link href="/workflows">
                    <Button
                      size="lg"
                      variant="outline"
                      className="text-lg px-8 py-3 border-indigo-600 text-indigo-600 hover:bg-indigo-50"
                    >
                      <Workflow className="mr-2 h-5 w-5" />
                      Build Workflows
                    </Button>
                  </Link>
                </div>
                <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
                  <Link href="/integrations">
                    <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
                      <CardContent className="p-0 text-center">
                        <Database className="h-8 w-8 text-indigo-600 mx-auto mb-2" />
                        <h3 className="font-semibold text-slate-900">Integrations</h3>
                        <p className="text-sm text-slate-600">Connect your apps</p>
                      </CardContent>
                    </Card>
                  </Link>
                  <Link href="/analytics">
                    <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
                      <CardContent className="p-0 text-center">
                        <BarChart3 className="h-8 w-8 text-indigo-600 mx-auto mb-2" />
                        <h3 className="font-semibold text-slate-900">Analytics</h3>
                        <p className="text-sm text-slate-600">Track performance</p>
                      </CardContent>
                    </Card>
                  </Link>
                  <Link href="/teams">
                    <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
                      <CardContent className="p-0 text-center">
                        <Users className="h-8 w-8 text-indigo-600 mx-auto mb-2" />
                        <h3 className="font-semibold text-slate-900">Teams</h3>
                        <p className="text-sm text-slate-600">Collaborate</p>
                      </CardContent>
                    </Card>
                  </Link>
                </div>
              </>
            ) : (
              <>
                <Badge variant="secondary" className="mb-4 bg-indigo-100 text-indigo-800 hover:bg-indigo-200">
                  🚀 Now in Beta - Join thousands of users automating their workflows
                </Badge>
                <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-6">
                  Automate Your Workflows
                  <span className="text-indigo-600 block">With Ease</span>
                </h1>
                <p className="text-xl text-slate-600 mb-8 max-w-3xl mx-auto">
                  Connect your favorite apps, automate repetitive tasks, and boost productivity with ChainReact's
                  powerful workflow automation platform. No coding required.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link href="/auth/register">
                    <Button size="lg" className="text-lg px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white">
                      Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Link href="/support">
                    <Button
                      size="lg"
                      variant="outline"
                      className="text-lg px-8 py-3 border-indigo-600 text-indigo-600 hover:bg-indigo-50"
                    >
                      <Play className="mr-2 h-5 w-5" />
                      Watch Demo
                    </Button>
                  </Link>
                </div>
                <p className="text-sm text-slate-500 mt-4">
                  Free 14-day trial • No credit card required • Cancel anytime
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Features Section - Show for both logged in and out users */}
      <section id="features" className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              {isAuthenticated ? "Your automation toolkit" : "Everything you need to automate"}
            </h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              {isAuthenticated
                ? "Explore all the powerful features available in your ChainReact workspace."
                : "Powerful features designed to make workflow automation simple, reliable, and scalable."}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card className="p-6 bg-gradient-to-br from-white to-indigo-50 border border-indigo-100 hover:shadow-lg transition-shadow">
              <CardContent className="p-0">
                <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
                  <Workflow className="h-6 w-6 text-indigo-600" />
                </div>
                <h3 className="text-xl font-semibold text-indigo-900 mb-2">Visual Workflow Builder</h3>
                <p className="text-black">
                  Drag and drop interface to create complex workflows without writing a single line of code.
                </p>
                {isAuthenticated && (
                  <Link href="/workflows" className="inline-block mt-3">
                    <Button size="sm" variant="outline" className="text-indigo-600 border-indigo-600">
                      Build Now
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-white to-purple-50 border border-purple-100 hover:shadow-lg transition-shadow">
              <CardContent className="p-0">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                  <Zap className="h-6 w-6 text-purple-600" />
                </div>
                <h3 className="text-xl font-semibold text-purple-900 mb-2">Lightning Fast</h3>
                <p className="text-black">Execute workflows in milliseconds with our optimized automation engine.</p>
                {isAuthenticated && (
                  <Link href="/analytics" className="inline-block mt-3">
                    <Button size="sm" variant="outline" className="text-purple-600 border-purple-600">
                      View Analytics
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-white to-blue-50 border border-blue-100 hover:shadow-lg transition-shadow">
              <CardContent className="p-0">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                  <Shield className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold text-blue-900 mb-2">Enterprise Security</h3>
                <p className="text-black">Bank-grade encryption, SOC 2 compliance, and advanced security controls.</p>
                {isAuthenticated && (
                  <Link href="/settings" className="inline-block mt-3">
                    <Button size="sm" variant="outline" className="text-blue-600 border-blue-600">
                      Security Settings
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-white to-green-50 border border-green-100 hover:shadow-lg transition-shadow">
              <CardContent className="p-0">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                  <Users className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold text-green-900 mb-2">Team Collaboration</h3>
                <p className="text-black">Share workflows, collaborate in real-time, and manage team permissions.</p>
                {isAuthenticated && (
                  <Link href="/teams" className="inline-block mt-3">
                    <Button size="sm" variant="outline" className="text-green-600 border-green-600">
                      Manage Teams
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-white to-amber-50 border border-amber-100 hover:shadow-lg transition-shadow">
              <CardContent className="p-0">
                <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center mb-4">
                  <BarChart3 className="h-6 w-6 text-amber-600" />
                </div>
                <h3 className="text-xl font-semibold text-amber-900 mb-2">Advanced Analytics</h3>
                <p className="text-black">Monitor performance, track success rates, and optimize your workflows.</p>
                {isAuthenticated && (
                  <Link href="/analytics" className="inline-block mt-3">
                    <Button size="sm" variant="outline" className="text-amber-600 border-amber-600">
                      View Reports
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-white to-rose-50 border border-rose-100 hover:shadow-lg transition-shadow">
              <CardContent className="p-0">
                <div className="w-12 h-12 bg-rose-100 rounded-lg flex items-center justify-center mb-4">
                  <Clock className="h-6 w-6 text-rose-600" />
                </div>
                <h3 className="text-xl font-semibold text-rose-900 mb-2">Smart Scheduling</h3>
                <p className="text-black">Schedule workflows, set triggers, and automate based on time or events.</p>
                {isAuthenticated && (
                  <Link href="/workflows" className="inline-block mt-3">
                    <Button size="sm" variant="outline" className="text-rose-600 border-rose-600">
                      Schedule Workflows
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Integrations Section */}
      <section id="integrations" className="py-16 bg-gradient-to-br from-slate-50 to-indigo-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Connect with your favorite tools</h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Integrate with 500+ popular apps and services. From productivity tools to social media platforms.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-8 mb-12">
            {[
              { icon: Github, name: "GitHub", color: "bg-gray-100 text-gray-700" },
              { icon: Slack, name: "Slack", color: "bg-green-100 text-green-700" },
              { icon: Calendar, name: "Google", color: "bg-blue-100 text-blue-700" },
              { icon: Mail, name: "Gmail", color: "bg-red-100 text-red-700" },
              { icon: Database, name: "Notion", color: "bg-slate-100 text-slate-700" },
              { icon: Globe, name: "Shopify", color: "bg-green-100 text-green-700" },
              { icon: Smartphone, name: "Discord", color: "bg-indigo-100 text-indigo-700" },
              { icon: Code, name: "GitLab", color: "bg-orange-100 text-orange-700" },
            ].map((integration, index) => (
              <div
                key={index}
                className={`flex flex-col items-center p-4 bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow-md transition-shadow`}
              >
                <div className={`w-12 h-12 ${integration.color} rounded-full flex items-center justify-center mb-2`}>
                  <integration.icon className="h-6 w-6" />
                </div>
                <span className="text-sm font-medium text-black">{integration.name}</span>
              </div>
            ))}
          </div>

          <div className="text-center">
            <p className="text-slate-600 mb-4">And 500+ more integrations</p>
            <Link href="/integrations">
              <Button variant="outline" className="border-indigo-600 text-indigo-600 hover:bg-indigo-50">
                {isAuthenticated ? "Manage Integrations" : "View All Integrations"}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Only show pricing and testimonials for non-authenticated users */}
      {!isAuthenticated && (
        <>
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
                <Card className="p-8 bg-white border-2 border-slate-200 hover:border-indigo-200 hover:shadow-lg transition-all">
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
                        <Button
                          variant="outline"
                          className="w-full border-indigo-600 text-indigo-600 hover:bg-indigo-50"
                        >
                          Get Started Free
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>

                {/* Pro Plan */}
                <Card className="p-8 bg-gradient-to-b from-white to-indigo-50 border-2 border-indigo-500 relative transform hover:scale-105 transition-all shadow-lg">
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-indigo-600 text-white">Most Popular</Badge>
                  </div>
                  <CardContent className="p-0">
                    <div className="text-center">
                      <h3 className="text-2xl font-bold text-indigo-900 mb-2">Pro</h3>
                      <div className="text-4xl font-bold text-indigo-900 mb-4">
                        $29<span className="text-lg font-normal text-indigo-700">/month</span>
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
                        <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">
                          Start Free Trial
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>

                {/* Enterprise Plan */}
                <Card className="p-8 bg-white border-2 border-slate-200 hover:border-indigo-200 hover:shadow-lg transition-all">
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

                      <Link href="/support">
                        <Button
                          variant="outline"
                          className="w-full border-indigo-600 text-indigo-600 hover:bg-indigo-50"
                        >
                          Contact Sales
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          {/* Testimonials Section */}
          <section className="py-16 bg-gradient-to-br from-indigo-50 to-purple-50">
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
                    color: "bg-indigo-50 border-indigo-200",
                  },
                  {
                    name: "Mike Chen",
                    role: "Operations Manager",
                    company: "StartupXYZ",
                    content:
                      "The visual workflow builder is incredibly intuitive. Our entire team was up and running in minutes, not hours.",
                    rating: 5,
                    color: "bg-purple-50 border-purple-200",
                  },
                  {
                    name: "Emily Rodriguez",
                    role: "Product Manager",
                    company: "InnovateCo",
                    content:
                      "The integrations are seamless and the analytics help us optimize our processes continuously. Highly recommended!",
                    rating: 5,
                    color: "bg-blue-50 border-blue-200",
                  },
                ].map((testimonial, index) => (
                  <Card key={index} className={`p-6 ${testimonial.color} border hover:shadow-lg transition-shadow`}>
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
        </>
      )}

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-r from-indigo-600 to-purple-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {isAuthenticated ? (
            <>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Ready to build something amazing?</h2>
              <p className="text-xl text-indigo-100 mb-8 max-w-2xl mx-auto">
                Your workspace is ready. Start creating powerful workflows and automations today.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/workflows">
                  <Button size="lg" className="text-lg px-8 py-3 bg-white text-indigo-600 hover:bg-indigo-50">
                    Create Workflow <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link href="/templates">
                  <Button
                    size="lg"
                    variant="outline"
                    className="text-lg px-8 py-3 bg-transparent text-white border-white hover:bg-indigo-700"
                  >
                    Browse Templates
                  </Button>
                </Link>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Ready to automate your workflows?</h2>
              <p className="text-xl text-indigo-100 mb-8 max-w-2xl mx-auto">
                Join thousands of teams already using ChainReact to boost productivity and eliminate manual work.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/auth/register">
                  <Button size="lg" className="text-lg px-8 py-3 bg-white text-indigo-600 hover:bg-indigo-50">
                    Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link href="/support">
                  <Button
                    size="lg"
                    variant="outline"
                    className="text-lg px-8 py-3 bg-transparent text-white border-white hover:bg-indigo-700"
                  >
                    Schedule Demo
                  </Button>
                </Link>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
