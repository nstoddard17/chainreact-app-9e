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

---
---

# PART II — RESOLVERS-2 CONTRADICTION SWEEP

**Added 2026-07-16. Slice RESOLVERS-2. Documentation-only pass — no `.ts`/`.tsx`,
metadata, or test file was changed to produce this section.**

## Read this first

**NOTHING in this pass was live-certified. There are no connected provider test
accounts in this environment.** Every statement below is derived from reading the
tracked source in the working tree — schemas, handlers, API wrappers, metas,
registries, manifests, triggers — plus each provider's published API contract. **No
provider is described here as live-verified, and none should be treated as such.**
Where a claim depends on live behavior (e.g. what Mailchimp's `click-details` actually
returns for a given campaign), that is called out inline as unverified.

This is a **contradiction sweep**, not a victory lap. Its purpose is to name every
builder-visible Setup field that can still accept a provider-internal value **and
defend each one on the record** — including the 68 that are justified. A field appearing
in this table is not an accusation; a field *missing* from this table would be the
failure. The one field that could not be defended is in **DEFECTS FOUND** below, and it
is not quietly justified anywhere else in this document.

**Scope.** 69 free-text fields that could accept a provider-internal value, enumerated
from the live discovery registry (487 nodes = 397 actions + 90 triggers; 1,780 fields;
158 registered option resolvers; 32 providers; 716 fields already resolver-backed).
**59 render on Setup; 10 are Advanced-only.** Every one of the 69 was classified by
reading its handler and schema, **never from the field name** — `id` / `key` / `ref` /
`code` / `token` / `name` were treated as meaningless until the handler proved otherwise.
That discipline paid: `hubspot:create_contact.company` reads like a company reference and
is a free-text string property; `shopify:update_inventory.inventory_item_id` reads like a
listable resource and is not one; `microsoft-powerbi:*.key` reads like a provider key and
is a third-party database credential.

## Counts by classification

| Classification | Count | Verdict |
|---|---|---|
| **Static provider resource** (needs a selector — **DEFECT**) | **1** | **mailchimp:link_clicked.url — see below** |
| Dynamic upstream value | 33 | justified |
| Fixed repeated value | 14 | justified |
| Core user decision | 8 | justified |
| Advanced control | 6 | justified |
| Conditional option | 4 | justified |
| Derived/defaulted value | 3 | justified |
| Internal implementation detail | 0 | — |
| **Total** | **69** | |

---

## DEFECTS FOUND

### DEFECT-1 — `mailchimp:link_clicked.url` is a static discoverable provider resource rendered as plain Setup text

**This is a real defect. It is not justified anywhere else in this document.**
Reported, not implemented, per the terms of this pass.

| | |
|---|---|
| **Node** | `mailchimp:link_clicked` (trigger, polling) |
| **Field** | `url` — "URL filter", `type: "text"`, `required: false`, Setup tab, **no `optionsSource`** |
| **Runtime meaning** | An **exact string match** against Mailchimp's own `urls_clicked[].url` — `integrations/mailchimp/triggers/linkClicked/poll.ts` passes `config.url` as `urlFilter` into `processOneCampaign`, which filters the click-details result by strict `===`. The value is not the author's URL: it is **Mailchimp's verbatim tracked-link string for that campaign**. That makes it a provider-owned resource identifier, not business data. |
| **Backing endpoint (exists, and is already wrapped)** | **`GET /reports/{campaign_id}/click-details`** → `reportClickDetails()` in `integrations/_shared/mailchimp/api/reports.ts` (line ~171). It returns `urls_clicked[]` as `{ id, url, total_clicks, click_percentage, unique_clicks, … }`. **The `link_clicked` poll handler already calls this exact wrapper on every tick.** |
| **Parent dependency (exists)** | The sibling `campaignId` field on the *same node* is already a `combobox` on `optionsSource: "mailchimp:campaigns"` (`integrations/mailchimp/options/campaigns.ts`, registered in `services/options/_registry.ts`). |
| **Scope** | None needed. Mailchimp ignores OAuth scope params entirely (token is account-wide) — see §F-3. |
| **Net new work required** | A `mailchimp:links` resolver (`dependsOn: campaignId`, `allowManualEntry: true`) + one registry entry + one meta field-type change. **Zero new API surface.** The wrapper, the parent resolver, and the access are all already shipped. |

**Why this is a defect and not a documented limitation.** Rule 17 says a static
discoverable provider resource gets a registered selector, not a raw text box. Every
precondition for the selector is already in the repo. There is no API gap, no scope gap,
no reconnect cost, and no ambiguity about what the picker would show. It was simply not
wired.

**The severity is worse than "missing convenience," and this is the part a skeptical
reader should weigh.** The match is strict `===` with **no normalization** — a trailing
slash, a case difference, or a UTM-parameter difference produces a trigger that **never
fires and reports no error**. A hand-typed URL is therefore not merely inconvenient; it
is a silent-failure surface. A picker sourced from the provider's own `urls_clicked[]`
is the only way to guarantee the string matches. The picker is worth *more* here than on
a typical convenience field, not less.

**Honest caveats against my own finding** (a skeptical reader should have these):
1. `campaignId` is **optional** on this trigger — unset means "watch the most recent sent
   campaigns." With no campaign chosen the picker cannot populate, so it must keep
   `allowManualEntry` and degrade to text. It is a picker for the common case, not all cases.
2. `click-details` only lists URLs for campaigns that are **sent and have recorded at
   least one click**. A freshly-sent campaign may return an empty list at author time.
   **Unverified live** — no Mailchimp test account in this environment.
3. This does not make `link_clicked` broken today. Leaving `url` empty (fire on any link)
   is the default and works. The defect is scoped to the filtered path.

**Why no test caught this.** `tests/structure/option-source-reference-integrity.test.ts`
proves *referenced ⊆ registered* — every `optionsSource` names a real resolver. It
**cannot** detect a field that *should* have an `optionsSource` and doesn't. There is no
automated guard for "static provider resource left as text," and this sweep is currently
the only mechanism that finds one. Worth knowing before trusting a green test run as
evidence of config-UX completeness.

---

## WATCH ITEMS — justified, but the justification is thinner than the others

These are **not** defects; each is classified and defended in the main table. They are
surfaced separately because a skeptical reader deserves to see the weak seams rather
than discover them later. **Reported, not implemented.**

### W-1 — `shopify:update_inventory.inventory_item_id`: the justification cites an upstream output that does not exist

The classification (dynamic upstream value) is **correct and survives scrutiny** — see
the main table. But the *stated* upstream path is partly false, and the false half is in
shipped builder copy that RESOLVERS-2 itself wrote.

`integrations/shopify/actions/updateInventory.meta.ts` (field description **and** module
docblock) says the id comes from *"an earlier step's `inventoryItemId` output (**Update
Product Variant / Create Product Variant both produce it**)"*. Verified against the code:

- `shopify:update_product_variant` **does** emit `inventoryItemId` — `updateProductVariant.ts:71`, declared in its meta at line 128. ✅
- `shopify:create_product_variant` **does not**. Its output set is exactly
  `{ success, variantId, productId, sku, price, adminUrl, createdAt }`
  (`createProductVariant.ts:41-51`, meta lines 93-101). **No `inventoryItemId`.** ❌
- **No Shopify trigger emits it either** — `integrations/shopify/triggers/` contains only
  `webhookReceived`; a repo-wide grep for `inventoryItemId` outside tests returns only
  `updateInventory`, `updateProductVariant`, and the meta copy above.

So the "real path" this field's own defense rests on is available from **exactly one**
upstream action, not the two claimed. The classification holds — an inventory item still
has no merchant-facing identity and Shopify's `/inventory_items.json` still requires an
`ids=` filter you can only get from variants you already hold, so a picker would show the
parent **variant's** label and silently mis-target. But the copy overstates the escape
hatch, and the natural authoring flow (create a variant → set its stock) is precisely the
one the code does **not** support.

