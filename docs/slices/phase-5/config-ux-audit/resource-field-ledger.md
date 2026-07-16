# CONFIG-UX-SETUP-ADVANCED-1 — Resource-Identifier Field Ledger (complete)

Generated 2026-07-16 from the LIVE discovery registry (`services/discovery/_registry.ts` →
`listAllActionMetas` / `listAllTriggerMetas`, working tree) via a temp jest dump
(`ledger-dump.json`, 1,571 total builder fields across 31 providers; temp test deleted).
Resolver wiring verified against `services/options/_registry.ts` (working tree, incl. the
committed RESOLVERS-1 Stripe block) plus the untracked in-flight resolver files
(`git status`). Scopes verified against each provider's `integrations/<provider>/manifest.ts`.

**Buckets**
1. static-setup-resource → picker required
2. upstream-runtime value → mapping-prominent is correct
3. external-system-supplied at runtime → mapping/manual OK
4. provider-cannot-list (or deliberately-never-listed) → documented limitation w/ evidence
5. freeform business key → keep as typed input

Field notation: `metaKey.field` (`?` = optional). Every builder-visible resource-identifier
field is accounted for in exactly one section.

---

## A. Bucket 1 — picker wired and shipped (status = done)

514 field-consumers across 98 option sources. Current Setup = combobox/select picker
(typed/`{{...}}` fallback always available — ComboboxField accepts free text). No change
required; Advanced fallback = manual id entry in the same field.

