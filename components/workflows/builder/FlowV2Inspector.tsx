"use client"

/**
 * FlowV2Inspector.tsx
 *
 * Right-side inspector panel with tabs.
 * Tab order: Config, Input, Output, Errors, Lineage, Cost
 * Uses centralized Copy constants.
 */

import React, { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Copy } from "./ui/copy"
import "./styles/tokens.css"

interface FlowV2InspectorProps {
  selectedNode: any | null
  onClose?: () => void
}

type TabType = "config" | "input" | "output" | "errors" | "lineage" | "cost"

const TAB_ORDER: TabType[] = ["config", "input", "output", "errors", "lineage", "cost"]

const TAB_LABELS: Record<TabType, string> = {
  config: Copy.tabs.config,
  input: Copy.tabs.input,
  output: Copy.tabs.output,
  errors: Copy.tabs.errors,
  lineage: Copy.tabs.lineage,
  cost: Copy.tabs.cost,
}

export function FlowV2Inspector({ selectedNode, onClose }: FlowV2InspectorProps) {
  const [activeTab, setActiveTab] = useState<TabType>("config")

  if (!selectedNode) {
    return (
      <div className="w-[380px] h-full bg-white border-l border-gray-200 flex items-center justify-center">
        <p className="text-sm text-gray-500">Select a node to inspect</p>
      </div>
    )
  }

  return (
    <div className="w-[380px] h-full bg-white border-l border-gray-200 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Inspector</h2>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              ×
            </button>
          )}
        </div>
        {selectedNode.data?.title && (
          <p className="text-xs text-gray-600 mt-1">{selectedNode.data.title}</p>
        )}
      </div>

      {/* Tabs - exact order: Config, Input, Output, Errors, Lineage, Cost */}
      <div className="flow-inspector-tabs">
        {TAB_ORDER.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flow-inspector-tab ${
              activeTab === tab ? "flow-inspector-tab--active" : ""
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {activeTab === "config" && <ConfigTab node={selectedNode} />}
          {activeTab === "input" && <InputTab node={selectedNode} />}
          {activeTab === "output" && <OutputTab node={selectedNode} />}
          {activeTab === "errors" && <ErrorsTab node={selectedNode} />}
          {activeTab === "lineage" && <LineageTab node={selectedNode} />}
          {activeTab === "cost" && <CostTab node={selectedNode} />}
        </div>
      </ScrollArea>
    </div>
  )
}

// Tab Components
function ConfigTab({ node }: { node: any }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-gray-700">Configuration</h3>
      {node.data?.config ? (
        <pre className="text-xs bg-gray-50 p-2 rounded border border-gray-200 overflow-x-auto">
          {JSON.stringify(node.data.config, null, 2)}
        </pre>
      ) : (
        <p className="text-xs text-gray-500">No configuration</p>
      )}
    </div>
  )
}

function InputTab({ node }: { node: any }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-gray-700">Input Schema</h3>
      {node.io?.inputSchema ? (
        <pre className="text-xs bg-gray-50 p-2 rounded border border-gray-200 overflow-x-auto">
          {JSON.stringify(node.io.inputSchema, null, 2)}
        </pre>
      ) : (
        <p className="text-xs text-gray-500">No input schema defined</p>
      )}
    </div>
  )
}

function OutputTab({ node }: { node: any }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-gray-700">Output Schema</h3>
      {node.io?.outputSchema ? (
        <pre className="text-xs bg-gray-50 p-2 rounded border border-gray-200 overflow-x-auto">
          {JSON.stringify(node.io.outputSchema, null, 2)}
        </pre>
      ) : (
        <p className="text-xs text-gray-500">No output schema defined</p>
      )}
    </div>
  )
}

function ErrorsTab({ node }: { node: any }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-gray-700">Errors</h3>
      {node.errors && node.errors.length > 0 ? (
        <div className="space-y-2">
          {node.errors.map((error: any, index: number) => (
            <div
              key={index}
              className="text-xs bg-red-50 p-2 rounded border border-red-200"
            >
              <p className="font-medium text-red-700">{error.message}</p>
              {error.stack && (
                <pre className="mt-1 text-red-600 overflow-x-auto">{error.stack}</pre>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-500">No errors</p>
      )}
    </div>
  )
}

function LineageTab({ node }: { node: any }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-gray-700">Data Lineage</h3>
      {node.lineage && node.lineage.length > 0 ? (
        <div className="space-y-2">
          {node.lineage.map((record: any, index: number) => (
            <div
              key={index}
              className="text-xs bg-gray-50 p-2 rounded border border-gray-200"
            >
              <p>
                <span className="font-medium">From:</span> {record.fromNodeId}
              </p>
              <p>
                <span className="font-medium">To:</span> {record.targetPath}
              </p>
              <p className="text-gray-600 mt-1">{record.expr}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-500">No lineage records</p>
      )}
    </div>
  )
}

function CostTab({ node }: { node: any }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-gray-700">Cost Analysis</h3>
      {node.costHint !== undefined ? (
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-gray-600">Estimated Cost:</span>
            <span className="font-medium">${node.costHint.toFixed(4)}</span>
          </div>
          {node.tokenCount && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-600">Tokens:</span>
              <span className="font-medium">{node.tokenCount.toLocaleString()}</span>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-500">No cost information</p>
      )}
    </div>
  )
}
