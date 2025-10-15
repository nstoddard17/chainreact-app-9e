-- Add Airtable setup metadata to templates table
ALTER TABLE public.templates
ADD COLUMN IF NOT EXISTS airtable_setup JSONB;

ALTER TABLE public.templates
ADD COLUMN IF NOT EXISTS integration_setup JSONB;

-- Populate Airtable setup details for predefined AI Agent workflow
UPDATE public.templates
SET airtable_setup = jsonb_build_object(
  'baseName', 'Customer Service Automation',
  'tables', jsonb_build_array(
    jsonb_build_object(
      'tableName', 'Support Tickets',
      'description', 'Tracks support requests routed by AI',
      'fields', jsonb_build_array(
        jsonb_build_object('name', 'Ticket Summary', 'type', 'longText', 'description', 'AI-generated summary of the support request'),
        jsonb_build_object('name', 'Priority', 'type', 'singleSelect', 'options', jsonb_build_array('Low', 'Medium', 'High'), 'description', 'Priority level assigned by AI'),
        jsonb_build_object('name', 'Status', 'type', 'singleSelect', 'options', jsonb_build_array('Open', 'In Progress', 'Resolved', 'Closed'), 'description', 'Current status of the ticket'),
        jsonb_build_object('name', 'Channel', 'type', 'singleLineText', 'description', 'Source channel (e.g., Discord channel name)')
      )
    ),
    jsonb_build_object(
      'tableName', 'Feedback Log',
      'description', 'Captures customer feedback messages',
      'fields', jsonb_build_array(
        jsonb_build_object('name', 'Feedback Insight', 'type', 'longText', 'description', 'AI-extracted main insight from feedback'),
        jsonb_build_object('name', 'Feedback Summary', 'type', 'longText', 'description', 'Short summary of the feedback message'),
        jsonb_build_object('name', 'Customer', 'type', 'singleLineText', 'description', 'Name or handle of the customer who shared the feedback'),
        jsonb_build_object('name', 'Sentiment', 'type', 'singleSelect', 'options', jsonb_build_array('Positive', 'Neutral', 'Negative'), 'description', 'Sentiment analysis (e.g., Positive, Negative, Neutral)'),
        jsonb_build_object('name', 'Confidence', 'type', 'number', 'description', 'General AI confidence score for this classification'),
        jsonb_build_object('name', 'Source', 'type', 'singleLineText', 'description', 'Origin of feedback (e.g., Discord)')
      )
    ),
    jsonb_build_object(
      'tableName', 'Newsletter Subscribers',
      'description', 'Manages newsletter subscription requests',
      'fields', jsonb_build_array(
        jsonb_build_object('name', 'Name', 'type', 'singleLineText', 'description', 'Subscriber''s name'),
        jsonb_build_object('name', 'Email', 'type', 'email', 'description', 'Subscriber''s email address'),
        jsonb_build_object('name', 'Source', 'type', 'singleLineText', 'description', 'Where the signup came from (e.g., Discord)'),
        jsonb_build_object('name', 'Status', 'type', 'singleSelect', 'options', jsonb_build_array('Subscribed', 'Unsubscribed', 'Pending'), 'description', 'Current subscription status')
      )
    )
  )
)
WHERE name = 'AI Agent Test Workflow - Customer Service'
  AND (airtable_setup IS NULL OR airtable_setup = 'null'::jsonb);

UPDATE public.templates
SET integration_setup = jsonb_build_array(
  jsonb_build_object(
    'type', 'airtable',
    'baseName', 'Customer Service Automation',
    'instructions', jsonb_build_array(
      'Create a base named Customer Service Automation in Airtable',
      'Add the Support Tickets, Feedback Log, and Newsletter Subscribers tables',
      'Import the provided CSV files or copy the field structure before running the workflow'
    ),
    'tables', jsonb_build_array(
      jsonb_build_object(
        'tableName', 'Support Tickets',
        'description', 'Tracks support requests routed by AI',
        'fields', jsonb_build_array(
          jsonb_build_object('name', 'Ticket Summary', 'type', 'longText', 'description', 'AI-generated summary of the support request'),
          jsonb_build_object('name', 'Priority', 'type', 'singleSelect', 'options', jsonb_build_array('Low', 'Medium', 'High'), 'description', 'Priority level assigned by AI'),
          jsonb_build_object('name', 'Status', 'type', 'singleSelect', 'options', jsonb_build_array('Open', 'In Progress', 'Resolved', 'Closed'), 'description', 'Current status of the ticket'),
          jsonb_build_object('name', 'Channel', 'type', 'singleLineText', 'description', 'Source channel (e.g., Discord channel name)')
        )
      ),
      jsonb_build_object(
        'tableName', 'Feedback Log',
        'description', 'Captures customer feedback messages',
        'fields', jsonb_build_array(
          jsonb_build_object('name', 'Feedback Insight', 'type', 'longText', 'description', 'AI-extracted main insight from feedback'),
          jsonb_build_object('name', 'Feedback Summary', 'type', 'longText', 'description', 'Short summary of the feedback message'),
          jsonb_build_object('name', 'Customer', 'type', 'singleLineText', 'description', 'Name or handle of the customer who shared the feedback'),
          jsonb_build_object('name', 'Sentiment', 'type', 'singleSelect', 'options', jsonb_build_array('Positive', 'Neutral', 'Negative'), 'description', 'Sentiment analysis (e.g., Positive, Negative, Neutral)'),
          jsonb_build_object('name', 'Confidence', 'type', 'number', 'description', 'General AI confidence score for this classification'),
          jsonb_build_object('name', 'Source', 'type', 'singleLineText', 'description', 'Origin of feedback (e.g., Discord)')
        )
      ),
      jsonb_build_object(
        'tableName', 'Newsletter Subscribers',
        'description', 'Manages newsletter subscription requests',
        'fields', jsonb_build_array(
          jsonb_build_object('name', 'Name', 'type', 'singleLineText', 'description', 'Subscriber''s name'),
          jsonb_build_object('name', 'Email', 'type', 'email', 'description', 'Subscriber''s email address'),
          jsonb_build_object('name', 'Source', 'type', 'singleLineText', 'description', 'Where the signup came from (e.g., Discord)'),
          jsonb_build_object('name', 'Status', 'type', 'singleSelect', 'options', jsonb_build_array('Subscribed', 'Unsubscribed', 'Pending'), 'description', 'Current subscription status')
        )
      )
    )
  )
)
WHERE name = 'AI Agent Test Workflow - Customer Service'
  AND (integration_setup IS NULL OR integration_setup = 'null'::jsonb);

