import { AdvancedExecutionEngine } from '@/lib/execution/advancedExecutionEngine'
import { createClient } from '@supabase/supabase-js'
import { safeDecrypt } from '@/lib/security/encryption'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface DropboxWebhookResult {
  workflowId: string
  success: boolean
  skipped?: boolean
  reason?: string
  dropbox?: {
    accountId?: string | null
    folderPath: string
    includeSubfolders: boolean
    fileType: string
    rawEntriesCount?: number
  }
}

interface DropboxTriggerPayload {
  files: Array<{
    id: string
    name: string
    pathLower: string
    pathDisplay: string
    size?: number
    rev?: string
    contentHash?: string
    clientModified?: string
    serverModified?: string
  }>
  accountId?: string | null
  folderPath: string
  includeSubfolders: boolean
  fileType: string
  rawEntriesCount?: number
  cursor?: string
  skipReason?: string
}

export async function handleDropboxWebhookEvent(
  payload: any,
  headers: Record<string, string>,
  requestId?: string
): Promise<DropboxWebhookResult[]> {
  const logPrefix = requestId ? `[${requestId}]` : '[dropbox]'
  try {
    console.log(`${logPrefix} Dropbox webhook payload keys:`, {
      hasListFolder: !!payload?.list_folder,
      accounts: payload?.list_folder?.accounts || payload?.list_folder?.account_ids || null,
      deltaPresent: !!payload?.delta,
    })
  } catch {
    // ignore logging errors
  }

  const workflows = await findDropboxWorkflows(payload)

  if (workflows.length === 0) {
    console.log(`${logPrefix} No Dropbox workflows matched incoming payload.`)
    return []
  }

  const results: DropboxWebhookResult[] = []

  for (const workflow of workflows) {
    const result = await processDropboxWorkflow(workflow, payload, headers, requestId)
    if (result) {
      results.push(result)
    }
  }

  return results
}

async function findDropboxWorkflows(payload: any): Promise<any[]> {
  const accounts = Array.isArray(payload?.list_folder?.accounts)
    ? (payload.list_folder.accounts as string[])
    : []

  if (accounts.length === 0) {
    console.log('🛑 Dropbox webhook payload missing accounts array, skipping workflow lookup')
    return []
  }

  const accountSet = new Set(accounts)

  const { data: webhookConfigs, error: configError } = await supabase
    .from('webhook_configs')
    .select('id, workflow_id, config, status')
    .eq('provider_id', 'dropbox')

  if (configError) {
    console.error('❌ Failed to fetch Dropbox webhook configs:', configError)
    return []
  }

  const dropboxConfigMap = new Map<string, any>()

  for (const config of webhookConfigs || []) {
    if (config.status && config.status !== 'active') continue

    let configJson: any = config.config || {}
    if (typeof configJson === 'string') {
      try {
        configJson = JSON.parse(configJson)
      } catch (parseErr) {
        console.warn('⚠️ Failed to parse Dropbox webhook config JSON:', parseErr)
        configJson = {}
      }
    }

    const dropboxStateRaw = configJson.dropbox_state || {}
    const dropboxState = {
      ...dropboxStateRaw,
      path: typeof dropboxStateRaw.path === 'string' ? dropboxStateRaw.path : undefined
    }

    const accountId: string | undefined = dropboxState?.accountId || configJson?.accountId
    if (accountId && !accountSet.has(accountId)) continue

    dropboxConfigMap.set(config.workflow_id, {
      ...config,
      dropboxState,
      config: configJson
    })
  }

  if (dropboxConfigMap.size === 0) {
    console.log('ℹ️ No Dropbox webhook configs matched the incoming account IDs')
    return []
  }

  const workflowIds = Array.from(dropboxConfigMap.keys())

  const { data: workflows, error: workflowError } = await supabase
    .from('workflows')
    .select('*')
    .in('status', ['draft', 'active'])
    .in('id', workflowIds)

  if (workflowError) {
    console.error('Error fetching Dropbox workflows:', workflowError)
    return []
  }

  const matching: any[] = []

  for (const workflow of workflows || []) {
    let nodes: any[] = []
    const rawNodes = workflow.nodes

    if (Array.isArray(rawNodes)) {
      nodes = rawNodes
    } else if (typeof rawNodes === 'string') {
      try {
        nodes = JSON.parse(rawNodes)
      } catch (parseErr) {
        console.warn('⚠️ Failed to parse workflow nodes while filtering:', {
          workflowId: workflow.id,
          error: parseErr
        })
        nodes = []
      }
    }

    const providerTriggers = nodes.filter((node: any) =>
      node?.data?.providerId === 'dropbox' && node?.data?.isTrigger === true
    )

    if (providerTriggers.length === 0) continue

    const cachedConfig = dropboxConfigMap.get(workflow.id)
    if (!cachedConfig) continue

    ;(workflow as any).__dropboxWebhookConfig = cachedConfig
    matching.push(workflow)
  }

  console.log(`🎯 Dropbox workflows matched: ${matching.length}`)
  return matching
}

