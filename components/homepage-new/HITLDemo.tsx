"use client"

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Mail,
  Brain,
  CheckCircle,
  XCircle,
  MessageSquare,
  TrendingUp,
  Sparkles,
  ArrowRight,
  PlayCircle,
  RefreshCw
} from 'lucide-react'

type DemoStep = 'trigger' | 'ai-analysis' | 'hitl-pause' | 'conversation' | 'learning' | 'complete'

interface Message {
  role: 'ai' | 'user'
  content: string
}

export function HITLDemo() {
  const [currentStep, setCurrentStep] = useState<DemoStep>('trigger')
  const [isPlaying, setIsPlaying] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [showAccuracyImprovement, setShowAccuracyImprovement] = useState(false)

  const resetDemo = () => {
    setCurrentStep('trigger')
    setIsPlaying(false)
    setMessages([])
    setShowAccuracyImprovement(false)
  }

  const startDemo = () => {
    setIsPlaying(true)
    setCurrentStep('trigger')

    // Automated demo progression
    const steps: DemoStep[] = ['trigger', 'ai-analysis', 'hitl-pause', 'conversation', 'learning', 'complete']
    let currentIndex = 0

    const interval = setInterval(() => {
      currentIndex++
      if (currentIndex < steps.length) {
        setCurrentStep(steps[currentIndex])

        // Add messages during conversation step
        if (steps[currentIndex] === 'conversation') {
          setTimeout(() => {
            setMessages([{
              role: 'ai',
              content: "Should I refund this customer? They're reporting a 3-week shipping delay."
            }])
          }, 500)

          setTimeout(() => {
            setMessages(prev => [...prev, {
              role: 'user',
              content: "Yes, refund. Any shipping delay over 2 weeks gets an automatic refund."
            }])
          }, 2500)
        }

        // Show accuracy improvement
        if (steps[currentIndex] === 'learning') {
          setTimeout(() => {
            setShowAccuracyImprovement(true)
          }, 500)
        }
      } else {
        clearInterval(interval)
        setIsPlaying(false)
      }
    }, 2500)

    return () => clearInterval(interval)
  }

  return (
    <section id="demo" className="relative z-10 px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-12">
          <Badge variant="secondary" className="bg-purple-600/20 text-purple-300 dark:text-purple-300 border border-purple-500/30 mb-4">
            <Sparkles className="w-3 h-3 mr-1" />
            Interactive Demo
          </Badge>
          <h2 className="text-3xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6">
            See Human-in-the-Loop AI in Action
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            Watch how your AI learns from your corrections and becomes smarter with every workflow run
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 items-start">
          {/* Left: Workflow Visualization */}
          <div className="relative">
            <Card className="bg-white/90 dark:bg-slate-950/70 backdrop-blur-xl border-white/60 dark:border-white/10 overflow-hidden">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                  <Mail className="w-5 h-5 text-blue-500" />
                  Customer Support Workflow
                </h3>

                {/* Workflow Steps */}
                <div className="space-y-4">
                  {/* Step 1: Trigger */}
                  <motion.div
                    initial={{ opacity: 0.3 }}
                    animate={{
                      opacity: currentStep === 'trigger' ? 1 : 0.5,
                      scale: currentStep === 'trigger' ? 1.02 : 1
                    }}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      currentStep === 'trigger'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white">
                        <Mail className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900 dark:text-white text-sm">
                          Gmail Trigger
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          New email received
                        </div>
                      </div>
                      {currentStep === 'trigger' && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"
                        />
                      )}
                    </div>
                  </motion.div>

                  {/* Arrow */}
                  <div className="flex justify-center">
                    <ArrowRight className="w-5 h-5 text-gray-400 dark:text-gray-600" />
                  </div>

                  {/* Step 2: AI Analysis */}
                  <motion.div
                    initial={{ opacity: 0.3 }}
                    animate={{
                      opacity: currentStep === 'ai-analysis' ? 1 : 0.5,
                      scale: currentStep === 'ai-analysis' ? 1.02 : 1
                    }}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      currentStep === 'ai-analysis'
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-500/10'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center text-white">
                        <Brain className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900 dark:text-white text-sm">
                          AI Analysis
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          Processing email content...
                        </div>
                      </div>
                      {currentStep === 'ai-analysis' && (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        >
                          <Brain className="w-4 h-4 text-purple-500" />
                        </motion.div>
                      )}
                    </div>
                  </motion.div>

                  {/* Arrow */}
                  <div className="flex justify-center">
                    <ArrowRight className="w-5 h-5 text-gray-400 dark:text-gray-600" />
                  </div>

                  {/* Step 3: HITL Pause */}
                  <motion.div
                    initial={{ opacity: 0.3 }}
                    animate={{
                      opacity: ['hitl-pause', 'conversation'].includes(currentStep) ? 1 : 0.5,
                      scale: ['hitl-pause', 'conversation'].includes(currentStep) ? 1.02 : 1
                    }}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      ['hitl-pause', 'conversation'].includes(currentStep)
                        ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-500/10'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-yellow-500 flex items-center justify-center text-white">
                        <MessageSquare className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900 dark:text-white text-sm">
                          HITL Pause
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          Awaiting your input...
                        </div>
                      </div>
                      {['hitl-pause', 'conversation'].includes(currentStep) && (
                        <Badge className="bg-yellow-500 text-white text-xs">
                          Active
                        </Badge>
                      )}
                    </div>
                  </motion.div>

                  {/* Arrow */}
                  <div className="flex justify-center">
                    <ArrowRight className="w-5 h-5 text-gray-400 dark:text-gray-600" />
                  </div>

                  {/* Step 4: Learning */}
                  <motion.div
                    initial={{ opacity: 0.3 }}
                    animate={{
                      opacity: currentStep === 'learning' ? 1 : 0.5,
                      scale: currentStep === 'learning' ? 1.02 : 1
                    }}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      currentStep === 'learning'
                        ? 'border-green-500 bg-green-50 dark:bg-green-500/10'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white">
                        <TrendingUp className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900 dark:text-white text-sm">
                          AI Learning
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          Training on your correction...
                        </div>
                      </div>
                      {currentStep === 'learning' && (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      )}
                    </div>
                  </motion.div>

                  {/* Arrow */}
                  <div className="flex justify-center">
                    <ArrowRight className="w-5 h-5 text-gray-400 dark:text-gray-600" />
                  </div>

                  {/* Step 5: Complete */}
                  <motion.div
                    initial={{ opacity: 0.3 }}
                    animate={{
                      opacity: currentStep === 'complete' ? 1 : 0.5,
                      scale: currentStep === 'complete' ? 1.02 : 1
                    }}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      currentStep === 'complete'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white">
                        <CheckCircle className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900 dark:text-white text-sm">
                          Workflow Complete
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          Refund processed, customer notified
                        </div>
                      </div>
                      {currentStep === 'complete' && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                        >
                          <CheckCircle className="w-5 h-5 text-blue-500" />
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                </div>
              </CardContent>
            </Card>

            {/* Control Buttons */}
            <div className="flex gap-3 mt-6 justify-center">
              <Button
                onClick={startDemo}
                disabled={isPlaying}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
              >
                <PlayCircle className="w-4 h-4 mr-2" />
                {isPlaying ? 'Playing...' : 'Start Demo'}
              </Button>
              <Button
                onClick={resetDemo}
                variant="outline"
                className="border-gray-300 dark:border-white/20"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Reset
              </Button>
            </div>
          </div>

          {/* Right: HITL Conversation & Results */}
          <div className="space-y-6">
            {/* Conversation Card */}
            <Card className="bg-white/90 dark:bg-slate-950/70 backdrop-blur-xl border-white/60 dark:border-white/10">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-yellow-500" />
                  Human-in-the-Loop Conversation
                </h3>

                <div className="min-h-[200px] space-y-4">
                  <AnimatePresence>
                    {messages.length === 0 && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex items-center justify-center h-[200px] text-gray-400 dark:text-gray-600 text-sm"
                      >
                        Conversation will appear here...
                      </motion.div>
                    )}

                    {messages.map((msg, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          msg.role === 'ai'
                            ? 'bg-purple-500 text-white'
                            : 'bg-blue-500 text-white'
                        }`}>
                          {msg.role === 'ai' ? (
                            <Brain className="w-4 h-4" />
                          ) : (
                            <span className="text-xs font-bold">You</span>
                          )}
                        </div>
                        <div className={`flex-1 p-3 rounded-xl ${
                          msg.role === 'ai'
                            ? 'bg-purple-50 dark:bg-purple-500/10 text-gray-900 dark:text-white'
                            : 'bg-blue-50 dark:bg-blue-500/10 text-gray-900 dark:text-white'
                        }`}>
                          <p className="text-sm">{msg.content}</p>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </CardContent>
            </Card>

            {/* AI Learning Progress */}
            <Card className="bg-white/90 dark:bg-slate-950/70 backdrop-blur-xl border-white/60 dark:border-white/10">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-green-500" />
                  AI Learning Progress
                </h3>

                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Autonomous Accuracy
                      </span>
                      <motion.span
                        className="text-sm font-semibold text-gray-900 dark:text-white"
                        animate={showAccuracyImprovement ? { scale: [1, 1.2, 1] } : {}}
                      >
                        {showAccuracyImprovement ? '85%' : '75%'}
                      </motion.span>
                    </div>
                    <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: '75%' }}
                        animate={{ width: showAccuracyImprovement ? '85%' : '75%' }}
                        transition={{ duration: 1, ease: "easeOut" }}
                        className="h-full bg-gradient-to-r from-green-500 to-green-600"
                      />
                    </div>
                  </div>

                  <AnimatePresence>
                    {showAccuracyImprovement && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-3 rounded-xl bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20"
                      >
                        <div className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                          <div className="text-sm text-green-900 dark:text-green-100">
                            <p className="font-semibold mb-1">AI learned new rule!</p>
                            <p className="text-xs text-green-700 dark:text-green-200">
                              "Shipping delays over 2 weeks = automatic refund"
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                    <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                      <div className="flex justify-between">
                        <span>Total corrections</span>
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {showAccuracyImprovement ? '48' : '47'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Rules learned</span>
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {showAccuracyImprovement ? '23' : '22'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Key Insight */}
            <Card className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-500/10 dark:to-purple-500/10 border-blue-200 dark:border-blue-500/20">
              <CardContent className="p-6">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white flex-shrink-0">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-1">
                      The Power of HITL
                    </h4>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      After just a few corrections, your AI learns your business rules, edge cases, and preferences.
                      What started as needing your input 80% of the time becomes 90% autonomous in months.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  )
}
