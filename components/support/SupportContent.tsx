"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ProfessionalSearch } from "@/components/ui/professional-search"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  MessageCircle,
  Mail,
  Phone,
  Clock,
  ChevronDown,
  ChevronRight,
  Book,
  Video,
  Users,
  Zap,
  Shield,
  Settings,
  HelpCircle,
  CheckCircle,
  X,
  Loader2,
} from "lucide-react"

import { logger } from '@/lib/utils/logger'

export function SupportContent() {
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [ticketForm, setTicketForm] = useState({
    name: "",
    email: "",
    subject: "",
    priority: "medium",
    category: "general",
    description: "",
  })

  useEffect(() => {
    // Simulate loading time for initial data fetch
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 500)
    return () => clearTimeout(timer)
  }, [])

  const faqs = [
    {
      id: 1,
      question: "How do I create my first workflow?",
      answer:
        "To create your first workflow, navigate to the Workflows page and click 'Create Workflow'. You can start from scratch or use one of our pre-built templates. Our visual workflow builder makes it easy to drag and drop components to build your automation.",
    },
    {
      id: 2,
      question: "What integrations are available?",
      answer:
        "ChainReact supports 20+ integrations including Slack, Google Workspace, GitHub, Discord, Microsoft Teams, Trello, Stripe, and many more. You can find the complete list on the Integrations page.",
    },
    {
      id: 3,
      question: "How do I connect an integration?",
      answer:
        "Go to the Integrations page, find the service you want to connect, and click 'Connect'. You'll be redirected to authorize ChainReact to access your account. Once authorized, the integration will be available in your workflows.",
    },
    {
      id: 4,
      question: "Can I collaborate with my team?",
      answer:
        "Yes! ChainReact supports real-time collaboration. You can invite team members to your organization, share workflows, and work together in real-time with live cursors and comments.",
    },
    {
      id: 5,
      question: "What are the pricing plans?",
      answer:
        "We offer three plans: Free (up to 5 workflows), Pro ($29/month for unlimited workflows and advanced features), and Enterprise (custom pricing with dedicated support and compliance features).",
    },
    {
      id: 6,
      question: "How do I upgrade my plan?",
      answer:
        "You can upgrade your plan anytime by going to Settings > Billing. Choose your desired plan and complete the payment process. Your new features will be available immediately.",
    },
    {
      id: 7,
      question: "Is my data secure?",
      answer:
        "Absolutely. We use enterprise-grade encryption, SOC 2 compliance, and follow industry best practices for data security. Your data is encrypted both in transit and at rest.",
    },
    {
      id: 8,
      question: "How do I troubleshoot a failed workflow?",
      answer:
        "Check the workflow execution logs in the Analytics section. Look for error messages and verify that all integrations are properly connected. You can also use our workflow debugger to step through each action.",
    },
  ]

  const filteredFaqs = faqs.filter(
    (faq) =>
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const handleTicketSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Handle ticket submission
    logger.debug("Support ticket submitted:", ticketForm)
    alert("Support ticket submitted successfully! We'll get back to you within 24 hours.")
    setTicketForm({
      name: "",
      email: "",
      subject: "",
      priority: "medium",
      category: "general",
      description: "",
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <p className="text-lg text-muted-foreground">Loading support...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-orange-50 via-rose-50 to-orange-50 border-b border-orange-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center">
            <Badge variant="secondary" className="mb-4 bg-orange-100 text-orange-800 hover:bg-orange-200">
              💬 We're here to help
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
              How can we
              <span className="text-orange-600 block">help you?</span>
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
              Get the support you need to succeed with ChainReact. Search our knowledge base, contact our team, or
              browse our resources.
            </p>

            {/* Enhanced Search Bar */}
            <div className="max-w-2xl mx-auto">
              <div className="bg-white rounded-xl shadow-lg border-2 border-gray-200 hover:border-orange-300 transition-colors">
                <ProfessionalSearch
                  placeholder="Search for help articles, FAQs, and more..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onClear={() => setSearchQuery('')}
                  className="py-6 text-lg text-black bg-transparent border-0 focus:ring-2 focus:ring-orange-500 focus:border-transparent rounded-xl placeholder:text-gray-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}
              </div>
              {searchQuery && (
                <div className="mt-2 text-sm text-gray-600">
                  {filteredFaqs.length} result{filteredFaqs.length !== 1 ? "s" : ""} found for "{searchQuery}"
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Quick Help Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <Card className="bg-gradient-to-br from-white to-orange-50 border border-orange-100 hover:shadow-xl transition-all duration-300 cursor-pointer hover:scale-105">
            <CardHeader className="text-center">
              <Book className="h-12 w-12 text-orange-600 mx-auto mb-4" />
              <CardTitle className="text-orange-900">Documentation</CardTitle>
              <CardDescription className="text-gray-600">Comprehensive guides and API documentation</CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-gradient-to-br from-white to-rose-50 border border-rose-100 hover:shadow-xl transition-all duration-300 cursor-pointer hover:scale-105">
            <CardHeader className="text-center">
              <Video className="h-12 w-12 text-rose-600 mx-auto mb-4" />
              <CardTitle className="text-rose-900">Video Tutorials</CardTitle>
              <CardDescription className="text-gray-600">Step-by-step video guides for common tasks</CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-gradient-to-br from-white to-orange-50 border border-orange-100 hover:shadow-xl transition-all duration-300 cursor-pointer hover:scale-105">
            <CardHeader className="text-center">
              <Users className="h-12 w-12 text-orange-600 mx-auto mb-4" />
              <CardTitle className="text-orange-900">Community</CardTitle>
              <CardDescription className="text-gray-600">Connect with other ChainReact users</CardDescription>
            </CardHeader>
          </Card>
        </div>

        <Tabs defaultValue="faq" className="space-y-8">
          <TabsList className="grid w-full grid-cols-4 bg-white border-2 border-gray-200 rounded-xl shadow-lg">
            <TabsTrigger
              value="faq"
              className="data-[state=active]:bg-orange-600 data-[state=active]:text-white rounded-lg"
            >
              FAQ
            </TabsTrigger>
            <TabsTrigger
              value="contact"
              className="data-[state=active]:bg-orange-600 data-[state=active]:text-white rounded-lg"
            >
              Contact Support
            </TabsTrigger>
            <TabsTrigger
              value="status"
              className="data-[state=active]:bg-orange-600 data-[state=active]:text-white rounded-lg"
            >
              System Status
            </TabsTrigger>
            <TabsTrigger
              value="resources"
              className="data-[state=active]:bg-orange-600 data-[state=active]:text-white rounded-lg"
            >
              Resources
            </TabsTrigger>
          </TabsList>

          {/* FAQ Tab */}
          <TabsContent value="faq" className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Frequently Asked Questions</h2>
              <p className="text-gray-600">Find quick answers to common questions</p>
            </div>

            <div className="space-y-4">
              {filteredFaqs.map((faq) => (
                <Card
                  key={faq.id}
                  className="overflow-hidden bg-white border-2 border-gray-200 hover:shadow-xl hover:border-orange-300 transition-all duration-300"
                >
                  <CardHeader
                    className="cursor-pointer hover:bg-orange-50 transition-colors"
                    onClick={() => setExpandedFaq(expandedFaq === faq.id ? null : faq.id)}
                  >
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg text-gray-900">{faq.question}</CardTitle>
                      {expandedFaq === faq.id ? (
                        <ChevronDown className="h-5 w-5 text-orange-600" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-orange-600" />
                      )}
                    </div>
                  </CardHeader>
                  {expandedFaq === faq.id && (
                    <CardContent>
                      <p className="text-gray-600">{faq.answer}</p>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>

            {filteredFaqs.length === 0 && searchQuery && (
              <div className="text-center py-12">
                <HelpCircle className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No results found</h3>
                <p className="text-gray-600 mb-4">
                  We couldn't find any FAQs matching "{searchQuery}". Try a different search term or contact our support
                  team.
                </p>
                <Button onClick={() => setSearchQuery("")} className="bg-orange-600 hover:bg-orange-700">
                  Clear Search
                </Button>
              </div>
            )}
          </TabsContent>

          {/* Contact Support Tab */}
          <TabsContent value="contact" className="space-y-6">
            <div className="grid lg:grid-cols-2 gap-8">
              {/* Contact Methods */}
              <div className="space-y-6">
                <h2 className="text-3xl font-bold text-gray-900 mb-6">Get in Touch</h2>

                <Card className="bg-gradient-to-br from-white to-orange-50 border-2 border-orange-100 hover:shadow-xl transition-all duration-300">
                  <CardHeader>
                    <div className="flex items-center space-x-3">
                      <MessageCircle className="h-6 w-6 text-orange-600" />
                      <div>
                        <CardTitle className="text-orange-900">Live Chat</CardTitle>
                        <CardDescription className="text-gray-600">
                          Available 24/7 for immediate assistance
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Button className="w-full bg-orange-600 hover:bg-orange-700">Start Live Chat</Button>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-white to-green-50 border-2 border-green-100 hover:shadow-xl transition-all duration-300">
                  <CardHeader>
                    <div className="flex items-center space-x-3">
                      <Mail className="h-6 w-6 text-green-600" />
                      <div>
                        <CardTitle className="text-green-900">Email Support</CardTitle>
                        <CardDescription className="text-gray-600">Response within 24 hours</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-600">support@chainreact.app</p>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-white to-rose-50 border-2 border-rose-100 hover:shadow-xl transition-all duration-300">
                  <CardHeader>
                    <div className="flex items-center space-x-3">
                      <Phone className="h-6 w-6 text-rose-600" />
                      <div>
                        <CardTitle className="text-rose-900">Phone Support</CardTitle>
                        <CardDescription className="text-gray-600">Enterprise customers only</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-600">+1 (555) 123-4567</p>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-white to-amber-50 border-2 border-amber-100 hover:shadow-xl transition-all duration-300">
                  <CardHeader>
                    <div className="flex items-center space-x-3">
                      <Clock className="h-6 w-6 text-amber-600" />
                      <div>
                        <CardTitle className="text-amber-900">Support Hours</CardTitle>
                        <CardDescription className="text-gray-600">When our team is available</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1 text-sm text-gray-600">
                      <p>Monday - Friday: 9:00 AM - 6:00 PM PST</p>
                      <p>Saturday: 10:00 AM - 4:00 PM PST</p>
                      <p>Sunday: Closed</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Support Ticket Form */}
              <div>
                <h3 className="text-2xl font-bold text-gray-900 mb-6">Submit a Support Ticket</h3>

                <Card className="bg-white border-2 border-gray-200 shadow-xl">
                  <CardContent className="p-6">
                    <form onSubmit={handleTicketSubmit} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                          <Input
                            type="text"
                            value={ticketForm.name}
                            onChange={(e) => setTicketForm({ ...ticketForm, name: e.target.value })}
                            className="border-2 border-gray-200 focus:border-orange-500 focus:ring-orange-500 text-black"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                          <Input
                            type="email"
                            value={ticketForm.email}
                            onChange={(e) => setTicketForm({ ...ticketForm, email: e.target.value })}
                            className="border-2 border-gray-200 focus:border-orange-500 focus:ring-orange-500 text-black"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                        <Input
                          type="text"
                          value={ticketForm.subject}
                          onChange={(e) => setTicketForm({ ...ticketForm, subject: e.target.value })}
                          className="border-2 border-gray-200 focus:border-orange-500 focus:ring-orange-500 text-black"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                          <select
                            className="w-full p-2 border-2 border-gray-200 rounded-md focus:border-orange-500 focus:ring-orange-500 text-black"
                            value={ticketForm.priority}
                            onChange={(e) => setTicketForm({ ...ticketForm, priority: e.target.value })}
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="urgent">Urgent</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                          <select
                            className="w-full p-2 border-2 border-gray-200 rounded-md focus:border-orange-500 focus:ring-orange-500 text-black"
                            value={ticketForm.category}
                            onChange={(e) => setTicketForm({ ...ticketForm, category: e.target.value })}
                          >
                            <option value="general">General</option>
                            <option value="technical">Technical Issue</option>
                            <option value="billing">Billing</option>
                            <option value="integrations">Integrations</option>
                            <option value="feature">Feature Request</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <Textarea
                          rows={6}
                          value={ticketForm.description}
                          onChange={(e) => setTicketForm({ ...ticketForm, description: e.target.value })}
                          placeholder="Please describe your issue in detail..."
                          className="border-2 border-gray-200 focus:border-orange-500 focus:ring-orange-500 text-black"
                          required
                        />
                      </div>

                      <Button type="submit" className="w-full bg-orange-600 hover:bg-orange-700">
                        Submit Ticket
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* System Status Tab */}
          <TabsContent value="status" className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">System Status</h2>
              <div className="flex items-center justify-center space-x-2">
                <CheckCircle className="h-6 w-6 text-green-600" />
                <span className="text-lg font-medium text-green-600">All Systems Operational</span>
              </div>
            </div>

            <div className="grid gap-4">
              {[
                { name: "API", status: "operational" },
                { name: "Workflow Engine", status: "operational" },
                { name: "Integrations", status: "operational" },
                { name: "Dashboard", status: "operational" },
                { name: "Authentication", status: "operational" },
                { name: "Database", status: "operational" },
              ].map((service) => (
                <Card
                  key={service.name}
                  className="bg-white border-2 border-green-100 hover:shadow-xl transition-all duration-300"
                >
                  <CardContent className="flex items-center justify-between p-4">
                    <span className="font-medium text-gray-900">{service.name}</span>
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <Badge variant="secondary" className="bg-green-100 text-green-800">
                        Operational
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Resources Tab */}
          <TabsContent value="resources" className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Helpful Resources</h2>
              <p className="text-gray-600">Everything you need to get the most out of ChainReact</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                {
                  icon: Book,
                  title: "Getting Started Guide",
                  description: "Learn the basics of ChainReact",
                  color: "bg-gradient-to-br from-white to-orange-50 border-orange-100 text-orange-600",
                },
                {
                  icon: Zap,
                  title: "Workflow Templates",
                  description: "Pre-built workflows for common use cases",
                  color: "bg-gradient-to-br from-white to-yellow-50 border-yellow-100 text-yellow-600",
                },
                {
                  icon: Settings,
                  title: "API Documentation",
                  description: "Complete API reference and examples",
                  color: "bg-gradient-to-br from-white to-slate-50 border-slate-100 text-slate-600",
                },
                {
                  icon: Shield,
                  title: "Security Guide",
                  description: "Best practices for secure workflows",
                  color: "bg-gradient-to-br from-white to-green-50 border-green-100 text-green-600",
                },
                {
                  icon: Users,
                  title: "Team Management",
                  description: "How to collaborate with your team",
                  color: "bg-gradient-to-br from-white to-rose-50 border-rose-100 text-rose-600",
                },
                {
                  icon: HelpCircle,
                  title: "Troubleshooting",
                  description: "Common issues and solutions",
                  color: "bg-gradient-to-br from-white to-red-50 border-red-100 text-red-600",
                },
              ].map((resource, index) => (
                <Card
                  key={index}
                  className={`${resource.color} border-2 hover:shadow-xl transition-all duration-300 cursor-pointer hover:scale-105`}
                >
                  <CardHeader className="text-center">
                    <resource.icon className={`h-12 w-12 ${resource.color.split(" ")[4]} mx-auto mb-4`} />
                    <CardTitle className="text-gray-900">{resource.title}</CardTitle>
                    <CardDescription className="text-gray-600">{resource.description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
