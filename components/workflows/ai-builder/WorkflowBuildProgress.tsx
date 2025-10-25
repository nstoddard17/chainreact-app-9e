import React from 'react'
import { CheckCircle, Circle, Loader2 } from 'lucide-react'

interface WorkflowBuildProgressProps {
  currentNode: number
  totalNodes: number
  currentNodeName: string
  status: 'preparing' | 'configuring' | 'testing' | 'complete' | 'error'
}

export function WorkflowBuildProgress({
  currentNode,
  totalNodes,
  currentNodeName,
  status
}: WorkflowBuildProgressProps) {
  const percentage = (currentNode / totalNodes) * 100

  const getStatusIcon = () => {
    switch (status) {
      case 'preparing':
      case 'configuring':
      case 'testing':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
      case 'complete':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'error':
        return <CheckCircle className="w-4 h-4 text-red-500" />
      default:
        return <Circle className="w-4 h-4 text-gray-400" />
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'preparing':
        return 'Preparing'
      case 'configuring':
        return 'Configuring'
      case 'testing':
        return 'Testing'
      case 'complete':
        return 'Complete'
      case 'error':
        return 'Needs Attention'
      default:
        return 'Pending'
    }
  }

  const getStatusColor = () => {
    switch (status) {
      case 'preparing':
        return 'text-gray-500'
      case 'configuring':
        return 'text-blue-500'
      case 'testing':
        return 'text-yellow-500'
      case 'complete':
        return 'text-green-500'
      case 'error':
        return 'text-red-500'
      default:
        return 'text-gray-400'
    }
  }

  const progressBarClass = (() => {
    switch (status) {
      case 'testing':
        return 'bg-gradient-to-r from-yellow-400 to-amber-400'
      case 'complete':
        return 'bg-gradient-to-r from-green-500 to-emerald-400'
      case 'error':
        return 'bg-gradient-to-r from-red-500 to-rose-500'
      case 'preparing':
      case 'configuring':
      default:
        return 'bg-gradient-to-r from-blue-500 to-sky-400'
    }
  })()

  const currentBarClass = (() => {
    switch (status) {
      case 'testing':
        return 'bg-amber-400 animate-pulse'
      case 'complete':
        return 'bg-emerald-500'
      case 'error':
        return 'bg-red-500 animate-pulse'
      case 'preparing':
      case 'configuring':
      default:
        return 'bg-blue-500 animate-pulse'
    }
  })()

  return (
    <div className="bg-gray-800/50 rounded-lg p-4 mb-4 border border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className="text-sm font-medium text-gray-200">
            Node {currentNode} of {totalNodes}
          </span>
        </div>
        <span className={`text-sm font-medium ${getStatusColor()}`}>
          {getStatusText()}
        </span>
      </div>

      <div className="mb-2">
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span className="truncate max-w-[200px]">{currentNodeName}</span>
          <span>{Math.round(percentage)}%</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-2">
          <div
            className={`${progressBarClass} h-2 rounded-full transition-all duration-500`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      <div className="flex gap-1 mt-3">
        {Array.from({ length: totalNodes }).map((_, index) => (
          <div
            key={index}
            className={`flex-1 h-1 rounded-full transition-all duration-300 ${
              index < currentNode - 1
                ? 'bg-green-500'
                : index === currentNode - 1
                ? currentBarClass
                : 'bg-gray-600'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