| provider | node.field consumers | what the value represents | listing endpoint (verified in resolver) | source | status |
|---|---|---|---|---|---|
| slack | 30 channel fields: upload_file / send_channel_message / update_message / delete_message / get_messages / get_thread_messages / schedule_message / cancel_scheduled_message / add_reaction / remove_reaction / pin_message / unpin_message / list_scheduled_messages? / get_channel_info / archive_channel / rename_channel / join_channel / leave_channel / invite_users_to_channel / remove_user_from_channel / set_channel_topic / set_channel_purpose / post_interactive_blocks `.channel`; triggers message.channel / message.group / reaction_added / reaction_removed / member_joined_channel / member_left_channel / file_shared `.channelId?` | Slack channel id | `conversations.list` | slack:channels | done |
| slack | unarchive_channel.channel | archived channel id | `conversations.list` (archived filter) | slack:channels_archived | done (this session) |
| slack | send_direct_message.userId, invite_users_to_channel.users, remove_user_from_channel.user, get_user_info.user, message.im.withUserId? | Slack user id | `users.list` (`users:read`) | slack:users | done |
| slack | message.mpim.channelId? | group-DM (mpim) id | `conversations.list types=mpim` (`mpim:read`) | slack:group_dms | done |
| gmail | send_email.labels?, search_emails.labelIds?, add_label.labelIds, remove_label.labelIds, new_email.labelIds?, new_labeled_email.labelId | Gmail label ids | `users.labels.list` | gmail:labels | done |
| microsoft-outlook | fetch_emails.folderId?, move_email.destinationFolderId, new_email.folder?, email_flagged.folder? | Graph mail-folder id | `GET /me/mailFolders` (`Mail.Read`) | microsoft-outlook:folders | done |
| microsoft-outlook | add_categories.categories | master-category names | `GET /me/outlook/masterCategories` (optional `MailboxSettings.Read`, manifest updated) | microsoft-outlook:categories | done (this session) |
| microsoft-outlook-calendar | (calendar picker backs analytics widgets; action calendar defaulting) | calendar id | `GET /me/calendars` | microsoft-outlook-calendar:calendars (analytics surface) | done |
| google-calendar | create_event / list_events / update_event / delete_event / add_attendees / event_changed `.calendarId?` | calendar id | `calendarList.list` (`calendar.readonly`) | google-calendar:calendars | done |
| google-drive | move_file.fileId, delete_file.fileId, get_file_metadata.fileId | Drive file id | Drive `files.list` | google-drive:files | done |
| google-drive | 10 folder fields incl. google-docs:create_document.folderId?, upload_file/create_folder.parentFolderId?, list_files/search_files.folderId?, move_file.newParentFolderId, file_changed.fileId?/folderId?, google-docs new_document/document_updated.folderId? | Drive folder id | Drive `files.list` (folder mimeType) | google-drive:folders | done |
| google-docs | update_document / share_document / get_document / export_document / document_updated? `.documentId` | Docs document id | Drive `files.list` (Docs mimeType) — pre-existing from GDOCS-3 slice | google-docs:documents | done (verified pre-existing) |
| google-sheets | 13 `.spreadsheetId` fields (read_rows, get_cell_value, get_sheet_metadata, find_row, append_row, update_row, update_cell, clear_range, delete_row, batch_update, format_range, new_worksheet, row_changed) | spreadsheet id | Drive `files.list` (`drive.metadata.readonly` in manifest) — pre-existing from GSHEETS-2 | google-sheets:spreadsheets | done (verified pre-existing) |
| google-sheets | 6 `.sheetName` fields | worksheet/tab name | `spreadsheets.get?includeGridData=false` | google-sheets:sheets | done |
| notion | update_page/archive_page/restore_page/get_page.pageId, create_database.parentPageId, append_block_children.blockId, create_comment.pageId?, list_comments.blockId | Notion page id | `POST /v1/search` (page filter) | notion:pages | done |
| notion | get_user.userId | Notion user id | `GET /v1/users` | notion:users | done |
| discord | 7 `.guildId` fields | guild id | bot `GET /users/@me/guilds` | discord:guilds | done |
| discord | 5 `.channelId` fields | channel id | `GET /guilds/{id}/channels` | discord:channels | done |
| discord | delete_message.userIds?, fetch_messages.filterAuthor?, assign_role.userId, new_message.authorFilter? | member/user id | `GET /guilds/{id}/members` | discord:members | done |
| discord | edit_message.messageId | bot-authored message id | `GET /channels/{id}/messages` (bot filter) | discord:bot_messages | done |
| discord | delete_message.messageIds? | message ids | `GET /channels/{id}/messages` | discord:messages | done |
| discord | assign_role.roleId | role id | `GET /guilds/{id}/roles` | discord:roles | done |
| trello | 13 board fields (6 action UI-scope `boardId?`, create_list.idBoard, 6 trigger `boardId`) | board id | `GET /1/members/me/boards` | trello:boards | done |
| trello | create_card.listId, update_card.idList?, move_card.idList | list id | `GET /1/boards/{id}/lists` | trello:lists | done |
| trello | update_card/move_card/archive_card/add_comment/add_label_to_card.cardId | card id | `GET /1/boards/{id}/cards` | trello:cards | done |
| trello | create_card.idMembers? | member ids | `GET /1/boards/{id}/members` | trello:members | done |
| trello | create_card.idLabels?, add_label_to_card.labelId | label ids | `GET /1/boards/{id}/labels` | trello:labels | done |
| airtable | 12 `.baseId` fields | base id (appXXX) | `GET /v0/meta/bases` (`schema.bases:read`) | airtable:bases | done |
| airtable | 11 `.tableIdOrName` fields | table id/name | `GET /v0/meta/bases/{id}/tables` | airtable:tables | done |
| airtable | list_records.fields? | field names | same schema endpoint | airtable:fields | done |
| airtable | list_records.view? | view name | same schema endpoint | airtable:views | done |
| airtable | add_attachment.fieldName | attachment-type field name | same schema endpoint | airtable:attachment_fields | done |
| monday | 25 `.boardId` fields | board id | GraphQL `boards` | monday:boards | done |
| monday | create_item.groupId, list_items/search_items.groupId?, move_item.targetGroupId | group id | GraphQL `boards{groups}` | monday:groups | done |
| monday | update_item.columnId, search_items.columnId?, column_changed.columnId? | column id | GraphQL `boards{columns}` | monday:columns | done |
| monday | 12 `.itemId`/`parentItemId` fields | item id | GraphQL `boards{items_page}` | monday:items | done |
| monday | add_file.columnId, download_file.columnId | file-column id (incl. `__item_files__` sentinel) | GraphQL columns (file type) | monday:file_columns | done |
| monday | get_user.userId | user id | GraphQL `users` | monday:users | done |
| monday | download_file.fileId? | asset id on item+column | GraphQL `items{assets}` | monday:item_files | done |
| monday | add_column.columnType | Monday column type | static combobox options (typeable for new types) | (static) | done (this session) |
| asana | 12 `.workspaceId?` fields | workspace gid | `GET /workspaces` | asana:workspaces | done |
| asana | 12 `.projectId` fields | project gid | `GET /projects` | asana:projects | done |
| asana | 4 `.assigneeId?` fields | user gid | `GET /users` (names only) | asana:users | done |
| asana | update/complete/add_comment/get_task.taskGid, create_subtask.parentTaskGid | task gid | `GET /tasks?project=` | asana:tasks | done |
| typeform | list_responses/get_response/new_response_in_form.formId | form id | `GET /forms` (server-side `search`) | typeform:forms | done |
| calendly | event_scheduled/event_canceled.eventTypeId? | event-type UUID | `GET /event_types` | calendly:event_types | done |
| quickbooks | get_customer/create_invoice.customerId, list_invoices.customerId? | QBO customer id | `query Customer` | quickbooks:customers | done |
| quickbooks | send_invoice/get_invoice.invoiceId | invoice id | `query Invoice` | quickbooks:invoices | done |
| quickbooks | create_invoice.termId? | sales term id | `query Term` | quickbooks:terms | done |
| quickbooks | (items / tax_codes resolvers registered; ZERO top-level meta consumers — intended for lineItems rows, see §C-8) | item / tax-code ids | `query Item` / `query TaxCode` | quickbooks:items, quickbooks:tax_codes | done (resolver), unconsumed |
| microsoft-excel | 17 `.workbookId` fields | DriveItem id of workbook | Graph drive list (xlsx filter) | microsoft-excel:workbooks | done |
| microsoft-excel | 9 `.worksheetName` fields | worksheet NAME | `GET /workbook/worksheets` | microsoft-excel:worksheets | done |
| microsoft-excel | 5 `.tableName` fields | table NAME | `GET /workbook/tables` | microsoft-excel:tables | done |
| microsoft-excel | add_row.values (spreadsheet-rows) | real header columns | `worksheet/usedRange` row 1 | microsoft-excel:worksheet_columns | done |
| microsoft-excel | find_row.lookupColumn | table column name | `GET /workbook/tables/{name}/columns` | microsoft-excel:table_columns | done (this session) |
| microsoft-onedrive | 8 destination-folder fields (`parentItemId?`, `targetParentItemId`) | folder DriveItem id | `GET /me/drive/.../children` | microsoft-onedrive:folders | done |
| microsoft-onedrive | move_item/copy_item/delete_item.itemId | item DriveItem id | same, per folder | microsoft-onedrive:items | done |
| microsoft-onedrive | get_file.itemId | file DriveItem id | flat root+1-level descent | microsoft-onedrive:files | done |
| microsoft-onenote | 12 `.notebookId` fields | notebook id | `GET /me/onenote/notebooks` | microsoft-onenote:notebooks | done |
| microsoft-onenote | 9 `.sectionId` fields | section id | `GET /notebooks/{id}/sections` | microsoft-onenote:sections | done |
| microsoft-onenote | 5 `.pageId`/`sourcePageId` fields | page id | `GET /sections/{id}/pages` | microsoft-onenote:pages | done |
| microsoft-onenote | copy_page.targetSectionId | cross-notebook target section id | `GET /me/onenote/sections` (all notebooks; new `sectionsListAll` helper) | microsoft-onenote:target_sections | done (this session) |
| microsoft-teams | 7 `.teamId` fields | team id | `GET /me/joinedTeams` | microsoft-teams:teams | done |
| microsoft-teams | 5 `.channelId` fields | channel id | `GET /teams/{id}/channels` | microsoft-teams:channels | done |
| microsoft-teams | send_chat_message.chatId | 1:1/group chat id | `GET /me/chats` (new `chatsList` helper) | microsoft-teams:chats | done (this session) |
| eden | 29 `.workspaceId?` fields | Eden workspace id | Eden MCP workspaces list | eden:workspaces | done |
| eden | 7 board fields (`boardId`/`itemId` on board actions) | board id | Eden MCP boards list | eden:boards | done |
| eden | read/append/update/rename_note.itemId | note id | Eden MCP notes list | eden:notes | done |
| eden | get_prompt/export_skill.promptId | saved-prompt id | Eden MCP prompts list | eden:prompts | done |
| eden | 6 `.scheduleId?` fields | posting-schedule id | Eden MCP schedules list | eden:schedules | done |
| eden | 5 `.postId` fields | scheduled-post/draft id | Eden MCP scheduled-posts list | eden:scheduled_posts (+ eden:draft_posts registered) | done |
| hubspot | 8 `.hubspot_owner_id?` fields | owner id | `GET /crm/v3/owners` | hubspot:owners | done |
| hubspot | create/update_deal.pipeline? → dealstage | pipeline / stage ids | `GET /crm/v3/pipelines/deals` | hubspot:deal_pipelines / deal_stages | done |
| hubspot | create/update_ticket.hs_pipeline → hs_pipeline_stage | ticket pipeline / stage | `GET /crm/v3/pipelines/tickets` | hubspot:ticket_pipelines / ticket_stages | done |
| hubspot | add_contact_to_list/remove_from_list.listId | list id | `GET /crm/v3/lists/search` | hubspot:lists | done |
| hubspot | 12 portal-enum fields (dealtype, contact lifecyclestage / hs_lead_status, company lifecyclestage, ticket category / source_type) | portal-customizable enum values | `GET /crm/v3/properties/{object}/{property}` | hubspot:{deal_dealtype, contact_*, company_*, ticket_*} | done |
| github | create_issue / create_pull_request / create_branch / add_comment / new_commit `.repository` | `owner/repo` | `GET /user/repos` (`repo` scope) | github:repos | done (verified pre-existing) |
| mailchimp | 15 audience/list fields | audience (list) id | `GET /3.0/lists` | mailchimp:audiences | done |
| mailchimp | get_campaign / get_campaign_stats / email_opened? / link_clicked? `.campaignId` | campaign id | `GET /3.0/campaigns` | mailchimp:campaigns | done |
| mailchimp | segment_updated/subscriber_added_to_segment.segmentId | segment id | `GET /3.0/lists/{id}/segments` | mailchimp:segments | done |
| mailchimp | get_subscriber.email | member email (per-list key) | `GET /3.0/lists/{id}/members` | mailchimp:members | done |
| facebook | 10 `.pageId` fields | Page id | `GET /me/accounts` — pre-existing from FACEBOOK-3 | facebook:pages | done (verified pre-existing) |
| facebook | update/comment_on/delete_post.postId, new_comment.postId? | Page post id | `GET /{page}/posts` | facebook:posts | done |
| facebook | send_message.recipientId | `conversationId:psid` | `GET /{page}/conversations` | facebook:conversations | done |
| google-analytics | 6 `.accountId?` fields | GA4 account | Admin `accountSummaries.list` | google-analytics:accounts | done |
| google-analytics | 6 `.propertyId` fields | GA4 property | same accountSummaries call — pre-existing from GA-3 (+ `_flat` for analytics widget) | google-analytics:properties | done (verified pre-existing) |
| google-analytics | send_event.measurementId | web data-stream measurement id (G-XXXX) | Admin `dataStreams.list` | google-analytics:data_streams | done |
| google-analytics | find_conversion.conversionEventName | conversion event name | Admin `conversionEvents.list` | google-analytics:conversion_events | done |
| dropbox | 7 file-path fields (download_file/get_file_metadata/create_shared_link/get_temporary_link/delete_file.path, move_file/copy_file.fromPath) | file path (Dropbox is path-keyed) | `files/list_folder` (dep folderPath) | dropbox:files | done (root-file caveat → §F-2) |
| dropbox | 11 folder-path fields (upload_file.path?, list_folder/search_files/new_file.path?, UI-scope folderPath? parents) | folder path | `files/list_folder` recursive | dropbox:folders | done |
| stripe | update_customer.customerId, create_payment_intent.customerId?, create_subscription.customerId, create_checkout_session.customer?, create_invoice.customerId, get_payments.customer? | `cus_` id | `GET /v1/customers` | stripe:customers | done (this session, committed) |
| stripe | update/cancel/find_subscription.subscriptionId | `sub_` id | `GET /v1/subscriptions` | stripe:subscriptions | done (this session, committed) |
| stripe | create_subscription.priceId, update_subscription.priceId? | `price_` id | `GET /v1/prices` | stripe:prices | done (this session, committed) |

