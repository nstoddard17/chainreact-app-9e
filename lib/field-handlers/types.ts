/**
 * Field handler library types
 * 
 * This defines the types for our field handler system that provides
 * configurable behavior for different field types across the application.
 */

import { ReactNode } from "react"

export interface FieldStyling {
  theme?: 'auto' | 'light' | 'dark' | 'custom'
  portal?: boolean
  className?: string
  errorClassName?: string
  containerClassName?: string
}

export interface FieldValidation {
  required?: boolean
  minLength?: number
  maxLength?: number
  pattern?: RegExp
  custom?: (value: any) => boolean | string
}

export interface FieldBehavior {
  // Loading strategy for dynamic fields
  loadingStrategy: 'eager' | 'on-demand' | 'hybrid'
  
  // Whether to cache loaded options
  cacheOptions?: boolean
  
  // Auto-focus behavior
  autoFocus?: boolean
  
  // Whether to support drag and drop for variables
  supportsDragDrop?: boolean
  
  // Whether to show loading indicators
  showLoadingIndicator?: boolean
  
  // Whether to allow manual entry when no options found
  allowManualEntry?: boolean
}

export interface FieldHandler {
  // Core behavior
  behavior: FieldBehavior
  
  // Styling configuration
  styling?: FieldStyling
  
  // Validation rules
  validation?: FieldValidation
  
  // Custom transformation functions
  formatValue?: (value: any) => any
  parseValue?: (value: any) => any
  
  // Custom placeholder logic
  getPlaceholder?: (field: any) => string
  
  // Custom options processing
  processOptions?: (options: any[]) => any[]
  
  // Custom error handling
  handleError?: (error: string) => string
}

export interface FieldComponent {
  component: React.ComponentType<any>
  props?: Record<string, any>
}

export interface FieldRegistry {
  [fieldType: string]: FieldHandler
}

// Preset behavior configurations
export interface PresetBehaviors {
  EAGER_LOAD: FieldBehavior
  ON_DEMAND_LOAD: FieldBehavior
  HYBRID_LOAD: FieldBehavior
  STATIC_FIELD: FieldBehavior
}

// Context for field rendering
export interface FieldContext {
  field: any
  value: any
  onChange: (value: any) => void
  error?: string
  disabled?: boolean
  workflowData?: any
  currentNodeId?: string
  dynamicOptions?: Record<string, any[]>
  loadingDynamic?: boolean
  onDynamicLoad?: (fieldName: string, dependsOn?: string, dependsOnValue?: any, forceRefresh?: boolean) => Promise<void>
}