async function processDropboxWorkflow(
  workflow: any,
  payload: any,
  headers: Record<string, string>,
  requestId?: string
): Promise<DropboxWebhookResult | null> {
  const logPrefix = requestId ? `[${requestId}]` : ''
  console.log(`${logPrefix} Processing Dropbox workflow ${workflow.id} (${workflow.name})`)

  const triggerPayload = await buildDropboxTriggerPayload(workflow, payload, requestId)

  if (!triggerPayload) {
    console.log(`${logPrefix} Dropbox payload unavailable, skipping workflow ${workflow.id}`)
    return {
      workflowId: workflow.id,
      success: true,
      skipped: true,
      reason: 'dropbox_payload_unavailable'
    }
  }

  if (!triggerPayload.files || triggerPayload.files.length === 0) {
    console.log(`${logPrefix} No Dropbox files matched filters for workflow ${workflow.id}, skipping execution`, {
      dropbox: {
        skipReason: triggerPayload.skipReason,
        folderPath: triggerPayload.folderPath,
        includeSubfolders: triggerPayload.includeSubfolders,
        fileType: triggerPayload.fileType,
        rawEntriesCount: triggerPayload.rawEntriesCount
      }
    })

    return {
      workflowId: workflow.id,
      success: true,
      skipped: true,
      reason: triggerPayload.skipReason || 'no_matching_files',
      dropbox: {
        accountId: triggerPayload.accountId || null,
        folderPath: triggerPayload.folderPath,
        includeSubfolders: triggerPayload.includeSubfolders,
        fileType: triggerPayload.fileType,
        rawEntriesCount: triggerPayload.rawEntriesCount
      }
    }
  }

  console.log(`${logPrefix} Dropbox payload prepared for workflow ${workflow.id}`, {
    fileCount: triggerPayload.files.length,
    firstFile: triggerPayload.files[0]?.pathLower || null
  })

  let workflowNodes: any[] = []
  if (Array.isArray(workflow.nodes)) {
    workflowNodes = workflow.nodes
  } else if (typeof workflow.nodes === 'string') {
    try {
      workflowNodes = JSON.parse(workflow.nodes)
    } catch (parseError) {
      console.warn(`${logPrefix} Failed to parse workflow nodes JSON for workflow ${workflow.id}:`, parseError)
      workflowNodes = []
    }
  }

  const triggerNode = workflowNodes.find((node: any) =>
    node?.data?.providerId === 'dropbox' && node?.data?.isTrigger === true
  )

  if (!triggerNode) {
    console.warn(`${logPrefix} No Dropbox trigger node found for workflow ${workflow.id}`)
    return {
      workflowId: workflow.id,
      success: true,
      skipped: true,
      reason: 'missing_trigger_node',
      dropbox: {
        accountId: triggerPayload.accountId || null,
        folderPath: triggerPayload.folderPath,
        includeSubfolders: triggerPayload.includeSubfolders,
        fileType: triggerPayload.fileType,
        rawEntriesCount: triggerPayload.rawEntriesCount
      }
    }
  }

  const executionEngine = new AdvancedExecutionEngine()
  const session = await executionEngine.createExecutionSession(
    workflow.id,
    workflow.user_id,
    'webhook',
    {
      inputData: triggerPayload,
      provider: 'dropbox',
      triggerNode: triggerNode,
      requestId
    }
  )

  console.log(`${logPrefix} Created execution session: ${session.id}`)

  await executionEngine.executeWorkflowAdvanced(session.id, triggerPayload)
  console.log(`${logPrefix} Dropbox workflow execution completed`)

  return {
    workflowId: workflow.id,
    success: true,
    dropbox: {
      accountId: triggerPayload.accountId || null,
      folderPath: triggerPayload.folderPath,
      includeSubfolders: triggerPayload.includeSubfolders,
      fileType: triggerPayload.fileType,
      rawEntriesCount: triggerPayload.rawEntriesCount
    }
  }
}

