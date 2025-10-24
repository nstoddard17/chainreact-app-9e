# Node Validation Report

**Generated**: 2025-10-23T15:43:51.178Z

## Summary

- **Total Nodes Checked**: 196
- **Total Issues Found**: 282
- **Critical Issues**: 266 🔴
- **Warnings**: 0 🟡
- **Info**: 16 🔵

### ⚠️ Action Required

266 critical issue(s) need immediate attention.

## Issues by Provider

| Provider | Issues |
|----------|--------|
| mailchimp | 49 |
| hubspot | 32 |
| airtable | 26 |
| stripe | 20 |
| twitter | 17 |
| trello | 14 |
| dropbox | 11 |
| shopify | 11 |
| teams | 11 |
| discord | 8 |
| google-analytics | 7 |
| logic | 7 |
| misc | 7 |
| notion | 7 |
| facebook | 6 |
| github | 6 |
| google-sheets | 6 |
| onedrive | 6 |
| utility | 6 |
| google-drive | 5 |
| microsoft-excel | 5 |
| outlook | 5 |
| google-calendar | 4 |
| google-docs | 4 |
| onenote | 2 |

## Issues by Category

| Category | Count |
|----------|-------|
| missing handler | 164 |
| field alignment | 102 |
| missing optional field | 5 |
| missing pagination | 11 |

## Detailed Issues

### 🔴 CRITICAL (266)

#### airtable (24)

