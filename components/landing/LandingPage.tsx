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
  TrendingUp,
  User,
  Plus,
  Settings,
  Bell,
  Heart,
  Target,
  Layers,
} from "lucide-react"
import Link from "next/link"
import { useAuth } from "@/hooks/use-auth"

// 3D Chain Link Component
const ChainLink = ({ className = "", delay = 0 }: { className?: string; delay?: number }) => (
  <div 
    className={`absolute ${className}`}
    style={{
      animation: `float 6s ease-in-out infinite`,
      animationDelay: `${delay}s`,
    }}
  >
    <div className="relative w-16 h-16 md:w-20 md:h-20">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full opacity-20 blur-sm"></div>
      <div className="absolute inset-1 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full shadow-lg transform rotate-12">
        <div className="absolute inset-2 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full"></div>
        <div className="absolute inset-3 bg-gradient-to-br from-blue-300 to-blue-500 rounded-full"></div>
        <div className="absolute top-1/2 left-1/2 w-6 h-6 bg-white rounded-full transform -translate-x-1/2 -translate-y-1/2 opacity-30"></div>
      </div>
    </div>
  </div>
)

// Floating Geometric Shapes
const FloatingShape = ({ 
  className = "", 
  delay = 0, 
  shape = "circle" 
}: { 
  className?: string; 
  delay?: number; 
  shape?: "circle" | "square" | "triangle" | "hexagon"
}) => {
  const shapeClasses = {
    circle: "rounded-full",
    square: "rounded-lg rotate-45",
    triangle: "rounded-sm",
    hexagon: "rounded-lg"
  }

  return (
    <div 
      className={`absolute ${className}`}
      style={{
        animation: `floatSlow 8s ease-in-out infinite`,
        animationDelay: `${delay}s`,
      }}
    >
      <div className={`w-8 h-8 md:w-12 md:h-12 bg-gradient-to-br from-blue-400/30 to-purple-400/30 ${shapeClasses[shape]} backdrop-blur-sm border border-white/10`}></div>
    </div>
  )
}

// Animated Icon Components
const FloatingIcon = ({ 
  Icon, 
  className = "", 
  delay = 0,
  color = "blue"
}: { 
  Icon: any; 
  className?: string; 
  delay?: number;
  color?: string;
}) => {
  const colorClasses = {
    blue: "text-blue-400/60",
    purple: "text-purple-400/60",
    green: "text-green-400/60",
    pink: "text-pink-400/60",
    indigo: "text-indigo-400/60"
  }

  return (
    <div 
      className={`absolute ${className}`}
      style={{
        animation: `floatIcon 10s ease-in-out infinite`,
        animationDelay: `${delay}s`,
      }}
    >
      <div className="relative">
        <div className="absolute inset-0 bg-white/5 rounded-full blur-sm w-8 h-8"></div>
        <Icon className={`w-6 h-6 ${colorClasses[color as keyof typeof colorClasses] || colorClasses.blue}`} />
      </div>
    </div>
  )
}

// Floating UI Card Components
const AnalyticsCard = ({ className = "" }: { className?: string }) => (
  <div 
    className={`absolute ${className} bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20 shadow-xl`}
    style={{
      animation: `floatSlow 8s ease-in-out infinite`,
      animationDelay: '1s',
    }}
  >
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-white font-semibold text-sm">Analytics</h3>
      <BarChart3 className="w-4 h-4 text-blue-300" />
    </div>
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-blue-200 text-xs">Active Workflows</span>
        <span className="text-white text-xs font-medium">24</span>
      </div>
      <div className="w-full bg-white/20 rounded-full h-1">
        <div className="bg-gradient-to-r from-blue-400 to-purple-400 h-1 rounded-full w-3/4"></div>
      </div>
      <div className="flex items-center space-x-1">
        <TrendingUp className="w-3 h-3 text-green-400" />
        <span className="text-green-400 text-xs">+12% this week</span>
      </div>
    </div>
  </div>
)