async function buildDropboxTriggerPayload(
  workflow: any,
  payload: any,
  requestId?: string
): Promise<DropboxTriggerPayload | null> {
  const logPrefix = requestId ? `[${requestId}]` : ''

  let webhookConfig = (workflow as any).__dropboxWebhookConfig

  if (!webhookConfig) {
    const { data: configRecord, error: configError } = await supabase
      .from('webhook_configs')
      .select('id, workflow_id, config, status')
      .eq('workflow_id', workflow.id)
      .eq('provider_id', 'dropbox')
      .eq('status', 'active')
      .maybeSingle()

    if (configError || !configRecord) {
      console.warn(`${logPrefix} No active Dropbox webhook config found for workflow ${workflow.id}`, configError)
      return null
    }

    let configJson: any = configRecord.config || {}
    if (typeof configJson === 'string') {
      try {
        configJson = JSON.parse(configJson)
      } catch (parseErr) {
        console.warn(`${logPrefix} Failed to parse Dropbox config JSON for workflow ${workflow.id}:`, parseErr)
        configJson = {}
      }
    }

    webhookConfig = {
      ...configRecord,
      config: configJson,
      dropboxState: configJson.dropbox_state || {}
    }

    ;(workflow as any).__dropboxWebhookConfig = webhookConfig
  }

  const configJson = webhookConfig.config || {}
  const dropboxState = webhookConfig.dropboxState || configJson.dropbox_state || {}

  const rawFolderPath: string = typeof configJson.path === 'string'
    ? configJson.path
    : (typeof dropboxState.path === 'string' ? dropboxState.path : '')

  const folderPathLower = (rawFolderPath || '').toLowerCase()

  const includeSubfolders: boolean = configJson.includeSubfolders !== undefined
    ? configJson.includeSubfolders !== false
    : (dropboxState.includeSubfolders !== false)

  const fileType: string = configJson.fileType || dropboxState.fileType || 'any'
  let cursor: string | undefined = dropboxState.cursor
  let accountId: string | null = dropboxState.accountId || null

  const { data: integration, error: integrationError } = await supabase
    .from('integrations')
    .select('id, access_token, provider, status, metadata')
    .eq('user_id', workflow.user_id)
    .eq('provider', 'dropbox')
    .eq('status', 'connected')
    .maybeSingle()

  if (integrationError || !integration) {
    console.error(`${logPrefix} Dropbox integration not found for workflow ${workflow.id}:`, integrationError)
    return {
      files: [],
      folderPath: folderPathLower,
      includeSubfolders,
      fileType,
      skipReason: 'missing_integration'
    }
  }

  const accessToken = safeDecrypt(integration.access_token)
  if (!accessToken) {
    console.error(`${logPrefix} Dropbox integration missing access token for workflow ${workflow.id}`)
    return {
      files: [],
      folderPath: folderPathLower,
      includeSubfolders,
      fileType,
      skipReason: 'missing_access_token'
    }
  }

  if (!accountId) {
    accountId = await fetchDropboxAccountId(accessToken)
  }

  if (!cursor) {
    console.log(`${logPrefix} No Dropbox cursor stored for workflow ${workflow.id}, fetching latest...`)
    cursor = await getLatestDropboxCursor(accessToken, rawFolderPath, includeSubfolders)

    if (!cursor) {
      console.warn(`${logPrefix} Failed to obtain Dropbox cursor for workflow ${workflow.id}`)
      return {
        files: [],
        folderPath: folderPathLower,
        includeSubfolders,
        fileType,
        accountId,
        skipReason: 'cursor_initialization_failed'
      }
    }
  }

  const entriesResult = await fetchDropboxEntries(accessToken, cursor)

  if (entriesResult.cursorInvalid) {
    console.warn(`${logPrefix} Dropbox cursor invalid for workflow ${workflow.id}, resetting`)
    const latestCursor = await getLatestDropboxCursor(accessToken, rawFolderPath, includeSubfolders)

    if (latestCursor) {
      const resetState = {
        ...dropboxState,
        cursor: latestCursor,
        path: rawFolderPath,
        includeSubfolders,
        fileType,
        accountId,
        lastCursorSync: new Date().toISOString()
      }

      await updateDropboxWebhookState(webhookConfig.id, configJson, resetState)
      webhookConfig.dropboxState = resetState
      webhookConfig.config = {
        ...configJson,
        dropbox_state: resetState
      }
      cursor = latestCursor
    }

    return {
      files: [],
      folderPath: folderPathLower,
      includeSubfolders,
      fileType,
      accountId,
      skipReason: 'cursor_reset'
    }
  }

  const entries = entriesResult.entries
  const nextCursor = entriesResult.cursor || cursor

  console.log(`${logPrefix} Dropbox entries fetched`, {
    workflowId: workflow.id,
    accountId,
    folderPath: rawFolderPath,
    folderPathLower,
    includeSubfolders,
    rawEntriesCount: entries.length,
    fileType,
    sampleEntry: entries[0]?.path_lower || null
  })

  const filteredFiles = entries
    .filter((entry: any) => entry?.['.tag'] === 'file')
    .filter((entry: any) => isEntryInDropboxFolder(entry?.path_lower, folderPathLower, includeSubfolders))
    .filter((entry: any) => matchesDropboxFileType(entry?.name, fileType))
    .map((entry: any) => ({
      id: entry.id,
      name: entry.name,
      pathLower: entry.path_lower,
      pathDisplay: entry.path_display,
      size: entry.size,
      rev: entry.rev,
      contentHash: entry.content_hash,
      clientModified: entry.client_modified,
      serverModified: entry.server_modified
    }))

  console.log(`${logPrefix} Dropbox filtered files`, {
    workflowId: workflow.id,
    filteredCount: filteredFiles.length,
    firstFile: filteredFiles[0]?.pathLower || null
  })

  const updatedState = {
    ...dropboxState,
    cursor: nextCursor,
    path: rawFolderPath,
    includeSubfolders,
    fileType,
    accountId,
    lastCursorSync: new Date().toISOString()
  }

  await updateDropboxWebhookState(webhookConfig.id, configJson, updatedState)
  webhookConfig.dropboxState = updatedState
  webhookConfig.config = {
    ...configJson,
    dropbox_state: updatedState
  }
  ;(workflow as any).__dropboxWebhookConfig = webhookConfig

  return {
    files: filteredFiles,
    accountId,
    folderPath: folderPathLower,
    includeSubfolders,
    fileType,
    rawEntriesCount: entries.length,
    cursor: nextCursor,
    skipReason: filteredFiles.length === 0 ? 'no_matching_files' : undefined
  }
}

