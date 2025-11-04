/**
 * Test Data Configuration for Node Testing
 *
 * Provides safe test values for all providers
 * - Email: chainreactapp@gmail.com (ChainReact's account)
 * - Other services: Test accounts
 */

export interface TestDataConfig {
  [key: string]: Record<string, any>
}

/**
 * Safe test data for all providers
 * IMPORTANT: All data here should be safe to use in real API calls
 */
export const TEST_DATA: TestDataConfig = {
  // Email providers
  gmail: {
    to: 'chainreactapp@gmail.com',
    from: 'chainreactapp@gmail.com',
    subject: '[TEST] Automated Gmail Action Test',
    body: 'This is an automated test email from ChainReact node testing system.',
    html: '<p>This is an automated test email from <strong>ChainReact</strong> node testing system.</p>',
    labelName: 'TEST_AUTOMATION',
    searchQuery: 'subject:[TEST]',
  },

  outlook: {
    to: 'chainreactapp@gmail.com',
    subject: '[TEST] Automated Outlook Action Test',
    body: 'This is an automated test email from ChainReact node testing system.',
    importance: 'normal',
  },

  // Messaging platforms
  slack: {
    channel: '#test-automation',
    message: '[TEST] Automated Slack message test',
    threadMessage: '[TEST] Thread reply test',
    channelName: 'test-automation',
    channelDescription: 'Automated testing channel',
  },

  discord: {
    channelId: 'test-channel-id', // Will be filled from actual test server
    message: '[TEST] Automated Discord message test',
    channelName: 'test-automation',
    categoryName: 'Test Category',
    roleName: 'Test Role',
  },

  // Project management
  notion: {
    pageName: '[TEST] Automated Test Page',
    pageContent: 'This is a test page created by automated testing.',
    databaseName: '[TEST] Automated Test Database',
    query: 'test',
  },

  airtable: {
    baseId: 'test-base-id', // Will be configured
    tableName: 'Test Table',
    recordName: '[TEST] Test Record',
    fields: {
      Name: '[TEST] Automated Test',
      Status: 'Testing',
      Description: 'Created by automated node testing',
    },
  },

  trello: {
    boardName: 'Test Board',
    listName: '[TEST] Test List',
    cardName: '[TEST] Automated Test Card',
    cardDescription: 'Created by automated node testing system',
    position: 'top',
  },

  monday: {
    boardId: 'test-board-id', // Will be configured
    itemName: '[TEST] Automated Test Item',
    updateText: '[TEST] Automated test update',
  },

  // Google Workspace
  'google-sheets': {
    spreadsheetName: '[TEST] Automated Test Sheet',
    sheetName: 'Test Data',
    range: 'A1:B2',
    values: [
      ['Test Header 1', 'Test Header 2'],
      ['Test Value 1', 'Test Value 2']
    ],
  },

  'google-calendar': {
    summary: '[TEST] Automated Test Event',
    description: 'Created by automated node testing',
    startTime: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
    endTime: new Date(Date.now() + 7200000).toISOString(), // 2 hours from now
    attendees: ['chainreactapp@gmail.com'],
  },

  'google-drive': {
    fileName: '[TEST] test-file.txt',
    fileContent: 'This is a test file created by automated testing',
    mimeType: 'text/plain',
    folderName: '[TEST] Test Folder',
  },

  'google-docs': {
    documentName: '[TEST] Automated Test Document',
    content: 'This is a test document created by automated testing.',
  },

  'google-analytics': {
    eventName: 'test_event',
    eventParams: {
      test_parameter: 'automated_test_value',
      test_category: 'testing',
    },
  },

  // Microsoft 365
  'microsoft-excel': {
    workbookName: '[TEST] Test Workbook',
    worksheetName: 'Test Sheet',
    range: 'A1:B2',
    values: [
      ['Header1', 'Header2'],
      ['Value1', 'Value2']
    ],
  },

  'microsoft-onenote': {
    notebookName: '[TEST] Test Notebook',
    sectionName: '[TEST] Test Section',
    pageName: '[TEST] Automated Test Page',
    pageContent: '<html><body><p>This is a test page created by automated testing.</p></body></html>',
  },

  onedrive: {
    fileName: '[TEST] test-file.txt',
    fileContent: 'This is a test file created by automated testing',
    folderName: '[TEST] Test Folder',
  },

  // Cloud storage
  dropbox: {
    fileName: '[TEST] test-file.txt',
    fileContent: 'This is a test file created by automated testing',
    path: '/Test Automation',
  },

  // Development tools
  github: {
    repoName: 'test-repo',
    owner: 'chainreact-test', // Test organization
    issueTitle: '[TEST] Automated Test Issue',
    issueBody: 'This issue was created by automated testing. Please close.',
    prTitle: '[TEST] Automated Test PR',
    prBody: 'This PR was created by automated testing. Do not merge.',
    branch: 'test-automation',
  },

  // CRM & Marketing
  hubspot: {
    email: 'test@chainreact.app',
    firstName: 'Test',
    lastName: 'Automation',
    companyName: '[TEST] Test Company',
    dealName: '[TEST] Test Deal',
    dealAmount: '1000',
    listId: 'test-list-id', // Will be configured
  },

  mailchimp: {
    email: 'test@chainreact.app',
    firstName: 'Test',
    lastName: 'Automation',
    listId: 'test-list-id', // Will be configured
    tagName: 'TEST_AUTOMATION',
    campaignName: '[TEST] Test Campaign',
  },

  stripe: {
    email: 'test@chainreact.app',
    amount: 1000, // $10.00 in cents
    currency: 'usd',
    description: '[TEST] Automated test payment',
  },

  // Social media
  twitter: {
    text: '[TEST] Automated tweet test - please ignore',
    replyText: '[TEST] Automated reply test',
    dmText: '[TEST] Automated DM test',
    username: 'chainreact_test',
  },

  facebook: {
    message: '[TEST] Automated Facebook post test',
    pageId: 'test-page-id', // Will be configured
  },

  // AI actions
  ai: {
    prompt: 'Summarize: This is a test document for automated testing.',
    text: 'This is a test document that will be analyzed by AI.',
    targetLanguage: 'es',
    contentType: 'product_review',
  },

  // Utility actions
  utility: {
    url: 'https://example.com',
    searchQuery: 'test query',
    fileName: '[TEST] test-file.txt',
    fileContent: 'Test file content',
  },

  // Logic/Control actions
  logic: {
    httpUrl: 'https://httpbin.org/post',
    httpMethod: 'POST',
    httpBody: { test: 'data' },
    conditionValue: 'test',
    conditionOperator: 'equals',
    conditionCompare: 'test',
  },

  // HITL (Human-in-the-Loop)
  hitl: {
    message: '[TEST] This is a test approval request - please approve or reject',
    approvalType: 'simple',
  },
}

