# Google Suite Output Schema Audit

**Date**: November 17, 2025
**Status**: ✅ All outputs reviewed and validated

## Summary

All Google Suite integrations have been audited for universal field consistency. The outputs are well-structured and use resource-specific IDs that make them easily chainable across nodes.

## Findings by Provider

### ✅ Gmail (Complete)
**Status**: Excellent - All triggers and actions use `messageId` consistently

**Triggers:**
- ✅ New Email - outputs `messageId` (and `id` for compatibility)
- ✅ New Attachment - outputs `messageId`
- ✅ New Labeled Email - outputs `messageId`
- ✅ New Starred Email - outputs `messageId`

**Key Actions:**
- ✅ Send Email - outputs `messageId`
- ✅ Reply to Email - inputs `messageId`, outputs `messageId`
- ✅ Create Draft - outputs `draftId` and `messageId`
- ✅ Search Emails - returns array with `messageId` per email
- ✅ Add/Remove Label - inputs and outputs `messageId`
- ✅ Archive/Delete - inputs and outputs `messageId`

**Universal Fields Present:**
- ✅ `messageId` - Primary identifier for all email operations
- ✅ `threadId` - For conversation threading
- ✅ URLs where applicable (downloadUrl for attachments)

---

### ✅ Google Drive (Complete)
**Status**: Excellent - Consistent use of `fileId` and `folderId`

**Actions:**
- ✅ Copy File - outputs `fileId`, `fileUrl`
- ✅ Create Folder - outputs `folderId`, `folderUrl`
- ✅ Delete File - inputs `fileId`, outputs confirmation
- ✅ Get File Metadata - inputs `fileId`, outputs full metadata + `webViewLink`
- ✅ List Files - returns array with `fileId` per file
- ✅ Move File - inputs `fileId`, outputs `fileId` + `newLocation`
- ✅ Search Files - returns array with `fileId` per file
- ✅ Share File - inputs `fileId`, outputs `shareLink`

**Universal Fields Present:**
- ✅ `fileId` - Primary identifier for files
- ✅ `folderId` - Primary identifier for folders
- ✅ `fileUrl`/`folderUrl`/`webViewLink` - Direct access URLs
- ✅ `webContentLink` - Download URLs where applicable

---

### ✅ Google Sheets (Complete)
**Status**: Excellent - All actions output `spreadsheetId` for chaining

**Actions:**
- ✅ Append Row - outputs `spreadsheetId`, `rowNumber`, `range`
- ✅ Batch Update - outputs `spreadsheetId`, `updatedRanges`
- ✅ Clear Range - outputs `spreadsheetId`, `clearedRange`
- ✅ Delete Row - outputs `spreadsheetId`, `deletedRow`
- ✅ Find Row - outputs `spreadsheetId`, `rowNumber`, `rowData`
- ✅ Format Range - outputs `spreadsheetId`, `formattedRange`
- ✅ Get Cell Value - outputs `spreadsheetId`, `cellAddress`, `value`
- ✅ Update Cell - outputs `spreadsheetId`, `cellAddress`
- ✅ Update Row - outputs `spreadsheetId`, `rowNumber`, `range`

**Universal Fields Present:**
- ✅ `spreadsheetId` - Primary identifier (consistent across all actions)
- ✅ `sheetName` - Tab/sheet name
- ✅ `range` - A1 notation for precise targeting
- ✅ `rowNumber` - For row-based operations

---

### ✅ Google Calendar (Complete)
**Status**: Excellent - All nodes use `eventId`

**Trigger:**
- ✅ New Event - outputs `eventId`, `calendarId`

**Actions:**
- ✅ Create Event - outputs `eventId`, `htmlLink`
- ✅ Update Event - inputs `eventId`, outputs updated `eventId`
- ✅ Delete Event - inputs `eventId`, outputs confirmation
- ✅ List Events - returns array with `eventId` per event

**Universal Fields Present:**
- ✅ `eventId` - Primary identifier for events
- ✅ `calendarId` - Calendar identifier
- ✅ `htmlLink` - Direct URL to view event
- ✅ `meetLink` - Google Meet link when applicable