async function fetchDropboxEntries(accessToken: string, cursor: string): Promise<{ entries: any[]; cursor?: string; cursorInvalid?: boolean }> {
  const aggregated: any[] = []
  let currentCursor = cursor
  let hasMore = true
  let safety = 0

  while (hasMore && safety < 10) {
    safety += 1

    const response = await fetch('https://api.dropboxapi.com/2/files/list_folder/continue', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ cursor: currentCursor })
    })

    if (response.status === 409) {
      return { entries: [], cursorInvalid: true }
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(`Dropbox list_folder/continue failed (${response.status}): ${errorText}`)
    }

    const json = await response.json()

    const entries = Array.isArray(json?.entries) ? json.entries : []
    aggregated.push(...entries)

    currentCursor = json?.cursor || currentCursor
    hasMore = Boolean(json?.has_more)

    if (!hasMore) {
      break
    }
  }

  return { entries: aggregated, cursor: currentCursor }
}

async function getLatestDropboxCursor(accessToken: string, path: string, recursive: boolean): Promise<string | null> {
  const response = await fetch('https://api.dropboxapi.com/2/files/list_folder/get_latest_cursor', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      path,
      recursive,
      include_deleted: false,
      include_media_info: false,
      include_has_explicit_shared_members: false,
      include_mounted_folders: true,
      include_non_downloadable_files: false
    })
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    console.error('❌ Failed to fetch Dropbox latest cursor:', response.status, errorText)
    return null
  }

  const json = await response.json().catch(() => null)
  return json?.cursor || null
}