/**
 * Get test data for a specific provider
 */
export function getTestData(providerId: string): Record<string, any> {
  const data = TEST_DATA[providerId]
  if (!data) {
    console.warn(`[TestData] No test data configured for provider: ${providerId}`)
    return {}
  }
  return data
}

/**
 * Build test config for a node by merging test data with required fields
 */
export function buildTestConfig(
  node: { type: string; providerId: string; configSchema?: any[] },
  customData?: Record<string, any>
): Record<string, any> {
  const providerId = node.providerId || 'utility'
  const testData = getTestData(providerId)
  const config: Record<string, any> = { ...testData, ...customData }

  // Fill in any required fields that are missing
  if (node.configSchema) {
    for (const field of node.configSchema) {
      if (field.required && !config[field.name]) {
        // Provide sensible defaults based on field type
        switch (field.type) {
          case 'text':
          case 'textarea':
            config[field.name] = `[TEST] ${field.label || field.name}`
            break
          case 'number':
            config[field.name] = field.default || 0
            break
          case 'checkbox':
            config[field.name] = field.default || false
            break
          case 'select':
          case 'combobox':
            if (field.options && field.options.length > 0) {
              config[field.name] = field.options[0].value
            }
            break
          default:
            config[field.name] = ''
        }
      }
    }
  }

  return config
}

/**
 * Test user ID for automated testing
 * Should be a real admin user in the system
 */
export const TEST_USER_ID = process.env.TEST_USER_ID || 'test-user-id'

/**
 * Check if a test should be skipped due to missing configuration
 */
export function shouldSkipTest(providerId: string, reason?: string): boolean {
  const skippedProviders = [
    // Add providers that should be skipped here
    // Example: 'stripe' if no test Stripe account configured
  ]

  if (skippedProviders.includes(providerId)) {
    console.log(`[TestData] Skipping ${providerId} tests: ${reason || 'Provider skipped'}`)
    return true
  }

  return false
}