## B. Bucket 1 — in-progress THIS session (meta wiring and/or resolver registration landing now)

| provider | node.field | what the value represents | listing/search endpoint | scope (manifest verdict) | current Setup | corrected Setup | infra needed | status |
|---|---|---|---|---|---|---|---|---|
| hubspot | update_contact.contactId + create_note/task/call/meeting.associatedContactId? (5) | contact id | `POST /crm/v3/objects/contacts/search` | covered by existing 18-scope manifest | combobox wired to `hubspot:contacts` in metas; resolver file `integrations/hubspot/options/records.ts` untracked, registry entry pending | search-picker | register resolvers in `services/options/_registry.ts` | in-progress |
| hubspot | update_company.companyId + 4 assoc fields (5) | company id | `POST /crm/v3/objects/companies/search` | covered | same | search-picker | same | in-progress |
| hubspot | update_deal.dealId + 4 assoc + create_line_item.dealId (6) | deal id | `POST /crm/v3/objects/deals/search` | covered | same | search-picker | same | in-progress |
| hubspot | update_ticket.ticketId + 4 assoc (5) | ticket id | `POST /crm/v3/objects/tickets/search` | covered | same | search-picker | same | in-progress |
| hubspot | update_product.productId, create_line_item.hs_product_id? (2) | product id | `POST /crm/v3/objects/products/search` | covered (`e-commerce`) | same | search-picker | same | in-progress |
| hubspot | update_line_item.lineItemId, remove_line_item.lineItemId (2) | line-item id | `POST /crm/v3/objects/line_items/search` | covered | same | search-picker | same | in-progress |
| hubspot | get_{contacts,companies,deals,tickets,products,line_items}.properties? + .filterProperty? (12) | portal property internal names | `GET /crm/v3/properties/{objectType}` | covered (incl. new `crm.schemas.*.read`) | string-array/combobox wired to `hubspot:*_properties`; resolver `propertyNames.ts` untracked | picker | registry entry | in-progress |
| hubspot | create_call.hs_call_disposition? (1) | call disposition GUID | `GET /calling/v1/dispositions` (portal disposition list) | covered | wired to `hubspot:call_disposition` | picker | registry entry | in-progress |
| github | create_pull_request.head / base?, create_branch.sourceBranch?, new_commit.branch? (4) | branch name | `GET /repos/{owner}/{repo}/branches` | `repo` (verified in manifest) | combobox wired to `github:branches`; resolver `options/branches.ts` untracked | picker (dep: repository) | registry entry | in-progress |
| github | create_issue.milestone (1) | numeric milestone id (NOT title) | `GET /repos/{owner}/{repo}/milestones` | `repo` (verified) | plain `number` field | combobox picker (dep: repository), value = milestone number | new `github:milestones` resolver + meta field type change number→combobox | in-progress (no resolver file yet) |
| notion | query_database.databaseId (1) | database id | `POST /v1/search` (database filter) | integration token (covered) | wired to `notion:databases`; resolver `options/databases.ts` untracked | picker | registry entry | in-progress |
| notion | create_database_entry.databaseId (1) | database id | same endpoint / same resolver | covered | plain text, mapping-first description | wire `optionsSource: "notion:databases"` (combobox) — same resolver as query_database | meta edit only | in-progress (not yet wired) |
| shopify | update_product.product_id, create_product_variant.product_id (2) | product id | `GET /admin/api/2024-10/products.json` | `read_products` (verified in manifest) | metas being wired to `shopify:products` (landed mid-audit); resolver `options/products.ts` untracked | picker | registry entry | in-progress |
| shopify | update_customer.customer_id (1) | customer id | `GET /admin/api/2024-10/customers/search.json?query=` | `read_customers` (verified in manifest) | plain text | search-picker `shopify:customers` | new resolver + registry + meta wire | in-progress per coordinator (no file yet) |
| shopify | update_inventory.location_id (1) | location id | `GET /admin/api/2024-10/locations.json` | **`read_locations` NOT in manifest** (verified: 11 scopes, none covers locations) | plain text | picker `shopify:locations` | new resolver + registry + meta wire + **manifest scope add ⇒ merchant reconnect** | in-progress per coordinator — flag the scope gap |
| airtable | get_record/update_record/delete_record/add_attachment.recordId (4) | record id (recXXX) | `GET /v0/{baseId}/{tableIdOrName}` (bounded page; primary-field labels) | `data.records:read` (verified in manifest) | plain text, mapping-first descriptions ("Usually mapped from an upstream step") | searchable picker `airtable:records` (deps: baseId + tableIdOrName) with mapping still prominent — note the earlier v1 rejection comment in `_registry.ts` ("record pickers are large/ambiguous — rejected for v1"); the corrective pass reverses it with a bounded q-filtered page | new resolver + registry + meta wire | in-progress per coordinator |

