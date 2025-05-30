import { generateObject } from "ai"
import { openai } from "@ai-sdk/openai"
import { z } from "zod"

const OptimizationSuggestionSchema = z.object({
  type: z.enum(["performance", "reliability", "cost", "maintainability"]),
  title: z.string(),
  description: z.string(),
  impact: z.enum(["low", "medium", "high"]),
  effort: z.enum(["low", "medium", "high"]),
  changes: z.array(
    z.object({
      nodeId: z.string().optional(),
      action: z.enum(["add", "remove", "modify", "reorder"]),
      details: z.record(z.any()),
    }),
  ),
  reasoning: z.string(),
  confidence: z.number().min(0).max(1),
})

const WorkflowAnalysisSchema = z.object({
  performance_score: z.number().min(0).max(100),
  reliability_score: z.number().min(0).max(100),
  maintainability_score: z.number().min(0).max(100),
  issues: z.array(
    z.object({
      type: z.string(),
      severity: z.enum(["low", "medium", "high", "critical"]),
      description: z.string(),
      location: z.string().optional(),
    }),
  ),
  suggestions: z.array(OptimizationSuggestionSchema),
})

export async function analyzeWorkflowPerformance(workflow: any, executionHistory?: any[]) {
  try {
    const { object } = await generateObject({
      model: openai("gpt-4o"),
      schema: WorkflowAnalysisSchema,
      prompt: `
        Analyze this workflow for performance, reliability, and maintainability issues:
        
        Workflow: ${JSON.stringify(workflow, null, 2)}
        ${executionHistory ? `Execution History: ${JSON.stringify(executionHistory.slice(-10), null, 2)}` : ""}
        
        Evaluate:
        1. Performance bottlenecks (sequential vs parallel execution)
        2. Error handling and retry logic
        3. Resource usage optimization
        4. Code maintainability and clarity
        5. Security considerations
        6. Scalability issues
        
        Provide scores (0-100) and specific improvement suggestions.
      `,
    })

    return {
      success: true,
      analysis: object,
    }
  } catch (error) {
    console.error("Error analyzing workflow:", error)
    return {
      success: false,
      error: "Failed to analyze workflow",
    }
  }
}

export async function detectWorkflowAnomalies(workflow: any, recentExecutions: any[]) {
  try {
    const { object } = await generateObject({
      model: openai("gpt-4o"),
      schema: z.object({
        anomalies: z.array(
          z.object({
            type: z.string(),
            severity: z.enum(["low", "medium", "high", "critical"]),
            description: z.string(),
            pattern: z.string(),
            suggested_actions: z.array(z.string()),
            confidence: z.number().min(0).max(1),
          }),
        ),
      }),
      prompt: `
        Analyze recent workflow executions for anomalies and patterns:
        
        Workflow: ${JSON.stringify(workflow, null, 2)}
        Recent Executions: ${JSON.stringify(recentExecutions, null, 2)}
        
        Look for:
        1. Unusual execution times
        2. Error patterns
        3. Data anomalies
        4. Performance degradation
        5. Unexpected behavior patterns
        6. Resource usage spikes
        
        Identify anomalies and suggest corrective actions.
      `,
    })

    return {
      success: true,
      anomalies: object.anomalies,
    }
  } catch (error) {
    console.error("Error detecting anomalies:", error)
    return {
      success: false,
      error: "Failed to detect anomalies",
    }
  }
}

export async function suggestWorkflowConsolidation(workflows: any[]) {
  try {
    const { object } = await generateObject({
      model: openai("gpt-4o"),
      schema: z.object({
        consolidation_opportunities: z.array(
          z.object({
            workflow_ids: z.array(z.string()),
            similarity_score: z.number().min(0).max(1),
            consolidation_type: z.enum(["merge", "template", "shared_component"]),
            description: z.string(),
            benefits: z.array(z.string()),
            effort_estimate: z.enum(["low", "medium", "high"]),
          }),
        ),
      }),
      prompt: `
        Analyze these workflows for consolidation opportunities:
        ${JSON.stringify(workflows, null, 2)}
        
        Look for:
        1. Similar node patterns
        2. Duplicate functionality
        3. Shared components
        4. Template opportunities
        5. Merge candidates
        
        Suggest consolidation strategies to reduce maintenance overhead.
      `,
    })

    return {
      success: true,
      opportunities: object.consolidation_opportunities,
    }
  } catch (error) {
    console.error("Error suggesting consolidation:", error)
    return {
      success: false,
      error: "Failed to suggest consolidation",
    }
  }
}