**Suggested (not applied):** either correct the description to name only Update Product
Variant, or add `inventoryItemId` to `create_product_variant`'s output — the value is on
the variant response the handler already holds. The second is the better fix and closes
the gap the copy assumes is already closed.

### W-2 — Gmail's `messageId` decoy: the field name collides with a payload key that will 404

Every Gmail action field in this sweep is named `messageId`, and **the Gmail trigger
payload contains a key literally named `messageId` that is the wrong value.**

- `gmail:new_email` / `new_labeled_email` / `new_attachment` payloads expose **`id`** =
  the Gmail API message id — the value these fields need
  (`newEmail/newEmail.meta.ts:108`).
- The same payloads **also** expose **`messageId`** = the **RFC-5322 `Message-ID:`
  header** (`newEmail/messageHydration.ts:59` → `headerValue(headers, "Message-ID")`;
  meta line 121).

An author mapping `{{trigger.messageId}}` into a field labeled "Message id" is doing the
obvious thing and gets a 404. The correct token is `{{trigger.id}}`. Compounding it:
`gmail:search_emails` outputs `messages[].messageId` meaning the **API id** — the
opposite convention from the trigger — and Microsoft Outlook inverts both (triggers emit
`messageId` = the Graph id; `fetch_emails` emits `messages[].id`). Four sources, two
providers, exactly inverted conventions.

`mark_as_read` / `mark_as_unread` / `archive_email` / `delete_email` have **bare**
descriptions ("Gmail message id to mark as read.") with **no upstream guidance at all**,
so those four give the author nothing to disambiguate against.

The classification (dynamic upstream value) is right and no picker is wanted. But
"upstream mapping is the primary path" is only an honest defense if the author can find
the right token, and today the most discoverable token is the wrong one. **This is a copy
fix, not a resolver fix** — name `{{trigger.id}}` explicitly in the seven Gmail
`messageId`/`originalMessageId` descriptions.

### W-3 — Outlook descriptions cite a "search result" from an action that does not exist

`microsoft-outlook:reply_to_email.emailId` says *"Source from a trigger payload
(payload.messageId) or a **fetch_emails / search** result"*, and
`microsoft-outlook:get_attachment.emailId` says *"…or **upstream search**"*.
**There is no Outlook search action in this repo.** `integrations/microsoft-outlook/actions/`
has exactly one list surface: `fetchEmails`. Additionally, "fetch_emails result" is
correct only if the author knows the key silently changes from `messageId` (trigger) to
`id` (`fetchEmails.ts:108`). Classification unaffected; copy overstates.

### W-4 — `stripe:create_refund`: the mutex pair is internally inconsistent

`createRefund.schema.ts:36` enforces an **XOR** — exactly one of `chargeId` /
`paymentIntentId`. RESOLVERS-2 gave **`chargeId` a picker** (`stripe:charges`, `GET /v1/charges`)
and justified it in `integrations/stripe/options/charges.ts:24-26` on an explicit
one-off-operator framing: *"a refund operator is picking 'the charge I need to reverse'."*

**That exact argument applies to the sibling branch of the same XOR**, which is still a
raw `pi_xxx` text box. Either the operator-picking-a-refund-target framing justifies both
branches, or it justifies neither. The general "PaymentIntents are transactional" defense
(which I accept for `confirm` / `capture` — see below) is *weakest* precisely here,
because RESOLVERS-2 already conceded the one-off-refund use case when it shipped
`stripe:charges`.

I am classifying `create_refund.paymentIntentId` as a dynamic upstream value and calling
it justified-on-balance, because a refund driven by automation should map the id rather
than pin a literal. But this is the thinnest justification in the sweep and I am not
going to pretend otherwise. Building it would need a net-new `paymentIntentsList` wrapper
— `integrations/stripe/api/paymentIntents.ts` has only `create` / `get` / `confirm` /
`capture`; Stripe does expose `GET /v1/payment_intents`.

**Related dead copy:** `integrations/stripe/options/paymentMethods.ts:195` throws
`MISSING_DEPENDENCY` with the message **"Enter or select a payment intent first."** — but
`confirm_payment_intent.paymentIntentId` has no `optionsSource`, so **there is nothing to
select**. The nested `payment_method` picker is pickable while its parent dep is not.

### W-5 — `google-analytics:send_event.clientId` is a required, non-advanced, un-resolvable Setup field with no sourcing guidance

Classification (dynamic upstream value) is **correct and unavoidable**: the GA4
`client_id` is minted browser-side by gtag.js in the visitor's `_ga` cookie. No GA
Admin/Data API enumerates client ids; GA's five registered resolvers (`accounts`,
`properties`, `data_streams`, `conversion_events`, `propertiesFlat`) could never back it.
**Verified:** `measurementProtocolCollect.ts:38` sends it as the Measurement Protocol
`client_id` body param. **No picker is possible. This is not a resolver gap.**

But the honest owner-facing read: the Setup tab carries a **required** field an ordinary
user cannot fill, whose description is just *"The GA4 client_id the event is attributed
to."* — no hint of where the value comes from. The node is un-configurable without
GA-internal knowledge, which is the rule-17 bar even though rule 17's usual remedy (a
selector) does not apply. **The available remedy is copy**, not a resolver: say that the
value arrives from the visitor's `_ga` cookie on the author's own site and is normally
mapped from an upstream step or webhook. Recorded here so this is a known accepted gap
rather than a surprise.

Secondary: `sendEvent.schema.ts`'s own comment calls `clientId` / `userId` sensitive
inputs, and the handler honors it (output is structural-only: `{success, eventName,
sentAt}`). But in the meta only `apiSecret` carries `sensitivity: "secret"` — `clientId`
and `userId` carry **no** sensitivity marker despite being device/person identifiers.

### W-6 — `slack:*.fileId` descriptions name a trigger key that does not exist, and offer URL-scraping as the fallback

`download_file.fileId` / `get_file_info.fileId` both say *"Source from the file_uploaded
trigger payload…"* — but the trigger's payload key is **`file_id`** (snake_case), not
`fileId` (`fileUploaded.meta.ts:52`). The trigger meta's own docblock says it pinned
snake_case *"so workflow authors mapping `{{trigger.file_id}}` get the right path on the
first try"* — and then neither consuming action names the key. The `slack:upload_file` →
`fileId` path **is** real and correct.

The third offered path — *"a Slack file URL's `F…` segment"* — is builder copy
instructing an ordinary user to hand-extract an internal identifier out of a URL. There
is no `slack:files` resolver (`integrations/slack/options/` has only `channels`,
`channelsArchived`, `groupDms`, `users`). Classification (dynamic upstream value) still
holds — the real path is `{{trigger.file_id}}` or the upload step's output — but the copy
points at a key that isn't there and then suggests URL surgery.

### W-7 — `microsoft-powerbi:add_workspace_user` / `update_workspace_user`.principalIdentifier — the closest thing to a static resource in the set, saved only by the token audience

An Entra security group / service principal **is** a static discoverable resource in the
abstract. The **only** reason this is not DEFECT-2 is a structural auth fact, and the
reader should see it stated plainly rather than take "provider can't list it" on faith.

**Verified in `integrations/microsoft-powerbi/oauth.ts` (module docblock, lines ~19-24):**
Power BI's scopes are Power BI Service resource scopes
(`https://analysis.windows.net/powerbi/api/…`), **not** Graph scopes — *"the access
token's audience is the Power BI API and it CANNOT call Graph `/me`."* The provider does
not even resolve its own account id via Graph; it decodes the OIDC `id_token` instead,
precisely because Graph is unreachable on this token. **So this integration structurally
cannot call Graph `/users` or `/groups` to enumerate principals.** Backing this field
would require a second, separately-consented Graph token — a new auth surface, not a
resolver.