-- Populate Airtable setup details for the Microsoft Teams support workflow
UPDATE public.templates
SET airtable_setup = jsonb_build_object(
  'baseName', 'Teams Support Desk',
  'tables', jsonb_build_array(
    jsonb_build_object(
      'tableName', 'Support Tickets',
      'description', 'Track incoming Microsoft Teams support conversations',
      'fields', jsonb_build_array(
        jsonb_build_object('name', 'Customer', 'type', 'singleLineText', 'description', 'Name of the teammate or customer asking for help'),
        jsonb_build_object('name', 'Issue', 'type', 'longText', 'description', 'Full message content captured from Teams'),
        jsonb_build_object('name', 'Status', 'type', 'singleSelect', 'options', jsonb_build_array('Open', 'In Progress', 'Resolved', 'Closed'), 'description', 'Ticket progress managed by the support team'),
        jsonb_build_object('name', 'Created', 'type', 'date', 'description', 'When the ticket was created in Airtable')
      )
    )
  )
)
WHERE name = 'Microsoft Teams Support Hub'
  AND (airtable_setup IS NULL OR airtable_setup = 'null'::jsonb);

UPDATE public.templates
SET integration_setup = jsonb_build_array(
  jsonb_build_object(
    'type', 'airtable',
    'baseName', 'Teams Support Desk',
    'instructions', jsonb_build_array(
      'Create a base named Teams Support Desk in Airtable',
      'Add a Support Tickets table with the fields listed below',
      'Use the workflow to automatically populate tickets from Teams messages'
    ),
    'tables', jsonb_build_array(
      jsonb_build_object(
        'tableName', 'Support Tickets',
        'description', 'Track incoming Microsoft Teams support conversations',
        'fields', jsonb_build_array(
          jsonb_build_object('name', 'Customer', 'type', 'singleLineText', 'description', 'Name of the teammate or customer asking for help'),
          jsonb_build_object('name', 'Issue', 'type', 'longText', 'description', 'Full message content captured from Teams'),
          jsonb_build_object('name', 'Status', 'type', 'singleSelect', 'options', jsonb_build_array('Open', 'In Progress', 'Resolved', 'Closed'), 'description', 'Ticket progress managed by the support team'),
          jsonb_build_object('name', 'Created', 'type', 'date', 'description', 'When the ticket was created in Airtable')
        )
      )
    )
  )
)
WHERE name = 'Microsoft Teams Support Hub'
  AND (integration_setup IS NULL OR integration_setup = 'null'::jsonb);

-- Populate Google Sheets setup for the cross-platform publishing template
UPDATE public.templates
SET integration_setup = jsonb_build_array(
  jsonb_build_object(
    'type', 'google_sheets',
    'spreadsheetName', 'Social Media Content Calendar',
    'instructions', jsonb_build_array(
      'Download the sample CSV file and import it into a new Google Sheet named Social Media Content Calendar.',
      'Ensure the sheet is titled Posts and the header row remains unchanged so the workflow can map fields correctly.',
      'Share the sheet with the Google account connected to ChainReact (if required) and paste the sheet ID in the Google Sheets node configuration.'
    ),
    'sampleSheets', jsonb_build_array(
      jsonb_build_object(
        'sheetName', 'Posts',
        'description', 'Required columns with example social content that the workflow will publish',
        'downloadUrl', '/setup-resources/google-sheets/cross-platform-content.csv'
      )
    ),
    'resources', jsonb_build_array(
      jsonb_build_object(
        'name', 'Import CSV instructions',
        'description', 'Google Sheets guide on importing CSV files',
        'url', 'https://support.google.com/docs/answer/40608',
        'type', 'documentation'
      )
    )
  )
)
WHERE name = 'Cross-Platform Content Publisher'
  AND (integration_setup IS NULL OR integration_setup = 'null'::jsonb);
