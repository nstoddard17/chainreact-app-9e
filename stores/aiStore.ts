"use client"

import { create } from "zustand"
import { suggestNodeConfiguration, generateNodeSuggestions } from "@/lib/ai/workflowGenerator"
import {
  analyzeWorkflowPerformance,
  detectWorkflowAnomalies,
  suggestWorkflowConsolidation,
} from "@/lib/ai/workflowOptimizer"
import { generateDataMapping, suggestDataTransformations, detectDataPatterns } from "@/lib/ai/dataMapper"

interface AIState {
  optimizations: Record<string, any[]>
  anomalies: Record<string, any[]>
  isGenerating: boolean
  error: string | null
  // Workflow Generation
  generatedWorkflow: any | null
  generationHistory: any[]

  // Optimization
  isAnalyzing: boolean
  workflowAnalysis: any | null
  optimizationSuggestions: any[]

  // Data Mapping
  isMappingData: boolean
  dataMappings: any[]

  // Node Suggestions
  nodeSuggestions: any[]

  // Loading states
  loading: {
    generation: boolean
    optimization: boolean
    mapping: boolean
    anomalies: boolean
    suggestions: boolean
  }
}

interface AIActions {
  fetchOptimizations: (workflowId: string) => Promise<void>
  fetchAnomalies: (workflowId: string) => Promise<void>
  generateWorkflow: (prompt: string) => Promise<any>
  // Workflow Generation
  saveGeneratedWorkflow: (workflow: any, feedback?: any) => Promise<void>
  getGenerationHistory: () => Promise<void>

  // Node Suggestions
  getNodeSuggestions: (workflow: any, position: { x: number; y: number }) => Promise<void>
  getSuggestedConfiguration: (nodeType: string, context: any) => Promise<any>

  // Optimization
  analyzeWorkflow: (workflow: any, executionHistory?: any[]) => Promise<void>
  detectAnomalies: (workflow: any, executions: any[]) => Promise<void>
  getConsolidationSuggestions: (workflows: any[]) => Promise<void>

  // Data Mapping
  generateMapping: (sourceSchema: any, targetSchema: any, context?: any) => Promise<any>
  getTransformationSuggestions: (data: any, targetFormat: string) => Promise<any>
  analyzeDataPatterns: (executionData: any[]) => Promise<void>

  // Feedback
  provideFeedback: (type: string, id: string, feedback: any) => Promise<void>

  // Clear functions
  clearError: () => void
  clearSuggestions: () => void
}