## C. Bucket 1 — STILL UNCOVERED after all of the above (build candidates, exact endpoint + scope)

| # | provider | node.field | what the value represents | listing endpoint | scope (manifest verdict) | current Setup | corrected Setup | Advanced fallback | infra needed | status |
|---|---|---|---|---|---|---|---|---|---|---|
| C-1 | github | create_issue.labels? (string-array) | existing repo label names | `GET /repos/{owner}/{repo}/labels` | `repo` — already in manifest, no reconnect | free chips | string-array with `optionsSource: "github:labels"` (contract explicitly allows optionsSource on string-array), dep: repository | type new label names (GitHub auto-rejects unknown labels — creating labels needs a separate call, so keep typing allowed) | new `github:labels` resolver + registry + meta wire | uncovered |
| C-2 | github | create_issue.assignees? (string-array) | GitHub usernames with triage access | `GET /repos/{owner}/{repo}/assignees` | `repo` — in manifest | free chips | string-array with `optionsSource: "github:assignees"`, dep: repository | typed username | new resolver + registry + meta wire | uncovered |
| C-3 | google-sheets | find_row.column (req) | header name of search column (row 0) | `spreadsheets.values.get` range `1:1` (same pattern as `microsoft-excel:worksheet_columns`) | `spreadsheets` — in manifest | free text | combobox `google-sheets:columns` (deps: spreadsheetId + sheetName), value = header name | typed header name (headers can be added after authoring) | new resolver + registry + meta wire | uncovered |
| C-4 | google-sheets | row_changed.keyColumn? | header name used as stable row key | same endpoint/resolver as C-3 | same | free text | same combobox | typed header | reuse C-3 resolver | uncovered |
| C-5 | mailchimp | add_tag.email, remove_tag.email, update_subscriber.email, add_note.email, unsubscribe_subscriber.emailAddress, remove_subscriber.email (6) | member email (per-list subscriber key) | `GET /3.0/lists/{list_id}/members` — resolver `mailchimp:members` ALREADY EXISTS (wired only to get_subscriber.email) | synthetic `account_access` (Mailchimp ignores scopes) — covered | plain text | combobox `optionsSource: "mailchimp:members"` (dep audience_id/listId — note dep-name variance: unsubscribe uses `listId`) with mapping prominent (emails usually flow from triggers) | typed/mapped email | meta edits only — resolver already registered | uncovered (easy win) |
| C-6 | notion | create_page.parent (json, advanced, req) | target container: `{"databaseId":…}` or `{"pageId":…}` | `POST /v1/search` — both notion:databases and notion:pages resolvers exist | covered | advanced JSON escape hatch as the ONLY way to set a required field | redesign: `parentType` select (database/page) + conditional `databaseId` (notion:databases) / `pageId` (notion:pages) comboboxes; keep json only as advanced override | `{{...}}` mapping | meta + runtime-schema mapping change (composite either/or) | uncovered |
| C-7 | stripe | create_checkout_session.lineItems[].price (object-list row) | `price_` id per line | `GET /v1/prices` — `stripe:prices` resolver ALREADY registered | covered | typed text inside object-list row | picker inside object-list rows | typed price id | **contract change**: `ObjectListItemFieldSchema` (contracts/actionMeta.ts ~line 307) is deliberately reduced — no `optionsSource`. Extending it to allow optionsSource on item fields unblocks this and C-8 | uncovered (contract-blocked) |
| C-8 | quickbooks | create_invoice.lineItems[].itemId (object-list row) | QBO item (product/service) id | `query Item` — `quickbooks:items` resolver ALREADY registered (currently zero consumers; its description even tells authors to "find ids via the Items dropdown on other fields", which doesn't exist yet) | covered | typed text inside object-list row | picker inside object-list rows | typed id | same contract change as C-7 | uncovered (contract-blocked) |
| C-9 | shopify | update_product_variant.variant_id | variant id | `GET /admin/api/2024-10/products/{product_id}/variants.json` | `read_products` — in manifest | plain text | add UI-scope `product_id` parent (shopify:products) + `shopify:variants` cascade picker | mapped from create_product_variant output / order webhook line_items | new resolver + UI-scope parent field (Trello boardId pattern) | uncovered |

## D. Bucket 2 — upstream-runtime values (mapping-prominent is CORRECT; no picker required)

All verified by reading the meta descriptions (which explicitly steer to trigger payloads /
upstream outputs). Current Setup = text field with mapping guidance = correct; no change.

| provider | node.field | represents | why bucket 2 (evidence) | listable in principle? | status |
|---|---|---|---|---|---|
| gmail | get_attachment/add_label/remove_label/mark_as_read/mark_as_unread/archive_email/delete_email.messageId (7) | Gmail message id | descriptions: "Source from the … trigger payload or a search_emails result" | yes (`users.messages.list`) but message-at-author-time is wrong model | correct as-is |
| gmail | reply_to_email/create_draft_reply.originalMessageId (2) | message id being replied to | same | same | correct as-is |
| gmail | get_attachment.attachmentId | attachment id within message | only meaningful from message payload | no standalone listing | correct as-is |
| microsoft-outlook | reply_to_email/forward_email/get_attachment/add_categories/move_email/delete_email.emailId (6) | Graph message id | descriptions: "Source from a trigger payload (payload.messageId) or fetch_emails result" | yes but runtime-flow value | correct as-is |
| google-calendar | update_event/delete_event/add_attendees.eventId (3) | event id | "Often comes from a trigger or List Events" | yes (`events.list`) — optional future picker, low value (events churn) | correct as-is |
| microsoft-outlook-calendar | update_event/delete_event/add_attendees.eventId (3) | event id | same wording | yes (`GET /me/events`) | correct as-is |
| microsoft-teams | reply_to_channel_message.messageId | channel message id | "usually from the New Channel Message trigger ({{trigger.messageId}})"; registry documents messages resolver as deliberately DEFERRED | yes (`GET /teams/{id}/channels/{id}/messages` — list_channel_messages action exists) | correct as-is (deferral documented) |
| slack | upload_file/send_channel_message/send_direct_message/schedule_message/post_interactive_blocks.threadTs?, get_thread_messages.threadTs (6) | parent-message `ts` | "Wire the `ts` output of an earlier Slack message step" | messages listable but ts is a flow value | correct as-is |
| slack | download_file/get_file_info.fileId (2) | Slack file id (F-…) | "Source from the file_uploaded trigger payload" | `files.list` exists — optional future picker | correct as-is |
| slack | cancel_scheduled_message.scheduledMessageId | scheduled-message id | "Wire from an upstream Schedule Message action's output" | `chat.scheduledMessages.list` exists; flow value | correct as-is |
| stripe | confirm/capture/find_payment_intent.paymentIntentId, create_refund.paymentIntentId? (4) | `pi_` id | "Usually wired from {{stripe:create_payment_intent.paymentIntentId}} or a webhook trigger payload"; PaymentIntents are transactional runtime objects — picking one at author time is almost never the intent | yes (`GET /v1/payment_intents`) — justified NOT to pick | correct as-is |
| stripe | create_refund.chargeId? | `ch_` id | from payment webhook / get_payments output | yes (`GET /v1/charges`) — same justification | correct as-is |
| stripe | find_customer.customerId? | lookup key (mutex with email) | direct-lookup input | (customers picker already on mutation actions) | correct as-is |
| stripe | get_payments.startingAfter?/endingBefore? | pagination cursors | prev-run outputs | n/a | correct as-is |
| shopify | update_order_status/add_order_note/create_fulfillment.order_id (3) | order id | orders are transactional; arrive via order webhooks/triggers — picking a fixed order at author time is a near-certain authoring error; `GET /orders.json` (read_orders) exists but a picker would encourage the wrong pattern | yes — deliberately not | correct as-is |
| shopify | update_inventory.inventory_item_id | inventory item id | description: "available from a variant's inventoryItemId output" | derived value | correct as-is |
| typeform | get_response.responseToken | response id | "usually mapped from the New Response trigger or List Responses" | responses list exists per form; flow value | correct as-is |
| notion | get_block/get_block_children.blockId (2) | block or page id | blocks only addressable from upstream payloads; accepts page ids too (could optionally wire notion:pages, but blocks≠pages generally) | pages yes, blocks no | correct as-is |
| notion | create_comment.discussionId? | comment thread id | "from a previous comment step's discussionId output" | no listing (comments per page only) | correct as-is |
| github | add_comment.issueNumber | issue/PR number | integer from URL / new_issue-style upstream; `GET /repos/{o}/{r}/issues` (repo scope) could back an optional picker later | yes — optional future | correct as-is |
| microsoft-excel | update_row/delete_row.rowNumber (2) | 1-based row index | from find_row output | n/a | correct as-is |
| google-sheets | delete_row.rowNumber | row index | from find_row output | n/a | correct as-is |
| monday | (all itemIds covered by picker — none left) | — | — | — | — |
| all | pagination cursors/tokens: gmail search_emails.pageToken?, google-drive list/search.pageToken? (2), google-calendar list_events.pageToken?, dropbox list_folder.cursor?, monday list_items/list_boards.cursor? (2), eden list_boards/list_board_items/list_notes/search_items.cursor? (4), typeform list_responses.before? | provider pagination state | prev-run `nextCursor` outputs (advanced-flagged where applicable) | n/a | correct as-is |

## E. Bucket 3 — external-system-supplied at runtime (mapping/manual OK)

| provider | node.field | represents | status |
|---|---|---|---|
| google-analytics | send_event.clientId (req) | GA4 client_id of the end visitor — generated by the GA tag on the customer's site; arrives via webhook/upstream data. Not listable per se (User Explorer API is reporting, not identity listing) | correct as-is |
| microsoft-onenote | update_page.target (req) | CSS selector or `data-id` from an earlier Get Page Content run (include element IDs on) | correct as-is |
| eden | read_content.url (req) | public URL of an external post (YouTube/X/TikTok) | correct as-is |
| facebook | comment_on_post.attachmentUrl? | external media URL | correct as-is |
| native | http_request.url (req) | arbitrary external endpoint | correct as-is |

## F. Bucket 4 — provider-cannot-list / deliberately-never-listed (documented limitations)

| # | provider | node.field | limitation | evidence |
|---|---|---|---|---|
| F-1 | google-analytics | send_event.apiSecret (req) | Measurement Protocol API secret. GA4 Admin API technically exposes `properties.dataStreams.measurementProtocolSecrets.list` (scope analytics.readonly, present in manifest), but V2 made a deliberate security decision to NEVER read or surface these secrets — the value is treated as a paste-only secret. This is a documented non-listing, not an API gap. | `services/options/_registry.ts` GA block: "The Measurement Protocol api_secret is NEVER read or surfaced" (D-GA1 audit); field description: "treated as a secret — created in GA Admin → Data Streams → Measurement Protocol API secrets" |
| F-2 | dropbox | root-level files in the `dropbox:files` cascade | The options route drops empty dep values, so Dropbox root ("") cannot be a cascade parent — root-level files must be typed manually; nested-folder files get the picker. Field descriptions state this explicitly ("Root-level files must be typed manually"). | `services/options/_registry.ts` Dropbox block lines ~248-251; every dropbox file-path field description |
| F-3 | mailchimp | scope-verified listing guarantees | Mailchimp ignores OAuth scope params entirely (token grants account-wide access) — scope "verification" for any future Mailchimp resolver is vacuous; the synthetic `account_access` scope is a contract placeholder. Not a field gap, but a standing caveat for endpoint+scope claims on this provider. | `integrations/mailchimp/manifest.ts` header comment (scope param documented-but-ignored, token `scope: null`) |

## G. Bucket 5 — freeform business keys / new-resource names (keep as typed input)

Names/values the author is CREATING or business data with no provider referent; no picker is
possible or appropriate. Status = correct as-is for all.

- **New-resource names:** slack create_channel.name / rename_channel.name; github create_repository.name, create_branch.branchName, create_gist.filename; gmail create_label.name; trello create_card/create_list/create_board.name; monday create_item.itemName, create_subitem.subitemName, create_board.boardName, duplicate_board.newBoardName?, add_column.columnTitle; asana create_task/update_task/create_subtask.name; mailchimp create_audience.name, create_segment.name; microsoft-excel create_worksheet.name, rename_worksheet.newWorksheetName; onedrive create_folder.name, upload_file.filename, move/copy.newName?; onenote create_section/create_notebook.displayName; dropbox create_folder.path, move_file/copy_file.toPath (destination path incl. new name), upload_file.filename?; google-drive create_folder.name, upload_file.filename; google-docs export_document.fileName?; google-sheets create_spreadsheet.initialSheetName?; quickbooks create_customer.displayName; eden rename_board.name; discord slash_command.commandName (creates/updates the command); GA create_conversion_event.eventName (registers a new conversion name); mailchimp create_custom_event.event_name.
- **Business/contact data used as keys:** hubspot create_contact.email (+ names), add_contact_to_list.email / remove_from_list.email (contact email as membership key — typically mapped from upstream), get_owners.email? (filter); mailchimp add_subscriber.email etc. where the member does not exist yet (create-path); shopify create_order.email, create_customer.email; stripe create_customer.email, find_customer.email? (lookup key), create_checkout_session.customerEmail?/clientReferenceId?; quickbooks send_invoice.sendTo? (email override), create_invoice.customerEmail?; SKUs/tracking: shopify sku fields (create_product, variants), tracking_number/url, hubspot hs_sku?.
- **Idempotency/technical keys:** eden idempotencyKey? fields (3); stripe metadata keys; native http_request headers/queryParams.

---

## Summary

- **Total builder fields dumped:** 1,571 (31 providers; actions + triggers).
- **Resource-identifier fields:** ~700 of them are resource-referencing (the rest are content, enums, filters, toggles, quantities).
- **Bucket 1 — wired & done:** 514 field-consumers across 98 sources (§A), including this session's committed stripe (11 fields), slack:channels_archived, outlook:categories, monday columnType, excel:table_columns, teams:chats, onenote:target_sections. Verified pre-existing (not new): google-docs:documents, google-sheets:spreadsheets, facebook:pages, google-analytics:properties(+_flat).
- **Bucket 1 — in-progress this session:** 43 already-meta-wired field-consumers awaiting resolver registration (hubspot records 25 + properties 12 + call_disposition 1, github branches 4, notion query_database 1) plus 10 not-yet-wired fields (shopify products 2 / customers 1 / locations 1, airtable recordId 4, github milestone 1, notion create_database_entry 1) — §B.
- **Bucket 1 — still uncovered (build list, §C):** 9 items / 16 fields: github labels + assignees (endpoints `GET /repos/{o}/{r}/labels|assignees`, scope `repo` already granted); google-sheets header-column picker ×2 (values.get `1:1`, scope granted); mailchimp member-email wiring ×6 (resolver already registered — meta edits only); notion create_page.parent composite redesign; stripe checkout lineItems[].price + quickbooks invoice lineItems[].itemId (both resolver-ready but **blocked by the object-list ItemField contract, which deliberately omits optionsSource** — contracts/actionMeta.ts ~line 307); shopify variant_id cascade.
- **Bucket 2:** ~55 fields — message/event/thread/file/payment ids and pagination cursors; descriptions verified to steer to trigger payloads/upstream outputs. Shopify order ids justified as bucket 2 (transactional webhook-fed values; a picker would encourage a wrong authoring pattern). Correct as-is.
- **Bucket 3:** 5 fields (GA clientId, OneNote target, external URLs). Correct as-is.
- **Bucket 4:** 2 real limitations with evidence — GA apiSecret (deliberate never-read, D-GA1) and Dropbox root-file cascade gap; plus the Mailchimp scope-verification caveat.
- **Bucket 5:** ~60 freeform keys/new-resource names. Correct as-is.
- **Infra flags:** (1) shopify locations picker requires adding `read_locations` to the manifest ⇒ merchant reconnect; (2) object-list ItemField contract extension needed before any line-item picker; (3) quickbooks:items / tax_codes resolvers are registered but have zero consumers until (2) lands.