const WorkflowCard = ({ className = "" }: { className?: string }) => (
  <div 
    className={`absolute ${className} bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20 shadow-xl`}
    style={{
      animation: `floatSlow 7s ease-in-out infinite`,
      animationDelay: '2s',
    }}
  >
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-white font-semibold text-sm">Workflow</h3>
      <Workflow className="w-4 h-4 text-blue-300" />
    </div>
    <div className="space-y-2">
      <div className="flex items-center space-x-2">
        <div className="w-6 h-4 bg-blue-500 rounded-sm"></div>
        <div className="w-1 h-1 bg-white rounded-full"></div>
        <div className="w-6 h-4 bg-purple-500 rounded-sm"></div>
        <div className="w-1 h-1 bg-white rounded-full"></div>
        <div className="w-6 h-4 bg-green-500 rounded-sm"></div>
      </div>
      <div className="text-blue-200 text-xs">Gmail → Slack → Trello</div>
    </div>
  </div>
)

const TaskCard = ({ className = "" }: { className?: string }) => (
  <div 
    className={`absolute ${className} bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20 shadow-xl`}
    style={{
      animation: `floatSlow 9s ease-in-out infinite`,
      animationDelay: '0.5s',
    }}
  >
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-white font-semibold text-sm">New Task</h3>
      <Plus className="w-4 h-4 text-blue-300" />
    </div>
    <div className="space-y-2">
      <div className="space-y-1">
        <div className="text-blue-200 text-xs">Name</div>
        <div className="w-full h-2 bg-white/20 rounded"></div>
      </div>
      <div className="space-y-1">
        <div className="text-blue-200 text-xs">Assignee</div>
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full"></div>
          <div className="w-12 h-2 bg-white/20 rounded"></div>
        </div>
      </div>
      <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs h-6 transform hover:scale-105 transition-all duration-200">
        Create
      </Button>
    </div>
  </div>
)

