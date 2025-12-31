"use client"

import React, { memo, useMemo } from 'react'
import {
  Settings,
  Bell,
  Heart,
  Target,
  Layers,
  Code,
  Database,
  Globe,
  BarChart3,
  Workflow,
  TrendingUp,
  Plus,
} from 'lucide-react'
import { Button } from "@/components/ui/button"

// Memoized floating components for better performance
const ChainLink = memo(({ className = "", delay = 0 }: { className?: string; delay?: number }) => (
  <div 
    className={`absolute ${className}`}
    style={{
      animation: `float 6s ease-in-out infinite`,
      animationDelay: `${delay}s`,
      willChange: 'transform',
    }}
  >
    <div className="relative w-16 h-16 md:w-20 md:h-20">
      <div className="absolute inset-0 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full opacity-20 blur-sm"></div>
      <div className="absolute inset-1 bg-gradient-to-br from-orange-500 to-orange-700 rounded-full shadow-lg transform rotate-12">
        <div className="absolute inset-2 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full"></div>
        <div className="absolute inset-3 bg-gradient-to-br from-orange-300 to-orange-500 rounded-full"></div>
        <div className="absolute top-1/2 left-1/2 w-6 h-6 bg-white rounded-full transform -translate-x-1/2 -translate-y-1/2 opacity-30"></div>
      </div>
    </div>
  </div>
))

const FloatingShape = memo(({ 
  className = "", 
  delay = 0, 
  shape = "circle" 
}: { 
  className?: string; 
  delay?: number; 
  shape?: "circle" | "square" | "triangle" | "hexagon"
}) => {
  const shapeClasses = useMemo(() => ({
    circle: "rounded-full",
    square: "rounded-lg rotate-45",
    triangle: "rounded-sm",
    hexagon: "rounded-lg"
  }), [])

  return (
    <div 
      className={`absolute ${className}`}
      style={{
        animation: `floatSlow 8s ease-in-out infinite`,
        animationDelay: `${delay}s`,
        willChange: 'transform',
      }}
    >
      <div className={`w-8 h-8 md:w-12 md:h-12 bg-gradient-to-br from-orange-400/30 to-rose-400/30 ${shapeClasses[shape]} backdrop-blur-sm border border-white/10`}></div>
    </div>
  )
})

