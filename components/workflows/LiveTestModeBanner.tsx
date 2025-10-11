'use client'

import { useEffect, useState } from 'react'
import { LiveTestStatus, ExecutionProgress } from '@/hooks/workflows/useLiveTestMode'

interface LiveTestModeBannerProps {
  status: LiveTestStatus
  progress: ExecutionProgress | null
  onStop: () => void
  triggerType?: string
}

export function LiveTestModeBanner({
  status,
  progress,
  onStop,
  triggerType,
}: LiveTestModeBannerProps) {
  const [elapsedTime, setElapsedTime] = useState(0)

  // Track elapsed time
  useEffect(() => {
    if (status === 'listening' || status === 'executing') {
      const interval = setInterval(() => {
        setElapsedTime(prev => prev + 1)
      }, 1000)

      return () => clearInterval(interval)
    } 
      setElapsedTime(0)
    
  }, [status])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getBannerColor = () => {
    switch (status) {
      case 'listening':
        return 'bg-blue-500/10 border-blue-500/20 text-blue-400'
      case 'executing':
        return 'bg-purple-500/10 border-purple-500/20 text-purple-400'
      case 'completed':
        return 'bg-green-500/10 border-green-500/20 text-green-400'
      case 'failed':
        return 'bg-red-500/10 border-red-500/20 text-red-400'
      default:
        return 'bg-gray-500/10 border-gray-500/20 text-gray-400'
    }
  }

  const getStatusIcon = () => {
    switch (status) {
      case 'listening':
        return (
          <div className="flex items-center gap-2">
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
            </div>
            <span className="font-medium">Listening for {triggerType?.replace(/_/g, ' ')} trigger...</span>
          </div>
        )
      case 'executing':
        return (
          <div className="flex items-center gap-2">
            <svg
              className="animate-spin h-4 w-4 text-purple-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <span className="font-medium">
              Executing workflow... {progress?.currentNodeName && `(${progress.currentNodeName})`}
            </span>
          </div>
        )
      case 'completed':
        return (
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 text-green-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span className="font-medium">Workflow execution completed successfully</span>
          </div>
        )
      case 'failed':
        return (
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            <span className="font-medium">Workflow execution failed</span>
          </div>
        )
      default:
        return null
    }
  }

  if (status === 'idle' || status === 'stopped') {
    return null
  }

  return (
    <div
      className={`fixed top-16 left-0 right-0 z-50 border-b ${getBannerColor()} backdrop-blur-sm`}
    >
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 flex-1">
            {getStatusIcon()}

            {progress && status === 'executing' && (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 transition-all duration-300"
                      style={{ width: `${progress.progressPercentage}%` }}
                    />
                  </div>
                  <span className="text-sm tabular-nums">
                    {progress.progressPercentage}%
                  </span>
                </div>
                <span className="text-sm text-gray-400">
                  {progress.completedNodes.length} / {progress.totalNodes} nodes
                </span>
              </div>
            )}

            <span className="text-sm text-gray-400 tabular-nums">
              {formatTime(elapsedTime)}
            </span>
          </div>

          {(status === 'listening' || status === 'executing') && (
            <button
              onClick={onStop}
              className="px-4 py-1.5 text-sm font-medium text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
            >
              Stop
            </button>
          )}

          {(status === 'completed' || status === 'failed') && (
            <button
              onClick={onStop}
              className="px-4 py-1.5 text-sm font-medium text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