Mitigating design (verified): the **User** path never needs an object id. `AddWorkspaceUserConfigSchema`'s
`superRefine` requires `principalEmail` (email/UPN) when `principalType === "User"`, and
the handler sends `emailAddress` for users and `identifier` only for Group/App — never
both (`addWorkspaceUser.ts:36-43`). The meta scopes `principalIdentifier` with
`visibleWhen: { field: "principalType", valueIn: ["Group", "App"] }`, so the ordinary
"grant a colleague access" path **never sees an object-id box at all**. The residue is
Group/App grants — an admin-shaped task where the operator plausibly has the object id.
That is why it is a conditional option and not a defect.

`add_or_update_pipeline_user.principalIdentifier` differs and is *better* on the common
path: one field, `"Email/UPN for a user; Azure AD object id for a group or app."`,
placeholder `"user@contoso.com or object id"`. A user is addressed by email — understandable.

### W-8 — `microsoft-onenote:update_page.target` oversells its upstream source

**Read-only note — `integrations/microsoft-onenote/` is another session's in-flight work
and was not touched.** The description says the value is *"a data-id value from an earlier
Get Page Content step with Include element IDs turned on."* `get_page_content` exists and
the flag is real (**`includeIDs`**, boolean, `defaultValue: false`, `advanced: true`) —
but its **only** output is **`content`**: a single raw HTML string marked `sensitive: true`.
There is **no structured element-id list output**, so the `data-id` values are embedded in
an HTML blob the author must eyeball and hand-copy. The chain is conceptually real but
**not a wired path**. Classification (dynamic upstream value, conditional on
`updateMode: "insert"`) stands; the copy describes a path the builder cannot actually walk.

> **Out of scope, routed not fixed:** while reading that folder a subagent flagged an
> apparent bug in `pageContentGet.ts` — the `preGenerated` input appears to set the query
> param `preAuthenticated` (a *different* Graph parameter), which would make the meta's
> "use cached HTML" toggle a no-op. **Not verified further and not touched** — it belongs
> to the in-flight OneNote session. Flagging it so it isn't lost.

---

## OWNER ACTION REQUIRED

Both items are **owner/dashboard steps this pass cannot perform in code**, and both were
verified in the working tree.

### OA-1 — Shopify `read_locations` must be added to the Partner dashboard app config

- **Verified:** `integrations/shopify/manifest.ts` now declares `scopes.optional:
  ["read_locations"]` (RESOLVERS-2); the 11 `scopes.required` entries are unchanged.
- **Owner action:** **`read_locations` must be added to the Shopify Partner dashboard app
  configuration before consent can include it.** Until that is done, the widened scope is
  requested by the app but cannot be granted, and the `shopify:locations` picker cannot
  work for anyone.
- **Merchant action:** merchants who connected **before** this change hold tokens minted
  without `read_locations`. They must **reconnect — for the locations picker only.**
  Everything else on the Shopify integration keeps working untouched.
- **Failure mode is designed, not silent** (verified in `integrations/shopify/options/locations.ts`):
  a pre-change token gets HTTP 403 → `InsufficientScopeError` (mapped in
  `_shared/shopify/api/_request.ts`) → `PROVIDER_REAUTH_REQUIRED` → the client renders a
  **Reconnect prompt**, not a broken empty dropdown. Manual entry keeps `location_id`
  usable meanwhile. Shopify tokens are non-refreshable (`refreshable: false`), so a
  refresh could never have granted it either — re-consent is the only path.
- **Why optional, not required:** no action handler needs `read_locations`
  (`update_inventory` only writes against a location id it is handed). Making it required
  would force **every** existing Shopify merchant to reconnect just to gain a picker.
  Follows the `MailboxSettings.Read` precedent (OA-2).

### OA-2 — Microsoft Outlook `MailboxSettings.Read` requires existing connections to reconnect

- **Verified:** `integrations/microsoft-outlook/manifest.ts` declares `MailboxSettings.Read`
  under `scopes.optional` (RESOLVERS-1). `scopes.required` remains `offline_access`,
  `Mail.Send`, `Mail.Read`, `Mail.ReadWrite`.
- **Needed by:** only the `microsoft-outlook:categories` resolver
  (Graph `GET /me/outlook/masterCategories`), which backs the category picker on
  `add_categories.categories`. **No action handler needs it.**
- **User action:** **existing connections predate this scope and must reconnect** to get
  the category picker. Same designed failure mode: 403 → `InsufficientScopeError` →
  `PROVIDER_REAUTH_REQUIRED` → Reconnect prompt. Manual entry keeps the field usable, and
  typed category names Graph doesn't know yet are **also valid** (Graph auto-creates them
  on the message with a default color) — so the manual path is genuinely equivalent here,
  not a degraded stand-in.
- **Tenant note:** an IT-restricted tenant that declines the optional scope loses only the
  picker. That is why it is optional.

---

## THE LEDGER — all 69 rows

Column notes. **Discovery supported?** = could the provider enumerate this value for a
picker, on the token this integration actually holds. **Test evidence** = tests that
exist in the tree; **none were run in this pass, and none are live** — the file names are
citations, not a green run. **Status** = `justified` unless stated.

### Static provider resource — 1 (DEFECT)

| Provider | Node | Field | Runtime meaning | Current field renderer | optionsSource (if any) | Discovery supported? | Normal path | Advanced fallback | Justification for any remaining plain text input | Test evidence | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| mailchimp | link_clicked (trigger) | url | Exact `===` match vs Mailchimp's verbatim `urls_clicked[].url` for the campaign — a provider-owned tracked-link string, not the author's URL (`triggers/linkClicked/poll.ts` → `urlFilter`) | **text (Setup)** | **none** | **YES — `GET /reports/{campaign_id}/click-details`, already wrapped as `reportClickDetails()` (`_shared/mailchimp/api/reports.ts:171`) and already called by this trigger's own poll loop every tick. Parent `campaignId` already has `mailchimp:campaigns`. No scope needed.** | **selector (`mailchimp:links`, dependsOn campaignId) — NOT BUILT** | typed URL (would remain, for the campaign-less case) | **NONE. There is no acceptable justification. Every precondition — wrapper, parent resolver, account-wide token — is already shipped; the picker was simply not wired. Strict `===` with no normalization makes a hand-typed URL a silent-never-fires failure, so the picker matters more here than on a typical field.** | `tests/unit/integrations/mailchimp/triggers/linkClicked/`, `tests/unit/integrations/mailchimp/options/campaigns.test.ts`. **No test exists that could catch this** — `option-source-reference-integrity` only proves referenced ⊆ registered. | **DEFECT — reported, not implemented** |

### Dynamic upstream value — 33

Upstream mapping is the primary path. A picker is either impossible or actively harmful
(pinning a literal transactional id into a repeating workflow is an authoring error, not
a convenience).