const FloatingIcon = memo(({ 
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
  const colorClasses = useMemo(() => ({
    blue: "text-orange-400/60",
    purple: "text-rose-400/60",
    green: "text-green-400/60",
    pink: "text-pink-400/60",
    indigo: "text-orange-400/60"
  }), [])

  return (
    <div 
      className={`absolute ${className}`}
      style={{
        animation: `floatIcon 10s ease-in-out infinite`,
        animationDelay: `${delay}s`,
        willChange: 'transform',
      }}
    >
      <div className="relative">
        <div className="absolute inset-0 bg-white/5 rounded-full blur-sm w-8 h-8"></div>
        <Icon className={`w-6 h-6 ${colorClasses[color as keyof typeof colorClasses] || colorClasses.blue}`} />
      </div>
    </div>
  )
})

const AnalyticsCard = memo(({ className = "" }: { className?: string }) => (
  <div 
    className={`absolute ${className} bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20 shadow-xl`}
    style={{
      animation: `floatSlow 8s ease-in-out infinite`,
      animationDelay: '1s',
      willChange: 'transform',
    }}
  >
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-white font-semibold text-sm">Analytics</h3>
      <BarChart3 className="w-4 h-4 text-orange-300" />
    </div>
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-orange-200 text-xs">Active Workflows</span>
        <span className="text-white text-xs font-medium">24</span>
      </div>
      <div className="w-full bg-white/20 rounded-full h-1">
        <div className="bg-gradient-to-r from-orange-400 to-rose-400 h-1 rounded-full w-3/4"></div>
      </div>
      <div className="flex items-center space-x-1">
        <TrendingUp className="w-3 h-3 text-green-400" />
        <span className="text-green-400 text-xs">+12% this week</span>
      </div>
    </div>
  </div>
))

const WorkflowCard = memo(({ className = "" }: { className?: string }) => (
  <div 
    className={`absolute ${className} bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20 shadow-xl`}
    style={{
      animation: `floatSlow 7s ease-in-out infinite`,
      animationDelay: '2s',
      willChange: 'transform',
    }}
  >
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-white font-semibold text-sm">Workflow</h3>
      <Workflow className="w-4 h-4 text-orange-300" />
    </div>
    <div className="space-y-2">
      <div className="flex items-center space-x-2">
        <div className="w-6 h-4 bg-orange-500 rounded-sm"></div>
        <div className="w-1 h-1 bg-white rounded-full"></div>
        <div className="w-6 h-4 bg-rose-500 rounded-sm"></div>
        <div className="w-1 h-1 bg-white rounded-full"></div>
        <div className="w-6 h-4 bg-green-500 rounded-sm"></div>
      </div>
      <div className="text-orange-200 text-xs">Gmail → Slack → Trello</div>
    </div>
  </div>
))

const TaskCard = memo(({ className = "" }: { className?: string }) => (
  <div 
    className={`absolute ${className} bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20 shadow-xl`}
    style={{
      animation: `floatSlow 9s ease-in-out infinite`,
      animationDelay: '0.5s',
      willChange: 'transform',
    }}
  >
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-white font-semibold text-sm">New Task</h3>
      <Plus className="w-4 h-4 text-orange-300" />
    </div>
    <div className="space-y-2">
      <div className="space-y-1">
        <div className="text-orange-200 text-xs">Name</div>
        <div className="w-full h-2 bg-white/20 rounded"></div>
      </div>
      <div className="space-y-1">
        <div className="text-orange-200 text-xs">Assignee</div>
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-gradient-to-br from-orange-400 to-rose-400 rounded-full"></div>
          <div className="w-12 h-2 bg-white/20 rounded"></div>
        </div>
      </div>
      <Button size="sm" className="w-full bg-orange-600 hover:bg-orange-700 text-white text-xs h-6 transform hover:scale-105 transition-all duration-200">
        Create
      </Button>
    </div>
  </div>
))

// Main animated background component
const AnimatedBackground = memo(() => {
  return (
    <>
      {/* CSS Animations - optimized for performance */}
      <style jsx>{`
        @keyframes float {
          0%, 100% { 
            transform: translateY(0px) rotate(0deg); 
          }
          50% { 
            transform: translateY(-20px) rotate(180deg); 
          }
        }
        @keyframes floatSlow {
          0%, 100% { 
            transform: translateY(0px); 
          }
          50% { 
            transform: translateY(-10px); 
          }
        }
        @keyframes floatIcon {
          0%, 100% { 
            transform: translateY(0px) rotate(0deg) scale(1); 
          }
          50% { 
            transform: translateY(-15px) rotate(180deg) scale(1.1); 
          }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
        .animate-pulse-slow {
          animation: pulse 3s ease-in-out infinite;
        }
      `}</style>
      
      <div className="absolute inset-0 overflow-hidden">
        {/* Floating Particles - Reduced number for performance */}
        <div className="absolute top-10 left-10 w-2 h-2 bg-orange-400 rounded-full animate-pulse-slow"></div>
        <div className="absolute top-20 right-20 w-1 h-1 bg-rose-400 rounded-full animate-pulse-slow" style={{animationDelay: '1s'}}></div>
        <div className="absolute bottom-20 left-20 w-1 h-1 bg-orange-300 rounded-full animate-pulse-slow" style={{animationDelay: '2s'}}></div>
        <div className="absolute bottom-10 right-10 w-2 h-2 bg-orange-400 rounded-full animate-pulse-slow" style={{animationDelay: '0.5s'}}></div>
        
        {/* 3D Chain Links - Reduced number */}
        <ChainLink className="top-20 right-1/4 hidden md:block" delay={0} />
        <ChainLink className="bottom-32 left-1/4 hidden md:block" delay={1} />
        
        {/* Floating Geometric Shapes - Reduced number */}
        <FloatingShape className="top-40 left-1/2 hidden md:block" delay={0} shape="circle" />
        <FloatingShape className="bottom-40 right-1/2 hidden md:block" delay={2} shape="hexagon" />
        
        {/* Floating Icons - Reduced number */}
        <FloatingIcon Icon={Settings} className="top-32 left-1/4 hidden lg:block" delay={0} color="blue" />
        <FloatingIcon Icon={Bell} className="top-1/2 left-1/6 hidden lg:block" delay={1} color="purple" />
        <FloatingIcon Icon={Heart} className="bottom-1/3 right-1/4 hidden lg:block" delay={2} color="pink" />
        <FloatingIcon Icon={Target} className="top-3/4 right-1/6 hidden lg:block" delay={3} color="green" />
        
        {/* Floating UI Cards */}
        <AnalyticsCard className="top-32 right-10 w-40 hidden lg:block" />
        <WorkflowCard className="bottom-40 left-10 w-44 hidden lg:block" />
        <TaskCard className="top-1/2 right-20 w-36 hidden xl:block" />
      </div>
    </>
  )
})

ChainLink.displayName = 'ChainLink'
FloatingShape.displayName = 'FloatingShape'
FloatingIcon.displayName = 'FloatingIcon'
AnalyticsCard.displayName = 'AnalyticsCard'
WorkflowCard.displayName = 'WorkflowCard'
TaskCard.displayName = 'TaskCard'
AnimatedBackground.displayName = 'AnimatedBackground'

export default AnimatedBackground 