export const useAIStore = create<AIState & AIActions>((set, get) => ({
  optimizations: {},
  anomalies: {},
  isGenerating: false,
  error: null,
  // Initial state
  generatedWorkflow: null,
  generationHistory: [],
  isAnalyzing: false,
  workflowAnalysis: null,
  optimizationSuggestions: [],
  isMappingData: false,
  dataMappings: [],
  nodeSuggestions: [],
  loading: {
    generation: false,
    optimization: false,
    mapping: false,
    anomalies: false,
    suggestions: false,
  },

  fetchOptimizations: async (workflowId: string) => {
    try {
      set((state) => ({
        optimizations: {
          ...state.optimizations,
          [workflowId]: [],
        },
      }))
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  fetchAnomalies: async (workflowId: string) => {
    try {
      set((state) => ({
        anomalies: {
          ...state.anomalies,
          [workflowId]: [],
        },
      }))
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  generateWorkflow: async (prompt: string) => {
    set({ isGenerating: true, error: null })
    try {
      // Mock generation
      const mockWorkflow = {
        name: "AI Generated Workflow",
        description: `Generated from: ${prompt}`,
        nodes: [],
        connections: [],
      }
      set({ isGenerating: false })
      return mockWorkflow
    } catch (error: any) {
      set({ error: error.message, isGenerating: false })
      throw error
    }
  },

  saveGeneratedWorkflow: async (workflow: any, feedback?: any) => {
    try {
      const response = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...workflow,
          ai_generated: true,
          ai_feedback: feedback,
        }),
      })

      if (!response.ok) throw new Error("Failed to save workflow")

      set((state) => ({ ...state, generatedWorkflow: null }))
    } catch (error: any) {
      set({ error: error.message })
      throw error
    }
  },

  getGenerationHistory: async () => {
    try {
      const response = await fetch("/api/ai/workflow-generation")
      const data = await response.json()

      set({ generationHistory: data.generations || [] })
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  // Node Suggestions
  getNodeSuggestions: async (workflow: any, position: { x: number; y: number }) => {
    set((state) => ({
      ...state,
      loading: { ...state.loading, suggestions: true },
    }))

    try {
      const result = await generateNodeSuggestions(workflow, position)

      if (result.success) {
        set((state) => ({
          ...state,
          nodeSuggestions: result.suggestions,
          loading: { ...state.loading, suggestions: false },
        }))
      } else {
        throw new Error(result.error)
      }
    } catch (error: any) {
      set((state) => ({
        ...state,
        error: error.message,
        loading: { ...state.loading, suggestions: false },
      }))
    }
  },

  getSuggestedConfiguration: async (nodeType: string, context: any) => {
    try {
      const result = await suggestNodeConfiguration(nodeType, context)
      return result.success ? result.config : null
    } catch (error: any) {
      set({ error: error.message })
      return null
    }
  },

  // Optimization
  analyzeWorkflow: async (workflow: any, executionHistory?: any[]) => {
    set((state) => ({
      ...state,
      loading: { ...state.loading, optimization: true },
    }))

    try {
      const result = await analyzeWorkflowPerformance(workflow, executionHistory)

      if (result.success) {
        set((state) => ({
          ...state,
          workflowAnalysis: result.analysis,
          optimizationSuggestions: result.analysis.suggestions,
          loading: { ...state.loading, optimization: false },
        }))

        // Save to database
        await fetch("/api/ai/workflow-optimization", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workflow_id: workflow.id,
            optimization_type: "performance_analysis",
            suggestions: result.analysis.suggestions,
            performance_metrics: {
              performance_score: result.analysis.performance_score,
              reliability_score: result.analysis.reliability_score,
              maintainability_score: result.analysis.maintainability_score,
            },
          }),
        })
      } else {
        throw new Error(result.error)
      }
    } catch (error: any) {
      set((state) => ({
        ...state,
        error: error.message,
        loading: { ...state.loading, optimization: false },
      }))
    }
  },

  detectAnomalies: async (workflow: any, executions: any[]) => {
    set((state) => ({
      ...state,
      loading: { ...state.loading, anomalies: true },
    }))

    try {
      const result = await detectWorkflowAnomalies(workflow, executions)

      if (result.success) {
        set((state) => ({
          ...state,
          anomalies: result.anomalies,
          loading: { ...state.loading, anomalies: false },
        }))

        // Save anomalies to database
        for (const anomaly of result.anomalies) {
          await fetch("/api/ai/anomaly-detection", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workflow_id: workflow.id,
              anomaly_type: anomaly.type,
              severity: anomaly.severity,
              description: anomaly.description,
              detected_patterns: { pattern: anomaly.pattern },
              suggested_actions: anomaly.suggested_actions,
            }),
          })
        }
      } else {
        throw new Error(result.error)
      }
    } catch (error: any) {
      set((state) => ({
        ...state,
        error: error.message,
        loading: { ...state.loading, anomalies: false },
      }))
    }
  },

  getConsolidationSuggestions: async (workflows: any[]) => {
    try {
      const result = await suggestWorkflowConsolidation(workflows)

      if (result.success) {
        // Add consolidation suggestions to optimization suggestions
        set((state) => ({
          ...state,
          optimizationSuggestions: [
            ...state.optimizationSuggestions,
            ...result.opportunities.map((opp: any) => ({
              type: "consolidation",
              title: `Consolidate ${opp.workflow_ids.length} workflows`,
              description: opp.description,
              impact: "medium",
              effort: opp.effort_estimate,
              changes: [],
              reasoning: opp.benefits.join(", "),
              confidence: opp.similarity_score,
            })),
          ],
        }))
      }
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  // Data Mapping
  generateMapping: async (sourceSchema: any, targetSchema: any, context?: any) => {
    set((state) => ({
      ...state,
      loading: { ...state.loading, mapping: true },
    }))

    try {
      const result = await generateDataMapping(sourceSchema, targetSchema, context)

      if (result.success) {
        set((state) => ({
          ...state,
          dataMappings: [...state.dataMappings, result.mapping],
          loading: { ...state.loading, mapping: false },
        }))

        return result.mapping
      } else {
        throw new Error(result.error)
      }
    } catch (error: any) {
      set((state) => ({
        ...state,
        error: error.message,
        loading: { ...state.loading, mapping: false },
      }))
      throw error
    }
  },

  getTransformationSuggestions: async (data: any, targetFormat: string) => {
    try {
      const result = await suggestDataTransformations(data, targetFormat)
      return result.success ? result.transformations : []
    } catch (error: any) {
      set({ error: error.message })
      return []
    }
  },

  analyzeDataPatterns: async (executionData: any[]) => {
    try {
      const result = await detectDataPatterns(executionData)

      if (result.success) {
        // Could store patterns for future reference
        console.log("Data patterns detected:", result.patterns)
      }
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  // Feedback
  provideFeedback: async (type: string, id: string, feedback: any) => {
    try {
      await fetch(`/api/ai/${type}/${id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(feedback),
      })
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  // Clear functions
  clearError: () => set({ error: null }),
  clearSuggestions: () => set({ nodeSuggestions: [], optimizationSuggestions: [] }),
}))