**airtable_trigger_new_record** (`airtable_trigger_new_record`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/airtable/new_record.ts

**airtable_trigger_record_updated** (`airtable_trigger_record_updated`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/airtable/record_updated.ts

**airtable_trigger_table_deleted** (`airtable_trigger_table_deleted`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/airtable/table_deleted.ts

**Create Record** (`airtable_action_create_record`)
- **Issue**: Handler reads field 'baseId' but it's not in the schema
- **Fix**: Add field 'baseId' to configSchema in airtable/index.ts
- **Location**: Handler uses config.baseId

**Create Record** (`airtable_action_create_record`)
- **Issue**: Handler reads field 'tableName' but it's not in the schema
- **Fix**: Add field 'tableName' to configSchema in airtable/index.ts
- **Location**: Handler uses config.tableName

**Create Record** (`airtable_action_create_record`)
- **Issue**: Handler reads field 'tableId' but it's not in the schema
- **Fix**: Add field 'tableId' to configSchema in airtable/index.ts
- **Location**: Handler uses config.tableId

**Create Record** (`airtable_action_create_record`)
- **Issue**: Handler reads field 'fields' but it's not in the schema
- **Fix**: Add field 'fields' to configSchema in airtable/index.ts
- **Location**: Handler uses config.fields

**Update Record** (`airtable_action_update_record`)
- **Issue**: Handler reads field 'baseId' but it's not in the schema
- **Fix**: Add field 'baseId' to configSchema in airtable/index.ts
- **Location**: Handler uses config.baseId

**Update Record** (`airtable_action_update_record`)
- **Issue**: Handler reads field 'tableName' but it's not in the schema
- **Fix**: Add field 'tableName' to configSchema in airtable/index.ts
- **Location**: Handler uses config.tableName

**Update Record** (`airtable_action_update_record`)
- **Issue**: Handler reads field 'recordId' but it's not in the schema
- **Fix**: Add field 'recordId' to configSchema in airtable/index.ts
- **Location**: Handler uses config.recordId

**Update Record** (`airtable_action_update_record`)
- **Issue**: Handler reads field 'status' but it's not in the schema
- **Fix**: Add field 'status' to configSchema in airtable/index.ts
- **Location**: Handler uses config.status

**Update Record** (`airtable_action_update_record`)
- **Issue**: Handler reads field 'tableId' but it's not in the schema
- **Fix**: Add field 'tableId' to configSchema in airtable/index.ts
- **Location**: Handler uses config.tableId

**Update Record** (`airtable_action_update_record`)
- **Issue**: Handler reads field 'fields' but it's not in the schema
- **Fix**: Add field 'fields' to configSchema in airtable/index.ts
- **Location**: Handler uses config.fields

**Get Records** (`airtable_action_list_records`)
- **Issue**: Handler reads field 'baseId' but it's not in the schema
- **Fix**: Add field 'baseId' to configSchema in airtable/index.ts
- **Location**: Handler uses config.baseId

**Get Records** (`airtable_action_list_records`)
- **Issue**: Handler reads field 'tableName' but it's not in the schema
- **Fix**: Add field 'tableName' to configSchema in airtable/index.ts
- **Location**: Handler uses config.tableName

**Get Records** (`airtable_action_list_records`)
- **Issue**: Handler reads field 'maxRecords' but it's not in the schema
- **Fix**: Add field 'maxRecords' to configSchema in airtable/index.ts
- **Location**: Handler uses config.maxRecords

**Get Records** (`airtable_action_list_records`)
- **Issue**: Handler reads field 'filterByFormula' but it's not in the schema
- **Fix**: Add field 'filterByFormula' to configSchema in airtable/index.ts
- **Location**: Handler uses config.filterByFormula

**Get Records** (`airtable_action_list_records`)
- **Issue**: Handler reads field 'keywordSearch' but it's not in the schema
- **Fix**: Add field 'keywordSearch' to configSchema in airtable/index.ts
- **Location**: Handler uses config.keywordSearch

**Get Records** (`airtable_action_list_records`)
- **Issue**: Handler reads field 'filterField' but it's not in the schema
- **Fix**: Add field 'filterField' to configSchema in airtable/index.ts
- **Location**: Handler uses config.filterField

**Get Records** (`airtable_action_list_records`)
- **Issue**: Handler reads field 'filterValue' but it's not in the schema
- **Fix**: Add field 'filterValue' to configSchema in airtable/index.ts
- **Location**: Handler uses config.filterValue

**Get Records** (`airtable_action_list_records`)
- **Issue**: Handler reads field 'sortOrder' but it's not in the schema
- **Fix**: Add field 'sortOrder' to configSchema in airtable/index.ts
- **Location**: Handler uses config.sortOrder

**Get Records** (`airtable_action_list_records`)
- **Issue**: Handler reads field 'dateFilter' but it's not in the schema
- **Fix**: Add field 'dateFilter' to configSchema in airtable/index.ts
- **Location**: Handler uses config.dateFilter

**Get Records** (`airtable_action_list_records`)
- **Issue**: Handler reads field 'customDateRange' but it's not in the schema
- **Fix**: Add field 'customDateRange' to configSchema in airtable/index.ts
- **Location**: Handler uses config.customDateRange

**Get Records** (`airtable_action_list_records`)
- **Issue**: Handler reads field 'recordLimit' but it's not in the schema
- **Fix**: Add field 'recordLimit' to configSchema in airtable/index.ts
- **Location**: Handler uses config.recordLimit

#### discord (8)

**discord_trigger_member_join** (`discord_trigger_member_join`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/discord/member_join.ts

**discord_trigger_new_message** (`discord_trigger_new_message`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/discord/new_message.ts

**discord_trigger_slash_command** (`discord_trigger_slash_command`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/discord/slash_command.ts

**discord_action_send_message** (`discord_action_send_message`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/discord/send_message.ts

**discord_action_edit_message** (`discord_action_edit_message`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/discord/edit_message.ts

**discord_action_delete_message** (`discord_action_delete_message`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/discord/delete_message.ts

**discord_action_fetch_messages** (`discord_action_fetch_messages`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/discord/fetch_messages.ts

**discord_action_assign_role** (`discord_action_assign_role`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/discord/assign_role.ts

#### dropbox (10)

**dropbox_trigger_new_file** (`dropbox_trigger_new_file`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/dropbox/new_file.ts

**Upload File** (`dropbox_action_upload_file`)
- **Issue**: Handler reads field 'fileName' but it's not in the schema
- **Fix**: Add field 'fileName' to configSchema in dropbox/index.ts
- **Location**: Handler uses config.fileName

**Upload File** (`dropbox_action_upload_file`)
- **Issue**: Handler reads field 'sourceType' but it's not in the schema
- **Fix**: Add field 'sourceType' to configSchema in dropbox/index.ts
- **Location**: Handler uses config.sourceType

**Upload File** (`dropbox_action_upload_file`)
- **Issue**: Handler reads field 'path' but it's not in the schema
- **Fix**: Add field 'path' to configSchema in dropbox/index.ts
- **Location**: Handler uses config.path

**Upload File** (`dropbox_action_upload_file`)
- **Issue**: Handler reads field 'uploadedFiles' but it's not in the schema
- **Fix**: Add field 'uploadedFiles' to configSchema in dropbox/index.ts
- **Location**: Handler uses config.uploadedFiles

**Upload File** (`dropbox_action_upload_file`)
- **Issue**: Handler reads field 'fileUrl' but it's not in the schema
- **Fix**: Add field 'fileUrl' to configSchema in dropbox/index.ts
- **Location**: Handler uses config.fileUrl

**Upload File** (`dropbox_action_upload_file`)
- **Issue**: Handler reads field 'fileContent' but it's not in the schema
- **Fix**: Add field 'fileContent' to configSchema in dropbox/index.ts
- **Location**: Handler uses config.fileContent

**Upload File** (`dropbox_action_upload_file`)
- **Issue**: Handler reads field 'fileFromNode' but it's not in the schema
- **Fix**: Add field 'fileFromNode' to configSchema in dropbox/index.ts
- **Location**: Handler uses config.fileFromNode

**Get File** (`dropbox_action_get_file`)
- **Issue**: Handler reads field 'filePath' but it's not in the schema
- **Fix**: Add field 'filePath' to configSchema in dropbox/index.ts
- **Location**: Handler uses config.filePath

**Get File** (`dropbox_action_get_file`)
- **Issue**: Handler reads field 'downloadContent' but it's not in the schema
- **Fix**: Add field 'downloadContent' to configSchema in dropbox/index.ts
- **Location**: Handler uses config.downloadContent

#### facebook (6)

**facebook_trigger_new_post** (`facebook_trigger_new_post`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/facebook/new_post.ts

**facebook_trigger_new_comment** (`facebook_trigger_new_comment`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/facebook/new_comment.ts

**facebook_action_create_post** (`facebook_action_create_post`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/facebook/create_post.ts

**facebook_action_get_page_insights** (`facebook_action_get_page_insights`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/facebook/get_page_insights.ts

**facebook_action_send_message** (`facebook_action_send_message`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/facebook/send_message.ts

**facebook_action_comment_on_post** (`facebook_action_comment_on_post`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/facebook/comment_on_post.ts

#### github (6)

**github_trigger_new_commit** (`github_trigger_new_commit`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/github/new_commit.ts

**github_action_create_issue** (`github_action_create_issue`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/github/create_issue.ts

**github_action_create_repository** (`github_action_create_repository`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/github/create_repository.ts

**github_action_create_pull_request** (`github_action_create_pull_request`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/github/create_pull_request.ts

**github_action_create_gist** (`github_action_create_gist`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/github/create_gist.ts

**github_action_add_comment** (`github_action_add_comment`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/github/add_comment.ts

#### google-analytics (7)

**google_analytics_trigger_new_pageview** (`google_analytics_trigger_new_pageview`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/google-analytics/trigger_new_pageview.ts

**google_analytics_trigger_goal_completion** (`google_analytics_trigger_goal_completion`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/google-analytics/trigger_goal_completion.ts

**google_analytics_trigger_new_event** (`google_analytics_trigger_new_event`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/google-analytics/trigger_new_event.ts

**google_analytics_action_send_event** (`google_analytics_action_send_event`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/google-analytics/action_send_event.ts

**google_analytics_action_get_realtime_data** (`google_analytics_action_get_realtime_data`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/google-analytics/action_get_realtime_data.ts

**google_analytics_action_run_report** (`google_analytics_action_run_report`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/google-analytics/action_run_report.ts

**google_analytics_action_get_user_activity** (`google_analytics_action_get_user_activity`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/google-analytics/action_get_user_activity.ts

#### google-calendar (4)

**google_calendar_trigger_new_event** (`google_calendar_trigger_new_event`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/google-calendar/trigger_new_event.ts

**google_calendar_trigger_event_updated** (`google_calendar_trigger_event_updated`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/google-calendar/trigger_event_updated.ts

**google_calendar_trigger_event_canceled** (`google_calendar_trigger_event_canceled`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/google-calendar/trigger_event_canceled.ts

**google_calendar_action_create_event** (`google_calendar_action_create_event`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/google-calendar/action_create_event.ts

#### google-docs (4)

**google_docs_action_create_document** (`google_docs_action_create_document`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/google-docs/action_create_document.ts

**google_docs_action_update_document** (`google_docs_action_update_document`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/google-docs/action_update_document.ts

**google_docs_trigger_new_document** (`google_docs_trigger_new_document`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/google-docs/trigger_new_document.ts

**google_docs_trigger_document_updated** (`google_docs_trigger_document_updated`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/google-docs/trigger_document_updated.ts

#### google-drive (5)

**google-drive:new_file_in_folder** (`google-drive:new_file_in_folder`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/google-drive/in_folder.ts

**google-drive:new_folder_in_folder** (`google-drive:new_folder_in_folder`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/google-drive/in_folder.ts

**google-drive:file_updated** (`google-drive:file_updated`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/google-drive/.ts

**google-drive:create_file** (`google-drive:create_file`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/google-drive/.ts

**google-drive:get_file** (`google-drive:get_file`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/google-drive/.ts

#### google-sheets (6)

**google_sheets_trigger_new_row** (`google_sheets_trigger_new_row`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/google-sheets/trigger_new_row.ts

**google_sheets_trigger_new_worksheet** (`google_sheets_trigger_new_worksheet`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/google-sheets/trigger_new_worksheet.ts

**google_sheets_trigger_updated_row** (`google_sheets_trigger_updated_row`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/google-sheets/trigger_updated_row.ts

**google_sheets_unified_action** (`google_sheets_unified_action`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/google-sheets/unified_action.ts

**google-sheets_action_export_sheet** (`google-sheets_action_export_sheet`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/google-sheets/export_sheet.ts

**google_sheets_action_create_spreadsheet** (`google_sheets_action_create_spreadsheet`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/google-sheets/action_create_spreadsheet.ts

#### hubspot (26)

**hubspot_trigger_contact_created** (`hubspot_trigger_contact_created`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/hubspot/contact_created.ts

**hubspot_trigger_contact_updated** (`hubspot_trigger_contact_updated`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/hubspot/contact_updated.ts

**hubspot_trigger_contact_deleted** (`hubspot_trigger_contact_deleted`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/hubspot/contact_deleted.ts

**hubspot_trigger_company_created** (`hubspot_trigger_company_created`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/hubspot/company_created.ts

**hubspot_trigger_company_updated** (`hubspot_trigger_company_updated`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/hubspot/company_updated.ts

**hubspot_trigger_company_deleted** (`hubspot_trigger_company_deleted`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/hubspot/company_deleted.ts

**hubspot_trigger_deal_created** (`hubspot_trigger_deal_created`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/hubspot/deal_created.ts

**hubspot_trigger_deal_updated** (`hubspot_trigger_deal_updated`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/hubspot/deal_updated.ts

**hubspot_trigger_deal_deleted** (`hubspot_trigger_deal_deleted`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/hubspot/deal_deleted.ts

**hubspot_action_create_contact** (`hubspot_action_create_contact`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/hubspot/create_contact.ts

**hubspot_action_create_company** (`hubspot_action_create_company`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/hubspot/create_company.ts

**hubspot_action_create_deal** (`hubspot_action_create_deal`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/hubspot/create_deal.ts

**hubspot_action_add_contact_to_list** (`hubspot_action_add_contact_to_list`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/hubspot/add_contact_to_list.ts

**hubspot_action_update_deal** (`hubspot_action_update_deal`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/hubspot/update_deal.ts

**Get Contacts** (`hubspot_action_get_contacts`)
- **Issue**: Handler reads field 'limit' but it's not in the schema
- **Fix**: Add field 'limit' to configSchema in hubspot/index.ts
- **Location**: Handler uses config.limit

**Get Contacts** (`hubspot_action_get_contacts`)
- **Issue**: Handler reads field 'filterProperty' but it's not in the schema
- **Fix**: Add field 'filterProperty' to configSchema in hubspot/index.ts
- **Location**: Handler uses config.filterProperty

**Get Contacts** (`hubspot_action_get_contacts`)
- **Issue**: Handler reads field 'filterValue' but it's not in the schema
- **Fix**: Add field 'filterValue' to configSchema in hubspot/index.ts
- **Location**: Handler uses config.filterValue

**Get Contacts** (`hubspot_action_get_contacts`)
- **Issue**: Handler reads field 'properties' but it's not in the schema
- **Fix**: Add field 'properties' to configSchema in hubspot/index.ts
- **Location**: Handler uses config.properties

**Get Companies** (`hubspot_action_get_companies`)
- **Issue**: Handler reads field 'limit' but it's not in the schema
- **Fix**: Add field 'limit' to configSchema in hubspot/index.ts
- **Location**: Handler uses config.limit

**Get Companies** (`hubspot_action_get_companies`)
- **Issue**: Handler reads field 'filterProperty' but it's not in the schema
- **Fix**: Add field 'filterProperty' to configSchema in hubspot/index.ts
- **Location**: Handler uses config.filterProperty

**Get Companies** (`hubspot_action_get_companies`)
- **Issue**: Handler reads field 'filterValue' but it's not in the schema
- **Fix**: Add field 'filterValue' to configSchema in hubspot/index.ts
- **Location**: Handler uses config.filterValue

**Get Companies** (`hubspot_action_get_companies`)
- **Issue**: Handler reads field 'properties' but it's not in the schema
- **Fix**: Add field 'properties' to configSchema in hubspot/index.ts
- **Location**: Handler uses config.properties

**Get Deals** (`hubspot_action_get_deals`)
- **Issue**: Handler reads field 'limit' but it's not in the schema
- **Fix**: Add field 'limit' to configSchema in hubspot/index.ts
- **Location**: Handler uses config.limit

**Get Deals** (`hubspot_action_get_deals`)
- **Issue**: Handler reads field 'filterProperty' but it's not in the schema
- **Fix**: Add field 'filterProperty' to configSchema in hubspot/index.ts
- **Location**: Handler uses config.filterProperty

**Get Deals** (`hubspot_action_get_deals`)
- **Issue**: Handler reads field 'filterValue' but it's not in the schema
- **Fix**: Add field 'filterValue' to configSchema in hubspot/index.ts
- **Location**: Handler uses config.filterValue

**Get Deals** (`hubspot_action_get_deals`)
- **Issue**: Handler reads field 'properties' but it's not in the schema
- **Fix**: Add field 'properties' to configSchema in hubspot/index.ts
- **Location**: Handler uses config.properties

#### logic (7)

**path** (`path`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/logic/.ts

**filter** (`filter`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/logic/.ts

**http_request** (`http_request`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/logic/.ts

**if_then_condition** (`if_then_condition`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/logic/condition.ts

**delay** (`delay`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/logic/.ts

**custom_script** (`custom_script`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/logic/.ts

**loop** (`loop`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/logic/.ts

#### mailchimp (48)

**mailchimp_trigger_new_subscriber** (`mailchimp_trigger_new_subscriber`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/mailchimp/new_subscriber.ts

**mailchimp_trigger_email_opened** (`mailchimp_trigger_email_opened`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/mailchimp/email_opened.ts

**Add Subscriber** (`mailchimp_action_add_subscriber`)
- **Issue**: Handler reads field 'audience_id' but it's not in the schema
- **Fix**: Add field 'audience_id' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.audience_id

**Add Subscriber** (`mailchimp_action_add_subscriber`)
- **Issue**: Handler reads field 'email' but it's not in the schema
- **Fix**: Add field 'email' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.email

**Add Subscriber** (`mailchimp_action_add_subscriber`)
- **Issue**: Handler reads field 'status' but it's not in the schema
- **Fix**: Add field 'status' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.status

**Add Subscriber** (`mailchimp_action_add_subscriber`)
- **Issue**: Handler reads field 'first_name' but it's not in the schema
- **Fix**: Add field 'first_name' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.first_name

**Add Subscriber** (`mailchimp_action_add_subscriber`)
- **Issue**: Handler reads field 'last_name' but it's not in the schema
- **Fix**: Add field 'last_name' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.last_name

**Add Subscriber** (`mailchimp_action_add_subscriber`)
- **Issue**: Handler reads field 'phone' but it's not in the schema
- **Fix**: Add field 'phone' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.phone

**Add Subscriber** (`mailchimp_action_add_subscriber`)
- **Issue**: Handler reads field 'address' but it's not in the schema
- **Fix**: Add field 'address' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.address

**Add Subscriber** (`mailchimp_action_add_subscriber`)
- **Issue**: Handler reads field 'city' but it's not in the schema
- **Fix**: Add field 'city' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.city

**Add Subscriber** (`mailchimp_action_add_subscriber`)
- **Issue**: Handler reads field 'state' but it's not in the schema
- **Fix**: Add field 'state' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.state

**Add Subscriber** (`mailchimp_action_add_subscriber`)
- **Issue**: Handler reads field 'zip' but it's not in the schema
- **Fix**: Add field 'zip' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.zip

**Add Subscriber** (`mailchimp_action_add_subscriber`)
- **Issue**: Handler reads field 'country' but it's not in the schema
- **Fix**: Add field 'country' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.country

**Add Subscriber** (`mailchimp_action_add_subscriber`)
- **Issue**: Handler reads field 'tags' but it's not in the schema
- **Fix**: Add field 'tags' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.tags

**Update Subscriber** (`mailchimp_action_update_subscriber`)
- **Issue**: Handler reads field 'audience_id' but it's not in the schema
- **Fix**: Add field 'audience_id' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.audience_id

**Update Subscriber** (`mailchimp_action_update_subscriber`)
- **Issue**: Handler reads field 'subscriber_email' but it's not in the schema
- **Fix**: Add field 'subscriber_email' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.subscriber_email

**Update Subscriber** (`mailchimp_action_update_subscriber`)
- **Issue**: Handler reads field 'new_email' but it's not in the schema
- **Fix**: Add field 'new_email' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.new_email

**Update Subscriber** (`mailchimp_action_update_subscriber`)
- **Issue**: Handler reads field 'status' but it's not in the schema
- **Fix**: Add field 'status' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.status

**Update Subscriber** (`mailchimp_action_update_subscriber`)
- **Issue**: Handler reads field 'first_name' but it's not in the schema
- **Fix**: Add field 'first_name' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.first_name

**Update Subscriber** (`mailchimp_action_update_subscriber`)
- **Issue**: Handler reads field 'last_name' but it's not in the schema
- **Fix**: Add field 'last_name' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.last_name

**Update Subscriber** (`mailchimp_action_update_subscriber`)
- **Issue**: Handler reads field 'phone' but it's not in the schema
- **Fix**: Add field 'phone' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.phone

**Update Subscriber** (`mailchimp_action_update_subscriber`)
- **Issue**: Handler reads field 'address' but it's not in the schema
- **Fix**: Add field 'address' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.address

**Update Subscriber** (`mailchimp_action_update_subscriber`)
- **Issue**: Handler reads field 'city' but it's not in the schema
- **Fix**: Add field 'city' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.city

**Update Subscriber** (`mailchimp_action_update_subscriber`)
- **Issue**: Handler reads field 'state' but it's not in the schema
- **Fix**: Add field 'state' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.state

**Update Subscriber** (`mailchimp_action_update_subscriber`)
- **Issue**: Handler reads field 'zip' but it's not in the schema
- **Fix**: Add field 'zip' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.zip

**Update Subscriber** (`mailchimp_action_update_subscriber`)
- **Issue**: Handler reads field 'country' but it's not in the schema
- **Fix**: Add field 'country' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.country

**Remove Subscriber** (`mailchimp_action_remove_subscriber`)
- **Issue**: Handler reads field 'audience_id' but it's not in the schema
- **Fix**: Add field 'audience_id' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.audience_id

**Remove Subscriber** (`mailchimp_action_remove_subscriber`)
- **Issue**: Handler reads field 'email' but it's not in the schema
- **Fix**: Add field 'email' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.email

**Remove Subscriber** (`mailchimp_action_remove_subscriber`)
- **Issue**: Handler reads field 'delete_permanently' but it's not in the schema
- **Fix**: Add field 'delete_permanently' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.delete_permanently

**Add Tag to Subscriber** (`mailchimp_action_add_tag`)
- **Issue**: Handler reads field 'audience_id' but it's not in the schema
- **Fix**: Add field 'audience_id' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.audience_id

**Add Tag to Subscriber** (`mailchimp_action_add_tag`)
- **Issue**: Handler reads field 'email' but it's not in the schema
- **Fix**: Add field 'email' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.email

**Add Tag to Subscriber** (`mailchimp_action_add_tag`)
- **Issue**: Handler reads field 'tags' but it's not in the schema
- **Fix**: Add field 'tags' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.tags

**Remove Tag from Subscriber** (`mailchimp_action_remove_tag`)
- **Issue**: Handler reads field 'audience_id' but it's not in the schema
- **Fix**: Add field 'audience_id' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.audience_id

**Remove Tag from Subscriber** (`mailchimp_action_remove_tag`)
- **Issue**: Handler reads field 'email' but it's not in the schema
- **Fix**: Add field 'email' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.email

**Remove Tag from Subscriber** (`mailchimp_action_remove_tag`)
- **Issue**: Handler reads field 'tags' but it's not in the schema
- **Fix**: Add field 'tags' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.tags

**Send Campaign** (`mailchimp_action_send_campaign`)
- **Issue**: Handler reads field 'campaign_id' but it's not in the schema
- **Fix**: Add field 'campaign_id' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.campaign_id

**Create Campaign** (`mailchimp_action_create_campaign`)
- **Issue**: Handler reads field 'audience_id' but it's not in the schema
- **Fix**: Add field 'audience_id' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.audience_id

**Create Campaign** (`mailchimp_action_create_campaign`)
- **Issue**: Handler reads field 'type' but it's not in the schema
- **Fix**: Add field 'type' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.type

**Create Campaign** (`mailchimp_action_create_campaign`)
- **Issue**: Handler reads field 'subject_line' but it's not in the schema
- **Fix**: Add field 'subject_line' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.subject_line

**Create Campaign** (`mailchimp_action_create_campaign`)
- **Issue**: Handler reads field 'preview_text' but it's not in the schema
- **Fix**: Add field 'preview_text' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.preview_text

**Create Campaign** (`mailchimp_action_create_campaign`)
- **Issue**: Handler reads field 'from_name' but it's not in the schema
- **Fix**: Add field 'from_name' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.from_name

**Create Campaign** (`mailchimp_action_create_campaign`)
- **Issue**: Handler reads field 'reply_to' but it's not in the schema
- **Fix**: Add field 'reply_to' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.reply_to

**Create Campaign** (`mailchimp_action_create_campaign`)
- **Issue**: Handler reads field 'html_content' but it's not in the schema
- **Fix**: Add field 'html_content' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.html_content

**Create Campaign** (`mailchimp_action_create_campaign`)
- **Issue**: Handler reads field 'text_content' but it's not in the schema
- **Fix**: Add field 'text_content' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.text_content

**Get Subscribers** (`mailchimp_action_get_subscribers`)
- **Issue**: Handler reads field 'audience_id' but it's not in the schema
- **Fix**: Add field 'audience_id' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.audience_id

**Get Subscribers** (`mailchimp_action_get_subscribers`)
- **Issue**: Handler reads field 'status' but it's not in the schema
- **Fix**: Add field 'status' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.status

**Get Subscribers** (`mailchimp_action_get_subscribers`)
- **Issue**: Handler reads field 'limit' but it's not in the schema
- **Fix**: Add field 'limit' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.limit

**Get Subscribers** (`mailchimp_action_get_subscribers`)
- **Issue**: Handler reads field 'offset' but it's not in the schema
- **Fix**: Add field 'offset' to configSchema in mailchimp/index.ts
- **Location**: Handler uses config.offset

#### microsoft-excel (5)

**microsoft_excel_trigger_new_row** (`microsoft_excel_trigger_new_row`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/microsoft-excel/trigger_new_row.ts

**microsoft_excel_trigger_new_worksheet** (`microsoft_excel_trigger_new_worksheet`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/microsoft-excel/trigger_new_worksheet.ts

**microsoft_excel_trigger_updated_row** (`microsoft_excel_trigger_updated_row`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/microsoft-excel/trigger_updated_row.ts

**microsoft_excel_action_create_workbook** (`microsoft_excel_action_create_workbook`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/microsoft-excel/action_create_workbook.ts

**microsoft_excel_unified_action** (`microsoft_excel_unified_action`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/microsoft-excel/unified_action.ts

#### misc (7)

**manychat_trigger_new_subscriber** (`manychat_trigger_new_subscriber`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/misc/new_subscriber.ts

**manychat_action_send_message** (`manychat_action_send_message`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/misc/send_message.ts

**manychat_action_tag_subscriber** (`manychat_action_tag_subscriber`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/misc/tag_subscriber.ts

**gumroad_trigger_new_sale** (`gumroad_trigger_new_sale`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/misc/new_sale.ts

**gumroad_trigger_new_subscriber** (`gumroad_trigger_new_subscriber`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/misc/new_subscriber.ts

**gumroad_action_create_product** (`gumroad_action_create_product`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/misc/create_product.ts

**gumroad_action_get_sales_analytics** (`gumroad_action_get_sales_analytics`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/misc/get_sales_analytics.ts

#### notion (7)

**notion_trigger_new_page** (`notion_trigger_new_page`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/notion/new_page.ts

**notion_trigger_page_updated** (`notion_trigger_page_updated`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/notion/page_updated.ts

**notion_action_create_page** (`notion_action_create_page`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/notion/create_page.ts

**notion_action_append_to_page** (`notion_action_append_to_page`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/notion/append_to_page.ts

**notion_action_create_database** (`notion_action_create_database`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/notion/create_database.ts

**notion_action_search_pages** (`notion_action_search_pages`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/notion/search_pages.ts

**notion_action_update_page** (`notion_action_update_page`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/notion/update_page.ts

#### onedrive (5)

**onedrive_trigger_new_file** (`onedrive_trigger_new_file`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/onedrive/new_file.ts

**onedrive_trigger_file_modified** (`onedrive_trigger_file_modified`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/onedrive/file_modified.ts

**onedrive_action_upload_file** (`onedrive_action_upload_file`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/onedrive/upload_file.ts

**Get File** (`onedrive_action_get_file`)
- **Issue**: Handler reads field 'fileId' but it's not in the schema
- **Fix**: Add field 'fileId' to configSchema in onedrive/index.ts
- **Location**: Handler uses config.fileId

**Get File** (`onedrive_action_get_file`)
- **Issue**: Handler reads field 'downloadContent' but it's not in the schema
- **Fix**: Add field 'downloadContent' to configSchema in onedrive/index.ts
- **Location**: Handler uses config.downloadContent

#### outlook (5)

**microsoft-outlook_trigger_new_email** (`microsoft-outlook_trigger_new_email`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/outlook/new_email.ts

**microsoft-outlook_trigger_email_sent** (`microsoft-outlook_trigger_email_sent`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/outlook/email_sent.ts

**microsoft-outlook_action_fetch_emails** (`microsoft-outlook_action_fetch_emails`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/outlook/fetch_emails.ts

**microsoft-outlook_action_get_calendar_events** (`microsoft-outlook_action_get_calendar_events`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/outlook/get_calendar_events.ts

**microsoft-outlook_action_search_email** (`microsoft-outlook_action_search_email`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/outlook/search_email.ts

#### shopify (11)

**shopify_trigger_new_order** (`shopify_trigger_new_order`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/shopify/new_order.ts

**shopify_trigger_order_updated** (`shopify_trigger_order_updated`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/shopify/order_updated.ts

**shopify_trigger_new_customer** (`shopify_trigger_new_customer`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/shopify/new_customer.ts

**shopify_trigger_product_updated** (`shopify_trigger_product_updated`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/shopify/product_updated.ts

**shopify_trigger_inventory_low** (`shopify_trigger_inventory_low`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/shopify/inventory_low.ts

**shopify_action_create_order** (`shopify_action_create_order`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/shopify/create_order.ts

**shopify_action_update_order_status** (`shopify_action_update_order_status`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/shopify/update_order_status.ts

**shopify_action_create_product** (`shopify_action_create_product`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/shopify/create_product.ts

**shopify_action_update_inventory** (`shopify_action_update_inventory`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/shopify/update_inventory.ts

**shopify_action_create_customer** (`shopify_action_create_customer`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/shopify/create_customer.ts

**shopify_action_add_order_note** (`shopify_action_add_order_note`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/shopify/add_order_note.ts

#### stripe (18)

**stripe_trigger_new_payment** (`stripe_trigger_new_payment`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/stripe/new_payment.ts

**stripe_action_create_customer** (`stripe_action_create_customer`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/stripe/create_customer.ts

**stripe_trigger_customer_created** (`stripe_trigger_customer_created`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/stripe/customer_created.ts

**stripe_trigger_payment_succeeded** (`stripe_trigger_payment_succeeded`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/stripe/payment_succeeded.ts

**stripe_trigger_subscription_created** (`stripe_trigger_subscription_created`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/stripe/subscription_created.ts

**stripe_trigger_subscription_deleted** (`stripe_trigger_subscription_deleted`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/stripe/subscription_deleted.ts

**stripe_trigger_invoice_payment_failed** (`stripe_trigger_invoice_payment_failed`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/stripe/invoice_payment_failed.ts

**stripe_action_create_payment_intent** (`stripe_action_create_payment_intent`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/stripe/create_payment_intent.ts

**stripe_action_create_invoice** (`stripe_action_create_invoice`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/stripe/create_invoice.ts

**stripe_action_create_subscription** (`stripe_action_create_subscription`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/stripe/create_subscription.ts

**Get Customers** (`stripe_action_get_customers`)
- **Issue**: Handler reads field 'limit' but it's not in the schema
- **Fix**: Add field 'limit' to configSchema in stripe/index.ts
- **Location**: Handler uses config.limit

**Get Customers** (`stripe_action_get_customers`)
- **Issue**: Handler reads field 'email' but it's not in the schema
- **Fix**: Add field 'email' to configSchema in stripe/index.ts
- **Location**: Handler uses config.email

**Get Customers** (`stripe_action_get_customers`)
- **Issue**: Handler reads field 'starting_after' but it's not in the schema
- **Fix**: Add field 'starting_after' to configSchema in stripe/index.ts
- **Location**: Handler uses config.starting_after

**Get Payments** (`stripe_action_get_payments`)
- **Issue**: Handler reads field 'limit' but it's not in the schema
- **Fix**: Add field 'limit' to configSchema in stripe/index.ts
- **Location**: Handler uses config.limit

**Get Payments** (`stripe_action_get_payments`)
- **Issue**: Handler reads field 'customerId' but it's not in the schema
- **Fix**: Add field 'customerId' to configSchema in stripe/index.ts
- **Location**: Handler uses config.customerId

**Get Payments** (`stripe_action_get_payments`)
- **Issue**: Handler reads field 'customer' but it's not in the schema
- **Fix**: Add field 'customer' to configSchema in stripe/index.ts
- **Location**: Handler uses config.customer

**Get Payments** (`stripe_action_get_payments`)
- **Issue**: Handler reads field 'status' but it's not in the schema
- **Fix**: Add field 'status' to configSchema in stripe/index.ts
- **Location**: Handler uses config.status

**Get Payments** (`stripe_action_get_payments`)
- **Issue**: Handler reads field 'starting_after' but it's not in the schema
- **Fix**: Add field 'starting_after' to configSchema in stripe/index.ts
- **Location**: Handler uses config.starting_after

#### teams (11)

**teams_trigger_new_message** (`teams_trigger_new_message`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/teams/new_message.ts

**teams_trigger_user_joins_team** (`teams_trigger_user_joins_team`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/teams/user_joins_team.ts

**teams_action_send_message** (`teams_action_send_message`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/teams/send_message.ts

**teams_action_create_meeting** (`teams_action_create_meeting`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/teams/create_meeting.ts

**teams_action_send_chat_message** (`teams_action_send_chat_message`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/teams/send_chat_message.ts

**teams_action_create_channel** (`teams_action_create_channel`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/teams/create_channel.ts

**teams_action_add_member_to_team** (`teams_action_add_member_to_team`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/teams/add_member_to_team.ts

**teams_action_schedule_meeting** (`teams_action_schedule_meeting`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/teams/schedule_meeting.ts

**teams_action_send_adaptive_card** (`teams_action_send_adaptive_card`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/teams/send_adaptive_card.ts

**teams_action_get_team_members** (`teams_action_get_team_members`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/teams/get_team_members.ts

**teams_action_create_team** (`teams_action_create_team`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/teams/create_team.ts

#### trello (13)

**trello_trigger_new_card** (`trello_trigger_new_card`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/trello/new_card.ts

**trello_trigger_card_updated** (`trello_trigger_card_updated`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/trello/card_updated.ts

**trello_trigger_card_moved** (`trello_trigger_card_moved`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/trello/card_moved.ts

**trello_trigger_comment_added** (`trello_trigger_comment_added`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/trello/comment_added.ts

**trello_trigger_member_changed** (`trello_trigger_member_changed`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/trello/member_changed.ts

**trello_action_create_card** (`trello_action_create_card`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/trello/create_card.ts

**trello_action_create_board** (`trello_action_create_board`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/trello/create_board.ts

**trello_action_create_list** (`trello_action_create_list`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/trello/create_list.ts

**trello_action_move_card** (`trello_action_move_card`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/trello/move_card.ts

**Get Cards** (`trello_action_get_cards`)
- **Issue**: Handler reads field 'boardId' but it's not in the schema
- **Fix**: Add field 'boardId' to configSchema in trello/index.ts
- **Location**: Handler uses config.boardId

**Get Cards** (`trello_action_get_cards`)
- **Issue**: Handler reads field 'listId' but it's not in the schema
- **Fix**: Add field 'listId' to configSchema in trello/index.ts
- **Location**: Handler uses config.listId

**Get Cards** (`trello_action_get_cards`)
- **Issue**: Handler reads field 'filter' but it's not in the schema
- **Fix**: Add field 'filter' to configSchema in trello/index.ts
- **Location**: Handler uses config.filter

**Get Cards** (`trello_action_get_cards`)
- **Issue**: Handler reads field 'limit' but it's not in the schema
- **Fix**: Add field 'limit' to configSchema in trello/index.ts
- **Location**: Handler uses config.limit

#### twitter (17)

**twitter_trigger_new_mention** (`twitter_trigger_new_mention`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/twitter/new_mention.ts

**twitter_trigger_new_follower** (`twitter_trigger_new_follower`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/twitter/new_follower.ts

**twitter_trigger_new_direct_message** (`twitter_trigger_new_direct_message`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/twitter/new_direct_message.ts

**twitter_trigger_search_match** (`twitter_trigger_search_match`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/twitter/search_match.ts

**twitter_trigger_user_tweet** (`twitter_trigger_user_tweet`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/twitter/user_tweet.ts

**twitter_action_post_tweet** (`twitter_action_post_tweet`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/twitter/post_tweet.ts

**twitter_action_reply_tweet** (`twitter_action_reply_tweet`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/twitter/reply_tweet.ts

**twitter_action_retweet** (`twitter_action_retweet`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/twitter/retweet.ts

**twitter_action_unretweet** (`twitter_action_unretweet`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/twitter/unretweet.ts

**twitter_action_like_tweet** (`twitter_action_like_tweet`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/twitter/like_tweet.ts

**twitter_action_unlike_tweet** (`twitter_action_unlike_tweet`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/twitter/unlike_tweet.ts

**twitter_action_send_dm** (`twitter_action_send_dm`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/twitter/send_dm.ts

**twitter_action_follow_user** (`twitter_action_follow_user`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/twitter/follow_user.ts

**twitter_action_unfollow_user** (`twitter_action_unfollow_user`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/twitter/unfollow_user.ts

**twitter_action_search_tweets** (`twitter_action_search_tweets`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/twitter/search_tweets.ts

**twitter_action_get_user_timeline** (`twitter_action_get_user_timeline`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/twitter/get_user_timeline.ts

**twitter_action_get_mentions** (`twitter_action_get_mentions`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/twitter/get_mentions.ts

#### utility (6)

**transformer** (`transformer`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/utility/.ts

**file_upload** (`file_upload`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/utility/.ts

**extract_website_data** (`extract_website_data`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/utility/data.ts

**conditional_trigger** (`conditional_trigger`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/utility/.ts

**google_search** (`google_search`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/utility/.ts

**tavily_search** (`tavily_search`)
- **Issue**: No handler found for this node type
- **Fix**: Create handler at lib/workflows/actions/utility/.ts

### 🔵 INFO (16)

#### airtable (2)

**Create Record** (`airtable_action_create_record`)
- **Issue**: Handler supports 'fields' field but schema doesn't expose it
- **Fix**: Add optional 'fields' field to schema for advanced use cases

**Update Record** (`airtable_action_update_record`)
- **Issue**: Handler supports 'fields' field but schema doesn't expose it
- **Fix**: Add optional 'fields' field to schema for advanced use cases

#### dropbox (1)

**Get File** (`dropbox_action_get_file`)
- **Issue**: Get action should have pagination fields (limit, offset, or starting_after)
- **Fix**: Add limit and/or offset fields to configSchema for better UX

#### hubspot (6)

**Get Contacts** (`hubspot_action_get_contacts`)
- **Issue**: Get action should have pagination fields (limit, offset, or starting_after)
- **Fix**: Add limit and/or offset fields to configSchema for better UX

**Get Contacts** (`hubspot_action_get_contacts`)
- **Issue**: Handler supports 'properties' field but schema doesn't expose it
- **Fix**: Add optional 'properties' field to schema for advanced use cases

**Get Companies** (`hubspot_action_get_companies`)
- **Issue**: Get action should have pagination fields (limit, offset, or starting_after)
- **Fix**: Add limit and/or offset fields to configSchema for better UX

**Get Companies** (`hubspot_action_get_companies`)
- **Issue**: Handler supports 'properties' field but schema doesn't expose it
- **Fix**: Add optional 'properties' field to schema for advanced use cases

**Get Deals** (`hubspot_action_get_deals`)
- **Issue**: Get action should have pagination fields (limit, offset, or starting_after)
- **Fix**: Add limit and/or offset fields to configSchema for better UX

**Get Deals** (`hubspot_action_get_deals`)
- **Issue**: Handler supports 'properties' field but schema doesn't expose it
- **Fix**: Add optional 'properties' field to schema for advanced use cases

#### mailchimp (1)

**Get Subscribers** (`mailchimp_action_get_subscribers`)
- **Issue**: Get action should have pagination fields (limit, offset, or starting_after)
- **Fix**: Add limit and/or offset fields to configSchema for better UX

#### onedrive (1)

**Get File** (`onedrive_action_get_file`)
- **Issue**: Get action should have pagination fields (limit, offset, or starting_after)
- **Fix**: Add limit and/or offset fields to configSchema for better UX

#### onenote (2)

**Get Page Content** (`microsoft-onenote_action_get_page_content`)
- **Issue**: Get action should have pagination fields (limit, offset, or starting_after)
- **Fix**: Add limit and/or offset fields to configSchema for better UX

**Get Pages** (`microsoft-onenote_action_get_pages`)
- **Issue**: Get action should have pagination fields (limit, offset, or starting_after)
- **Fix**: Add limit and/or offset fields to configSchema for better UX

#### stripe (2)

**Get Customers** (`stripe_action_get_customers`)
- **Issue**: Get action should have pagination fields (limit, offset, or starting_after)
- **Fix**: Add limit and/or offset fields to configSchema for better UX

**Get Payments** (`stripe_action_get_payments`)
- **Issue**: Get action should have pagination fields (limit, offset, or starting_after)
- **Fix**: Add limit and/or offset fields to configSchema for better UX

#### trello (1)

**Get Cards** (`trello_action_get_cards`)
- **Issue**: Get action should have pagination fields (limit, offset, or starting_after)
- **Fix**: Add limit and/or offset fields to configSchema for better UX

---

*Generated by validate-all-nodes.ts*
