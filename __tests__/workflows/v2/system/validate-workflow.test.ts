/**
 * Workflow Status Validation Tests
 *
 * Tests that validateWorkflow() correctly identifies workflows as complete
 * or incomplete based on structural requirements (trigger + action) and
 * field configuration (all visible required fields filled).
 *
 * Run: npx jest __tests__/workflows/v2/system/validate-workflow.test.ts
 */

// Mock ALL_NODE_COMPONENTS with controlled schemas before importing
jest.mock('@/lib/workflows/nodes', () => ({
  ALL_NODE_COMPONENTS: [
    // Trigger with one required field
    {
      type: 'gmail_trigger_new_email',
      title: 'Gmail: New Email',
      isTrigger: true,
      providerId: 'gmail',
      configSchema: [
        { name: 'labelId', label: 'Label', type: 'select', required: true },
      ],
    },
    // Trigger with NO required fields
    {
      type: 'webhook_trigger_incoming',
      title: 'Webhook: Incoming',
      isTrigger: true,
      providerId: 'webhook',
      configSchema: [],
    },
    // Action with simple required field
    {
      type: 'discord_action_send_message',
      title: 'Discord: Send Message',
      isTrigger: false,
      providerId: 'discord',
      configSchema: [
        { name: 'guildId', label: 'Server', type: 'select', required: true },
        {
          name: 'channelId',
          label: 'Channel',
          type: 'select',
          required: true,
          dependsOn: 'guildId',
        },
        { name: 'message', label: 'Message', type: 'text', required: true },
      ],
    },
    // Action with only optional fields
    {
      type: 'slack_action_set_status',
      title: 'Slack: Set Status',
      isTrigger: false,
      providerId: 'slack',
      configSchema: [
        { name: 'statusText', label: 'Status Text', type: 'text', required: false },
        { name: 'emoji', label: 'Emoji', type: 'text', required: false },
      ],
    },
    // Action with hidden conditional fields using hidden.$condition
    {
      type: 'notion_action_update_page',
      title: 'Notion: Update Page',
      isTrigger: false,
      providerId: 'notion',
      configSchema: [
        { name: 'databaseId', label: 'Database', type: 'select', required: true },
        {
          name: 'pageId',
          label: 'Page',
          type: 'select',
          required: true,
          dependsOn: 'databaseId',
          hidden: {
            $condition: { databaseId: { $exists: false } },
          },
        },
        {
          name: 'title',
          label: 'Title',
          type: 'text',
          required: false,
          dependsOn: 'pageId',
        },
      ],
    },
    // Action with required field that has a defaultValue
    {
      type: 'gdrive_action_upload',
      title: 'Google Drive: Upload File',
      isTrigger: false,
      providerId: 'google-drive',
      configSchema: [
        { name: 'fileName', label: 'File Name', type: 'text', required: true },
        { name: 'sourceType', label: 'File Source', type: 'select', required: true, defaultValue: 'file' },
      ],
    },
    // AI agent node (should always be skipped)
    {
      type: 'ai_agent',
      title: 'AI Agent',
      isTrigger: false,
      providerId: 'ai',
      configSchema: [
        { name: 'prompt', label: 'Prompt', type: 'text', required: true },
      ],
    },
  ],
}))

import { validateWorkflow } from '@/lib/workflows/validation/validateWorkflow'

// ── Helpers ──────────────────────────────────────────────────────────

let nodeIdCounter = 0

function makeNode(opts: {
  nodeType?: string
  isTrigger?: boolean
  config?: Record<string, any>
  title?: string
  reactFlowType?: string
  useMetadata?: boolean
  validationState?: { isValid: boolean; missingRequired: string[] }
  needsSetup?: boolean
}) {
  const id = `node-${++nodeIdCounter}`
  const base: any = {
    id,
    type: opts.reactFlowType || 'custom',
    position: { x: 0, y: 0 },
  }

  if (opts.useMetadata) {
    base.metadata = {
      type: opts.nodeType,
      isTrigger: opts.isTrigger ?? false,
      config: opts.config || {},
      ...(opts.validationState !== undefined && { validationState: opts.validationState }),
      ...(opts.needsSetup !== undefined && { needsSetup: opts.needsSetup }),
    }
  } else {
    base.data = {
      type: opts.nodeType,
      isTrigger: opts.isTrigger ?? false,
      config: opts.config || {},
      title: opts.title,
      ...(opts.validationState !== undefined && { validationState: opts.validationState }),
      ...(opts.needsSetup !== undefined && { needsSetup: opts.needsSetup }),
    }
  }

  return base
}

