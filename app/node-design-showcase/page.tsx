"use client"

import React, { useState } from 'react'
import { Mail, Database, Zap, Check, X, ChevronDown, ChevronRight, Layers, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default function NodeDesignShowcase() {
  const [expandedCard, setExpandedCard] = useState<string | null>(null)
  const [selectedView, setSelectedView] = useState<'board' | 'table' | 'timeline'>('board')
  const [interactiveOption8, setInteractiveOption8] = useState({
    selectedNode: 0,
    nodes: [
      { title: "Get Email from Gmail", description: "Retrieve emails from Gmail inbox", icon: Mail, color: "bg-blue-500" },
      { title: "Download Attachment to Storage", description: "Download Gmail attachment and save to cloud storage", icon: Database, color: "bg-purple-500" },
      { title: "Send Notification", description: "Send success notification via Slack", icon: Zap, color: "bg-green-500" },
    ]
  })

  const [interactiveOption9, setInteractiveOption9] = useState({
    hoveredNode: null as number | null,
    nodes: [
      { title: "Trigger: New Email", description: "Watches Gmail inbox for new emails", icon: Mail, color: "blue" },
      { title: "Download Attachment", description: "Downloads file from email", icon: Database, color: "purple" },
      { title: "Upload to Storage", description: "Saves to cloud storage", icon: Settings, color: "green" },
      { title: "Send Success Alert", description: "Notifies via Slack", icon: Zap, color: "orange" },
    ]
  })

  const [interactiveOption11, setInteractiveOption11] = useState({
    currentStep: 0,
    playing: false,
    nodes: [
      { title: "Get Email", description: "Retrieve from Gmail", icon: Mail, status: "completed" },
      { title: "Download", description: "Get attachment", icon: Database, status: "running" },
      { title: "Save", description: "Store in cloud", icon: Settings, status: "pending" },
      { title: "Notify", description: "Send alert", icon: Zap, status: "pending" },
    ]
  })

  // Sample node data
  const sampleNode = {
    title: "Download Attachment to Storage",
    description: "Download Gmail attachment and save to cloud storage",
    icon: Mail,
    provider: "Gmail",
    status: "ready"
  }

  // Auto-play timeline
  React.useEffect(() => {
    if (interactiveOption11.playing) {
      const timer = setInterval(() => {
        setInteractiveOption11(prev => ({
          ...prev,
          currentStep: (prev.currentStep + 1) % prev.nodes.length
        }))
      }, 2000)
      return () => clearInterval(timer)
    }
  }, [interactiveOption11.playing])

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold">Workflow Node Design Options</h1>
          <p className="text-muted-foreground text-lg">
            Explore different visual approaches for workflow nodes
          </p>
        </div>

        {/* Current Design */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Current Design (Baseline)</h2>
          <div className="flex flex-wrap gap-4">
            <div className="w-[360px] bg-card rounded-lg shadow-sm border-2 border-border p-3">
              <div className="grid grid-cols-[40px_1fr] gap-2.5 items-center">
                <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                  <Mail className="w-6 h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold whitespace-nowrap overflow-hidden text-ellipsis">
                    Download Attachment to Stor...
                  </h3>
                  <p className="text-sm text-muted-foreground line-clamp-1">
                    Download Gmail attachment and save t...
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Option 1: Multi-line Wrapping */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Option 1: Multi-line Text Wrapping</h2>
          <div className="flex flex-wrap gap-4">
            <div className="w-[360px] bg-card rounded-lg shadow-sm border-2 border-border p-3">
              <div className="grid grid-cols-[40px_1fr] gap-2.5 items-start">
                <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                  <Mail className="w-6 h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold">
                    Download Attachment to Storage
                  </h3>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    Download Gmail attachment and save to cloud storage
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Option 2: Icon-Only + Hover Card */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Option 2: Icon-Only with Hover Card</h2>
          <div className="flex flex-wrap gap-4 items-start">
            <div className="w-16 h-16 bg-card rounded-lg shadow-sm border-2 border-border flex items-center justify-center group relative cursor-pointer">
              <Mail className="w-8 h-8 text-muted-foreground" />
              <div className="absolute left-20 top-0 w-80 bg-popover border border-border rounded-lg shadow-lg p-4 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                <h3 className="text-lg font-semibold mb-2">{sampleNode.title}</h3>
                <p className="text-sm text-muted-foreground">{sampleNode.description}</p>
                <div className="flex gap-2 mt-3">
                  <Badge variant="outline">{sampleNode.provider}</Badge>
                  <Badge variant="outline" className="bg-green-500/10 text-green-600">Ready</Badge>
                </div>
              </div>
            </div>
            <div className="text-sm text-muted-foreground italic">← Hover to see details</div>
          </div>
        </section>

        {/* Option 3: Horizontal Layout */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Option 3: Horizontal Flow Layout</h2>
          <div className="flex flex-wrap gap-4">
            <div className="w-[400px] bg-card rounded-lg shadow-sm border-2 border-border p-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Mail className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold mb-1">
                    Download Attachment to Storage
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Download Gmail attachment and save to cloud storage
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Option 4: Collapsible/Expandable */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Option 4: Collapsible/Expandable Nodes</h2>
          <div className="flex flex-wrap gap-4">
            {/* Collapsed */}
            <div
              className="w-[360px] bg-card rounded-lg shadow-sm border-2 border-border p-3 cursor-pointer hover:border-primary"
              onClick={() => setExpandedCard(expandedCard === 'collapsed1' ? null : 'collapsed1')}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                    <Mail className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-base font-semibold">Download Attach...</h3>
                </div>
                {expandedCard === 'collapsed1' ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
              </div>
              {expandedCard === 'collapsed1' && (
                <div className="mt-3 pl-10 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Download Gmail attachment and save to cloud storage
                  </p>
                  <div className="flex gap-2">
                    <Badge variant="outline">Gmail</Badge>
                    <Badge variant="outline">Storage</Badge>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Option 5: Title-Only Design */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Option 5: Title-Only (No Description)</h2>
          <div className="flex flex-wrap gap-4">
            <div className="w-[360px] bg-card rounded-lg shadow-sm border-2 border-border p-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                  <Mail className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-base font-semibold">
                  Gmail: Download to Storage
                </h3>
              </div>
            </div>
          </div>
        </section>

        {/* Option 6: Badge/Tag Style */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Option 6: Badge/Tag Style</h2>
          <div className="flex flex-wrap gap-4">
            <div className="w-[360px] bg-card rounded-lg shadow-sm border-2 border-border p-3">
              <div className="grid grid-cols-[40px_1fr] gap-2.5 items-start">
                <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                  <Mail className="w-6 h-6 text-white" />
                </div>
                <div className="min-w-0 space-y-2">
                  <h3 className="text-lg font-semibold">
                    Download Attachment to Storage
                  </h3>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="secondary" className="text-xs">Gmail</Badge>
                    <Badge variant="secondary" className="text-xs">Storage</Badge>
                    <Badge variant="outline" className="text-xs">Download</Badge>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Option 7: Vertical Stack Compact */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Option 7: Vertical Stack (Icon Top)</h2>
          <div className="flex flex-wrap gap-4">
            <div className="w-[200px] bg-card rounded-lg shadow-sm border-2 border-border p-3">
              <div className="flex flex-col items-center text-center space-y-2">
                <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center">
                  <Mail className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-sm font-semibold leading-tight">
                  Download Attachment to Storage
                </h3>
              </div>
            </div>
          </div>
        </section>

        {/* Option 8: Split Layout - INTERACTIVE */}
        <section className="space-y-6 bg-slate-50 dark:bg-slate-900 p-6 rounded-xl">
          <div className="space-y-2">
            <h2 className="text-3xl font-bold">Option 8: Split Header/Content ⚡ INTERACTIVE</h2>
            <p className="text-muted-foreground">Click on different nodes to see the split header design in action. Full workflow context shown.</p>
          </div>

          <div className="bg-card rounded-lg border-2 border-border p-6 space-y-6">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-xs">Demo Workflow</Badge>
              <span className="text-sm text-muted-foreground">Click any node to select it</span>
            </div>

            {/* Workflow Canvas Simulation */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {interactiveOption8.nodes.map((node, idx) => {
                const Icon = node.icon
                const isSelected = interactiveOption8.selectedNode === idx
                return (
                  <div
                    key={idx}
                    onClick={() => setInteractiveOption8(prev => ({ ...prev, selectedNode: idx }))}
                    className={`cursor-pointer transition-all duration-200 ${
                      isSelected ? 'scale-105' : 'hover:scale-102'
                    }`}
                  >
                    <div className={`w-full rounded-lg shadow-sm border-2 overflow-hidden ${
                      isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border'
                    }`}>
                      <div className={`${node.color} text-white p-3 flex items-center gap-2`}>
                        <Icon className="w-5 h-5" />
                        <span className="font-semibold text-sm">Step {idx + 1}</span>
                        {isSelected && <Badge variant="secondary" className="ml-auto bg-white/20 text-white">Active</Badge>}
                      </div>
                      <div className="p-3 space-y-1 bg-card">
                        <h3 className="font-semibold text-sm leading-tight">{node.title}</h3>
                        <p className="text-xs text-muted-foreground leading-snug">
                          {node.description}
                        </p>
                        {isSelected && (
                          <div className="pt-2 flex gap-2">
                            <Badge variant="outline" className="text-xs">Ready</Badge>
                            <Badge variant="outline" className="text-xs">Configured</Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Details Panel */}
            <div className="bg-muted/50 rounded-lg p-4 border border-border">
              <h4 className="font-semibold mb-2">Selected Node Details</h4>
              <div className="text-sm space-y-2">
                <div><span className="text-muted-foreground">Title:</span> <span className="font-medium">{interactiveOption8.nodes[interactiveOption8.selectedNode].title}</span></div>
                <div><span className="text-muted-foreground">Description:</span> {interactiveOption8.nodes[interactiveOption8.selectedNode].description}</div>
                <div><span className="text-muted-foreground">Position:</span> Step {interactiveOption8.selectedNode + 1} of {interactiveOption8.nodes.length}</div>
              </div>
            </div>
          </div>
        </section>

        {/* Option 9: Minimal Dot Nodes - INTERACTIVE */}
        <section className="space-y-6 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-slate-900 dark:to-slate-800 p-6 rounded-xl">
          <div className="space-y-2">
            <h2 className="text-3xl font-bold">Option 9: Minimal Dots with Labels ⚡ INTERACTIVE</h2>
            <p className="text-muted-foreground">Hover over nodes to see connection details and full information. Ultra-compact design.</p>
          </div>

          <div className="bg-card rounded-lg border-2 border-border p-8 overflow-x-auto">
            <div className="flex items-center justify-center gap-8 min-w-max">
              {interactiveOption9.nodes.map((node, idx) => {
                const Icon = node.icon
                const isHovered = interactiveOption9.hoveredNode === idx
                const colorClasses = {
                  blue: 'bg-blue-500',
                  purple: 'bg-purple-500',
                  green: 'bg-green-500',
                  orange: 'bg-orange-500'
                }

                return (
                  <React.Fragment key={idx}>
                    <div className="flex flex-col items-center gap-3">
                      {/* Dot Node */}
                      <div
                        className="relative"
                        onMouseEnter={() => setInteractiveOption9(prev => ({ ...prev, hoveredNode: idx }))}
                        onMouseLeave={() => setInteractiveOption9(prev => ({ ...prev, hoveredNode: null }))}
                      >
                        <div
                          className={`w-16 h-16 rounded-full ${colorClasses[node.color as keyof typeof colorClasses]} flex items-center justify-center shadow-lg cursor-pointer transition-all duration-300 ${
                            isHovered ? 'scale-125 shadow-2xl' : ''
                          }`}
                        >
                          <Icon className={`text-white transition-all ${isHovered ? 'w-9 h-9' : 'w-7 h-7'}`} />
                        </div>

                        {/* Hover Card */}
                        {isHovered && (
                          <div className="absolute top-20 left-1/2 -translate-x-1/2 w-64 bg-popover border-2 border-border rounded-lg shadow-2xl p-4 z-10 animate-in fade-in slide-in-from-bottom-2">
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <div className={`w-8 h-8 rounded-full ${colorClasses[node.color as keyof typeof colorClasses]} flex items-center justify-center`}>
                                  <Icon className="w-5 h-5 text-white" />
                                </div>
                                <Badge variant="outline">Step {idx + 1}</Badge>
                              </div>
                              <div>
                                <h4 className="font-semibold mb-1">{node.title}</h4>
                                <p className="text-sm text-muted-foreground">{node.description}</p>
                              </div>
                              <div className="flex gap-2 flex-wrap">
                                <Badge variant="secondary" className="text-xs">Ready</Badge>
                                <Badge variant="secondary" className="text-xs">Configured</Badge>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Label Below */}
                      <div className="text-center max-w-[120px]">
                        <div className={`text-sm font-medium transition-all ${isHovered ? 'text-primary' : ''}`}>
                          {node.title}
                        </div>
                      </div>
                    </div>

                    {/* Connector Arrow */}
                    {idx < interactiveOption9.nodes.length - 1 && (
                      <div className="flex items-center">
                        <div className="w-12 h-0.5 bg-gradient-to-r from-muted-foreground to-muted-foreground/50"></div>
                        <div className="w-2 h-2 rotate-45 bg-muted-foreground -ml-1"></div>
                      </div>
                    )}
                  </React.Fragment>
                )
              })}
            </div>

            {/* Workflow Info */}
            <div className="mt-8 text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                {interactiveOption9.hoveredNode !== null
                  ? `Viewing Step ${interactiveOption9.hoveredNode + 1}: ${interactiveOption9.nodes[interactiveOption9.hoveredNode].title}`
                  : 'Hover over any node to see details'
                }
              </p>
              <div className="flex justify-center gap-2">
                <Badge variant="outline">{interactiveOption9.nodes.length} Steps</Badge>
                <Badge variant="outline">Linear Flow</Badge>
                <Badge variant="outline">Compact View</Badge>
              </div>
            </div>
          </div>
        </section>

        {/* Option 10: Card with Status Strip */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Option 10: Status Strip Accent</h2>
          <div className="flex flex-wrap gap-4">
            <div className="w-[360px] bg-card rounded-lg shadow-sm border-2 border-border overflow-hidden">
              <div className="h-1 bg-green-500"></div>
              <div className="p-3">
                <div className="grid grid-cols-[40px_1fr] gap-2.5 items-center">
                  <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                    <Mail className="w-6 h-6 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold">
                      Download Attachment to Storage
                    </h3>
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      Download Gmail attachment and save to cloud storage
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Option 11: Timeline/Sequential View - INTERACTIVE */}
        <section className="space-y-6 bg-gradient-to-r from-green-50 to-blue-50 dark:from-slate-900 dark:to-slate-800 p-6 rounded-xl">
          <div className="space-y-2">
            <h2 className="text-3xl font-bold">Option 11: Timeline/Sequential Layout ⚡ INTERACTIVE</h2>
            <p className="text-muted-foreground">Watch the workflow execution progress. Click play to animate through steps.</p>
          </div>

          <div className="bg-card rounded-lg border-2 border-border p-6 space-y-6">
            {/* Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  onClick={() => setInteractiveOption11(prev => ({ ...prev, playing: !prev.playing }))}
                  variant={interactiveOption11.playing ? "destructive" : "default"}
                >
                  {interactiveOption11.playing ? 'Pause' : 'Play'} Animation
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setInteractiveOption11(prev => ({
                    ...prev,
                    currentStep: 0,
                    playing: false,
                    nodes: prev.nodes.map((n, i) => ({
                      ...n,
                      status: i === 0 ? 'running' : 'pending'
                    }))
                  }))}
                >
                  Reset
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">Step {interactiveOption11.currentStep + 1} / {interactiveOption11.nodes.length}</Badge>
              </div>
            </div>

            {/* Timeline */}
            <div className="overflow-x-auto">
              <div className="flex items-center gap-3 min-w-max pb-4">
                {interactiveOption11.nodes.map((node, idx) => {
                  const Icon = node.icon
                  const isCurrent = idx === interactiveOption11.currentStep
                  const isCompleted = idx < interactiveOption11.currentStep
                  const isPending = idx > interactiveOption11.currentStep

                  return (
                    <React.Fragment key={idx}>
                      <div
                        className={`relative flex items-center gap-3 rounded-lg p-3 border-2 transition-all duration-500 ${
                          isCurrent
                            ? 'bg-primary/10 border-primary shadow-lg scale-105'
                            : isCompleted
                            ? 'bg-green-500/10 border-green-500'
                            : 'bg-muted border-border'
                        }`}
                        onClick={() => setInteractiveOption11(prev => ({ ...prev, currentStep: idx, playing: false }))}
                      >
                        {/* Status Indicator */}
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                            isCurrent
                              ? 'bg-primary animate-pulse'
                              : isCompleted
                              ? 'bg-green-500'
                              : 'bg-muted-foreground/20'
                          }`}
                        >
                          {isCompleted ? (
                            <Check className="w-5 h-5 text-white" />
                          ) : (
                            <Icon className={`w-5 h-5 ${isCurrent ? 'text-white' : 'text-muted-foreground'}`} />
                          )}
                        </div>

                        {/* Node Info */}
                        <div className="space-y-0.5">
                          <div className={`font-semibold text-sm ${isCurrent ? 'text-primary' : ''}`}>
                            {node.title}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {node.description}
                          </div>
                          <div className="flex gap-1 mt-1">
                            {isCompleted && <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/20">Completed</Badge>}
                            {isCurrent && <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">Running</Badge>}
                            {isPending && <Badge variant="outline" className="text-xs">Pending</Badge>}
                          </div>
                        </div>

                        {/* Progress Ring */}
                        {isCurrent && (
                          <div className="absolute -top-1 -right-1 w-4 h-4">
                            <div className="w-4 h-4 bg-primary rounded-full animate-ping"></div>
                          </div>
                        )}
                      </div>

                      {/* Connector */}
                      {idx < interactiveOption11.nodes.length - 1 && (
                        <div className="flex flex-col items-center gap-1">
                          <div
                            className={`w-12 h-1 rounded transition-all duration-500 ${
                              idx < interactiveOption11.currentStep
                                ? 'bg-green-500'
                                : idx === interactiveOption11.currentStep
                                ? 'bg-primary animate-pulse'
                                : 'bg-border'
                            }`}
                          ></div>
                        </div>
                      )}
                    </React.Fragment>
                  )
                })}
              </div>
            </div>

            {/* Execution Log */}
            <div className="bg-muted/50 rounded-lg p-4 border border-border space-y-2">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Execution Log
              </h4>
              <div className="space-y-1 text-xs font-mono">
                {interactiveOption11.nodes.map((node, idx) => {
                  const isCompleted = idx < interactiveOption11.currentStep
                  const isCurrent = idx === interactiveOption11.currentStep
                  return (
                    <div
                      key={idx}
                      className={`flex items-center gap-2 ${
                        isCurrent ? 'text-primary font-semibold' : isCompleted ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
                      }`}
                    >
                      {isCompleted && <Check className="w-3 h-3" />}
                      {isCurrent && <div className="w-3 h-3 rounded-full bg-primary animate-pulse"></div>}
                      {!isCompleted && !isCurrent && <div className="w-3 h-3 rounded-full bg-muted-foreground/20"></div>}
                      <span>[{idx + 1}]</span>
                      <span>{node.title}</span>
                      {isCompleted && <span className="text-green-600 dark:text-green-400">✓ Success</span>}
                      {isCurrent && <span className="text-primary">⟳ Running...</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Option 12: Accordion/Tree View */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Option 12: Accordion/Tree Structure</h2>
          <div className="flex flex-wrap gap-4">
            <div className="w-[400px] bg-card border border-border rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2 cursor-pointer hover:bg-accent rounded p-1">
                <ChevronDown className="w-4 h-4" />
                <Mail className="w-5 h-5 text-blue-500" />
                <span className="font-medium">Gmail: Download Attachment to Storage</span>
              </div>
              <div className="pl-6 space-y-1 text-sm text-muted-foreground">
                <div>├─ Description: Download Gmail attachment and save to cloud storage</div>
                <div>├─ Provider: Gmail</div>
                <div>└─ Status: Ready</div>
              </div>
            </div>
          </div>
        </section>

        {/* Option 13: Floating Label */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Option 13: Floating Label Above</h2>
          <div className="flex flex-wrap gap-4">
            <div className="relative pt-16">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-popover border border-border rounded-lg px-3 py-1.5 shadow-sm whitespace-nowrap">
                <div className="text-sm font-medium">Download Attachment to Storage</div>
                <div className="text-xs text-muted-foreground">Gmail → Cloud Storage</div>
              </div>
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
                <Mail className="w-10 h-10 text-white" />
              </div>
            </div>
          </div>
        </section>

        {/* Option 14: Glassmorphic Design */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Option 14: Glassmorphic/Blur Effect</h2>
          <div className="flex flex-wrap gap-4">
            <div className="relative w-[360px]">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-purple-500/20 blur-xl rounded-lg"></div>
              <div className="relative bg-card/80 backdrop-blur-sm rounded-lg border border-white/20 shadow-lg p-3">
                <div className="grid grid-cols-[40px_1fr] gap-2.5 items-center">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                    <Mail className="w-6 h-6 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold">
                      Download Attachment to Storage
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Download Gmail attachment
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Option 15: Neumorphic Design */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Option 15: Neumorphic (Soft Shadow)</h2>
          <div className="flex flex-wrap gap-4">
            <div className="w-[360px] bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-2xl p-4 shadow-[8px_8px_16px_#bebebe,-8px_-8px_16px_#ffffff] dark:shadow-[8px_8px_16px_#0a0a0a,-8px_-8px_16px_#1e1e1e]">
              <div className="grid grid-cols-[40px_1fr] gap-2.5 items-center">
                <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center shadow-inner">
                  <Mail className="w-6 h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold">
                    Download Attachment to Storage
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Gmail attachment handler
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Option 16: 3D Card Effect */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Option 16: 3D Perspective Card</h2>
          <div className="flex flex-wrap gap-4">
            <div
              className="w-[360px] bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl p-4 shadow-2xl transform hover:scale-105 transition-transform cursor-pointer"
              style={{
                transform: 'perspective(1000px) rotateY(-5deg) rotateX(5deg)',
                boxShadow: '20px 20px 40px rgba(0,0,0,0.3), -10px -10px 20px rgba(255,255,255,0.1)'
              }}
            >
              <div className="grid grid-cols-[40px_1fr] gap-2.5 items-center">
                <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center">
                  <Mail className="w-6 h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-white">
                    Download Attachment to Storage
                  </h3>
                  <p className="text-sm text-white/80">
                    Download Gmail attachment
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Option 17: Layered/Stacked Cards */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Option 17: Layered/Stacked Effect</h2>
          <div className="flex flex-wrap gap-4">
            <div className="relative w-[360px] h-32">
              <div className="absolute inset-0 bg-card border-2 border-border rounded-lg transform translate-x-2 translate-y-2 opacity-30"></div>
              <div className="absolute inset-0 bg-card border-2 border-border rounded-lg transform translate-x-1 translate-y-1 opacity-60"></div>
              <div className="absolute inset-0 bg-card border-2 border-primary rounded-lg shadow-lg p-3 cursor-pointer hover:translate-y-0 hover:shadow-xl transition-all">
                <div className="grid grid-cols-[40px_1fr] gap-2.5 items-center">
                  <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                    <Mail className="w-6 h-6 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold">
                      Download Attachment to Storage
                    </h3>
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      Download Gmail attachment
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Option 18: Terminal/Code Style */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Option 18: Terminal/CLI Style</h2>
          <div className="flex flex-wrap gap-4">
            <div className="w-[400px] bg-slate-900 rounded-lg p-4 font-mono text-sm shadow-lg">
              <div className="text-green-400 mb-2">$ workflow.execute()</div>
              <div className="text-white pl-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-blue-400">→</span>
                  <span>gmail.download_attachment</span>
                </div>
                <div className="text-slate-400 pl-6 text-xs">
                  --to=storage<br/>
                  --description="Download Gmail attachment and save to cloud storage"
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Option 19: Pill/Chip Style */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Option 19: Pill/Chip Compact</h2>
          <div className="flex flex-wrap gap-4">
            <div className="inline-flex items-center gap-2 bg-blue-500 text-white rounded-full px-4 py-2 shadow-md hover:shadow-lg transition-shadow cursor-pointer">
              <Mail className="w-5 h-5" />
              <span className="font-medium">Download Attachment to Storage</span>
              <Badge variant="secondary" className="bg-white/20">Gmail</Badge>
            </div>
          </div>
        </section>

        {/* Option 20: Neon Glow Effect */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Option 20: Neon Glow/Cyberpunk</h2>
          <div className="flex flex-wrap gap-4 bg-slate-950 p-8 rounded-lg">
            <div
              className="w-[360px] bg-slate-900 rounded-lg p-3 border-2 border-cyan-500"
              style={{
                boxShadow: '0 0 20px rgba(6, 182, 212, 0.5), inset 0 0 10px rgba(6, 182, 212, 0.2)'
              }}
            >
              <div className="grid grid-cols-[40px_1fr] gap-2.5 items-center">
                <div
                  className="w-10 h-10 bg-cyan-500 rounded-lg flex items-center justify-center"
                  style={{
                    boxShadow: '0 0 15px rgba(6, 182, 212, 0.8)'
                  }}
                >
                  <Mail className="w-6 h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-cyan-400">
                    Download Attachment to Storage
                  </h3>
                  <p className="text-sm text-cyan-300/60">
                    Download Gmail attachment
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Option 21: Gradient Border */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Option 21: Animated Gradient Border</h2>
          <div className="flex flex-wrap gap-4">
            <div className="relative w-[360px] p-[2px] bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-lg">
              <div className="bg-card rounded-lg p-3">
                <div className="grid grid-cols-[40px_1fr] gap-2.5 items-center">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
                    <Mail className="w-6 h-6 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold">
                      Download Attachment to Storage
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Download Gmail attachment
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Option 22: Isometric 3D */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Option 22: Isometric 3D Perspective</h2>
          <div className="flex flex-wrap gap-4">
            <div
              className="w-[360px] bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg p-4"
              style={{
                transform: 'perspective(600px) rotateX(15deg) rotateY(-10deg)',
                boxShadow: '15px 15px 30px rgba(0,0,0,0.3)'
              }}
            >
              <div className="grid grid-cols-[40px_1fr] gap-2.5 items-center">
                <div
                  className="w-10 h-10 bg-white/30 rounded-lg flex items-center justify-center backdrop-blur-sm"
                  style={{
                    transform: 'translateZ(20px)',
                    boxShadow: '0 5px 15px rgba(0,0,0,0.2)'
                  }}
                >
                  <Mail className="w-6 h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-white drop-shadow-md">
                    Download Attachment to Storage
                  </h3>
                  <p className="text-sm text-white/90">
                    Download Gmail attachment
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Option 23: Depth Layers */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Option 23: 3D Depth Layers</h2>
          <div className="flex flex-wrap gap-4">
            <div className="relative w-[360px]" style={{ perspective: '1000px' }}>
              <div
                className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl p-4 shadow-2xl"
                style={{
                  transformStyle: 'preserve-3d',
                  transform: 'translateZ(0px)'
                }}
              >
                <div className="grid grid-cols-[40px_1fr] gap-2.5 items-center">
                  <div
                    className="w-10 h-10 bg-white rounded-lg flex items-center justify-center"
                    style={{
                      transform: 'translateZ(30px)',
                      boxShadow: '0 10px 20px rgba(0,0,0,0.3)'
                    }}
                  >
                    <Mail className="w-6 h-6 text-blue-500" />
                  </div>
                  <div
                    className="min-w-0"
                    style={{
                      transform: 'translateZ(15px)'
                    }}
                  >
                    <h3 className="text-lg font-semibold text-white">
                      Download Attachment to Storage
                    </h3>
                    <p className="text-sm text-white/90">
                      Download Gmail attachment
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Option 24: Floating Blocks */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Option 24: Floating 3D Blocks</h2>
          <div className="flex flex-wrap gap-4" style={{ perspective: '800px' }}>
            <div
              className="w-[360px] bg-card rounded-xl p-4 border-2 border-border shadow-lg transition-transform hover:scale-105"
              style={{
                transform: 'rotateX(10deg) rotateY(-5deg) translateZ(50px)',
                transformStyle: 'preserve-3d'
              }}
            >
              <div className="grid grid-cols-[40px_1fr] gap-2.5 items-center">
                <div
                  className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center"
                  style={{
                    transform: 'translateZ(20px)',
                    boxShadow: '0 8px 16px rgba(59, 130, 246, 0.4)'
                  }}
                >
                  <Mail className="w-6 h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold">
                    Download Attachment to Storage
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Download Gmail attachment
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Option 25: Holographic Effect */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Option 25: Holographic/Iridescent</h2>
          <div className="flex flex-wrap gap-4">
            <div
              className="w-[360px] rounded-xl p-4 shadow-xl relative overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.2)'
              }}
            >
              <div
                className="absolute inset-0 opacity-30"
                style={{
                  background: 'linear-gradient(45deg, #ff0080, #ff8c00, #40e0d0, #ff0080)',
                  backgroundSize: '400% 400%',
                  animation: 'gradient 3s ease infinite'
                }}
              ></div>
              <div className="relative grid grid-cols-[40px_1fr] gap-2.5 items-center">
                <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center">
                  <Mail className="w-6 h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-white">
                    Download Attachment to Storage
                  </h3>
                  <p className="text-sm text-white/80">
                    Download Gmail attachment
                  </p>
                </div>
              </div>
            </div>
          </div>
          <style jsx>{`
            @keyframes gradient {
              0% { background-position: 0% 50%; }
              50% { background-position: 100% 50%; }
              100% { background-position: 0% 50%; }
            }
          `}</style>
        </section>

      </div>
    </div>
  )
}