export default function LandingPage() {
  const { isAuthenticated, user, isReady } = useAuth()

  // Show loading state while auth is initializing
  if (!isReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-blue-200">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(180deg); }
        }
        @keyframes floatSlow {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        @keyframes floatIcon {
          0%, 100% { transform: translateY(0px) rotate(0deg) scale(1); }
          50% { transform: translateY(-15px) rotate(180deg) scale(1.1); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes buttonHover {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-2px) scale(1.02); }
        }
        .animate-pulse-slow {
          animation: pulse 3s ease-in-out infinite;
        }
        .animate-shimmer {
          animation: shimmer 2s ease-in-out infinite;
        }
        .button-animated {
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }
        .button-animated:hover {
          animation: buttonHover 0.6s ease-in-out;
          box-shadow: 0 10px 25px rgba(59, 130, 246, 0.3);
        }
        .button-animated::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
          transition: left 0.5s;
        }
        .button-animated:hover::before {
          left: 100%;
        }
      `}</style>
      
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 relative overflow-hidden">
        {/* Rich Animated Background Elements */}
        <div className="absolute inset-0 overflow-hidden">
          {/* Floating Particles */}
          <div className="absolute top-10 left-10 w-2 h-2 bg-blue-400 rounded-full animate-pulse-slow"></div>
          <div className="absolute top-20 right-20 w-1 h-1 bg-purple-400 rounded-full animate-pulse-slow" style={{animationDelay: '1s'}}></div>
          <div className="absolute bottom-20 left-20 w-1 h-1 bg-blue-300 rounded-full animate-pulse-slow" style={{animationDelay: '2s'}}></div>
          <div className="absolute bottom-10 right-10 w-2 h-2 bg-indigo-400 rounded-full animate-pulse-slow" style={{animationDelay: '0.5s'}}></div>
          <div className="absolute top-1/3 left-1/3 w-1 h-1 bg-pink-400 rounded-full animate-pulse-slow" style={{animationDelay: '1.5s'}}></div>
          <div className="absolute top-2/3 right-1/3 w-2 h-2 bg-green-400 rounded-full animate-pulse-slow" style={{animationDelay: '2.5s'}}></div>
          
          {/* 3D Chain Links */}
          <ChainLink className="top-20 right-1/4 hidden md:block" delay={0} />
          <ChainLink className="bottom-32 left-1/4 hidden md:block" delay={1} />
          <ChainLink className="top-1/2 right-10 hidden lg:block" delay={2} />
          <ChainLink className="top-1/3 left-10 hidden lg:block" delay={3} />
          
          {/* Floating Geometric Shapes */}
          <FloatingShape className="top-40 left-1/2 hidden md:block" delay={0} shape="circle" />
          <FloatingShape className="top-60 right-1/3 hidden md:block" delay={1} shape="square" />
          <FloatingShape className="bottom-40 right-1/2 hidden md:block" delay={2} shape="hexagon" />
          <FloatingShape className="bottom-60 left-1/3 hidden md:block" delay={3} shape="triangle" />
          <FloatingShape className="top-1/4 right-20 hidden lg:block" delay={4} shape="circle" />
          <FloatingShape className="bottom-1/4 left-20 hidden lg:block" delay={5} shape="square" />
          
          {/* Floating Icons */}
          <FloatingIcon Icon={Settings} className="top-32 left-1/4 hidden lg:block" delay={0} color="blue" />
          <FloatingIcon Icon={Bell} className="top-1/2 left-1/6 hidden lg:block" delay={1} color="purple" />
          <FloatingIcon Icon={Heart} className="bottom-1/3 right-1/4 hidden lg:block" delay={2} color="pink" />
          <FloatingIcon Icon={Target} className="top-3/4 right-1/6 hidden lg:block" delay={3} color="green" />
          <FloatingIcon Icon={Layers} className="top-1/6 right-1/3 hidden lg:block" delay={4} color="indigo" />
          <FloatingIcon Icon={Code} className="bottom-1/6 left-1/6 hidden lg:block" delay={5} color="blue" />
          <FloatingIcon Icon={Database} className="top-2/3 left-1/3 hidden lg:block" delay={6} color="purple" />
          <FloatingIcon Icon={Globe} className="bottom-2/3 right-1/6 hidden lg:block" delay={7} color="green" />
          
          {/* Floating UI Cards */}
          <AnalyticsCard className="top-32 right-10 w-40 hidden lg:block" />
          <WorkflowCard className="bottom-40 left-10 w-44 hidden lg:block" />
          <TaskCard className="top-1/2 right-20 w-36 hidden xl:block" />
        </div>

        {/* Centered Navigation Buttons */}
        <div className="relative z-10 pt-8 pb-4">
          <div className="flex justify-center items-center space-x-6">
            <Link href="#features">
              <Button 
                variant="ghost" 
                className="button-animated text-blue-200 hover:text-white hover:bg-white/10 px-6 py-2 rounded-full transition-all duration-300"
              >
                Features
              </Button>
            </Link>
            <Link href="#pricing">
              <Button 
                variant="ghost" 
                className="button-animated text-blue-200 hover:text-white hover:bg-white/10 px-6 py-2 rounded-full transition-all duration-300"
              >
                Pricing
              </Button>
            </Link>
            {!isAuthenticated ? (
              <>
                <Link href="/auth/login">
                  <Button 
                    variant="ghost" 
                    className="button-animated text-blue-200 hover:text-white hover:bg-white/10 px-6 py-2 rounded-full transition-all duration-300"
                  >
                    Login
                  </Button>
                </Link>
                <Link href="/auth/register">
                  <Button className="button-animated bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-full shadow-lg hover:shadow-xl">
                    Sign Up
                  </Button>
                </Link>
              </>
            ) : (
              <Link href="/dashboard">
                <Button className="button-animated bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-full shadow-lg hover:shadow-xl">
                  Dashboard
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Hero Section */}
        <section className="relative z-10 px-4 sm:px-6 lg:px-8 pt-12 pb-16 md:pt-16 md:pb-20">
          <div className="max-w-4xl mx-auto text-center">
            {isAuthenticated ? (
              <>
                <Badge variant="secondary" className="mb-6 bg-green-500/20 text-green-300 border-green-500/30 hover:bg-green-500/30 animate-pulse">
                  ✅ Welcome back! You're logged in
                </Badge>
                <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-6 leading-tight">
                  Ready to Build
                  <span className="block bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                    Amazing Workflows?
                  </span>
                </h1>
                <p className="text-xl md:text-2xl text-blue-200 mb-8 max-w-3xl mx-auto leading-relaxed">
                  Welcome back,{" "}
                  {(user as any)?.user_metadata?.first_name ||
                    (user as any)?.user_metadata?.name?.split(" ")[0] ||
                    user?.email?.split("@")[0]}
                  ! Continue building powerful workflows and automating your tasks.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
                  <Link href="/dashboard">
                    <Button size="lg" className="button-animated text-lg px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg hover:shadow-xl">
                      Go to Dashboard <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Link href="/workflows">
                    <Button
                      size="lg"
                      variant="outline"
                      className="button-animated text-lg px-8 py-4 border-blue-400 text-blue-400 hover:bg-blue-400/10 rounded-full"
                    >
                      <Workflow className="mr-2 h-5 w-5" />
                      Build Workflows
                    </Button>
                  </Link>
                </div>
              </>
            ) : (
              <>
                <Badge variant="secondary" className="mb-6 bg-blue-500/20 text-blue-300 border-blue-500/30 hover:bg-blue-500/30 animate-pulse">
                  🚀 Now in Beta - Join thousands of users automating their workflows
                </Badge>
                <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-6 leading-tight">
                  Connect.
                  <span className="block">Automate.</span>
                  <span className="block bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                    React.
                  </span>
                </h1>
                <p className="text-xl md:text-2xl text-blue-200 mb-8 max-w-3xl mx-auto leading-relaxed">
                  Transform your workflow with intelligent automation. Connect your favorite apps, eliminate repetitive tasks, and boost productivity—all without writing a single line of code.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
                  <Link href="/auth/register">
                    <Button size="lg" className="button-animated text-lg px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg hover:shadow-xl">
                      Get Started <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Link href="#features">
                    <Button
                      size="lg"
                      variant="outline"
                      className="button-animated text-lg px-8 py-4 border-blue-400 text-blue-400 hover:bg-blue-400/10 rounded-full"
                    >
                      <Play className="mr-2 h-5 w-5" />
                      Watch Demo
                    </Button>
                  </Link>
                </div>
                <p className="text-sm text-blue-300 opacity-80">
                  Free 14-day trial • No credit card required • Cancel anytime
                </p>
              </>
            )}
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="relative z-10 px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
                {isAuthenticated ? "Your automation toolkit" : "Everything you need to automate"}
              </h2>
              <p className="text-xl text-blue-200 max-w-2xl mx-auto">
                {isAuthenticated
                  ? "Explore all the powerful features available in your ChainReact workspace."
                  : "Powerful features designed to make workflow automation simple, reliable, and scalable."}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              <Card className="p-6 bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-all duration-300 hover:shadow-xl transform hover:scale-105">
                <CardContent className="p-0">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center mb-4">
                    <Workflow className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Visual Workflow Builder</h3>
                  <p className="text-blue-200 mb-4">
                    Drag and drop interface to create complex workflows without writing a single line of code.
                  </p>
                  {isAuthenticated && (
                    <Link href="/workflows">
                      <Button size="sm" variant="outline" className="button-animated text-blue-400 border-blue-400 hover:bg-blue-400/10">
                        Build Now
                      </Button>
                    </Link>
                  )}
                </CardContent>
              </Card>

              <Card className="p-6 bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-all duration-300 hover:shadow-xl transform hover:scale-105">
                <CardContent className="p-0">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center mb-4">
                    <Zap className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Lightning Fast</h3>
                  <p className="text-blue-200 mb-4">Execute workflows in milliseconds with our optimized automation engine.</p>
                  {isAuthenticated && (
                    <Link href="/analytics">
                      <Button size="sm" variant="outline" className="button-animated text-purple-400 border-purple-400 hover:bg-purple-400/10">
                        View Analytics
                      </Button>
                    </Link>
                  )}
                </CardContent>
              </Card>

              <Card className="p-6 bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-all duration-300 hover:shadow-xl transform hover:scale-105">
                <CardContent className="p-0">
                  <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-teal-500 rounded-lg flex items-center justify-center mb-4">
                    <Shield className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Enterprise Security</h3>
                  <p className="text-blue-200 mb-4">Bank-grade security with end-to-end encryption and compliance standards.</p>
                  {isAuthenticated && (
                    <Link href="/settings">
                      <Button size="sm" variant="outline" className="button-animated text-green-400 border-green-400 hover:bg-green-400/10">
                        Security Settings
                      </Button>
                    </Link>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="relative z-10 px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
                Simple, transparent pricing
              </h2>
              <p className="text-xl text-blue-200 max-w-2xl mx-auto">
                Choose the plan that fits your needs. Upgrade or downgrade at any time.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {/* Free Plan */}
              <Card className="p-8 bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-all duration-300 transform hover:scale-105">
                <CardContent className="p-0 text-center">
                  <h3 className="text-2xl font-bold text-white mb-2">Free</h3>
                  <div className="text-4xl font-bold text-blue-400 mb-4">$0<span className="text-lg text-blue-200">/month</span></div>
                  <ul className="space-y-3 mb-8 text-blue-200">
                    <li className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-green-400 mr-2" />
                      5 workflows
                    </li>
                    <li className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-green-400 mr-2" />
                      100 executions/month
                    </li>
                    <li className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-green-400 mr-2" />
                      Basic integrations
                    </li>
                  </ul>
                  <Link href="/auth/register">
                    <Button className="button-animated w-full bg-white/10 hover:bg-white/20 text-white border border-white/20">
                      Get Started
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              {/* Pro Plan */}
              <Card className="p-8 bg-gradient-to-br from-blue-600/20 to-purple-600/20 backdrop-blur-sm border border-blue-400/30 hover:border-blue-400/50 transition-all duration-300 relative transform hover:scale-105">
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-4 py-1 animate-pulse">
                    Most Popular
                  </Badge>
                </div>
                <CardContent className="p-0 text-center">
                  <h3 className="text-2xl font-bold text-white mb-2">Pro</h3>
                  <div className="text-4xl font-bold text-blue-400 mb-4">$29<span className="text-lg text-blue-200">/month</span></div>
                  <ul className="space-y-3 mb-8 text-blue-200">
                    <li className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-green-400 mr-2" />
                      Unlimited workflows
                    </li>
                    <li className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-green-400 mr-2" />
                      10,000 executions/month
                    </li>
                    <li className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-green-400 mr-2" />
                      All integrations
                    </li>
                    <li className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-green-400 mr-2" />
                      Priority support
                    </li>
                  </ul>
                  <Link href="/auth/register">
                    <Button className="button-animated w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white">
                      Start Free Trial
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              {/* Enterprise Plan */}
              <Card className="p-8 bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-all duration-300 transform hover:scale-105">
                <CardContent className="p-0 text-center">
                  <h3 className="text-2xl font-bold text-white mb-2">Enterprise</h3>
                  <div className="text-4xl font-bold text-blue-400 mb-4">Custom</div>
                  <ul className="space-y-3 mb-8 text-blue-200">
                    <li className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-green-400 mr-2" />
                      Unlimited everything
                    </li>
                    <li className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-green-400 mr-2" />
                      Custom integrations
                    </li>
                    <li className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-green-400 mr-2" />
                      Dedicated support
                    </li>
                    <li className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-green-400 mr-2" />
                      SLA guarantee
                    </li>
                  </ul>
                  <Link href="/enterprise">
                    <Button className="button-animated w-full bg-white/10 hover:bg-white/20 text-white border border-white/20">
                      Contact Sales
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

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
                  <Button size="lg" className="button-animated text-lg px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg hover:shadow-xl">
                    Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link href="/support">
                  <Button
                    size="lg"
                    variant="outline"
                    className="button-animated text-lg px-8 py-4 border-blue-400 text-blue-400 hover:bg-blue-400/10 rounded-full"
                  >
                    Talk to Sales
                  </Button>
                </Link>
              </div>
            </div>
          </section>
        )}
      </div>
    </>
  )
}
