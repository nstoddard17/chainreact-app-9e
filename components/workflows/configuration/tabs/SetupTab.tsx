"use client"

import React from 'react'
import ConfigurationForm from '../ConfigurationForm'

interface SetupTabProps {
  nodeInfo: any
  initialData?: Record<string, any>
  onSave: (data: Record<string, any>) => void
  onCancel: () => void
  onBack?: () => void
  workflowData?: any
  currentNodeId?: string
  integrationName?: string
  isConnectedToAIAgent?: boolean
  isTemplateEditing?: boolean
  templateDefaults?: Record<string, any>
}

/**
 * Setup Tab - Main configuration form
 *
 * This is a wrapper around the existing ConfigurationForm component.
 * All field configuration happens here.
 */
export function SetupTab(props: SetupTabProps) {
  return <ConfigurationForm {...props} />
}
