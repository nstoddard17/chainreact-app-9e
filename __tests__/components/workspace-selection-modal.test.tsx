import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WorkspaceSelectionModal } from '@/components/workflows/WorkspaceSelectionModal'

// Mock dependencies
jest.mock('@/hooks/useWorkspaces', () => ({
  useWorkspaces: () => ({
    workspaces: [
      { type: 'personal', id: null, name: 'Personal Workspace', description: 'Your private workspace' },
      { type: 'team', id: 'team-1', name: 'Engineering', description: 'Team workspace' },
    ],
    loading: false,
    error: null,
  }),
}))

jest.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    updateProfile: jest.fn().mockResolvedValue(undefined),
  }),
}))

jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}))

jest.mock('@/lib/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}))

// Mock fetchWithTimeout for folder loading
jest.mock('@/lib/utils/fetch-with-timeout', () => ({
  fetchWithTimeout: jest.fn().mockImplementation((url: string) => {
    if (url.includes('ensure-default')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) })
    }
    if (url.includes('/api/workflows/folders')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          folders: [
            { id: 'folder-1', name: "DaBoss's Workflows", organization_id: null, is_trash: false },
            { id: 'folder-2', name: 'Archive', organization_id: null, is_trash: false },
          ],
        }),
      })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  }),
}))

// Mock next/link
jest.mock('next/link', () => {
  const React = require('react')
  return {
    __esModule: true,
    default: ({ children, ...props }: any) => React.createElement('a', props, children),
  }
})

describe('WorkspaceSelectionModal', () => {
  const defaultProps = {
    open: true,
    onOpenChange: jest.fn(),
    onWorkspaceSelected: jest.fn(),
    onCancel: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders the dialog with title and workspace dropdown', () => {
    render(<WorkspaceSelectionModal {...defaultProps} />)

    expect(screen.getByText('Choose Workspace')).toBeInTheDocument()
    expect(screen.getByText('Personal Workspace')).toBeInTheDocument()
  })

  it('renders Continue and Cancel buttons', () => {
    render(<WorkspaceSelectionModal {...defaultProps} />)

    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('calls onCancel when Cancel is clicked', async () => {
    const user = userEvent.setup()
    render(<WorkspaceSelectionModal {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onWorkspaceSelected with personal workspace when Continue is clicked', async () => {
    const user = userEvent.setup()
    render(<WorkspaceSelectionModal {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => {
      expect(defaultProps.onWorkspaceSelected).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'personal',
          id: null,
          name: 'Personal Workspace',
        }),
        false
      )
    })
  })

  it('does not render when open is false', () => {
    render(<WorkspaceSelectionModal {...defaultProps} open={false} />)

    expect(screen.queryByText('Choose Workspace')).not.toBeInTheDocument()
  })

  it('renders the save as default checkbox', () => {
    render(<WorkspaceSelectionModal {...defaultProps} />)

    expect(screen.getByText('Set as my default workspace')).toBeInTheDocument()
  })
})