async function fetchDropboxAccountId(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      return null
    }

    const json = await response.json().catch(() => null)
    return json?.account_id || null
  } catch (error) {
    console.warn('⚠️ Failed to fetch Dropbox account info:', error)
    return null
  }
}

async function updateDropboxWebhookState(
  webhookConfigId: string,
  existingConfig: any,
  dropboxState: any
): Promise<void> {
  try {
    let configJson = existingConfig || {}
    if (typeof configJson === 'string') {
      try {
        configJson = JSON.parse(configJson)
      } catch {
        configJson = {}
      }
    }

    const updatedConfig = {
      ...configJson,
      dropbox_state: dropboxState
    }

    await supabase
      .from('webhook_configs')
      .update({ config: updatedConfig })
      .eq('id', webhookConfigId)
  } catch (error) {
    console.error('❌ Failed to update Dropbox webhook config:', error)
  }
}

function isEntryInDropboxFolder(entryPathLower: string | undefined, folderPath: string, includeSubfolders: boolean): boolean {
  if (!entryPathLower) {
    return false
  }

  const normalizedEntry = entryPathLower
  const normalizedFolder = folderPath || ''

  if (!normalizedFolder) {
    if (includeSubfolders) {
      return true
    }

    const depth = normalizedEntry.split('/').filter(Boolean).length
    return depth === 1
  }

  if (!normalizedEntry.startsWith(normalizedFolder.endsWith('/') ? normalizedFolder : `${normalizedFolder}/`)) {
    return false
  }

  if (includeSubfolders) {
    return true
  }

  const relative = normalizedEntry.slice(normalizedFolder.length + 1)
  return !relative.includes('/')
}

function matchesDropboxFileType(fileName: string | undefined, filter: string): boolean {
  if (!fileName) {
    return false
  }

  const ext = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.')).toLowerCase() : ''

  if (filter === 'any') {
    return true
  }

  const groups: Record<string, string[]> = {
    documents: ['.doc', '.docx', '.txt', '.rtf', '.odt', '.pages', '.md'],
    images: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp', '.svg', '.heic'],
    audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a'],
    video: ['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.webm', '.m4v'],
    spreadsheets: ['.xls', '.xlsx', '.csv', '.tsv', '.ods'],
    presentations: ['.ppt', '.pptx', '.key', '.odp'],
    pdf: ['.pdf'],
    archives: ['.zip', '.rar', '.7z', '.tar', '.gz', '.tgz', '.bz2', '.xz']
  }

  const list = groups[filter]
  if (!list) {
    return true
  }

  if (filter === 'documents' && ext === '.pdf') {
    return true
  }

  return list.includes(ext)
}
