"use client"

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Mail,
  Brain,
  FileText,
  MessageSquare,
  ArrowRight,
  PlayCircle,
  RefreshCw,
  Sparkles,
  Search,
  CheckCircle,
  Database
} from 'lucide-react'

type DemoStep = 'trigger' | 'ai-analysis' | 'document-search' | 'hitl-conversation' | 'ai-response' | 'complete'

interface Message {
  role: 'ai' | 'user'
  content: string
}

interface Document {
  name: string
  source: string
  snippet: string
}

export function HITLDemo() {
  const [currentStep, setCurrentStep] = useState<DemoStep>('trigger')
  const [isPlaying, setIsPlaying] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [foundDocuments, setFoundDocuments] = useState<Document[]>([])
  const [showResponse, setShowResponse] = useState(false)

  const resetDemo = () => {
    setCurrentStep('trigger')
    setIsPlaying(false)
    setMessages([])
    setFoundDocuments([])
    setShowResponse(false)
  }

  const startDemo = () => {
    setIsPlaying(true)
    setCurrentStep('trigger')
    setMessages([])
    setFoundDocuments([])
    setShowResponse(false)

    const steps: DemoStep[] = ['trigger', 'ai-analysis', 'document-search', 'hitl-conversation', 'ai-response', 'complete']
    let currentIndex = 0

    const interval = setInterval(() => {
      currentIndex++
      if (currentIndex < steps.length) {
        setCurrentStep(steps[currentIndex])

        // Show document search results
        if (steps[currentIndex] === 'document-search') {
          setTimeout(() => {
            setFoundDocuments([
              {
                name: 'Return Policy 2024',
                source: 'Google Drive',
                snippet: 'Customers can return items within 30 days for a full refund. International returns accepted with prepaid label.'
              },
              {
                name: 'Customer Service Guidelines',
                source: 'Notion',
                snippet: 'Always offer expedited shipping on replacement orders. Waive return shipping for defective items.'
              }
            ])
          }, 800)
        }

        // Show HITL conversation
        if (steps[currentIndex] === 'hitl-conversation') {
          setTimeout(() => {
            setMessages([{
              role: 'ai',
              content: "I found your return policy in Google Drive. The customer is asking about an international return. Should I mention the prepaid label option?"
            }])
          }, 500)

          setTimeout(() => {
            setMessages(prev => [...prev, {
              role: 'user',
              content: "Yes, and also let them know we'll expedite the replacement. Add that to memory for future international return questions."
            }])
          }, 2500)

          setTimeout(() => {
            setMessages(prev => [...prev, {
              role: 'ai',
              content: "Got it! I've saved: 'International returns → mention prepaid label + expedited replacement.' I'll remember this for next time."
            }])
          }, 4500)
        }

        // Show final AI response
        if (steps[currentIndex] === 'ai-response') {
          setTimeout(() => {
            setShowResponse(true)
          }, 500)
        }
      } else {
        clearInterval(interval)
        setIsPlaying(false)
      }
    }, 3000)

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
            AI That Reads Your Documents
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            Watch how AI accesses your stored documents, collaborates with you through HITL, and builds a memory of your preferences
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 items-start">
          {/* Left: Workflow Visualization */}
          <div className="relative">
            <Card className="bg-white/90 dark:bg-slate-950/70 backdrop-blur-xl border-white/60 dark:border-white/10 overflow-hidden">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                  <Mail className="w-5 h-5 text-blue-500" />
                  Customer Support with AI Memory
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
                          Customer asks about international returns
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
                          Understanding customer question...
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

                  <div className="flex justify-center">
                    <ArrowRight className="w-5 h-5 text-gray-400 dark:text-gray-600" />
                  </div>

                  {/* Step 3: Document Search */}
                  <motion.div
                    initial={{ opacity: 0.3 }}
                    animate={{
                      opacity: currentStep === 'document-search' ? 1 : 0.5,
                      scale: currentStep === 'document-search' ? 1.02 : 1
                    }}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      currentStep === 'document-search'
                        ? 'border-green-500 bg-green-50 dark:bg-green-500/10'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white">
                        <Search className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900 dark:text-white text-sm">
                          Document Search
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          Searching Google Drive & Notion...
                        </div>
                      </div>
                      {currentStep === 'document-search' && (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        >
                          <Search className="w-4 h-4 text-green-500" />
                        </motion.div>
                      )}
                    </div>
                  </motion.div>

                  <div className="flex justify-center">
                    <ArrowRight className="w-5 h-5 text-gray-400 dark:text-gray-600" />
                  </div>

                  {/* Step 4: HITL Conversation */}
                  <motion.div
                    initial={{ opacity: 0.3 }}
                    animate={{
                      opacity: currentStep === 'hitl-conversation' ? 1 : 0.5,
                      scale: currentStep === 'hitl-conversation' ? 1.02 : 1
                    }}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      currentStep === 'hitl-conversation'
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
                          HITL Collaboration
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          AI asks for your input...
                        </div>
                      </div>
                      {currentStep === 'hitl-conversation' && (
                        <Badge className="bg-yellow-500 text-white text-xs">
                          Active
                        </Badge>
                      )}
                    </div>
                  </motion.div>

                  <div className="flex justify-center">
                    <ArrowRight className="w-5 h-5 text-gray-400 dark:text-gray-600" />
                  </div>

                  {/* Step 5: AI Response */}
                  <motion.div
                    initial={{ opacity: 0.3 }}
                    animate={{
                      opacity: currentStep === 'ai-response' ? 1 : 0.5,
                      scale: currentStep === 'ai-response' ? 1.02 : 1
                    }}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      currentStep === 'ai-response'
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-white">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900 dark:text-white text-sm">
                          Draft Response
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          Using retrieved docs + your input...
                        </div>
                      </div>
                      {currentStep === 'ai-response' && (
                        <CheckCircle className="w-5 h-5 text-indigo-500" />
                      )}
                    </div>
                  </motion.div>

                  <div className="flex justify-center">
                    <ArrowRight className="w-5 h-5 text-gray-400 dark:text-gray-600" />
                  </div>

                  {/* Step 6: Complete */}
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
                          Complete
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          Email sent, memory saved
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

          {/* Right: Documents & Conversation */}
          <div className="space-y-6">
            {/* Found Documents */}
            <Card className="bg-white/90 dark:bg-slate-950/70 backdrop-blur-xl border-white/60 dark:border-white/10">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-green-500" />
                  Documents Found
                </h3>

                <div className="min-h-[180px]">
                  <AnimatePresence>
                    {foundDocuments.length === 0 ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col items-center justify-center h-[180px] text-gray-400 dark:text-gray-600 text-sm"
                      >
                        <Database className="w-12 h-12 mb-2 opacity-50" />
                        <span>AI will search your documents...</span>
                      </motion.div>
                    ) : (
                      <div className="space-y-3">
                        {foundDocuments.map((doc, idx) => (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.2 }}
                            className="p-3 rounded-lg bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20"
                          >
                            <div className="flex items-start gap-2 mb-1">
                              <FileText className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                              <div className="flex-1">
                                <div className="font-semibold text-sm text-gray-900 dark:text-white">
                                  {doc.name}
                                </div>
                                <div className="text-xs text-green-700 dark:text-green-300 mb-1">
                                  From {doc.source}
                                </div>
                                <div className="text-xs text-gray-700 dark:text-gray-300 italic">
                                  "{doc.snippet}"
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              </CardContent>
            </Card>

            {/* HITL Conversation */}
            <Card className="bg-white/90 dark:bg-slate-950/70 backdrop-blur-xl border-white/60 dark:border-white/10">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-yellow-500" />
                  HITL Conversation
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

            {/* AI Generated Response */}
            <AnimatePresence>
              {showResponse && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-500/10 dark:to-indigo-500/10 border-blue-200 dark:border-blue-500/20">
                    <CardContent className="p-6">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-white flex-shrink-0">
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
                            AI-Generated Email Response
                          </h4>
                          <div className="text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-900/50 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                            <p className="mb-2">Hi [Customer],</p>
                            <p className="mb-2">
                              Thank you for reaching out! We're happy to help with your international return.
                              You can return your item within 30 days for a full refund. We'll provide a prepaid
                              shipping label for your convenience.
                            </p>
                            <p className="mb-2">
                              Once we receive your return, we'll expedite the replacement shipment at no extra charge.
                            </p>
                            <p>Best regards,<br />Support Team</p>
                          </div>
                          <div className="mt-3 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            <span>Used: Return Policy doc + Your guidance + Memory saved</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Key Insight */}
            <Card className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-500/10 dark:to-pink-500/10 border-purple-200 dark:border-purple-500/20">
              <CardContent className="p-6">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center text-white flex-shrink-0">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-1">
                      AI with Memory
                    </h4>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      The AI accessed your Google Drive and Notion docs to find answers, collaborated with you
                      via HITL, and saved your preferences for future use. It's not just automation—it's
                      an intelligent assistant that knows your business.
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