| Provider | Node | Field | Runtime meaning | Current field renderer | optionsSource (if any) | Discovery supported? | Normal path | Advanced fallback | Justification for any remaining plain text input | Test evidence | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| gmail | reply_to_email | originalMessageId | Path segment of `GET /messages/{id}?format=metadata` to derive To/Subject/In-Reply-To/References/threadId (`replyToEmail.ts:42-51`) | text (Setup, req) | none | Yes (`users.messages.list`) — deliberately not | upstream mapping — **`{{trigger.id}}`** (new_email / new_labeled_email) or `search_emails.messages[].messageId` | typed id | The email being replied to is chosen by the run, not the author. A picker would list messages at author time — the wrong model entirely; the message won't exist yet when the workflow runs. **See W-2: the copy doesn't name the key, and the payload's `messageId` is a decoy.** | `tests/unit/integrations/gmail/` | justified (copy fix W-2) |
| gmail | create_draft_reply | originalMessageId | Same as above (`createDraftReply.ts:47-56`) | text (Setup, req) | none | Yes — deliberately not | same | typed id | Same. | `tests/unit/integrations/gmail/` | justified (copy fix W-2) |
| gmail | get_attachment | messageId | Path segment of `GET /messages/{id}?format=full`, then `/messages/{id}/attachments/{attachmentId}` (`getAttachment.ts:63-105`) | text (Setup, req) | none | Yes — deliberately not | `{{trigger.id}}` from new_attachment | typed id | Runtime message. Same argument. | `tests/unit/integrations/gmail/` | justified |
| gmail | get_attachment | attachmentId | **Not used for the fetch.** Matched against a fresh `extractAttachmentMetadata` list; falls back to the sole attachment; bytes fetched via `target.attachmentId` (`getAttachment.ts:76-104`) | text (Setup, req) | none | **No** — attachment ids exist only inside a message payload, and the handler's own comment states they are **not stable across `messages.get` calls** | upstream mapping — `payload.attachments[i].attachmentId` | typed id | No standalone listing exists; the id is meaningless outside its parent message. **Caveat on the record:** the description advertises the trigger's `attachmentId`, which the handler documents as stale by run time — it survives only via the single-attachment fallback. A multi-attachment message + trigger-supplied id throws "Gmail attachment not found". Classification unaffected; the copy overstates. | `tests/unit/integrations/gmail/` | justified (copy caveat) |
| gmail | add_label | messageId | Path segment of `POST /messages/{id}/modify`, body `addLabelIds` (`addLabel.ts:41`) | text (Setup, req) | none | Yes — deliberately not | `{{trigger.id}}` / search result | typed id | Runtime message. Sibling `labelIds` **is** a picker (`gmail:labels`) — the resolver-able half of this node is already resolved. | `tests/unit/integrations/gmail/` | justified |
| gmail | remove_label | messageId | `POST /messages/{id}/modify`, body `removeLabelIds` (`removeLabel.ts:31`) | text (Setup, req) | none | Yes — deliberately not | same | typed id | Same. | `tests/unit/integrations/gmail/` | justified |
| gmail | mark_as_read | messageId | `POST /messages/{id}/modify` with hardcoded `removeLabelIds: ["UNREAD"]` (`markAsRead.ts:30`) | text (Setup, req) | none | Yes — deliberately not | `{{trigger.id}}` | typed id | Runtime message. **Description is bare — no upstream guidance at all (W-2).** | `tests/unit/integrations/gmail/` | justified (copy fix W-2) |
| gmail | mark_as_unread | messageId | `/modify` with `addLabelIds: ["UNREAD"]` (`markAsUnread.ts:25`) | text (Setup, req) | none | Yes — deliberately not | `{{trigger.id}}` | typed id | Same — bare description (W-2). | `tests/unit/integrations/gmail/` | justified (copy fix W-2) |
| gmail | archive_email | messageId | `/modify` with `removeLabelIds: ["INBOX"]` (`archiveEmail.ts:29`) | text (Setup, req) | none | Yes — deliberately not | `{{trigger.id}}` | typed id | Same — bare description (W-2). | `tests/unit/integrations/gmail/` | justified (copy fix W-2) |
| gmail | delete_email | messageId | `POST /messages/{id}/trash` or `DELETE /messages/{id}` per required `deleteMode` (`deleteEmail.ts:41,63`) | text (Setup, req) | none | Yes — deliberately not | `{{trigger.id}}` | typed id | Same — bare description (W-2). Destructive; pinning a literal id would be worse than useless. | `tests/unit/integrations/gmail/` | justified (copy fix W-2) |
| microsoft-outlook | reply_to_email | emailId | Path segment of `POST /me/messages/{id}/reply` \| `/replyAll` per required `replyAll` (`replyMessage.ts:40-43`) | text (Setup, req) | none | Yes — deliberately not | **`{{trigger.messageId}}`** (all 3 Outlook triggers emit `messageId` = Graph id) | typed id | Runtime message. **W-3: description cites a "search" action that does not exist.** | `tests/unit/integrations/microsoft-outlook/` | justified (copy fix W-3) |
| microsoft-outlook | forward_email | emailId | `POST /me/messages/{id}/forward` (`forwardEmail.ts:63`) | text (Setup, req) | none | Yes — deliberately not | `{{trigger.messageId}}` | typed id | Runtime message. | `tests/unit/integrations/microsoft-outlook/` | justified |
| microsoft-outlook | get_attachment | emailId | `GET /me/messages/{id}/attachments`, then per-attachment fetch (`getAttachment.ts:86,127`) | text (Setup, req) | none | Yes — deliberately not | `{{trigger.messageId}}` | typed id | Runtime message. **W-3: "upstream search" is phantom.** | `tests/unit/integrations/microsoft-outlook/` | justified (copy fix W-3) |
| microsoft-outlook | add_categories | emailId | `PATCH /me/messages/{id}` body `{categories:[…]}` — PATCH-**replace** (`addCategories.ts:63`) | text (Setup, req) | none | Yes — deliberately not | `{{trigger.messageId}}` | typed id | Runtime message. Sibling `categories` **is** a picker (`microsoft-outlook:categories`, OA-2) — the message id is the only unpicked field on this node, correctly. | `tests/unit/integrations/microsoft-outlook/` | justified |
| microsoft-outlook | move_email | emailId | `POST /me/messages/{id}/move` body `{destinationId}` (`moveEmail.ts:46`) | text (Setup, req) | none | Yes — deliberately not | `{{trigger.messageId}}` | typed id | Runtime message. Sibling `destinationFolderId` **is** a picker (`microsoft-outlook:folders`). Note Graph **re-keys on move** — the action returns a new `newId`, reinforcing that message ids are run-scoped, not author-scoped. | `tests/unit/integrations/microsoft-outlook/` | justified |
| microsoft-outlook | delete_email | emailId | `DELETE /me/messages/{id}` or `/move` → `deleteditems` per `deleteMode` (`deleteEmail.ts:47,57`) | text (Setup, req) | none | Yes — deliberately not | `{{trigger.messageId}}` | typed id | Runtime message; destructive. | `tests/unit/integrations/microsoft-outlook/` | justified |
| microsoft-teams | reply_to_channel_message | messageId | Path segment of `POST /teams/{t}/channels/{c}/messages/{id}/replies` | text (Setup, req) | none | Yes (`GET /teams/{t}/channels/{c}/messages`) — resolver **explicitly DEFERRED** at `services/options/_registry.ts:565-566` | **`{{trigger.messageId}}`** — verified: `newChannelMessage/normalize.ts` emits `payload.messageId = message.id`, declared in payloadShape | typed id | Replying to a message chosen at author time is nearly always an authoring error — the message you reply to is the one that just arrived. The claimed trigger path is **exact and real**. Siblings `teamId`/`channelId` are pickers. Latent gap: `list_channel_messages` outputs `messages[]` keyed `id` with **no declared `fields:`**, so the only non-trigger source isn't reachable in the variable picker — the meta doesn't claim it, so no false claim. | `tests/unit/integrations/microsoft-teams/` | justified (deferral documented) |
| slack | download_file | fileId | Form-encoded body param `file` on `files.info` (`api/filesInfo.ts:62`), then bytes from `url_private_download` | text (Setup, req) | none | Yes (`files.list`) — no resolver exists | upstream — **`{{trigger.file_id}}`** or `upload_file.fileId` | typed id | Schema pins `/^F[A-Z0-9]+$/`. The file is produced by the run. **W-6: description says "file_uploaded trigger payload" but the key is `file_id`, not `fileId`, and it offers URL-scraping as a fallback.** | `tests/unit/integrations/slack/` | justified (copy fix W-6) |
| slack | get_file_info | fileId | Same `files.info` call, projects metadata | text (Setup, req) | none | Yes — no resolver exists | same | typed id | Same. | `tests/unit/integrations/slack/` | justified (copy fix W-6) |
| slack | cancel_scheduled_message | scheduledMessageId | JSON body `scheduled_message_id` on `chat.deleteScheduledMessage` (`api/chatDeleteScheduledMessage.ts:32`) | text (Setup, req) | none | Yes (`chat.scheduledMessages.list`) — deliberately not | upstream — `schedule_message.scheduledMessageId` (**verified: that action outputs exactly this key**) | typed id | You can only cancel something this workflow scheduled; the id doesn't exist until the run creates it. A picker is logically impossible at author time. Sibling `channel` is a picker. Cosmetic drift: `list_scheduled_messages` outputs raw rows keyed `id` inside a `sensitive: true` array, so it isn't a usable second source. | `tests/unit/integrations/slack/` | justified |
| typeform | get_response | responseToken | Query param `included_response_ids` on `GET /forms/{id}/responses` (Typeform has no GET-one); re-matched on `i.token` | text (Setup, req) | none | Yes (per-form responses list) — deliberately not | `{{trigger.responseToken}}` — **verified exact in both directions** | typed token | **The cleanest row in the sweep.** `new_response_in_form` payloadShape declares exactly `responseToken`; `list_responses` outputs `responses[]` with a declared subfield named exactly `responseToken` (under `fields:`, so the picker reaches it). Placeholder already reads "Map the trigger's responseToken here". Sibling `formId` is a picker. A response is created by the run — nothing to pick at author time. | `tests/unit/integrations/typeform/` | justified |
| notion | create_comment | discussionId | JSON body `discussion_id` on comments create; schema `.refine`s exactly-one-of pageId/discussionId | text (Setup, opt) | none | **No** — Notion exposes no discussion listing (comments are per-page only) | upstream — a previous `create_comment.discussionId` output | typed id | **Verified the self-reference closes:** `mapNotionComment()` returns `discussionId: c.discussion_id ?? null` and the meta declares an output named exactly `discussionId`; `list_comments` reuses the same mapper. XOR with `pageId` (which **is** a picker, `notion:pages`) is enforced at runtime, documented in the description because FieldMeta can't express cross-field invariants. | `tests/unit/integrations/notion/` | justified |
| stripe | find_customer | email | `GET /v1/customers?email=…&limit=1`, takes `data[0]`; empty → `{found:false}` (`findCustomer.ts:87`) | text (Setup, opt) | none | n/a — it's a lookup key, not a resource ref | mapped from a trigger/form, or typed | typed email | **XOR** with `customerId` (`findCustomer.schema.ts:26`) — exactly one required, so "optional" is misleading in isolation. The whole point of find-by-email is that you have an email and not an id; the id branch already has the `stripe:customers` picker. Marked `sensitivity: "recipient"`. | `tests/unit/integrations/stripe/actions/` | justified |
| stripe | confirm_payment_intent | paymentIntentId | Path segment of `POST /v1/payment_intents/{id}/confirm` (`api/paymentIntents.ts:109`) | text (Setup, req) | none | Stripe exposes `GET /v1/payment_intents`, but **no `paymentIntentsList` wrapper exists** (`api/paymentIntents.ts` has only create/get/confirm/capture) | upstream — `{{stripe:create_payment_intent.paymentIntentId}}` | typed `pi_xxx` | PaymentIntents are transactional runtime objects. `riskLevel: high`, `requiresConfirmation: true`, money-moving: pinning a literal `pi_` into a **repeating** workflow means every run confirms the same intent — semantically wrong as automation. **See W-4 for the dead "select a payment intent" copy this creates.** | `tests/unit/integrations/stripe/actions/` | justified |
| stripe | capture_payment_intent | paymentIntentId | Path segment of `POST /v1/payment_intents/{id}/capture` | text (Setup, req) | none | Same — no wrapper | upstream mapping | typed `pi_xxx` | Strongest of the four: the meta requires the intent already be in **`requires_capture`** (created with `capture_method: manual` and confirmed). That state is transient and unknowable at author time — a picker would list intents whose state has already moved on by the time the workflow runs. | `tests/unit/integrations/stripe/actions/` | justified |
| stripe | create_refund | paymentIntentId | Stripe body param **`payment_intent`** on `POST /v1/refunds` (`createRefund.ts:48`) | text (Setup, opt) | none | Same — no wrapper | upstream mapping | typed `pi_xxx` | **Thinnest justification in the sweep — see W-4.** XOR sibling `chargeId` got the `stripe:charges` picker in this same slice, justified on a one-off-operator framing that applies equally here. Justified on balance (automation should map, not pin), but the inconsistency is real and recorded. | `tests/unit/integrations/stripe/actions/`, `tests/unit/integrations/stripe/options/paymentMethodsAndCharges.test.ts` | justified — **weak, see W-4** |
| stripe | find_payment_intent | paymentIntentId | `GET /v1/payment_intents/{id}`; 404 → `{found:false}` | text (Setup, req) | none | Same — no wrapper | `{{stripe:create_payment_intent.paymentIntentId}}` or the webhook trigger | typed `pi_xxx` | Read-only lookup of a runtime object. **Honest caveat:** the meta says "or a Stripe webhook trigger payload", and `stripe:event_received` does **not** emit a `paymentIntentId` key — its payload is `{stripeEventType, data, previousAttributes, created, livemode, account, apiVersion, request}`. The id is reachable only as `{{trigger.payload.data.id}}`, drilling into an opaque `sensitive` object with no declared nested `fields:`, whose shape varies per `stripeEventType`. The value is present; a labeled variable is not. | `tests/unit/integrations/stripe/actions/` | justified (copy caveat) |
| stripe | create_checkout_session | customerEmail | Stripe `customer_email` (`createCheckoutSession.ts:78`) | text (Setup, opt) | none | n/a — recipient data | mapped from the trigger/order | typed email | **Mutex** with `customer` (not XOR — both may be omitted; Stripe then creates a guest customer). The buyer's email is per-run data. `sensitivity: "recipient"`. | `tests/unit/integrations/stripe/actions/` | justified |
| shopify | create_fulfillment | tracking_url | Into `tracking_info: {number, company, url}` — built **only if** at least one of tracking_number/company/url is set; two-step `GET /orders/{id}/fulfillment_orders.json` → `POST /fulfillments.json` | text (Setup, opt) | none | **No** — a carrier tracking URL is not a Shopify resource | mapped from the shipping/label step | typed URL | Per-shipment value that cannot exist before the run. Schema enforces `z.string().url()`. Siblings `tracking_number`/`tracking_company` exist; Shopify may itself derive a URL from a recognized company+number, but **our code neither relies on nor implements that** — it passes through exactly what the merchant supplies. | `tests/unit/integrations/shopify/actions/` | justified |
| shopify | update_inventory | inventory_item_id | `inventory_item_id` on `/inventory_levels/set.json` \| `/adjust.json` (`updateInventory.ts:42,58`) | text (Setup, req) | none | **No.** `/inventory_items.json` **requires** an `ids=` filter obtainable only from variants you already hold — there is no standalone listing | upstream — `{{step.inventoryItemId}}` | typed id | **Verified sound.** An inventory item is a variant's invisible inventory record: no name, no SKU of its own, no merchant-facing identity anywhere in the Shopify admin. A picker could only show the **parent variant's** label — i.e. `shopify:variants` wearing a different id — which would **silently mis-target** if a merchant picked the variant they wanted while the field expects the inventory item. Sibling `location_id` **is** a picker (`shopify:locations`, OA-1); the two ids diverge deliberately and the meta documents why. **But see W-1: the copy claims Create Product Variant emits `inventoryItemId`, and it does not.** | `tests/unit/integrations/shopify/actions/`, `tests/e2e/slice-12-shopify-walkthrough.spec.ts` | justified — **copy inaccurate, see W-1** |
| google-analytics | send_event | clientId | GA4 Measurement Protocol body `client_id` (`_shared/google/api/analytics/measurementProtocolCollect.ts:38`) | text (**Setup, required**) | none | **No — structurally impossible.** `client_id` is minted browser-side by gtag.js into the visitor's `_ga` cookie. No GA Admin/Data API enumerates client ids | upstream/webhook from the author's own site | typed value | **No picker is possible; this is not a resolver gap.** GA's 5 registered resolvers could never back it. **W-5: required, non-advanced, un-resolvable, and the description gives no sourcing hint — a known accepted gap whose remedy is copy, not a resolver.** | `tests/unit/integrations/google-analytics/` | justified — **gap acknowledged, W-5** |
| google-analytics | send_event | userId | GA4 `user_id`, set only when defined | text (**Advanced**, opt) | none | **No** — same reason | upstream mapping | typed value | Same impossibility; correctly Advanced (cross-device attribution is a power-user concern). W-5's sensitivity-marker note applies. | `tests/unit/integrations/google-analytics/` | justified |
| microsoft-onenote | update_page | target | `[{target, action, content}]` → `PATCH /me/onenote/pages/{id}/content`; non-insert modes hardcode `target: "body"` | text (Setup, req **when** `updateMode: "insert"`) | none | **No** — a CSS selector / `data-id` addresses HTML inside one page | a `data-id` from `get_page_content` (`includeIDs: true`), or a CSS selector the author writes | typed selector | Conditional via `visibleWhen: {field: "updateMode", valueIn: ["insert"]}`; schema `.superRefine` mirrors it. Not a provider resource — an in-document address. **W-8: the claimed upstream chain isn't wired — `get_page_content` emits only a raw HTML `content` blob, no element-id list.** *Read-only: another session's in-flight folder; not modified.* | `tests/unit/integrations/microsoft-onenote/` | justified (copy fix W-8) |
| quickbooks | create_customer | postalCode | *(classified as Fixed repeated value — see that section)* | — | — | — | — | — | — | — | — |

