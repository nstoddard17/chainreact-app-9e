# Smart Node Configuration Fix Report

**Generated**: 2025-10-23T15:55:43.074Z

## Summary

- **Total Nodes Analyzed**: 1584
- **Nodes with Issues**: 19
- **Fields to Add**: 84

### Priority Breakdown

- 🔴 **Critical**: 17 (missing required fields)
- 🟠 **High**: 0 (5+ missing fields)
- 🟡 **Medium**: 1 (3-5 missing fields)
- 🟢 **Low**: 1 (1-2 missing fields)

## Fixes by Provider

### airtable (3 nodes)

- Critical: 3 | High: 0 | Medium: 0 | Low: 0

### dropbox (2 nodes)

- Critical: 2 | High: 0 | Medium: 0 | Low: 0

### hubspot (3 nodes)

- Critical: 3 | High: 0 | Medium: 0 | Low: 0

### mailchimp (7 nodes)

- Critical: 6 | High: 0 | Medium: 1 | Low: 0

### onedrive (1 nodes)

- Critical: 1 | High: 0 | Medium: 0 | Low: 0

### stripe (2 nodes)

- Critical: 1 | High: 0 | Medium: 0 | Low: 1

### trello (1 nodes)

- Critical: 1 | High: 0 | Medium: 0 | Low: 0

## Detailed Fixes

### 🔴 CRITICAL Priority

#### airtable: Create Record

**Node Type**: `airtable_action_create_record`

**Missing Fields** (3):

- **tableName** (text, required)
  - 💡 Should be dynamic dropdown: `provider-tables`
  - 💡 Make this a dynamic dropdown using provider-tables
  - 💡 Add supportsAI: true for AI-powered filling
- **tableId** (text, required)
  - 💡 Should be dynamic dropdown: `provider-tables`
  - 💡 Make this a dynamic dropdown using provider-tables
  - 💡 Add supportsAI: true for AI-powered filling
- **fields** (text)
  - 💡 Add supportsAI: true for AI-powered filling

#### airtable: Update Record

**Node Type**: `airtable_action_update_record`

**Missing Fields** (5):

- **tableName** (text, required)
  - 💡 Should be dynamic dropdown: `provider-tables`
  - 💡 Make this a dynamic dropdown using provider-tables
  - 💡 Add supportsAI: true for AI-powered filling
