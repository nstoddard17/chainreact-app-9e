import React from 'react'
import { render, RenderOptions } from '@testing-library/react'

/**
 * Renders a component with all required providers.
 * Extend this as new providers are needed.
 */
function AllProviders({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: AllProviders, ...options })
}

// Re-export everything from RTL for convenience
export * from '@testing-library/react'
export { renderWithProviders as render }

// ── Mock factories ──

export function createMockWorkflow(overrides: Record<string, any> = {}) {
  return {
    id: 'workflow-1',
    name: 'Test Workflow',
    description: '',
    status: 'draft',
    nodes: [],
    edges: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: 'user-1',
    user_id: 'user-1',
    organization_id: null,
    visibility: 'private',
    executions_count: 0,
    ...overrides,
  }
}

export function createMockNode(overrides: Record<string, any> = {}) {
  return {
    id: 'node-1',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      type: 'slack_action_send_message',
      label: 'Send Slack Message',
      config: {},
      ...overrides.data,
    },
    ...overrides,
  }
}

export function createMockUser(overrides: Record<string, any> = {}) {
  return {
    id: 'user-1',
    email: 'test@example.com',
    ...overrides,
  }
}

export function createMockProfile(overrides: Record<string, any> = {}) {
  return {
    id: 'user-1',
    email: 'test@example.com',
    full_name: 'Test User',
    username: 'testuser',
    provider: 'email',
    admin_capabilities: null,
    workflow_creation_mode: 'ask',
    default_workspace_type: null,
    default_workspace_id: null,
    ...overrides,
  }
}

export function createMockIntegration(overrides: Record<string, any> = {}) {
  return {
    id: 'integration-1',
    provider: 'slack',
    status: 'connected',
    user_id: 'user-1',
    created_at: new Date().toISOString(),
    ...overrides,
  }
}