### Fixed repeated value — 14

Understandable business values an author configures once. No provider referent to list —
listing is not merely unavailable, it is **meaningless**.

| Provider | Node | Field | Runtime meaning | Current field renderer | optionsSource (if any) | Discovery supported? | Normal path | Advanced fallback | Justification for any remaining plain text input | Test evidence | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| hubspot | create_contact | company | **Free-text string** written into the flat `properties` map → `POST /crm/v3/objects/contacts`. **Verified NOT an id/association:** `_shared/hubspot/api/contacts.ts` contains no association code; `attachAssociations` is never imported by this handler | text (Setup, opt) | none | n/a — it is a text property, not a reference | typed once, or mapped | same field | **Exactly the trap Marcus named.** The name says "company"; the handler says `properties.company = "Acme Inc."`. To *associate* a real HubSpot company record you use a downstream association action — and the meta already says so ("NOT a HubSpot company id"). A company picker here would write a numeric id into a display-name field and corrupt the contact. Correct as text. | `tests/unit/integrations/hubspot/actions/` | justified |
| hubspot | update_contact | company | Same, via `PATCH /crm/v3/objects/contacts/{id}` (`contactsUpdate`) | text (Setup, opt) | none | n/a | typed / mapped | same field | Same. Meta says "(not a HubSpot company id)". | `tests/unit/integrations/hubspot/actions/` | justified |
| hubspot | create_product | hs_sku | HubSpot `hs_sku` property — free-form catalog SKU string | text (Setup, opt) | none | n/a — author-owned catalog data | typed once per product | same field | The author is **creating** the product; the SKU is their own value and cannot pre-exist in HubSpot. Nothing to list. | `tests/unit/integrations/hubspot/actions/` | justified |
| hubspot | update_product | hs_sku | Same property on update | text (Setup, opt) | none | n/a | typed | same field | Setting a new SKU value. Sibling `productId` **is** a picker (`hubspot:products`). | `tests/unit/integrations/hubspot/actions/` | justified |
| quickbooks | create_customer | postalCode | Nested by the handler into `billingAddress: {line1,line2,city,state,postalCode,country}` → `POST /v3/company/{realmId}/customer`. `z.string().max(30).optional()` | text (Setup, opt) | none | n/a — postal codes are not a QBO resource | typed, or mapped from a form/order | same field | Plain billing-address data on a customer being **created**; no QBO referent exists. Siblings `customerId`/`termId` on other nodes are pickers where a real referent exists. | `tests/unit/integrations/quickbooks/` | justified |
| shopify | create_product | sku | Free-text SKU on the default variant, straight into the variant body (`_shared/shopify/api/products.ts`) | text (Setup, opt) | none | n/a | typed | same field | **Verified: no lookup-by-sku exists anywhere** in `integrations/shopify/` or `_shared/shopify/`. The only *read* of sku is cosmetic (`options/variants.ts:86` renders it into a picker label). The author is creating the product. | `tests/unit/integrations/shopify/actions/` | justified |
| shopify | create_product_variant | sku | Free-text SKU on the new variant | text (Setup, opt) | none | n/a | typed | same field | Same — author-owned catalog string on a variant being created. | `tests/unit/integrations/shopify/actions/` | justified |
| shopify | create_product_variant | barcode | Free-text barcode (ISBN/UPC/GTIN) on the new variant | text (Setup, opt) | none | n/a — a GTIN is a global trade identifier, not a Shopify resource | typed | same field | Same. | `tests/unit/integrations/shopify/actions/` | justified |
| shopify | update_product_variant | sku | New SKU value on the variant | text (Setup, opt) | none | n/a | typed | same field | Setting a value, not selecting one. Sibling `variant_id` is the resource ref (tracked separately at §C-9). | `tests/unit/integrations/shopify/actions/` | justified |
| shopify | update_product_variant | barcode | New barcode value | text (Setup, opt) | none | n/a | typed | same field | Same. | `tests/unit/integrations/shopify/actions/` | justified |
| stripe | confirm_payment_intent | return_url | Stripe body `return_url` — where Stripe sends the customer back after 3DS / off-session redirect | text (Setup, opt) | none | **No — it is the author's own site**, Stripe has no listing of your URLs | typed once | same field | Required only when the intent uses redirect-flow methods (iDEAL, SOFORT). It is the merchant's own endpoint — set once, reused every run. `sensitivity: "recipient"`. | `tests/unit/integrations/stripe/actions/` | justified |
| stripe | create_checkout_session | successUrl | Stripe `success_url` (`createCheckoutSession.ts:70`) | text (**Setup, required**) | none | **No — the author's own site** | typed once | same field | Your own post-payment page. Required (Q11 — recipient-visible, no silent default). Stripe appends `?session_id={CHECKOUT_SESSION_ID}` if the literal placeholder is included — which is why it must stay author-authored text. `sensitivity: "recipient"`. | `tests/unit/integrations/stripe/actions/` | justified |
| stripe | create_checkout_session | cancelUrl | Stripe `cancel_url` (`createCheckoutSession.ts:71`) | text (**Setup, required**) | none | **No — the author's own site** | typed once | same field | Same. | `tests/unit/integrations/stripe/actions/` | justified |
| microsoft-powerbi | create_gateway_datasource | url | Into the **synthesized** `connectionDetails` JSON-in-string (`{server?, database?, url?}` — only provided keys), e.g. an OData/SharePoint/Web/File path | text (Setup, opt) | none | **No.** The Power BI gateway API has no endpoint that enumerates candidate data-source URLs — the URL names a **third-party system**, not a Power BI resource | typed once per datasource | same field | Schema `.superRefine` requires at least one of server/database/url. This is the address of the customer's own data source (their SharePoint site, their OData feed). Power BI cannot know it before you tell it — that is the entire point of registering a datasource. Note: the author never hand-writes the wire payload; the handler synthesizes `connectionDetails` from V2-shaped fields (rule 3). | `tests/unit/integrations/microsoft-powerbi/` | justified |

