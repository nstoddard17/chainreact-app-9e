"use client"

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
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

        if (steps[currentIndex] === 'ai-response') {
          setTimeout(() => {
            setShowResponse(true)
          }, 2000)
        }
      } else {
        clearInterval(interval)
        setIsPlaying(false)
      }
    }, 3000)

    return () => clearInterval(interval)
  }

  return (
    <section id="demo" className="relative px-4 sm:px-6 lg:px-8 py-24 border-t border-gray-100 dark:border-gray-800">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <Badge className="bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-500/20 mb-4">
            <Sparkles className="w-3 h-3 mr-1" />
            Interactive Demo
          </Badge>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-4">
            AI That Reads Your Documents
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Watch how AI accesses your stored documents, collaborates with you in real-time, and builds a memory of your preferences
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 items-start">
          {/* Left: Workflow Steps */}
          <div>
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-3">
                <Mail className="w-4 h-4 text-blue-600" />
                Customer Support with AI Memory
              </h3>
            </div>

            <div className="space-y-3">
              {/* Step 1 */}
              <motion.div
                animate={{
                  opacity: currentStep === 'trigger' ? 1 : 0.4,
                }}
                className="flex items-start gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900"
              >
                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <div className="font-medium text-sm text-gray-900 dark:text-white">Gmail Trigger</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">Customer asks about international returns</div>
                </div>
              </motion.div>

              {/* Step 2 */}
              <motion.div
                animate={{
                  opacity: currentStep === 'ai-analysis' ? 1 : 0.4,
                }}
                className="flex items-start gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900"
              >
                <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                  <Brain className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <div className="font-medium text-sm text-gray-900 dark:text-white">AI Analysis</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">Understanding customer question...</div>
                </div>
              </motion.div>

              {/* Step 3 */}
              <motion.div
                animate={{
                  opacity: currentStep === 'document-search' ? 1 : 0.4,
                }}
                className="flex items-start gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900"
              >
                <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-500/10 flex items-center justify-center flex-shrink-0">
                  <Search className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <div className="font-medium text-sm text-gray-900 dark:text-white">Document Search</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">Searching Google Drive & Notion...</div>
                </div>
              </motion.div>

              {/* Step 4 */}
              <motion.div
                animate={{
                  opacity: currentStep === 'hitl-conversation' ? 1 : 0.4,
                }}
                className="flex items-start gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900"
              >
                <div className="w-8 h-8 rounded-full bg-yellow-100 dark:bg-yellow-500/10 flex items-center justify-center flex-shrink-0">
                  <MessageSquare className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <div className="font-medium text-sm text-gray-900 dark:text-white">Human Collaboration</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">AI asks for your input...</div>
                </div>
              </motion.div>

              {/* Step 5 */}
              <motion.div
                animate={{
                  opacity: currentStep === 'ai-response' ? 1 : 0.4,
                }}
                className="flex items-start gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900"
              >
                <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <div className="font-medium text-sm text-gray-900 dark:text-white">Draft Response</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">Using retrieved docs + your input...</div>
                </div>
              </motion.div>

              {/* Step 6 */}
              <motion.div
                animate={{
                  opacity: currentStep === 'complete' ? 1 : 0.4,
                }}
                className="flex items-start gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900"
              >
                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <div className="font-medium text-sm text-gray-900 dark:text-white">Complete</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">Email sent, memory saved</div>
                </div>
              </motion.div>
            </div>

            {/* Controls */}
            <div className="grid grid-cols-2 gap-3 mt-6">
              <Button
                onClick={startDemo}
                disabled={isPlaying}
                className="bg-blue-600 hover:bg-blue-700 text-white py-6 text-base"
              >
                <PlayCircle className="w-5 h-5 mr-2" />
                {isPlaying ? 'Playing...' : 'Start Demo'}
              </Button>
              <Button
                onClick={resetDemo}
                variant="outline"
                className="py-6 text-base"
              >
                <RefreshCw className="w-5 h-5 mr-2" />
                Reset
              </Button>
            </div>
          </div>

          {/* Right: Output */}
          <div className="space-y-6">
            {/* Documents Found */}
            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-green-600" />
                Documents Found
              </h4>
              <div className="space-y-3 min-h-[160px]">
                <AnimatePresence>
                  {foundDocuments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[160px] text-gray-400 dark:text-gray-600 text-sm">
                      <Database className="w-10 h-10 mb-2 opacity-50" />
                      <span>AI will search your documents...</span>
                    </div>
                  ) : (
                    foundDocuments.map((doc, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-3 rounded-lg border border-green-200 dark:border-green-500/20 bg-green-50 dark:bg-green-500/5"
                      >
                        <div className="flex items-start gap-2">
                          <FileText className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm text-gray-900 dark:text-white truncate">{doc.name}</div>
                            <div className="text-xs text-green-700 dark:text-green-300 mb-1">From {doc.source}</div>
                            <div className="text-xs text-gray-700 dark:text-gray-300 italic line-clamp-2">"{doc.snippet}"</div>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Conversation */}
            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-yellow-600" />
                Human Collaboration
              </h4>
              <div className="space-y-3 min-h-[180px]">
                <AnimatePresence>
                  {messages.length === 0 ? (
                    <div className="flex items-center justify-center h-[180px] text-gray-400 dark:text-gray-600 text-sm">
                      Conversation will appear here...
                    </div>
                  ) : (
                    messages.map((msg, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                      >
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                          msg.role === 'ai' ? 'bg-purple-100 dark:bg-purple-500/10' : 'bg-blue-100 dark:bg-blue-500/10'
                        }`}>
                          {msg.role === 'ai' ? (
                            <Brain className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                          ) : (
                            <span className="text-xs font-bold text-blue-600 dark:text-blue-400">Y</span>
                          )}
                        </div>
                        <div className={`flex-1 p-3 rounded-lg text-sm ${
                          msg.role === 'ai'
                            ? 'bg-purple-50 dark:bg-purple-500/5 text-gray-900 dark:text-white border border-purple-200 dark:border-purple-500/20'
                            : 'bg-blue-50 dark:bg-blue-500/5 text-gray-900 dark:text-white border border-blue-200 dark:border-blue-500/20'
                        }`}>
                          {msg.content}
                        </div>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Response */}
            <AnimatePresence>
              {showResponse && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    AI-Generated Response
                  </h4>
                  <div className="p-4 rounded-lg border border-indigo-200 dark:border-indigo-500/20 bg-indigo-50 dark:bg-indigo-500/5">
                    <div className="text-sm text-gray-900 dark:text-white space-y-2">
                      <p>Hi [Customer],</p>
                      <p>Thank you for reaching out! We're happy to help with your international return. You can return your item within 30 days for a full refund. We'll provide a prepaid shipping label for your convenience.</p>
                      <p>Once we receive your return, we'll expedite the replacement shipment at no extra charge.</p>
                      <p>Best regards,<br />Support Team</p>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                      <CheckCircle className="w-3 h-3 text-green-500" />
                      <span>Used: Return Policy doc + Your guidance + Memory saved</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  )
}
