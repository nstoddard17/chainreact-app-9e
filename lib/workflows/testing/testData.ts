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
    text: '[TEST] Automated Slack message test',
    reminder_text: '[TEST] Reminder from automated testing',
    time: '5',
    time_unit: 'minutes',
    channels: '#test-automation',
    blocks: JSON.stringify([
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '[TEST] Interactive message from automated testing',
        },
      },
    ]),
  },

  discord: {
    channelId: 'test-channel-id', // Requires real Discord server - config_needed
    guildId: 'test-guild-id', // Requires real Discord server - config_needed
    guild_id: 'test-guild-id',
    channel_id: 'test-channel-id',
    message: '[TEST] Automated Discord message test',
    content: '[TEST] Automated Discord message test',
    message_id: 'test-message-id', // Requires real message - config_needed
    user_id: 'test-user-id', // Requires real user - config_needed
    role_id: 'test-role-id', // Requires real role - config_needed
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
    // These need real Notion IDs - will trigger config_needed classification
    page_id: 'test-page-id',
    block_id: 'test-block-id',
    database_id: 'test-database-id',
    parent_page_id: 'test-parent-page-id',
    title: '[TEST] Automated Test Page',
    content: 'This is a test page created by automated testing.',
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
    // These need real Trello IDs - will trigger config_needed classification
    board_id: 'test-board-id',
    boardId: 'test-board-id',
    list_id: 'test-list-id',
    listId: 'test-list-id',
    card_id: 'test-card-id',
    cardId: 'test-card-id',
    name: '[TEST] Automated Test Card',
    description: 'Created by automated node testing system',
  },

  monday: {
    boardId: 'test-board-id', // Will be configured - config_needed
    board_id: 'test-board-id',
    group_id: 'test-group-id',
    groupName: '[TEST] Test Group',
    group_name: '[TEST] Test Group',
    itemName: '[TEST] Automated Test Item',
    item_name: '[TEST] Automated Test Item',
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
    // For update/delete/get/add_attendees - need real event IDs (config_needed)
    eventId: 'test-event-id',
    event_id: 'test-event-id',
    calendarId: 'primary',
    calendar_id: 'primary',
  },

  'google-drive': {
    fileName: '[TEST] test-file.txt',
    fileContent: 'This is a test file created by automated testing',
    mimeType: 'text/plain',
    folderName: '[TEST] Test Folder',
    // For get_file - needs real file ID (config_needed)
    fileId: 'test-file-id',
    file_id: 'test-file-id',
    name: '[TEST] test-file.txt',
    content: 'This is a test file created by automated testing',
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
    clientId: '555555555.1234567890',
    displayName: '[TEST] ChainReact Batch Test Secret',
    conversionEventName: 'test_event',
    dateRange: 'last_7_days',
    metrics: ['sessions', 'totalUsers'],
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
    // Needs real workbook ID (config_needed)
    workbookId: 'test-workbook-id',
    workbook_id: 'test-workbook-id',
  },

  'microsoft-onenote': {
    notebookName: '[TEST] Test Notebook',
    sectionName: '[TEST] Test Section',
    pageName: '[TEST] Automated Test Page',
    pageContent: '<html><body><p>This is a test page created by automated testing.</p></body></html>',
    // Needs real notebook/section IDs (config_needed)
    notebookId: 'test-notebook-id',
    notebook_id: 'test-notebook-id',
    sectionId: 'test-section-id',
    section_id: 'test-section-id',
  },

  onedrive: {
    fileName: '[TEST] test-file.txt',
    fileContent: 'This is a test file created by automated testing',
    folderName: '[TEST] Test Folder',
    // Needs real item IDs for operations (config_needed)
    itemId: 'test-item-id',
    item_id: 'test-item-id',
    itemPath: '/Test Automation/test-file.txt',
  },

  // Cloud storage
  dropbox: {
    fileName: '[TEST] test-file.txt',
    fileContent: 'This is a test file created by automated testing',
    path: '/Test Automation',
  },

  // Development tools
  github: {
    repository: '', // Dynamically resolved to user's TEST-Repository
    name: 'TEST-Repository', // For create_repository action
    title: '[TEST] Automated Test Issue',
    body: 'This issue was created by automated testing. Please close.',
    branchName: `test-automation-${Date.now()}`, // Unique branch name per run
    sourceBranch: 'main',
    head: 'test-automation',
    base: 'main',
    filename: 'test-file.txt',
    content: '// Test content created by ChainReact automated testing',
    isPrivate: true,
    autoInit: true,
    isPublic: false,
    // For create_gist
    description: '[TEST] Automated test gist',
    files: { 'test.txt': { content: 'Test gist content from ChainReact automated testing' } },
    public: false,
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
    message: '[TEST] Automated Facebook post test - safe to delete',
    pageId: '', // Dynamically resolved from user's connected pages
    page_id: '', // Alias
    post_id: 'test-post-id', // Needs real post ID for update/delete (config_needed)
    postId: 'test-post-id',
    metric: 'page_media_view',
    period: 'day',
    dateRange: 'last_7_days',
    caption: '[TEST] Automated photo caption',
    title: '[TEST] Automated video title',
    description: '[TEST] Automated video description',
  },

  // E-commerce
  shopify: {
    title: '[TEST] Automated Test Product',
    body_html: '<p>Test product from automated testing</p>',
    vendor: 'ChainReact Test',
    product_type: 'Test',
    // For create_customer - valid email format
    email: 'test-customer@chainreact.app',
    first_name: 'Test',
    last_name: 'Customer',
    // For create_order - needs line_items
    line_items: [{ title: 'Test Item', quantity: 1, price: '10.00' }],
  },

  // AI actions
  ai: {
    prompt: 'Summarize the following text in one sentence: The quick brown fox jumps over the lazy dog. This is a common pangram used in testing that contains every letter of the English alphabet.',
    text: 'The quick brown fox jumps over the lazy dog. This is a common pangram used in testing that contains every letter of the English alphabet. It has been used since at least the late 19th century.',
    input: 'The quick brown fox jumps over the lazy dog. This is a common pangram used in testing that contains every letter of the English alphabet.',
    inputText: 'The quick brown fox jumps over the lazy dog. This is a common pangram used in testing.',
    input_text: 'The quick brown fox jumps over the lazy dog. This is a common pangram used in testing.',
    targetLanguage: 'es',
    target_language: 'es',
    contentType: 'product_review',
    content_type: 'product_review',
    // For ai_classify
    categories: 'positive, negative, neutral',
    // For ai_extract
    fields: 'name, date, location',
    extractionFields: 'name, date, location',
    // For ai_generate
    type: 'paragraph',
    topic: 'automated software testing',
  },

  // Utility actions
  utility: {
    url: 'https://httpbin.org/get',
    searchQuery: 'test query',
    fileName: '[TEST] test-file.txt',
    fileContent: 'Test file content',
    // For extract_website_data
    cssSelector: 'h1, p, title',
    css_selector: 'h1, p, title',
    selector: 'h1, p, title',
    extractionMethod: 'full_text',
    extraction_method: 'full_text',
    // For parse_file
    fileUrl: 'https://httpbin.org/robots.txt',
    file_url: 'https://httpbin.org/robots.txt',
  },

  // Logic/Control actions
  logic: {
    url: 'https://httpbin.org/get',
    httpUrl: 'https://httpbin.org/get',
    httpMethod: 'GET',
    method: 'GET',
    httpBody: { test: 'data' },
    conditionValue: 'test',
    conditionOperator: 'equals',
    conditionCompare: 'test',
    // For router
    conditions: [
      { field: 'status', operator: 'equals', value: 'active' },
    ],
    defaultRoute: 'route_1',
    routes: [
      { name: 'route_1', condition: { field: 'status', operator: 'equals', value: 'active' } },
    ],
  },

  // HITL (Human-in-the-Loop)
  hitl: {
    message: '[TEST] This is a test approval request - please approve or reject',
    approvalType: 'simple',
  },
}