### Core user decision — 8

| Provider | Node | Field | Runtime meaning | Current field renderer | optionsSource (if any) | Discovery supported? | Normal path | Advanced fallback | Justification for any remaining plain text input | Test evidence | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| native | http_request | url | The endpoint to request. `parseUrlSafely` (`httpRequest.ts:177-189`) rejects any scheme but `http`/`https` → `UnsupportedUrlSchemeError` | text (Setup, req) | none | **No** — arbitrary external endpoint; there is no provider | typed | same field | This IS the action. `native` has no provider to list from. **Not an unguarded box:** `validateEgressDestination` runs **before** the fetch — pre-DNS hostname denylist (localhost, cloud-metadata names), IP-literal classification, and DNS resolution where **every** returned A/AAAA must pass (blocks RFC1918, loopback, CGNAT, link-local incl. `169.254.169.254`, multicast, reserved, IPv6 ULA/link-local, IPv4-mapped IPv6). **Fails closed** on DNS error/empty. `redirect: "manual"` closes the redirect bypass. Max 2048; required (Q11). Two residual gaps are self-flagged in code: DNS-rebinding TOCTOU (tracked as a SEC-3.x follow-up) and no user-configurable allowlist. | `tests/unit/integrations/native/` | justified |
| eden | read_content | url | `readCard({url, includeTranscript, workspaceId?})` — the public post URL to read | text (Setup, req) | none | **No** — an arbitrary public URL on YouTube/X/TikTok; Eden has no listing of the internet | typed / mapped | same field | The URL is the input to the action. Schema enforces `z.string().url()`. Claims no upstream source and implies none. (`includeTranscript` is required with no default — deliberate Q11, cost/behaviour-switching.) | `tests/unit/integrations/eden/` | justified |
| facebook | comment_on_post | attachmentUrl | Optional media URL attached to the comment (photo/video/link preview) | text (Setup, opt) | none | **No** — an external media URL | typed / mapped | same field | External asset the author supplies. Siblings `pageId`/`postId` **are** pickers (`facebook:pages`, `facebook:posts`) — the Facebook-owned refs on this node are already resolved; this one isn't Facebook's. | `tests/unit/integrations/facebook/` | justified |
| stripe | create_checkout_session | clientReferenceId | Stripe `client_reference_id` (1..200 chars), echoed back on `checkout.session.completed` | text (Setup, opt) | none | **No** — the author invents this value | typed / mapped from your own order id | same field | A **workflow-defined** correlation string for workflow ↔ external-system reconciliation. By definition it cannot pre-exist in Stripe; Stripe only stores and returns it. | `tests/unit/integrations/stripe/actions/` | justified |
| hubspot | create_line_item | name | Free-text line-item label written to the `name` property | text (Setup, opt) | none | n/a — a label for a one-off line item, not a product reference | typed | same field | **Correction to the record:** there is **no schema refinement** — `CreateLineItemConfigSchema` is a plain `.strict()` object with both fields optional; the "at least one of `hs_product_id` / `name`" check is **handler-side** (`createLineItem.ts:26-30`, throws before any API call), and both docblocks say so. The **product** branch is already a picker: `hs_product_id` has `optionsSource: "hubspot:products"` (combobox + `allowManualEntry`, resolver `integrations/hubspot/options/records.ts:171`). `name` is the deliberate **non-catalog** branch — an ad-hoc line ("Custom onboarding fee") with no product record to point at. A picker here would defeat the branch's purpose. | `tests/unit/integrations/hubspot/actions/` | justified |
| microsoft-powerbi | add_or_update_pipeline_user | principalIdentifier | `identifier` on the pipeline add-or-update call — **email/UPN for a user**, object id for a group/app | text (Setup, req) | none | **No — structurally impossible on this token.** Verified in `integrations/microsoft-powerbi/oauth.ts`: the token's audience is `https://analysis.windows.net/powerbi/api`, **not** Graph — *"it CANNOT call Graph `/me`"*. The provider decodes the OIDC `id_token` for its own account id precisely because Graph is unreachable. So Graph `/users` / `/groups` cannot be called to list principals | typed email/UPN for the common case | same field | **Best of the three principal fields on the common path.** Placeholder `"user@contoso.com or object id"` — an ordinary user grants a colleague access by typing their **email**, which is understandable and requires no provider-internal knowledge. Only Group/App grants need an object id, and that is an admin-shaped task. Backing this would require a **second, separately-consented Graph token** — a new auth surface, not a resolver. See W-7. | `tests/unit/integrations/microsoft-powerbi/` | justified |
| microsoft-powerbi | create_gateway_datasource | key | The **third-party data source's** API key. `[{name:"key", value}]` → `encryptGatewayCredentials()` **RSA-OAEP against the gateway's live public key inside the handler**, before anything leaves the app | text (**Setup**, opt — required when `credentialType: "Key"`), `sensitivity: "secret"`, `visibleWhen: {credentialType: ["Key"]}` | none | **No — and listing it would be a security incident.** This is not a Power BI resource at all: it is the credential for the customer's Oracle/ODBC/Web endpoint. Power BI never had it and cannot return it | paste once | same field | Secret credential material for a **non-Power-BI** system. Follows the `apiSecret` precedent (§F-1): paste-only, never read back. **Verified never echoed:** handler output is a fixed key set `{datasourceId, gatewayId, datasourceName}` — no credential material in outputs or errors. Flows: `gatewayGet` (fetch current RSA public key) → encrypt in-app → POST with `encryptedConnection: "Encrypted"`, `encryptionAlgorithm: "RSA-OAEP"` (the documented on-premises requirement — plaintext to an on-prem gateway is not possible). | `tests/unit/integrations/microsoft-powerbi/` | justified |
| microsoft-powerbi | update_gateway_datasource_credentials | key | Same, on the credentials-update path | text (**Setup**, opt — required when `credentialType: "Key"`), `sensitivity: "secret"`, `visibleWhen: {credentialType: ["Key"]}` | none | **No** — same | paste once | same field | Same. | `tests/unit/integrations/microsoft-powerbi/` | justified |