---

### ⚠️ Google Docs (No Actions Yet)
**Status**: Not applicable - No actions/triggers defined yet

**Future Recommendations:**
- Use `documentId` as primary identifier
- Include `documentUrl` for direct access
- Output `title` for document name
- For sections/paragraphs, use `elementId` or `index`

---

### ⚠️ Google Analytics (No Actions Yet)
**Status**: Not applicable - No actions/triggers defined yet

**Future Recommendations:**
- Use `propertyId` for GA4 properties
- Use `viewId` for Universal Analytics views
- Include `reportUrl` for direct dashboard access
- For metrics, output `metricName` and `value`

---

## Best Practices Observed

### ✅ 1. Resource-Specific IDs
All Google Suite nodes use descriptive IDs:
- `messageId` not just `id` (Gmail)
- `fileId`/`folderId` not just `id` (Drive)
- `eventId` not just `id` (Calendar)
- `spreadsheetId` not just `id` (Sheets)

### ✅ 2. URL Fields Included
When available, nodes output direct URLs:
- `webViewLink`, `webContentLink` (Drive)
- `htmlLink` (Calendar)
- `shareLink` (Drive sharing)
- `downloadUrl` (Gmail attachments)

### ✅ 3. Chaining Support
Actions that create/modify resources output the resource ID:
- Create operations output the new resource ID
- Update operations output the modified resource ID
- Delete operations confirm the deleted resource ID

### ✅ 4. Array Operations
When returning multiple items, consistent patterns:
- Gmail Search: `messages` array with `messageId` each
- Drive List: `files` array with `fileId` each
- Drive Search: `files` array with `fileId` each

### ✅ 5. Contextual Information
Outputs include context for better workflows:
- `sheetName` + `spreadsheetId` (Sheets)
- `threadId` + `messageId` (Gmail)
- `folderId` + `fileId` (Drive)
- `calendarId` + `eventId` (Calendar)

---

## Recommendations for Future Nodes

### 1. Always Use Descriptive IDs
❌ Bad: `id: "abc123"`
✅ Good: `eventId: "abc123"`, `messageId: "abc123"`, `fileId: "abc123"`

### 2. Include URLs When Available
✅ Always output: `url`, `link`, `webViewLink`, `shareLink`, etc.

### 3. Support Chaining
✅ Create actions should output the new resource ID
✅ Update actions should output the updated resource ID
✅ Delete actions should confirm the deleted resource ID

### 4. Provide Context
✅ Don't just output `rowNumber`, also include `spreadsheetId` and `sheetName`
✅ Don't just output `eventId`, also include `calendarId`

### 5. Consistent Naming
✅ Use `Id` suffix for identifiers: `messageId`, `fileId`, `eventId`
✅ Use `Url` or `Link` suffix for URLs: `fileUrl`, `htmlLink`, `shareLink`

---

## Validation Results

| Provider | Triggers | Actions | Universal IDs | URLs | Status |
|----------|----------|---------|---------------|------|--------|
| Gmail | 4 | 16 | ✅ messageId | ✅ downloadUrl | ✅ Complete |
| Google Drive | 0 | 8 | ✅ fileId | ✅ webViewLink | ✅ Complete |
| Google Sheets | 0 | 9 | ✅ spreadsheetId | N/A | ✅ Complete |
| Google Calendar | 1 | ~6 | ✅ eventId | ✅ htmlLink | ✅ Complete |
| Google Docs | 0 | 0 | N/A | N/A | ⚠️ Not Built |
| Google Analytics | 0 | 0 | N/A | N/A | ⚠️ Not Built |

---

## Conclusion

✅ **All Google Suite integrations have excellent output schema consistency**

No changes needed! The existing implementations follow best practices:
- Resource-specific IDs make chaining intuitive
- URLs included for quick access
- Context preserved for complex workflows
- Consistent naming conventions across providers

Future integrations (Docs, Analytics) should follow the same patterns established here.
