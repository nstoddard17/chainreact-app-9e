import { renderHook, act } from '@testing-library/react'
import { useCreateAndOpenWorkflow } from '@/hooks/useCreateAndOpenWorkflow'

// Mock dependencies
const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const mockSetWorkspaceContext = jest.fn()
const mockCreateWorkflow = jest.fn()
jest.mock('@/stores/workflowStore', () => ({
  useWorkflowStore: () => ({
    setWorkspaceContext: mockSetWorkspaceContext,
  }),
  // getState() is called inside createAndOpen for createWorkflow
}))

// Mock the static getState call
jest.mock('@/stores/workflowStore', () => {
  const mockCreateWorkflow = jest.fn()
  return {
    useWorkflowStore: Object.assign(
      () => ({
        setWorkspaceContext: jest.fn(),
      }),
      {
        getState: () => ({
          createWorkflow: mockCreateWorkflow,
        }),
      }
    ),
  }
})

jest.mock('@/hooks/useWorkspaceContext', () => ({
  useWorkspaceContext: () => ({
    workspaceContext: { type: 'personal', id: null },
  }),
}))

jest.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    profile: { id: 'user-1' },
  }),
}))

jest.mock('@/lib/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}))

describe('useCreateAndOpenWorkflow', () => {
  let mockCreateWorkflowFn: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    // Get the mock from the module
    const { useWorkflowStore } = require('@/stores/workflowStore')
    mockCreateWorkflowFn = useWorkflowStore.getState().createWorkflow
    mockCreateWorkflowFn.mockResolvedValue({ id: 'new-workflow-123', name: 'New Workflow' })
  })

  it('creates a workflow and navigates to builder', async () => {
    const { result } = renderHook(() => useCreateAndOpenWorkflow())

    await act(async () => {
      await result.current.createAndOpen()
    })

    expect(mockCreateWorkflowFn).toHaveBeenCalledWith('New Workflow', '', undefined)
    expect(mockPush).toHaveBeenCalledWith('/workflows/builder/new-workflow-123?openPanel=true')
  })

  it('includes prompt as URL param when provided', async () => {
    const { result } = renderHook(() => useCreateAndOpenWorkflow())

    await act(async () => {
      await result.current.createAndOpen({ prompt: 'Send a slack message' })
    })

    expect(mockPush).toHaveBeenCalledWith(
      '/workflows/builder/new-workflow-123?openPanel=true&prompt=Send%20a%20slack%20message'
    )
  })

  it('sets isCreating during creation', async () => {
    const { result } = renderHook(() => useCreateAndOpenWorkflow())

    expect(result.current.isCreating).toBe(false)

    let resolveCreate: (value: any) => void
    mockCreateWorkflowFn.mockReturnValue(
      new Promise(resolve => { resolveCreate = resolve })
    )

    let createPromise: Promise<any>
    act(() => {
      createPromise = result.current.createAndOpen()
    })

    expect(result.current.isCreating).toBe(true)

    await act(async () => {
      resolveCreate!({ id: 'wf-1', name: 'New Workflow' })
      await createPromise!
    })

    expect(result.current.isCreating).toBe(false)
  })

  it('sets error state on failure', async () => {
    mockCreateWorkflowFn.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useCreateAndOpenWorkflow())

    let caughtError: Error | undefined
    await act(async () => {
      try {
        await result.current.createAndOpen()
      } catch (err) {
        caughtError = err as Error
      }
    })

    expect(caughtError?.message).toBe('Network error')
    expect(result.current.error).toBe('Network error')
    expect(result.current.isCreating).toBe(false)
    expect(mockPush).not.toHaveBeenCalled()
  })
})