### Advanced control — 6

Opaque pagination cursors. All **already `advanced: true`** — they render on the Advanced
tab and never count toward setup-needed. Rule 9: single-page-by-default, author composes
the loop.

| Provider | Node | Field | Runtime meaning | Current field renderer | optionsSource (if any) | Discovery supported? | Normal path | Advanced fallback | Justification for any remaining plain text input | Test evidence | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| gmail | search_emails | pageToken | `?pageToken=` on `GET /users/me/messages` (`usersMessagesList.ts:91-93`); handler does **not** auto-loop | text (**Advanced**, opt) | none | n/a | self-referential — the same action outputs **`nextPageToken`** + `hasMore` (`searchEmails.ts:80-84`) | same field | An opaque provider cursor with no meaning outside the immediately-preceding response. **Verified: the named output exists on the same action.** Nothing to list; a picker is incoherent. Exactly what `advanced` is for. | `tests/unit/integrations/gmail/` | justified |
| google-calendar | list_events | pageToken | `url.searchParams.set("pageToken", …)` (`api/eventsList.ts:85`) | text (**Advanced**, opt) | none | n/a | same action outputs **`nextPageToken`** (+ `nextSyncToken`) | same field | Same. **Verified.** | `tests/unit/integrations/google-calendar/` | justified |
| google-drive | list_files | pageToken | `url.searchParams.set("pageToken", …)` (`api/filesList.ts:116`) | text (**Advanced**, opt) | none | n/a | same action outputs **`nextPageToken`** | same field | Same. **Verified.** | `tests/unit/integrations/google-drive/` | justified |
| google-drive | search_files | pageToken | Reuses `filesList` with `nameContains` (`searchFiles.ts:44`) → same `pageToken` param | text (**Advanced**, opt) | none | n/a | same action outputs **`nextPageToken`** | same field | Same. **Verified.** | `tests/unit/integrations/google-drive/` | justified |
| stripe | get_payments | startingAfter | Stripe `starting_after` on `GET /v1/charges` (`getPayments.ts:63`) | text (**Advanced**, opt) | none | n/a | `{{prev.nextCursor}}` | same field | Stripe pagination uses **last-result IDs** as cursors, not page numbers — so the value is a `ch_` id that only means "the one I just saw". **Mutex** with `endingBefore` (`getPayments.schema.ts:63`). Not a resource ref despite looking like one. | `tests/unit/integrations/stripe/actions/` | justified |
| stripe | get_payments | endingBefore | Stripe `ending_before` (`getPayments.ts:64`) | text (**Advanced**, opt) | none | n/a | prev-run output | same field | Same, walking backwards. Mutex with `startingAfter`. | `tests/unit/integrations/stripe/actions/` | justified |

