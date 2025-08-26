// Import current database types
import type { Database } from "../../types/database.types"

// Type helpers for easier table access
type Tables = Database['public']['Tables']
type TableName = keyof Tables

// Helper function to get table schema
export function getTableSchema<T extends TableName>(tableName: T) {
  return {
    tableName,
    Row: {} as Tables[T]['Row'],
    Insert: {} as Tables[T]['Insert'], 
    Update: {} as Tables[T]['Update']
  }
}

// Core table schemas for commonly used tables
export const users = getTableSchema('user_profiles')
export const integrations = getTableSchema('integrations')
export const workflows = getTableSchema('workflows')
export const workflow_executions = getTableSchema('workflow_executions')
export const workflow_nodes = getTableSchema('workflow_nodes')
export const organizations = getTableSchema('organizations')
export const teams = getTableSchema('teams')
export const templates = getTableSchema('templates')

// Legacy compatibility - keep existing exports that code may still reference
export const accounts = getTableSchema('integrations') // Map legacy accounts to integrations
export const sessions = {
  tableName: "sessions" as const,
  columns: {
    id: "id",
    user_id: "user_id", 
    session_token: "session_token",
    expires: "expires",
    created_at: "created_at",
    updated_at: "updated_at",
  },
}

// Add missing integrationTable export (alias for integrations)
export const integrationTable = integrations

// Re-export database types for easier access
export type User = Database['public']['Tables']['user_profiles']['Row']
export type Integration = Database['public']['Tables']['integrations']['Row']
export type Workflow = Database['public']['Tables']['workflows']['Row']
export type WorkflowExecution = Database['public']['Tables']['workflow_executions']['Row']
export type WorkflowNode = Database['public']['Tables']['workflow_nodes']['Row']
export type Organization = Database['public']['Tables']['organizations']['Row']
export type Team = Database['public']['Tables']['teams']['Row']
export type Template = Database['public']['Tables']['templates']['Row']

// Legacy type aliases for backwards compatibility
export type OAuthAccount = Integration
export type Account = Integration
export type Session = {
  id: string
  user_id: string
  session_token: string
  expires: string
  created_at: string
  updated_at: string
}