function makeWorkflow(nodes: any[]) {
  return { nodes }
}

// ── Tests ────────────────────────────────────────────────────────────

beforeEach(() => {
  nodeIdCounter = 0
})

describe('validateWorkflow', () => {
  // ── Structural validation ──────────────────────────────────────────

  describe('structural validation', () => {
    it('reports empty workflow as incomplete', () => {
      const result = validateWorkflow(makeWorkflow([]))
      expect(result.isValid).toBe(false)
      expect(result.issues).toContain('No trigger node configured')
      expect(result.issues).toContain('No action nodes configured')
    })

    it('reports workflow with only trigger as incomplete', () => {
      const trigger = makeNode({
        nodeType: 'webhook_trigger_incoming',
        isTrigger: true,
      })
      const result = validateWorkflow(makeWorkflow([trigger]))
      expect(result.isValid).toBe(false)
      expect(result.issues).toContain('No action nodes configured')
      expect(result.issues).not.toContain('No trigger node configured')
    })

    it('reports workflow with only action as incomplete', () => {
      const action = makeNode({
        nodeType: 'slack_action_set_status',
        isTrigger: false,
        config: {},
      })
      const result = validateWorkflow(makeWorkflow([action]))
      expect(result.isValid).toBe(false)
      expect(result.issues).toContain('No trigger node configured')
      expect(result.issues).not.toContain('No action nodes configured')
    })

    it('recognizes trigger via data.isTrigger', () => {
      const trigger = makeNode({ nodeType: 'webhook_trigger_incoming', isTrigger: true })
      const action = makeNode({ nodeType: 'slack_action_set_status', isTrigger: false })
      const result = validateWorkflow(makeWorkflow([trigger, action]))
      expect(result.isValid).toBe(true)
    })

    it('recognizes trigger via metadata.isTrigger', () => {
      const trigger = makeNode({
        nodeType: 'webhook_trigger_incoming',
        isTrigger: true,
        useMetadata: true,
      })
      const action = makeNode({ nodeType: 'slack_action_set_status', isTrigger: false })
      const result = validateWorkflow(makeWorkflow([trigger, action]))
      expect(result.isValid).toBe(true)
    })

    it('recognizes trigger via node.type containing _trigger_', () => {
      // Node with no data.isTrigger but type string contains _trigger_
      const trigger: any = {
        id: 'trg-1',
        type: 'gmail_trigger_new_email',
        position: { x: 0, y: 0 },
        data: { type: 'webhook_trigger_incoming', config: {} },
      }
      const action = makeNode({ nodeType: 'slack_action_set_status', isTrigger: false })
      const result = validateWorkflow(makeWorkflow([trigger, action]))
      expect(result.isValid).toBe(true)
    })

    it('recognizes trigger via catalog lookup when isTrigger not on node data', () => {
      // Node has no isTrigger flag and type doesn't contain _trigger_
      // (e.g., google-drive uses colon format: "google-drive:new_file_in_folder")
      const trigger: any = {
        id: 'trg-catalog',
        type: 'custom',
        position: { x: 0, y: 0 },
        data: { type: 'gmail_trigger_new_email', config: { labelId: 'INBOX' } },
        // Note: NO isTrigger flag on data
      }
      const action = makeNode({ nodeType: 'slack_action_set_status', isTrigger: false })
      const result = validateWorkflow(makeWorkflow([trigger, action]))
      expect(result.isValid).toBe(true)
    })

    it('ignores add-* placeholder nodes as actions', () => {
      const trigger = makeNode({ nodeType: 'webhook_trigger_incoming', isTrigger: true })
      const placeholder: any = {
        id: 'placeholder-1',
        type: 'add-node',
        position: { x: 0, y: 0 },
        data: {},
      }
      const result = validateWorkflow(makeWorkflow([trigger, placeholder]))
      expect(result.isValid).toBe(false)
      expect(result.issues).toContain('No action nodes configured')
    })
  })

  // ── Field configuration validation ─────────────────────────────────

  describe('field configuration validation', () => {
    it('reports missing required fields as incomplete', () => {
      const trigger = makeNode({
        nodeType: 'gmail_trigger_new_email',
        isTrigger: true,
        config: {}, // labelId is required but missing
      })
      const action = makeNode({
        nodeType: 'discord_action_send_message',
        isTrigger: false,
        config: {}, // guildId and message are required but missing
      })
      const result = validateWorkflow(makeWorkflow([trigger, action]))
      expect(result.isValid).toBe(false)
      expect(result.issues.some(i => i.includes('Label'))).toBe(true)
      expect(result.issues.some(i => i.includes('Server'))).toBe(true)
      expect(result.issues.some(i => i.includes('Message'))).toBe(true)
    })

    it('returns valid when all required fields are filled', () => {
      const trigger = makeNode({
        nodeType: 'gmail_trigger_new_email',
        isTrigger: true,
        config: { labelId: 'INBOX' },
      })
      const action = makeNode({
        nodeType: 'discord_action_send_message',
        isTrigger: false,
        config: { guildId: 'g1', channelId: 'c1', message: 'Hello' },
      })
      const result = validateWorkflow(makeWorkflow([trigger, action]))
      expect(result.isValid).toBe(true)
      expect(result.issues).toEqual([])
    })

    it('skips nodes whose type is not in the component catalog', () => {
      const trigger = makeNode({ nodeType: 'webhook_trigger_incoming', isTrigger: true })
      const action = makeNode({
        nodeType: 'unknown_custom_action',
        isTrigger: false,
        config: {},
      })
      const result = validateWorkflow(makeWorkflow([trigger, action]))
      // Should not error, unknown node is simply skipped
      expect(result.isValid).toBe(true)
    })

    it('skips ai_agent nodes entirely', () => {
      const trigger = makeNode({ nodeType: 'webhook_trigger_incoming', isTrigger: true })
      const aiAgent = makeNode({
        nodeType: 'ai_agent',
        isTrigger: false,
        config: {}, // prompt is required but should be skipped
      })
      const result = validateWorkflow(makeWorkflow([trigger, aiAgent]))
      expect(result.isValid).toBe(true)
      expect(result.issues).toEqual([])
    })

    it('does not report required field as missing when it has a defaultValue (fallback path)', () => {
      // Node has no persisted validationState, so falls back to schema check.
      // sourceType is required but has defaultValue: "file" — should NOT be reported missing.
      const trigger = makeNode({ nodeType: 'webhook_trigger_incoming', isTrigger: true })
      const action = makeNode({
        nodeType: 'gdrive_action_upload',
        isTrigger: false,
        config: { fileName: 'test.txt' }, // sourceType not in config, but has defaultValue
      })
      const result = validateWorkflow(makeWorkflow([trigger, action]))
      expect(result.isValid).toBe(true)
      expect(result.issues).toEqual([])
    })

    it('reports required field without defaultValue as missing (truly unconfigured node)', () => {
      const trigger = makeNode({ nodeType: 'webhook_trigger_incoming', isTrigger: true })
      const action = makeNode({
        nodeType: 'gdrive_action_upload',
        isTrigger: false,
        config: {}, // completely empty config = never configured
      })
      const result = validateWorkflow(makeWorkflow([trigger, action]))
      expect(result.isValid).toBe(false)
      // sourceType has defaultValue so only fileName should be missing
      expect(result.issues.some(i => i.includes('File Name'))).toBe(true)
    })

    it('considers workflow valid when action has only optional fields', () => {
      const trigger = makeNode({ nodeType: 'webhook_trigger_incoming', isTrigger: true })
      const action = makeNode({
        nodeType: 'slack_action_set_status',
        isTrigger: false,
        config: {}, // all fields are optional
      })
      const result = validateWorkflow(makeWorkflow([trigger, action]))
      expect(result.isValid).toBe(true)
    })
  })

  // ── Conditional field visibility ───────────────────────────────────

  describe('conditional field visibility', () => {
    it('does NOT count hidden required field when parent is empty (dependsOn)', () => {
      const trigger = makeNode({ nodeType: 'webhook_trigger_incoming', isTrigger: true })
      const action = makeNode({
        nodeType: 'discord_action_send_message',
        isTrigger: false,
        title: 'Discord: Send Message',
        config: { guildId: '', channelId: '', message: 'Hello' },
        validationState: { isValid: false, missingRequired: ['Server'] },
        needsSetup: true,
      })
      const result = validateWorkflow(makeWorkflow([trigger, action]))
      expect(result.isValid).toBe(false)
      const discordIssue = result.issues.find(i => i.includes('Discord'))
      expect(discordIssue).toBeDefined()
      expect(discordIssue).toContain('Server')
      expect(discordIssue).not.toContain('Channel')
    })

    it('DOES count required child field when parent is set but child is empty', () => {
      const trigger = makeNode({ nodeType: 'webhook_trigger_incoming', isTrigger: true })
      const action = makeNode({
        nodeType: 'discord_action_send_message',
        isTrigger: false,
        title: 'Discord: Send Message',
        config: { guildId: 'g1', channelId: '', message: 'Hello' },
        validationState: { isValid: false, missingRequired: ['Channel'] },
        needsSetup: true,
      })
      const result = validateWorkflow(makeWorkflow([trigger, action]))
      expect(result.isValid).toBe(false)
      const discordIssue = result.issues.find(i => i.includes('Discord'))
      expect(discordIssue).toBeDefined()
      expect(discordIssue).toContain('Channel')
    })

    it('handles hidden.$condition with $exists: false correctly', () => {
      const trigger = makeNode({ nodeType: 'webhook_trigger_incoming', isTrigger: true })
      // Notion action: databaseId empty → pageId should be hidden (not counted)
      const action = makeNode({
        nodeType: 'notion_action_update_page',
        isTrigger: false,
        config: { databaseId: '', pageId: '' },
      })
      const result = validateWorkflow(makeWorkflow([trigger, action]))
      expect(result.isValid).toBe(false)
      const notionIssue = result.issues.find(i => i.includes('Notion'))
      expect(notionIssue).toBeDefined()
      // Should only report Database as missing, not the "Page" field
      // (note: "Page" appears in node title "Update Page" so we check the missing fields portion)
      const missingPart = notionIssue!.split('missing ')[1]
      expect(missingPart).toContain('Database')
      expect(missingPart).not.toContain('Page')
    })

    it('validates hidden.$condition child when parent IS set', () => {
      const trigger = makeNode({ nodeType: 'webhook_trigger_incoming', isTrigger: true })
      const action = makeNode({
        nodeType: 'notion_action_update_page',
        isTrigger: false,
        title: 'Notion: Update Page',
        config: { databaseId: 'db1', pageId: '' },
        validationState: { isValid: false, missingRequired: ['Page'] },
        needsSetup: true,
      })
      const result = validateWorkflow(makeWorkflow([trigger, action]))
      expect(result.isValid).toBe(false)
      const notionIssue = result.issues.find(i => i.includes('Notion'))
      expect(notionIssue).toBeDefined()
      expect(notionIssue).toContain('Page')
    })

    it('returns valid when all cascading fields are properly filled', () => {
      const trigger = makeNode({
        nodeType: 'gmail_trigger_new_email',
        isTrigger: true,
        config: { labelId: 'INBOX' },
      })
      const action = makeNode({
        nodeType: 'notion_action_update_page',
        isTrigger: false,
        config: { databaseId: 'db1', pageId: 'page1' },
      })
      const result = validateWorkflow(makeWorkflow([trigger, action]))
      expect(result.isValid).toBe(true)
      expect(result.issues).toEqual([])
    })
  })

  // ── workflow_json fallback ─────────────────────────────────────────

  describe('workflow_json fallback', () => {
    it('parses workflow_json as string', () => {
      const trigger = makeNode({ nodeType: 'webhook_trigger_incoming', isTrigger: true })
      const action = makeNode({ nodeType: 'slack_action_set_status', isTrigger: false })
      const workflow = {
        workflow_json: JSON.stringify({ nodes: [trigger, action] }),
      }
      const result = validateWorkflow(workflow)
      expect(result.isValid).toBe(true)
    })

    it('parses workflow_json as object', () => {
      const trigger = makeNode({ nodeType: 'webhook_trigger_incoming', isTrigger: true })
      const action = makeNode({ nodeType: 'slack_action_set_status', isTrigger: false })
      const workflow = {
        workflow_json: { nodes: [trigger, action] },
      }
      const result = validateWorkflow(workflow)
      expect(result.isValid).toBe(true)
    })

    it('returns invalid for malformed workflow_json', () => {
      const workflow = { workflow_json: '{not valid json!!!' }
      const result = validateWorkflow(workflow)
      expect(result.isValid).toBe(false)
      expect(result.issues).toContain('Invalid workflow configuration')
    })
  })

  // ── Persisted validation state (primary path) ──────────────────────

  describe('persisted validation state', () => {
    it('uses validationState.isValid when present — valid node', () => {
      const trigger = makeNode({
        nodeType: 'webhook_trigger_incoming',
        isTrigger: true,
        validationState: { isValid: true, missingRequired: [] },
        needsSetup: false,
      })
      const action = makeNode({
        nodeType: 'discord_action_send_message',
        isTrigger: false,
        config: { guildId: 'g1', channelId: 'c1', message: 'Hello' },
        validationState: { isValid: true, missingRequired: [] },
        needsSetup: false,
      })
      const result = validateWorkflow(makeWorkflow([trigger, action]))
      expect(result.isValid).toBe(true)
      expect(result.issues).toEqual([])
    })

    it('uses validationState.isValid when present — invalid node', () => {
      const trigger = makeNode({
        nodeType: 'webhook_trigger_incoming',
        isTrigger: true,
        validationState: { isValid: true, missingRequired: [] },
        needsSetup: false,
      })
      const action = makeNode({
        nodeType: 'discord_action_send_message',
        isTrigger: false,
        title: 'Discord: Send Message',
        validationState: { isValid: false, missingRequired: ['Channel'] },
        needsSetup: true,
      })
      const result = validateWorkflow(makeWorkflow([trigger, action]))
      expect(result.isValid).toBe(false)
      expect(result.issues.some(i => i.includes('Channel'))).toBe(true)
    })

    it('treats needsSetup: true as incomplete even without missingRequired', () => {
      const trigger = makeNode({
        nodeType: 'webhook_trigger_incoming',
        isTrigger: true,
        needsSetup: false,
      })
      const action = makeNode({
        nodeType: 'slack_action_set_status',
        isTrigger: false,
        title: 'Slack: Set Status',
        needsSetup: true,
        validationState: { isValid: false, missingRequired: [] },
      })
      const result = validateWorkflow(makeWorkflow([trigger, action]))
      expect(result.isValid).toBe(false)
      expect(result.issues.some(i => i.includes('needs configuration'))).toBe(true)
    })

    it('prefers persisted state over schema validation (ignores config)', () => {
      // Node has empty config but validationState says it's valid
      // (e.g., builder applied defaults before saving validationState)
      const trigger = makeNode({
        nodeType: 'gmail_trigger_new_email',
        isTrigger: true,
        config: {}, // labelId not in config!
        validationState: { isValid: true, missingRequired: [] },
        needsSetup: false,
      })
      const action = makeNode({
        nodeType: 'slack_action_set_status',
        isTrigger: false,
        needsSetup: false,
      })
      const result = validateWorkflow(makeWorkflow([trigger, action]))
      // Should be valid because persisted state says so
      expect(result.isValid).toBe(true)
    })

    it('reads __validationState from inside config object', () => {
      // Some save paths store validationState inside config rather than on node.data
      const trigger = makeNode({
        nodeType: 'webhook_trigger_incoming',
        isTrigger: true,
      })
      const action: any = {
        id: 'action-inner-vs',
        type: 'custom',
        position: { x: 0, y: 0 },
        data: {
          type: 'discord_action_send_message',
          isTrigger: false,
          config: {
            guildId: 'g1',
            channelId: 'c1',
            message: 'Hello',
            __validationState: { isValid: true, missingRequired: [] },
          },
        },
      }
      const result = validateWorkflow(makeWorkflow([trigger, action]))
      expect(result.isValid).toBe(true)
    })

    it('falls back to schema validation for truly unconfigured nodes', () => {
      // No validationState, no needsSetup, AND empty config — uses schema check
      const trigger = makeNode({
        nodeType: 'gmail_trigger_new_email',
        isTrigger: true,
        config: {}, // empty config = never configured
      })
      const action = makeNode({
        nodeType: 'slack_action_set_status',
        isTrigger: false,
      })
      const result = validateWorkflow(makeWorkflow([trigger, action]))
      expect(result.isValid).toBe(false)
      expect(result.issues.some(i => i.includes('Label'))).toBe(true)
    })

    it('trusts the builder when node has config values but no validationState', () => {
      // Node has config values (user interacted) but no persisted validationState.
      // This happens when the builder didn't save __validationState (older save paths).
      // We trust the builder — if the user configured it, it's configured.
      const trigger = makeNode({
        nodeType: 'webhook_trigger_incoming',
        isTrigger: true,
      })
      const action = makeNode({
        nodeType: 'discord_action_send_message',
        isTrigger: false,
        config: { guildId: 'g1', message: 'Hello' }, // has values but channelId missing
        // No validationState — trust the builder since user has interacted
      })
      const result = validateWorkflow(makeWorkflow([trigger, action]))
      expect(result.isValid).toBe(true)
    })
  })

  // ── Null / undefined edge cases ────────────────────────────────────

  describe('edge cases', () => {
    it('handles null/undefined workflow gracefully', () => {
      const result = validateWorkflow(null)
      expect(result.isValid).toBe(false)
      expect(result.issues).toContain('No trigger node configured')
    })

    it('handles workflow with no nodes property', () => {
      const result = validateWorkflow({ name: 'Empty' })
      expect(result.isValid).toBe(false)
      expect(result.issues).toContain('No trigger node configured')
    })
  })
})