- **recordId** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **status** (select, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **tableId** (text, required)
  - 💡 Should be dynamic dropdown: `provider-tables`
  - 💡 Make this a dynamic dropdown using provider-tables
  - 💡 Add supportsAI: true for AI-powered filling
- **fields** (text)
  - 💡 Add supportsAI: true for AI-powered filling

#### airtable: Get Records

**Node Type**: `airtable_action_list_records`

**Missing Fields** (10):

- **tableName** (text, required)
  - 💡 Should be dynamic dropdown: `provider-tables`
  - 💡 Make this a dynamic dropdown using provider-tables
  - 💡 Add supportsAI: true for AI-powered filling
- **maxRecords** (number)
  - 💡 Add supportsAI: true for AI-powered filling
- **filterByFormula** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **keywordSearch** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **filterField** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **filterValue** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **sortOrder** (text)
  - 💡 Add supportsAI: true for AI-powered filling
- **dateFilter** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **customDateRange** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **recordLimit** (number, required)
  - 💡 Add supportsAI: true for AI-powered filling

#### dropbox: Upload File

**Node Type**: `dropbox_action_upload_file`

**Missing Fields** (6):

- **sourceType** (object, required)
- **path** (text)
  - 💡 Add supportsAI: true for AI-powered filling
- **uploadedFiles** (file)
- **fileUrl** (file, required)
- **fileContent** (file, required)
- **fileFromNode** (file)

#### dropbox: Get File

**Node Type**: `dropbox_action_get_file`

**Missing Fields** (2):

- **filePath** (file, required)
- **downloadContent** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling

#### hubspot: Get Contacts

**Node Type**: `hubspot_action_get_contacts`

**Missing Fields** (3):

- **filterProperty** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **filterValue** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **properties** (text)
  - 💡 Add supportsAI: true for AI-powered filling

#### hubspot: Get Companies

**Node Type**: `hubspot_action_get_companies`

**Missing Fields** (3):

- **filterProperty** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **filterValue** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **properties** (text)
  - 💡 Add supportsAI: true for AI-powered filling

#### hubspot: Get Deals

**Node Type**: `hubspot_action_get_deals`

**Missing Fields** (3):

- **filterProperty** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **filterValue** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **properties** (text)
  - 💡 Add supportsAI: true for AI-powered filling

#### mailchimp: Add Subscriber

**Node Type**: `mailchimp_action_add_subscriber`

**Missing Fields** (11):

- **email** (email, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **status** (select)
  - 💡 Add supportsAI: true for AI-powered filling
- **first_name** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **last_name** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **phone** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **address** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **city** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **state** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **zip** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **country** (number, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **tags** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling

#### mailchimp: Update Subscriber

**Node Type**: `mailchimp_action_update_subscriber`

**Missing Fields** (11):

- **subscriber_email** (email, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **new_email** (email, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **status** (select, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **first_name** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **last_name** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **phone** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **address** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **city** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **state** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **zip** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **country** (number, required)
  - 💡 Add supportsAI: true for AI-powered filling

#### mailchimp: Remove Subscriber

**Node Type**: `mailchimp_action_remove_subscriber`

**Missing Fields** (2):

- **email** (email, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **delete_permanently** (text)
  - 💡 Add supportsAI: true for AI-powered filling

#### mailchimp: Add Tag to Subscriber

**Node Type**: `mailchimp_action_add_tag`

**Missing Fields** (2):

- **email** (email, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **tags** (array)

#### mailchimp: Remove Tag from Subscriber

**Node Type**: `mailchimp_action_remove_tag`

**Missing Fields** (2):

- **email** (email, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **tags** (array)

#### mailchimp: Create Campaign

**Node Type**: `mailchimp_action_create_campaign`

**Missing Fields** (7):

- **type** (select)
  - 💡 Add supportsAI: true for AI-powered filling
- **subject_line** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **preview_text** (text)
  - 💡 Add supportsAI: true for AI-powered filling
- **from_name** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **reply_to** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **html_content** (text)
  - 💡 Add supportsAI: true for AI-powered filling
- **text_content** (text)
  - 💡 Add supportsAI: true for AI-powered filling

#### onedrive: Get File

**Node Type**: `onedrive_action_get_file`

**Missing Fields** (2):

- **fileId** (file, required)
- **downloadContent** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling

#### stripe: Get Payments

**Node Type**: `stripe_action_get_payments`

**Missing Fields** (4):

- **limit** (number)
  - 💡 Add supportsAI: true for AI-powered filling
  - 💡 Pagination field - should be optional with sensible default
- **customer** (text, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **status** (select, required)
  - 💡 Add supportsAI: true for AI-powered filling
- **starting_after** (text)
  - 💡 Add supportsAI: true for AI-powered filling
  - 💡 Pagination field - should be optional with sensible default

#### trello: Get Cards

**Node Type**: `trello_action_get_cards`

**Missing Fields** (3):

- **listId** (text, required)
  - 💡 Should be dynamic dropdown: `provider-lists`
  - 💡 Make this a dynamic dropdown using provider-lists
  - 💡 Add supportsAI: true for AI-powered filling
- **filter** (text)
  - 💡 Add supportsAI: true for AI-powered filling
- **limit** (number)
  - 💡 Add supportsAI: true for AI-powered filling
  - 💡 Pagination field - should be optional with sensible default

### 🟡 MEDIUM Priority

#### mailchimp: Get Subscribers

**Node Type**: `mailchimp_action_get_subscribers`

**Missing Fields** (3):

- **status** (select)
  - 💡 Add supportsAI: true for AI-powered filling
- **limit** (number)
  - 💡 Add supportsAI: true for AI-powered filling
  - 💡 Pagination field - should be optional with sensible default
- **offset** (text)
  - 💡 Add supportsAI: true for AI-powered filling
  - 💡 Pagination field - should be optional with sensible default

### 🟢 LOW Priority

#### stripe: Get Customers

**Node Type**: `stripe_action_get_customers`

**Missing Fields** (2):

- **limit** (number)
  - 💡 Add supportsAI: true for AI-powered filling
  - 💡 Pagination field - should be optional with sensible default
- **starting_after** (text)
  - 💡 Add supportsAI: true for AI-powered filling
  - 💡 Pagination field - should be optional with sensible default