### Conditional option — 4

| Provider | Node | Field | Runtime meaning | Current field renderer | optionsSource (if any) | Discovery supported? | Normal path | Advanced fallback | Justification for any remaining plain text input | Test evidence | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| hubspot | get_deals | filterValue | The RHS of a single **EQ** filter: `filters.push({propertyName: config.filterProperty, operator:"EQ", value: config.filterValue})` → `POST /crm/v3/objects/deals/search` (`getDeals.ts:38-44`) | text (Setup, opt), `visibleWhen: {field:"filterProperty", valueTruthy:true}` | none | **No — not for this field's actual domain.** Its value space is whatever the author's chosen `filterProperty` accepts, and `filterProperty` is a combobox on `hubspot:deal_properties` with `allowManualEntry: true` — **including custom portal properties**. No single resolver can enumerate the values of an arbitrary, possibly-custom property | choose a property, then type the value | same field | Genuinely conditional: the field is meaningless until `filterProperty` is set (hence the `visibleWhen`), and its domain is decided by that choice. Both halves must be present for the filter to apply. **Honest wart, recorded rather than hidden:** the description tells the author to *"copy it from the Deal stage picker on Create Deal"* — i.e. go read an id off another node. That is real friction for the `dealstage`/`pipeline` special case, where a `visibleWhen`-scoped dependent picker **would** be possible (`hubspot:deal_stages` exists). It is not a defect — no picker can serve the general arbitrary-property case, and the field must stay typed for it — but the special case is a legitimate future improvement, not a closed question. | `tests/unit/integrations/hubspot/actions/` | justified — special case noted |
| hubspot | get_tickets | filterValue | Same against `/tickets/search`; `filterProperty` is a combobox on `hubspot:ticket_properties` | text (Setup, opt), `visibleWhen: {field:"filterProperty", valueTruthy:true}` | none | **No** — same reasoning | same | same field | Same, incl. the same "copy it from the Stage picker on Create Ticket" friction (`hubspot:ticket_stages` exists). | `tests/unit/integrations/hubspot/actions/` | justified — special case noted |
| microsoft-powerbi | add_workspace_user | principalIdentifier | `identifier` on `POST /groups/{workspaceId}/users` — **Entra object id, Group/App only.** Handler sends `emailAddress` for User and `identifier` for Group/App, **never both** (`addWorkspaceUser.ts:36-43`) | text (Setup, opt), `sensitivity: "recipient"`, **`visibleWhen: {field:"principalType", valueIn:["Group","App"]}`** | none | **No — structurally impossible on this token** (Power BI API audience ≠ Graph; see W-7 and `oauth.ts`) | **User → the sibling `principalEmail` (email/UPN), enforced by `superRefine`.** Group/App → object id | same field | **The ordinary path never sees this field.** Granting a colleague access = pick `User`, type their email; `visibleWhen` hides the object-id box entirely. The residue is Group/App grants — an admin task where the operator plausibly holds the object id. Backing it needs a **second Graph token**, i.e. a new auth surface, not a resolver. Sibling `workspaceId` is a picker. **This is the closest call in the sweep — see W-7 for the full argument rather than taking "can't list it" on faith.** | `tests/unit/integrations/microsoft-powerbi/` | justified — **closest call, W-7** |
| microsoft-powerbi | update_workspace_user | principalIdentifier | Same on the update-role path | text (Setup, opt), `sensitivity: "recipient"`, **`visibleWhen: {field:"principalType", valueIn:["Group","App"]}`** | none | **No** — same | same | same field | Same. | `tests/unit/integrations/microsoft-powerbi/` | justified — **closest call, W-7** |

### Derived/defaulted value — 3

| Provider | Node | Field | Runtime meaning | Current field renderer | optionsSource (if any) | Discovery supported? | Normal path | Advanced fallback | Justification for any remaining plain text input | Test evidence | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| eden | create_scheduling_draft | idempotencyKey | Retry-dedup key forwarded into `content.idempotencyKey` (`_shared/eden/api/scheduling.ts:105`) | text (**Advanced**, opt) | none | **No** — the caller invents it; Eden only stores it | **leave empty** — the handler derives one | type your own key | **The "generated automatically" claim was verified in the handler, not taken on faith.** `createSchedulingDraft.ts`: `const idempotencyKey = config.idempotencyKey ?? \`eden:${input.runId}:${input.nodeId}\`;` then passed **unconditionally** (never optional-spread). Schema: `.string().min(1).max(200).optional()`. **No defect.** Precision note for a careful reader: the derived key is `runId:nodeId`-scoped, so it dedupes **retries within a run** — a fresh run mints a new key and posts again. The description's own "a stable **per-run** key" is accurate, but a reader skimming the first sentence may over-read the guarantee. | `tests/unit/integrations/eden/` | justified |
| eden | schedule_post | idempotencyKey | Same (`schedulePost.ts`; fields from the shared `edenContentFields()`) | text (**Advanced**, opt) | none | **No** | leave empty | type your own | Same — verified identical line. | `tests/unit/integrations/eden/` | justified |
| eden | publish_post_now | idempotencyKey | Same (`publishPostNow.ts`) | text (**Advanced**, opt) | none | **No** | leave empty | type your own | Same — verified identical line. | `tests/unit/integrations/eden/` | justified |

---

## What this sweep proves — and what it does not

**Proves:** of 69 free-text fields that could accept a provider-internal value, **68 are
defensible against the code**, and **1 is not** (DEFECT-1, `mailchimp:link_clicked.url`).
Every classification was made by reading the handler; the name-based reading would have
misclassified at least four rows in both directions (`hubspot company`,
`shopify inventory_item_id`, `powerbi key`, `stripe startingAfter`).

**Does not prove:**
1. **Nothing here is live-certified.** No connected provider test accounts exist in this
   environment. Every endpoint/scope/behavior claim is read from tracked source and
   published API contracts. **No provider in this document is live-verified.**
2. **No test was run in this pass.** The Test-evidence column cites files that exist, not
   a green run.
3. **The 68 justified rows are justified for the reasons stated, not because a check passed.**
   The only mechanical guard, `option-source-reference-integrity.test.ts`, proves
   *referenced ⊆ registered* and **structurally cannot** find a missing picker — it would
   never have caught DEFECT-1. This sweep is currently the only mechanism that finds one.
   A green test run is **not** evidence of config-UX completeness.
4. **Eight watch items (W-1…W-8) are open**, most of them shipped builder copy that names
   an upstream source that does not exist (`create_product_variant.inventoryItemId`,
   Outlook "search", Slack `fileId` vs `file_id`, OneNote `data-id`) or that is actively
   misleading (Gmail's `messageId` decoy). Classifications are unaffected; the copy is
   not. **None were fixed — this pass is documentation-only.**
5. **Two OWNER ACTIONS block shipped pickers** (OA-1 Shopify Partner-dashboard
   `read_locations`; OA-2 Outlook `MailboxSettings.Read` reconnect). Until OA-1 is done,
   the `shopify:locations` picker cannot work for anyone.

**Rows where the runtime meaning could not be determined from the code: none.** All 69
were resolved to a concrete API parameter, path segment, or body field. Where uncertainty
remains it is about *live provider behavior* (DEFECT-1 caveat 2 — whether `click-details`
returns a usable list for a fresh campaign), not about what our code does.
