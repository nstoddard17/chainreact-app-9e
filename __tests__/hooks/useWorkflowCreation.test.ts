import { renderHook, act } from '@testing-library/react'
import { useWorkflowCreation } from '@/hooks/useWorkflowCreation'

// Mock dependencies
const mockSetWorkspaceContext = jest.fn()
jest.mock('@/stores/workflowStore', () => ({
  useWorkflowStore: () => ({
    setWorkspaceContext: mockSetWorkspaceContext,
  }),
}))

const mockProfile: Record<string, any> = {}
jest.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    profile: mockProfile,
    updateProfile: jest.fn(),
  }),
}))

const mockWorkspaceContext: Record<string, any> = {}
jest.mock('@/hooks/useWorkspaceContext', () => ({
  useWorkspaceContext: () => ({
    workspaceContext: mockWorkspaceContext,
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

describe('useWorkflowCreation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockProfile.workflow_creation_mode = 'ask'
    mockProfile.default_workspace_type = null
    mockProfile.default_workspace_id = null
    mockWorkspaceContext.type = 'personal'
    mockWorkspaceContext.id = null
  })

  describe('mode: ask', () => {
    it('opens workspace modal and stores callback', () => {
      const { result } = renderHook(() => useWorkflowCreation())
      const onProceed = jest.fn()

      expect(result.current.showWorkspaceModal).toBe(false)

      act(() => {
        result.current.initiateWorkflowCreation(onProceed)
      })

      expect(result.current.showWorkspaceModal).toBe(true)
      expect(onProceed).not.toHaveBeenCalled()
    })

    it('executes callback when workspace is selected', () => {
      const { result } = renderHook(() => useWorkflowCreation())
      const onProceed = jest.fn()

      act(() => {
        result.current.initiateWorkflowCreation(onProceed)
      })

      act(() => {
        result.current.handleWorkspaceSelected(
          { type: 'personal', id: null, name: 'Personal', folder_id: null },
          false
        )
      })

      expect(result.current.showWorkspaceModal).toBe(false)
      expect(onProceed).toHaveBeenCalledTimes(1)
      expect(mockSetWorkspaceContext).toHaveBeenCalledWith('personal', null)
    })

    it('surfaces async callback errors via toast', async () => {
      const { toast } = require('sonner')
      const { result } = renderHook(() => useWorkflowCreation())
      const asyncError = new Error('API failed')
      const onProceed = jest.fn().mockRejectedValue(asyncError)

      act(() => {
        result.current.initiateWorkflowCreation(onProceed)
      })

      // Use a microtask flush to let the promise rejection propagate
      await act(async () => {
        result.current.handleWorkspaceSelected(
          { type: 'personal', id: null, name: 'Personal', folder_id: null },
          false
        )
        // Wait for the promise rejection to be caught
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      expect(toast.error).toHaveBeenCalledWith('API failed')
    })

    it('exposes selected folder_id', () => {
      const { result } = renderHook(() => useWorkflowCreation())

      act(() => {
        result.current.initiateWorkflowCreation(jest.fn())
      })

      act(() => {
        result.current.handleWorkspaceSelected(
          { type: 'personal', id: null, name: 'Personal', folder_id: 'folder-123' },
          false
        )
      })

      expect(result.current.selectedFolderId).toBe('folder-123')
    })
  })

  describe('mode: default', () => {
    it('skips modal and calls onProceed immediately', () => {
      mockProfile.workflow_creation_mode = 'default'
      mockProfile.default_workspace_type = 'team'
      mockProfile.default_workspace_id = 'team-1'

      const { result } = renderHook(() => useWorkflowCreation())
      const onProceed = jest.fn()

      act(() => {
        result.current.initiateWorkflowCreation(onProceed)
      })

      expect(result.current.showWorkspaceModal).toBe(false)
      expect(onProceed).toHaveBeenCalledTimes(1)
      expect(mockSetWorkspaceContext).toHaveBeenCalledWith('team', 'team-1')
    })
  })

  describe('mode: follow_switcher', () => {
    it('uses current workspace context and calls onProceed immediately', () => {
      mockProfile.workflow_creation_mode = 'follow_switcher'
      mockWorkspaceContext.type = 'organization'
      mockWorkspaceContext.id = 'org-1'

      const { result } = renderHook(() => useWorkflowCreation())
      const onProceed = jest.fn()

      act(() => {
        result.current.initiateWorkflowCreation(onProceed)
      })

      expect(result.current.showWorkspaceModal).toBe(false)
      expect(onProceed).toHaveBeenCalledTimes(1)
      expect(mockSetWorkspaceContext).toHaveBeenCalledWith('organization', 'org-1')
    })
  })

  describe('cancel', () => {
    it('closes modal and clears pending callback', () => {
      const { result } = renderHook(() => useWorkflowCreation())
      const onProceed = jest.fn()

      act(() => {
        result.current.initiateWorkflowCreation(onProceed)
      })

      expect(result.current.showWorkspaceModal).toBe(true)

      act(() => {
        result.current.handleCancelWorkspaceSelection()
      })

      expect(result.current.showWorkspaceModal).toBe(false)

      // After cancel, selecting a workspace should NOT call the old callback
      act(() => {
        result.current.handleWorkspaceSelected(
          { type: 'personal', id: null, name: 'Personal', folder_id: null },
          false
        )
      })

      expect(onProceed).not.toHaveBeenCalled()
    })
  })

  describe('stale closure prevention', () => {
    it('always calls the most recent callback, not a stale one', () => {
      const { result } = renderHook(() => useWorkflowCreation())
      const firstCallback = jest.fn()
      const secondCallback = jest.fn()

      // Initiate with first callback
      act(() => {
        result.current.initiateWorkflowCreation(firstCallback)
      })

      // Cancel and initiate with second callback
      act(() => {
        result.current.handleCancelWorkspaceSelection()
      })

      act(() => {
        result.current.initiateWorkflowCreation(secondCallback)
      })

      // Select workspace — should call second, not first
      act(() => {
        result.current.handleWorkspaceSelected(
          { type: 'personal', id: null, name: 'Personal', folder_id: null },
          false
        )
      })

      expect(firstCallback).not.toHaveBeenCalled()
      expect(secondCallback).toHaveBeenCalledTimes(1)
    })
  })
})
