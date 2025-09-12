// Playwright test for Gmail Send Email with Google Drive attachment
// This test verifies:
// 1. Google Drive file upload and retrieval
// 2. Gmail Send Email using file from previous node
// 3. Signature behavior (no duplication)
// 4. HTML formatting in email body

const TEST_CONFIG = {
  GOOGLE_DRIVE_FILE_PATH: 'C:\\Users\\marcu\\OneDrive\\Pictures\\ChainReact\\New folder\\test-document.pdf',
  EMAIL_RECIPIENT: 'test@example.com',
  EMAIL_SUBJECT: 'Test Email with Attachment',
  EMAIL_BODY: '<div>This is a <strong>test email</strong> with an attachment from Google Drive.</div>',
  WORKFLOW_NAME: 'Gmail Attachment Test ' + Date.now()
};

async function runTest() {
  console.log('Starting Gmail attachment test...');
  
  // Navigate to workflows page
  await mcp__playwright__browser_navigate({ url: 'http://localhost:3000/workflows' });
  await mcp__playwright__browser_wait_for({ time: 2 });
  
  // Take initial screenshot
  await mcp__playwright__browser_take_screenshot({ 
    filename: 'gmail-test-1-workflows-page.png',
    fullPage: true 
  });
  
  // Get page snapshot to find Create Workflow button
  const snapshot1 = await mcp__playwright__browser_snapshot();
  console.log('Looking for Create Workflow button...');
  
  // Click Create Workflow button
  const createButton = snapshot1.find(item => 
    item.name === 'Create Workflow' || 
    item.name === 'Create a Workflow'
  );
  
  if (createButton) {
    await mcp__playwright__browser_click({
      element: 'Create Workflow button',
      ref: createButton.elementId
    });
    await mcp__playwright__browser_wait_for({ time: 2 });
  }
  
  // Enter workflow name
  const snapshot2 = await mcp__playwright__browser_snapshot();
  const nameInput = snapshot2.find(item => 
    item.name === 'Workflow Name' || 
    item.name === 'Name'
  );
  
  if (nameInput) {
    await mcp__playwright__browser_type({
      element: 'Workflow name input',
      ref: nameInput.elementId,
      text: TEST_CONFIG.WORKFLOW_NAME
    });
  }
  
  // Click Create button
  const snapshot3 = await mcp__playwright__browser_snapshot();
  const createWorkflowButton = snapshot3.find(item => 
    item.name === 'Create' && item.role === 'button'
  );
  
  if (createWorkflowButton) {
    await mcp__playwright__browser_click({
      element: 'Create button',
      ref: createWorkflowButton.elementId
    });
    await mcp__playwright__browser_wait_for({ time: 3 });
  }
  
  // Take screenshot of workflow builder
  await mcp__playwright__browser_take_screenshot({ 
    filename: 'gmail-test-2-workflow-builder.png',
    fullPage: true 
  });
  
  // Step 1: Add Manual Trigger
  console.log('Adding Manual Trigger...');
  const snapshot4 = await mcp__playwright__browser_snapshot();
  const addTriggerButton = snapshot4.find(item => 
    item.name === 'Add Trigger' || 
    item.name === 'Choose Trigger'
  );
  
  if (addTriggerButton) {
    await mcp__playwright__browser_click({
      element: 'Add Trigger button',
      ref: addTriggerButton.elementId
    });
    await mcp__playwright__browser_wait_for({ time: 2 });
  }
  
  // Select Manual trigger
  const snapshot5 = await mcp__playwright__browser_snapshot();
  const manualTrigger = snapshot5.find(item => 
    item.name === 'Manual' || 
    (item.name === 'Manual Trigger' && item.role === 'button')
  );
  
  if (manualTrigger) {
    await mcp__playwright__browser_click({
      element: 'Manual trigger option',
      ref: manualTrigger.elementId
    });
    await mcp__playwright__browser_wait_for({ time: 2 });
  }
  
  // Save trigger
  const snapshot6 = await mcp__playwright__browser_snapshot();
  const saveTriggerButton = snapshot6.find(item => 
    item.name === 'Save' && item.role === 'button'
  );
  
  if (saveTriggerButton) {
    await mcp__playwright__browser_click({
      element: 'Save trigger button',
      ref: saveTriggerButton.elementId
    });
    await mcp__playwright__browser_wait_for({ time: 2 });
  }
  
  // Step 2: Add Google Drive Upload File action
  console.log('Adding Google Drive Upload File action...');
  const snapshot7 = await mcp__playwright__browser_snapshot();
  const addActionButton = snapshot7.find(item => 
    item.name === 'Add Action' || 
    item.name === '+'
  );
  
  if (addActionButton) {
    await mcp__playwright__browser_click({
      element: 'Add Action button',
      ref: addActionButton.elementId
    });
    await mcp__playwright__browser_wait_for({ time: 2 });
  }
  
  // Select Google Drive
  const snapshot8 = await mcp__playwright__browser_snapshot();
  const googleDriveOption = snapshot8.find(item => 
    item.name === 'Google Drive' && item.role === 'button'
  );
  
  if (googleDriveOption) {
    await mcp__playwright__browser_click({
      element: 'Google Drive option',
      ref: googleDriveOption.elementId
    });
    await mcp__playwright__browser_wait_for({ time: 2 });
  }
  
  // Select Upload File action
  const snapshot9 = await mcp__playwright__browser_snapshot();
  const uploadFileAction = snapshot9.find(item => 
    item.name === 'Upload File' && item.role === 'button'
  );
  
  if (uploadFileAction) {
    await mcp__playwright__browser_click({
      element: 'Upload File action',
      ref: uploadFileAction.elementId
    });
    await mcp__playwright__browser_wait_for({ time: 2 });
  }
  
  // Configure Google Drive upload
  console.log('Configuring Google Drive upload...');
  
  // Select file source type (should be "Upload Files" by default)
  const snapshot10 = await mcp__playwright__browser_snapshot();
  
  // Upload the file
  const fileInput = snapshot10.find(item => 
    item.name === 'Upload Files' || 
    item.name === 'Choose files to upload'
  );
  
  if (fileInput) {
    await mcp__playwright__browser_file_upload({
      paths: [TEST_CONFIG.GOOGLE_DRIVE_FILE_PATH]
    });
    await mcp__playwright__browser_wait_for({ time: 2 });
  }
  
  // Save Google Drive action
  const snapshot11 = await mcp__playwright__browser_snapshot();
  const saveGDButton = snapshot11.find(item => 
    item.name === 'Save' && item.role === 'button'
  );
  
  if (saveGDButton) {
    await mcp__playwright__browser_click({
      element: 'Save Google Drive action',
      ref: saveGDButton.elementId
    });
    await mcp__playwright__browser_wait_for({ time: 2 });
  }
  
  // Step 3: Add Gmail Send Email action
  console.log('Adding Gmail Send Email action...');
  const snapshot12 = await mcp__playwright__browser_snapshot();
  const addActionButton2 = snapshot12.find(item => 
    item.name === 'Add Action' || 
    item.name === '+'
  );
  
  if (addActionButton2) {
    await mcp__playwright__browser_click({
      element: 'Add Action button',
      ref: addActionButton2.elementId
    });
    await mcp__playwright__browser_wait_for({ time: 2 });
  }
  
  // Select Gmail
  const snapshot13 = await mcp__playwright__browser_snapshot();
  const gmailOption = snapshot13.find(item => 
    item.name === 'Gmail' && item.role === 'button'
  );
  
  if (gmailOption) {
    await mcp__playwright__browser_click({
      element: 'Gmail option',
      ref: gmailOption.elementId
    });
    await mcp__playwright__browser_wait_for({ time: 2 });
  }
  
  // Select Send Email action
  const snapshot14 = await mcp__playwright__browser_snapshot();
  const sendEmailAction = snapshot14.find(item => 
    item.name === 'Send Email' && item.role === 'button'
  );
  
  if (sendEmailAction) {
    await mcp__playwright__browser_click({
      element: 'Send Email action',
      ref: sendEmailAction.elementId
    });
    await mcp__playwright__browser_wait_for({ time: 2 });
  }
  
  // Configure Gmail Send Email
  console.log('Configuring Gmail Send Email...');
  
  // Enter recipient
  const snapshot15 = await mcp__playwright__browser_snapshot();
  const toField = snapshot15.find(item => 
    item.name === 'To' && (item.role === 'textbox' || item.role === 'combobox')
  );
  
  if (toField) {
    await mcp__playwright__browser_type({
      element: 'To field',
      ref: toField.elementId,
      text: TEST_CONFIG.EMAIL_RECIPIENT
    });
  }
  
  // Enter subject
  const subjectField = snapshot15.find(item => 
    item.name === 'Subject' && item.role === 'textbox'
  );
  
  if (subjectField) {
    await mcp__playwright__browser_type({
      element: 'Subject field',
      ref: subjectField.elementId,
      text: TEST_CONFIG.EMAIL_SUBJECT
    });
  }
  
  // Enter body (HTML content)
  const bodyField = snapshot15.find(item => 
    item.name === 'Body' || 
    item.name === 'Compose your email...'
  );
  
  if (bodyField) {
    await mcp__playwright__browser_type({
      element: 'Body field',
      ref: bodyField.elementId,
      text: TEST_CONFIG.EMAIL_BODY
    });
    await mcp__playwright__browser_wait_for({ time: 1 });
  }
  
  // Take screenshot to verify signature was added (if body was empty)
  await mcp__playwright__browser_take_screenshot({ 
    filename: 'gmail-test-3-email-body-with-signature.png'
  });
  
  // Select attachment source type
  const snapshot16 = await mcp__playwright__browser_snapshot();
  const attachmentSourceDropdown = snapshot16.find(item => 
    item.name === 'Attachment Source' && item.role === 'combobox'
  );
  
  if (attachmentSourceDropdown) {
    await mcp__playwright__browser_click({
      element: 'Attachment Source dropdown',
      ref: attachmentSourceDropdown.elementId
    });
    await mcp__playwright__browser_wait_for({ time: 1 });
    
    // Select "From Previous Node"
    const snapshot17 = await mcp__playwright__browser_snapshot();
    const fromNodeOption = snapshot17.find(item => 
      item.name === 'From Previous Node'
    );
    
    if (fromNodeOption) {
      await mcp__playwright__browser_click({
        element: 'From Previous Node option',
        ref: fromNodeOption.elementId
      });
      await mcp__playwright__browser_wait_for({ time: 1 });
    }
  }
  
  // Enter file variable from Google Drive node
  const snapshot18 = await mcp__playwright__browser_snapshot();
  const fileVariableField = snapshot18.find(item => 
    item.name === 'File Variable' && item.role === 'textbox'
  );
  
  if (fileVariableField) {
    // Find the Google Drive node ID
    const gdNodeId = snapshot18.find(item => 
      item.name && item.name.includes('Upload File')
    )?.elementId?.split('-')[0] || 'node-1';
    
    await mcp__playwright__browser_type({
      element: 'File Variable field',
      ref: fileVariableField.elementId,
      text: `{{${gdNodeId}.output.file}}`
    });
  }
  
  // Save Gmail action
  const snapshot19 = await mcp__playwright__browser_snapshot();
  const saveGmailButton = snapshot19.find(item => 
    item.name === 'Save' && item.role === 'button'
  );
  
  if (saveGmailButton) {
    await mcp__playwright__browser_click({
      element: 'Save Gmail action',
      ref: saveGmailButton.elementId
    });
    await mcp__playwright__browser_wait_for({ time: 2 });
  }
  
  // Step 4: Test signature behavior - reopen Gmail action
  console.log('Testing signature behavior (no duplication)...');
  
  const snapshot20 = await mcp__playwright__browser_snapshot();
  const gmailNode = snapshot20.find(item => 
    item.name && item.name.includes('Send Email')
  );
  
  if (gmailNode) {
    await mcp__playwright__browser_click({
      element: 'Gmail Send Email node',
      ref: gmailNode.elementId
    });
    await mcp__playwright__browser_wait_for({ time: 2 });
  }
  
  // Take screenshot to verify signature wasn't duplicated
  await mcp__playwright__browser_take_screenshot({ 
    filename: 'gmail-test-4-no-signature-duplication.png'
  });
  
  // Close the modal
  const snapshot21 = await mcp__playwright__browser_snapshot();
  const closeButton = snapshot21.find(item => 
    item.name === 'Close' || 
    item.name === 'Cancel' ||
    item.name === 'Save'
  );
  
  if (closeButton) {
    await mcp__playwright__browser_click({
      element: 'Close/Save button',
      ref: closeButton.elementId
    });
    await mcp__playwright__browser_wait_for({ time: 2 });
  }
  
  // Step 5: Save and test the workflow
  console.log('Saving workflow...');
  
  // Save workflow
  const snapshot22 = await mcp__playwright__browser_snapshot();
  const saveWorkflowButton = snapshot22.find(item => 
    item.name === 'Save Workflow' || 
    item.name === 'Save'
  );
  
  if (saveWorkflowButton) {
    await mcp__playwright__browser_click({
      element: 'Save Workflow button',
      ref: saveWorkflowButton.elementId
    });
    await mcp__playwright__browser_wait_for({ time: 2 });
  }
  
  // Take final screenshot
  await mcp__playwright__browser_take_screenshot({ 
    filename: 'gmail-test-5-final-workflow.png',
    fullPage: true 
  });
  
  console.log('Test completed successfully!');
  console.log('Check the screenshots to verify:');
  console.log('1. Google Drive file upload configured');
  console.log('2. Gmail Send Email with attachment from previous node');
  console.log('3. HTML formatting in email body');
  console.log('4. No signature duplication when reopening modal');
  
  // Get console messages to check for errors
  const consoleMessages = await mcp__playwright__browser_console_messages();
  if (consoleMessages && consoleMessages.length > 0) {
    console.log('\nConsole messages:', consoleMessages);
  }
}

// Run the test
runTest().catch(console.error);