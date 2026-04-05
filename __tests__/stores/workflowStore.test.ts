import { useWorkflowStore, Workflow } from '@/stores/workflowStore'

// Mock external dependencies
jest.mock('@/utils/supabaseClient', () => ({
  supabase: {},
}))

jest.mock('@/lib/workflows/nodes', () => ({
  ALL_NODE_COMPONENTS: {},
}))

jest.mock('@/lib/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}))

jest.mock('@/lib/utils/cross-tab-sync', () => ({
  getCrossTabSync: jest.fn(() => ({
    broadcastWorkflowChange: jest.fn(),
  })),
}))

jest.mock('@/lib/utils/beta-tester-tracking', () => ({
  trackBetaTesterActivity: jest.fn().mockResolvedValue(undefined),
}))

const mockCreateWorkflow = jest.fn()
const mockUpdateWorkflow = jest.fn()
const mockDeleteWorkflow = jest.fn()
const mockFetchWorkflows = jest.fn()

jest.mock('@/services/workflow-service', () => ({
  WorkflowService: {
    createWorkflow: (...args: any[]) => mockCreateWorkflow(...args),
    updateWorkflow: (...args: any[]) => mockUpdateWorkflow(...args),
    deleteWorkflow: (...args: any[]) => mockDeleteWorkflow(...args),
    fetchWorkflows: (...args: any[]) => mockFetchWorkflows(...args),
  },
}))

const mockGetSecureUserAndSession = jest.fn()

jest.mock('@/lib/auth/session', () => ({
  SessionManager: {
    getSecureUserAndSession: (...args: any[]) => mockGetSecureUserAndSession(...args),
  },
}))

// Helper to build a fake workflow
function fakeWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: 'wf-1',
    name: 'Test Workflow',
    description: null,
    user_id: 'user-1',
    nodes: [],
    connections: [],
    status: 'draft',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('workflowStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useWorkflowStore.setState({
      workflows: [],
      currentWorkflow: null,
      selectedNode: null,
      loadingList: false,
      loadingCreate: false,
      loadingSave: false,
      updatingWorkflowIds: [],
      deletingWorkflowIds: [],
      error: null,
      lastFetchTime: null,
      fetchPromise: null,
      workspaceType: 'personal',
      workspaceId: null,
      currentUserId: null,
      lastWorkspaceKey: null,
      fetchStatus: 'idle',
      loadedOnce: false,
      dataOwnerKey: null,
    })

    jest.clearAllMocks()
  })

  // --- createWorkflow ---

  describe('createWorkflow', () => {
    it('adds the new workflow to the store on success', async () => {
      const created = fakeWorkflow({ id: 'wf-new', name: 'New Flow' })
      mockCreateWorkflow.mockResolvedValue(created)
      mockGetSecureUserAndSession.mockResolvedValue({ user: { id: 'user-1' } })

      const result = await useWorkflowStore.getState().createWorkflow('New Flow', 'desc')

      expect(result).toEqual(created)
      expect(mockCreateWorkflow).toHaveBeenCalledWith(
        'New Flow', 'desc', 'personal', undefined, undefined, undefined
      )

      const { workflows, loadingCreate } = useWorkflowStore.getState()
      expect(workflows).toHaveLength(1)
      expect(workflows[0].id).toBe('wf-new')
      expect(loadingCreate).toBe(false)
    })

    it('throws on error and does not add a workflow', async () => {
      mockCreateWorkflow.mockRejectedValue(new Error('Service error'))

      await expect(
        useWorkflowStore.getState().createWorkflow('Bad Flow')
      ).rejects.toThrow('Service error')

      const { workflows, loadingCreate } = useWorkflowStore.getState()
      expect(workflows).toHaveLength(0)
      expect(loadingCreate).toBe(false)
    })
  })

  // --- updateWorkflow ---

  describe('updateWorkflow', () => {
    it('updates the matching workflow in the store', async () => {
      const existing = fakeWorkflow({ id: 'wf-1', name: 'Old Name' })
      useWorkflowStore.setState({ workflows: [existing] })
      mockUpdateWorkflow.mockResolvedValue({})

      await useWorkflowStore.getState().updateWorkflow('wf-1', { name: 'New Name' })

      const { workflows, updatingWorkflowIds } = useWorkflowStore.getState()
      expect(workflows[0].name).toBe('New Name')
      expect(updatingWorkflowIds).not.toContain('wf-1')
    })

    it('also updates currentWorkflow if it matches', async () => {
      const existing = fakeWorkflow({ id: 'wf-1', name: 'Old' })
      useWorkflowStore.setState({ workflows: [existing], currentWorkflow: existing })
      mockUpdateWorkflow.mockResolvedValue({})

      await useWorkflowStore.getState().updateWorkflow('wf-1', { name: 'Updated' })

      expect(useWorkflowStore.getState().currentWorkflow?.name).toBe('Updated')
    })

    it('uses server status when triggerActivationError is returned', async () => {
      const existing = fakeWorkflow({ id: 'wf-1', status: 'draft' })
      useWorkflowStore.setState({ workflows: [existing] })
      mockUpdateWorkflow.mockResolvedValue({
        triggerActivationError: 'Trigger failed',
        status: 'inactive',
      })

      await useWorkflowStore.getState().updateWorkflow('wf-1', { status: 'active' })

      expect(useWorkflowStore.getState().workflows[0].status).toBe('inactive')
    })
  })

  // --- deleteWorkflow ---

  describe('deleteWorkflow', () => {
    it('removes the workflow from the store optimistically', async () => {
      const wf1 = fakeWorkflow({ id: 'wf-1' })
      const wf2 = fakeWorkflow({ id: 'wf-2', name: 'Second' })
      useWorkflowStore.setState({ workflows: [wf1, wf2] })
      mockDeleteWorkflow.mockResolvedValue(undefined)
      mockGetSecureUserAndSession.mockResolvedValue({ user: { id: 'user-1' } })

      await useWorkflowStore.getState().deleteWorkflow('wf-1')

      const { workflows } = useWorkflowStore.getState()
      expect(workflows).toHaveLength(1)
      expect(workflows[0].id).toBe('wf-2')
    })

    it('clears currentWorkflow if the deleted workflow was selected', async () => {
      const wf = fakeWorkflow({ id: 'wf-1' })
      useWorkflowStore.setState({ workflows: [wf], currentWorkflow: wf })
      mockDeleteWorkflow.mockResolvedValue(undefined)
      mockGetSecureUserAndSession.mockResolvedValue({ user: { id: 'user-1' } })

      await useWorkflowStore.getState().deleteWorkflow('wf-1')

      expect(useWorkflowStore.getState().currentWorkflow).toBeNull()
    })

    it('throws if workflow is not found', async () => {
      useWorkflowStore.setState({ workflows: [] })

      await expect(
        useWorkflowStore.getState().deleteWorkflow('nonexistent')
      ).rejects.toThrow('Workflow not found')
    })
  })

  // --- setWorkspaceContext ---

  describe('setWorkspaceContext', () => {
    it('sets workspace type and id', async () => {
      await useWorkflowStore.getState().setWorkspaceContext('team', 'team-123')

      const { workspaceType, workspaceId } = useWorkflowStore.getState()
      expect(workspaceType).toBe('team')
      expect(workspaceId).toBe('team-123')
    })

    it('clears workflows on context change (identity change)', async () => {
      useWorkflowStore.setState({
        workflows: [fakeWorkflow()],
        workspaceType: 'personal',
        workspaceId: null,
      })

      await useWorkflowStore.getState().setWorkspaceContext('organization', 'org-1')

      expect(useWorkflowStore.getState().workflows).toHaveLength(0)
      expect(useWorkflowStore.getState().workspaceType).toBe('organization')
    })

    it('does nothing if context is unchanged', async () => {
      useWorkflowStore.setState({
        workflows: [fakeWorkflow()],
        workspaceType: 'personal',
        workspaceId: null,
      })

      await useWorkflowStore.getState().setWorkspaceContext('personal', null)

      // Workflows should be preserved since context didn't change
      expect(useWorkflowStore.getState().workflows).toHaveLength(1)
    })
  })
})
