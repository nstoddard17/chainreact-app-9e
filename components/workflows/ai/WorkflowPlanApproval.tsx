/**
 * Workflow Plan Approval
 *
 * Shows the generated plan to user for approval before building
 */

'use client'

import { CheckCircle, Clock, Zap } from 'lucide-react'
import type { WorkflowPlan } from '@/lib/workflows/ai/SequentialWorkflowBuilder'

interface WorkflowPlanApprovalProps {
  plan: WorkflowPlan
  onApprove: () => void
  onReject: () => void
  isBuilding?: boolean
}

export function WorkflowPlanApproval({
  plan,
  onApprove,
  onReject,
  isBuilding = false
}: WorkflowPlanApprovalProps) {
  return (
    <div className="space-y-4 p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">
            {plan.workflowName}
          </h3>
        </div>
        <p className="text-sm text-gray-600">
          {plan.workflowDescription}
        </p>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>Est. {plan.estimatedTime}</span>
          </div>
          <div className="flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            <span>{plan.nodes.length} steps</span>
          </div>
        </div>
      </div>

      {/* Node List */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-gray-700 uppercase tracking-wide">
          Workflow Steps:
        </div>
        <div className="space-y-2">
          {plan.nodes.map((node, index) => (
            <div
              key={node.id}
              className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200"
            >
              {/* Step Number */}
              <div className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-semibold">
                {index + 1}
              </div>

              {/* Step Details */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900">
                  {node.title}
                </div>
                <div className="text-xs text-gray-600 mt-0.5">
                  {node.description}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                    {node.providerId}
                  </span>
                  {node.needsAuth && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                      Requires connection
                    </span>
                  )}
                </div>
              </div>

              {/* Category Icon */}
              <div className="flex-shrink-0">
                {node.category === 'trigger' && (
                  <div className="w-8 h-8 bg-green-100 rounded flex items-center justify-center">
                    <Zap className="w-4 h-4 text-green-600" />
                  </div>
                )}
                {node.category === 'action' && (
                  <div className="w-8 h-8 bg-purple-100 rounded flex items-center justify-center">
                    <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                )}
                {node.category === 'ai' && (
                  <div className="w-8 h-8 bg-indigo-100 rounded flex items-center justify-center">
                    <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={onApprove}
          disabled={isBuilding}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isBuilding ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Building workflow...
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" />
              Let's build this!
            </>
          )}
        </button>
        {!isBuilding && (
          <button
            onClick={onReject}
            className="px-4 py-3 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
          >
            Start over
          </button>
        )}
      </div>

      {/* Info */}
      <div className="text-xs text-gray-500 text-center">
        I'll guide you through each step, connecting integrations and configuring nodes as we go.
      </div>
    </div>
  )
}
