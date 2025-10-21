"use client"

import RegisterForm from "@/components/auth/RegisterForm"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft } from "lucide-react"

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
      <div className={`w-8 h-8 md:w-12 md:h-12 bg-gradient-to-br from-blue-400/30 to-purple-400/30 ${shapeClasses[shape as keyof typeof shapeClasses]} backdrop-blur-sm border border-white/10`}></div>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <>
      <style jsx>{`
        @keyframes floatSlow {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
      `}</style>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 z-0">
          <FloatingShape className="top-10 left-10" shape="circle" delay={0} />
          <FloatingShape className="top-1/4 right-1/4" shape="square" delay={1} />
          <FloatingShape className="bottom-1/2 left-1/3" shape="triangle" delay={2} />
          <FloatingShape className="bottom-10 right-10" shape="hexagon" delay={3} />
          <FloatingShape className="bottom-1/4 left-1/4" shape="circle" delay={4} />
          <FloatingShape className="top-1/2 right-1/3" shape="square" delay={5} />
        </div>
        <div className="w-full max-w-md z-10">
          <div className="text-center mb-6">
            <Link href="/" className="inline-flex items-center text-blue-300 hover:text-blue-100 transition-colors">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Link>
          </div>
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <Image
                src="/logo_transparent.png"
                alt="ChainReact Logo"
                width={64}
                height={64}
                className="w-16 h-16"
              />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Join ChainReact</h1>
            <p className="text-blue-200">Start automating your workflows today</p>
          </div>
          <RegisterForm />
        </div>
      </div>
    </>
  )
}