/**
 * Node-type-specific test data overrides.
 * These override provider-level defaults for specific node types that need
 * special configuration. Keys are the full node type (e.g., 'http_request').
 *
 * This is checked in buildTestConfig AFTER provider data is merged,
 * so these values take priority.
 */
export const NODE_TYPE_OVERRIDES: Record<string, Record<string, any>> = {
  // ── HTTP / Utility actions ──────────────────────────────────────────
  http_request: {
    url: 'https://httpbin.org/get',
    method: 'GET',
  },
  parse_file: {
    url: 'https://httpbin.org/robots.txt',
    fileUrl: 'https://httpbin.org/robots.txt',
    file_url: 'https://httpbin.org/robots.txt',
  },
  extract_website_data: {
    url: 'https://example.com',
    extractionMethod: 'full_text',
    extraction_method: 'full_text',
    cssSelector: 'h1, p',
    css_selector: 'h1, p',
    selector: 'h1, p',
  },

  // ── Router / Logic ──────────────────────────────────────────────────
  router: {
    conditions: [
      { field: 'status', operator: 'equals', value: 'active' },
    ],
    defaultRoute: 'route_1',
    routes: [
      { name: 'route_1', condition: { field: 'status', operator: 'equals', value: 'active' } },
    ],
  },

  // ── AI actions ──────────────────────────────────────────────────────
  ai_prompt: {
    prompt: 'Summarize the following text in one sentence: The quick brown fox jumps over the lazy dog. This is a common pangram used in testing.',
    text: 'The quick brown fox jumps over the lazy dog. This is a common pangram used in testing.',
    input: 'The quick brown fox jumps over the lazy dog. This is a common pangram used in testing.',
    inputText: 'The quick brown fox jumps over the lazy dog.',
    input_text: 'The quick brown fox jumps over the lazy dog.',
  },
  ai_summarize: {
    text: 'The quick brown fox jumps over the lazy dog. This is a common pangram used in testing that contains every letter of the English alphabet. It has been widely used since at least the late 19th century for typewriter and keyboard testing.',
    input: 'The quick brown fox jumps over the lazy dog. This is a common pangram used in testing that contains every letter of the English alphabet.',
    inputText: 'The quick brown fox jumps over the lazy dog. This is a common pangram.',
    input_text: 'The quick brown fox jumps over the lazy dog. This is a common pangram.',
    prompt: 'Summarize this text concisely.',
  },
  ai_extract: {
    text: 'John Smith attended the conference on January 15, 2025 in San Francisco, California.',
    input: 'John Smith attended the conference on January 15, 2025 in San Francisco, California.',
    inputText: 'John Smith attended the conference on January 15, 2025 in San Francisco.',
    input_text: 'John Smith attended the conference on January 15, 2025 in San Francisco.',
    fields: 'name, date, location',
    extractionFields: 'name, date, location',
    prompt: 'Extract the name, date, and location from this text.',
  },
  ai_classify: {
    text: 'This product is amazing! I love using it every day and it has made my life so much easier.',
    input: 'This product is amazing! I love using it every day.',
    inputText: 'This product is amazing! I love using it every day.',
    input_text: 'This product is amazing! I love using it every day.',
    categories: 'positive, negative, neutral',
    prompt: 'Classify the sentiment of this text.',
  },
  ai_sentiment: {
    text: 'I had a wonderful experience at this restaurant. The food was delicious and the service was excellent.',
    input: 'I had a wonderful experience at this restaurant. The food was delicious.',
    inputText: 'I had a wonderful experience at this restaurant.',
    input_text: 'I had a wonderful experience at this restaurant.',
    prompt: 'Analyze the sentiment of this text.',
  },
  ai_translate: {
    text: 'Hello, how are you? This is a test message for translation.',
    input: 'Hello, how are you? This is a test message for translation.',
    inputText: 'Hello, how are you?',
    input_text: 'Hello, how are you?',
    targetLanguage: 'es',
    target_language: 'es',
    prompt: 'Translate this text to Spanish.',
  },
  ai_generate: {
    prompt: 'Write a short paragraph about the importance of automated software testing.',
    text: 'automated software testing',
    input: 'automated software testing',
    inputText: 'automated software testing',
    input_text: 'automated software testing',
    type: 'paragraph',
    topic: 'automated software testing',
  },

  // ── Discord actions ─────────────────────────────────────────────────
  discord_action_send_message: {
    guild_id: 'test-guild-id',
    guildId: 'test-guild-id',
    channel_id: 'test-channel-id',
    channelId: 'test-channel-id',
    message: '[TEST] Automated Discord message test',
    content: '[TEST] Automated Discord message test',
  },
  discord_action_edit_message: {
    channel_id: 'test-channel-id',
    channelId: 'test-channel-id',
    message_id: 'test-message-id',
    messageId: 'test-message-id',
    content: '[TEST] Edited Discord message test',
  },
  discord_action_delete_message: {
    channel_id: 'test-channel-id',
    channelId: 'test-channel-id',
    message_id: 'test-message-id',
    messageId: 'test-message-id',
  },
  discord_action_fetch_messages: {
    channel_id: 'test-channel-id',
    channelId: 'test-channel-id',
    limit: 10,
  },
  discord_action_assign_role: {
    guild_id: 'test-guild-id',
    guildId: 'test-guild-id',
    user_id: 'test-user-id',
    userId: 'test-user-id',
    role_id: 'test-role-id',
    roleId: 'test-role-id',
  },

  // ── Google Calendar actions ─────────────────────────────────────────
  google_calendar_action_update_event: {
    eventId: 'test-event-id',
    event_id: 'test-event-id',
    calendarId: 'primary',
    summary: '[TEST] Updated Event',
  },
  google_calendar_action_delete_event: {
    eventId: 'test-event-id',
    event_id: 'test-event-id',
    calendarId: 'primary',
  },
  google_calendar_action_get_event: {
    eventId: 'test-event-id',
    event_id: 'test-event-id',
    calendarId: 'primary',
  },
  google_calendar_action_add_attendees: {
    eventId: 'test-event-id',
    event_id: 'test-event-id',
    calendarId: 'primary',
    attendees: ['chainreactapp@gmail.com'],
  },

  // ── Google Drive actions ────────────────────────────────────────────
  'google-drive:create_file': {
    name: '[TEST] test-file.txt',
    fileName: '[TEST] test-file.txt',
    content: 'This is a test file created by automated testing',
    fileContent: 'This is a test file created by automated testing',
    mimeType: 'text/plain',
  },
  'google-drive:get_file': {
    fileId: 'test-file-id',
    file_id: 'test-file-id',
  },

  // ── GitHub actions ──────────────────────────────────────────────────
  github_action_create_gist: {
    description: '[TEST] Automated test gist',
    files: { 'test.txt': { content: 'Test gist content from ChainReact automated testing' } },
    public: false,
    filename: 'test.txt',
    content: 'Test gist content from ChainReact automated testing',
  },

  // ── Notion actions ──────────────────────────────────────────────────
  notion_action_get_page: {
    page_id: 'test-page-id',
    pageId: 'test-page-id',
  },
  notion_action_update_page: {
    page_id: 'test-page-id',
    pageId: 'test-page-id',
    title: '[TEST] Updated Page',
  },
  notion_action_archive_page: {
    page_id: 'test-page-id',
    pageId: 'test-page-id',
  },
  notion_action_get_block: {
    block_id: 'test-block-id',
    blockId: 'test-block-id',
  },
  notion_action_append_block: {
    block_id: 'test-block-id',
    blockId: 'test-block-id',
    content: '[TEST] Appended content',
  },
  notion_action_delete_block: {
    block_id: 'test-block-id',
    blockId: 'test-block-id',
  },
  notion_action_query_database: {
    database_id: 'test-database-id',
    databaseId: 'test-database-id',
  },
  notion_action_create_page: {
    parent_page_id: 'test-parent-page-id',
    parentPageId: 'test-parent-page-id',
    title: '[TEST] Automated Test Page',
    content: 'Test page content from automated testing.',
  },

  // ── Slack actions ───────────────────────────────────────────────────
  slack_action_post_interactive: {
    channel: '#test-automation',
    blocks: JSON.stringify([
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '[TEST] Interactive message from automated testing',
        },
      },
    ]),
    text: '[TEST] Interactive message fallback text',
  },
  slack_action_add_reminder: {
    text: '[TEST] Reminder from automated testing',
    reminder_text: '[TEST] Reminder from automated testing',
    time: '5',
    time_unit: 'minutes',
  },
  slack_action_upload_file: {
    channels: '#test-automation',
    channel: '#test-automation',
    filename: 'test-upload.txt',
    content: 'Test file content from automated testing',
    title: '[TEST] Uploaded file',
  },

  // ── Trello actions ──────────────────────────────────────────────────
  trello_action_create_card: {
    board_id: 'test-board-id',
    boardId: 'test-board-id',
    list_id: 'test-list-id',
    listId: 'test-list-id',
    name: '[TEST] Automated Test Card',
    description: 'Created by automated testing',
  },
  trello_action_update_card: {
    card_id: 'test-card-id',
    cardId: 'test-card-id',
    name: '[TEST] Updated Card',
  },
  trello_action_delete_card: {
    card_id: 'test-card-id',
    cardId: 'test-card-id',
  },
  trello_action_move_card: {
    card_id: 'test-card-id',
    cardId: 'test-card-id',
    list_id: 'test-list-id',
    listId: 'test-list-id',
  },
  trello_action_add_comment: {
    card_id: 'test-card-id',
    cardId: 'test-card-id',
    text: '[TEST] Automated comment',
  },
  trello_action_create_list: {
    board_id: 'test-board-id',
    boardId: 'test-board-id',
    name: '[TEST] Test List',
  },
  trello_action_add_label: {
    card_id: 'test-card-id',
    cardId: 'test-card-id',
    label_id: 'test-label-id',
    labelId: 'test-label-id',
  },
  trello_action_add_member: {
    card_id: 'test-card-id',
    cardId: 'test-card-id',
    member_id: 'test-member-id',
    memberId: 'test-member-id',
  },

  // ── Facebook actions ────────────────────────────────────────────────
  facebook_action_create_post: {
    page_id: '', // Dynamically resolved
    pageId: '',
    message: '[TEST] Automated Facebook post test - safe to delete',
  },
  facebook_action_get_post: {
    post_id: 'test-post-id',
    postId: 'test-post-id',
  },
  facebook_action_get_page_insights: {
    page_id: '', // Dynamically resolved
    pageId: '',
    metric: 'page_media_view',
    period: 'day',
  },

  // ── OneDrive actions ────────────────────────────────────────────────
  onedrive_action_get_file: {
    itemId: 'test-item-id',
    item_id: 'test-item-id',
  },
  onedrive_action_delete_file: {
    itemId: 'test-item-id',
    item_id: 'test-item-id',
  },
  onedrive_action_move_file: {
    itemId: 'test-item-id',
    item_id: 'test-item-id',
    destinationId: 'test-destination-id',
    destination_id: 'test-destination-id',
  },
  onedrive_action_copy_file: {
    itemId: 'test-item-id',
    item_id: 'test-item-id',
    destinationId: 'test-destination-id',
    destination_id: 'test-destination-id',
  },

  // ── OneNote actions ─────────────────────────────────────────────────
  onenote_action_get_notebook: {
    notebookId: 'test-notebook-id',
    notebook_id: 'test-notebook-id',
  },
  onenote_action_get_section: {
    sectionId: 'test-section-id',
    section_id: 'test-section-id',
  },
  onenote_action_create_page: {
    sectionId: 'test-section-id',
    section_id: 'test-section-id',
    title: '[TEST] Automated Test Page',
    content: '<html><body><p>Test page content</p></body></html>',
  },

  // ── Microsoft Excel actions ─────────────────────────────────────────
  microsoft_excel_action_get_worksheets: {
    workbookId: 'test-workbook-id',
    workbook_id: 'test-workbook-id',
  },
  microsoft_excel_action_get_range: {
    workbookId: 'test-workbook-id',
    workbook_id: 'test-workbook-id',
    worksheetName: 'Sheet1',
    range: 'A1:B2',
  },
  microsoft_excel_action_update_range: {
    workbookId: 'test-workbook-id',
    workbook_id: 'test-workbook-id',
    worksheetName: 'Sheet1',
    range: 'A1:B2',
    values: [['Header1', 'Header2'], ['Value1', 'Value2']],
  },
  microsoft_excel_action_add_row: {
    workbookId: 'test-workbook-id',
    workbook_id: 'test-workbook-id',
    worksheetName: 'Sheet1',
    values: ['Value1', 'Value2'],
  },

  // ── Monday actions ──────────────────────────────────────────────────
  monday_action_create_group: {
    board_id: 'test-board-id',
    boardId: 'test-board-id',
    group_name: '[TEST] Test Group',
    groupName: '[TEST] Test Group',
  },

  // ── Shopify actions ─────────────────────────────────────────────────
  shopify_action_create_order: {
    line_items: [{ title: 'Test Item', quantity: 1, price: '10.00' }],
    email: 'test-customer@chainreact.app',
  },
  shopify_action_create_customer: {
    email: 'test-customer@chainreact.app',
    first_name: 'Test',
    last_name: 'Customer',
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
 * Field names that indicate a URL value is expected.
 * Used by buildTestConfig to provide valid URL defaults instead of "[TEST] URL".
 */
const URL_FIELD_NAMES = new Set([
  'url', 'fileUrl', 'file_url', 'imageUrl', 'image_url',
  'videoUrl', 'video_url', 'webhookUrl', 'webhook_url',
  'redirectUrl', 'redirect_url', 'callbackUrl', 'callback_url',
  'iconUrl', 'icon_url', 'avatarUrl', 'avatar_url',
  'linkUrl', 'link_url', 'sourceUrl', 'source_url',
  'targetUrl', 'target_url', 'httpUrl', 'http_url',
  'productLinkUrl', 'product_link_url', 'website',
])

/**
 * Field names that indicate an email value is expected.
 */
const EMAIL_FIELD_NAMES = new Set([
  'email', 'to', 'from', 'replyTo', 'reply_to',
  'cc', 'bcc', 'senderEmail', 'sender_email',
  'recipientEmail', 'recipient_email',
  'customerEmail', 'customer_email',
])

/**
 * Field names that indicate text/content input for AI or processing.
 */
const TEXT_INPUT_FIELD_NAMES = new Set([
  'text', 'input', 'inputText', 'input_text',
  'content', 'body', 'message', 'prompt',
  'data', 'sourceText', 'source_text',
])

/**
 * Build test config for a node by merging test data with required fields
 */
export function buildTestConfig(
  node: { type: string; providerId: string; configSchema?: any[] },
  customData?: Record<string, any>
): Record<string, any> {
  const providerId = node.providerId || 'utility'
  const testData = getTestData(providerId)

  // Start with provider-level data, then layer node-type-specific overrides
  const nodeOverrides = NODE_TYPE_OVERRIDES[node.type] || {}
  const config: Record<string, any> = { ...testData, ...nodeOverrides, ...customData }

  // Fill in any required fields that are missing
  if (node.configSchema) {
    for (const field of node.configSchema) {
      // Skip conditionally-required fields whose parent condition isn't met
      // (e.g., productLinkUrl is required only when enableMonetization=true)
      if (field.visibilityCondition) {
        const parentField = field.visibilityCondition.field
        const parentValue = config[parentField]
        const expectedValue = field.visibilityCondition.value
        const operator = field.visibilityCondition.operator

        // If parent field isn't set or doesn't match the visibility condition, skip
        if (operator === 'equals' && parentValue !== expectedValue) continue
        if (operator === 'isNotEmpty' && !parentValue) continue
      }

      if (field.required && !config[field.name]) {
        // Provide sensible defaults based on field type and name
        const fieldNameLower = (field.name || '').toLowerCase()

        // Check for URL fields first (regardless of field.type)
        if (URL_FIELD_NAMES.has(field.name) || fieldNameLower.includes('url')) {
          config[field.name] = 'https://httpbin.org/get'
          continue
        }

        // Check for email fields
        if (EMAIL_FIELD_NAMES.has(field.name) || fieldNameLower.includes('email')) {
          config[field.name] = 'test@chainreact.app'
          continue
        }

        // Check for text/content input fields (important for AI actions)
        if (TEXT_INPUT_FIELD_NAMES.has(field.name)) {
          config[field.name] = 'The quick brown fox jumps over the lazy dog. This is a test input for automated testing.'
          continue
        }

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
            if (field.defaultValue) {
              config[field.name] = field.defaultValue
            } else if (field.options && field.options.length > 0) {
              config[field.name] = field.options[0].value
            }
            break
          case 'multi-select':
            if (field.defaultValue) {
              config[field.name] = field.defaultValue
            } else if (field.options && field.options.length > 0) {
              config[field.name] = [field.options[0].value]
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
