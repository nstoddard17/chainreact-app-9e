# Gmail File Attachments Feature

## Overview

The Gmail send email action now supports file attachments. Users can upload files directly in the workflow configuration modal, and these files will be attached to emails sent through Gmail.

## Features

- **Drag & Drop Upload**: Users can drag and drop files directly into the upload area
- **Multiple Files**: Support for multiple file attachments (up to 5 files)
- **File Size Limits**: Individual files limited to 25MB (Gmail's attachment limit)
- **File Type Validation**: Supports common file types including documents, images, and archives
- **Temporary Storage**: Files are stored temporarily (24 hours) and automatically cleaned up
- **Secure Storage**: Files are stored in Supabase with user-based access control

## Supported File Types

- Documents: `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`, `.txt`, `.csv`
- Images: `.jpg`, `.jpeg`, `.png`, `.gif`
- Archives: `.zip`, `.rar`

## Architecture

### Frontend Components

1. **FileUpload Component** (`components/ui/file-upload.tsx`)
   - Handles drag & drop file uploads
   - Displays file previews and progress
   - Validates file sizes and types

2. **ConfigurationModal Updates** (`components/workflows/ConfigurationModal.tsx`)
   - Added support for "file" field type
   - Automatically stores uploaded files and gets file IDs
   - Handles upload errors gracefully

### Backend Components

1. **FileStorageService** (`lib/storage/fileStorage.ts`)
   - Manages file storage and retrieval
   - Handles file expiration and cleanup
   - Provides utilities for converting between File objects and stored references

2. **File Storage API** (`app/api/workflows/files/store/route.ts`)
   - REST endpoints for storing, retrieving, and deleting files
   - User authentication and authorization
   - File validation and error handling

3. **Gmail Integration** (`lib/workflows/executeNode.ts`)
   - Updated to handle stored file references
   - Creates proper MIME multipart messages with attachments
   - Converts stored files to email attachments

### Database Schema

**workflow_files** table:
- `id`: Unique file identifier
- `file_name`: Original filename  
- `file_type`: MIME type
- `file_size`: File size in bytes
- `file_path`: Storage path
- `user_id`: Owner's user ID
- `workflow_id`: Optional workflow association
- `created_at`: Upload timestamp
- `expires_at`: Expiration timestamp

## Usage

### For Users

1. **Adding Attachments**: In the Gmail send email configuration:
   - Click the "Attachments" field
   - Drag and drop files or click to browse
   - Files are automatically uploaded and validated
   - Preview attached files before saving

2. **File Limits**:
   - Maximum 5 files per email
   - Maximum 25MB per file
   - Files expire after 24 hours if unused

### For Developers

1. **Adding File Support to Other Actions**:
   ```typescript
   // In availableNodes.ts
   configSchema: [
     {
       name: "attachments",
       label: "Attachments", 
       type: "file",
       accept: ".pdf,.doc,.docx,.jpg,.png",
       maxSize: 25 * 1024 * 1024
     }
   ]
   ```

2. **Handling Files in Execution**:
   ```typescript
   const attachmentIds = config.attachments as string[]
   const files = await FileStorageService.getFilesFromReferences(attachmentIds, userId)
   ```

## API Endpoints

### Store Files
`POST /api/workflows/files/store`
- Upload files for workflow configuration
- Returns array of file IDs

### Get File Metadata  
`GET /api/workflows/files/store?fileIds=id1,id2`
- Retrieve metadata for stored files
- Returns file information without content

### Delete Files
`DELETE /api/workflows/files/store`
- Delete stored files by ID
- Cleans up both database records and storage

### Cleanup Expired Files
`GET /api/cron/cleanup-expired-files`
- Cron job endpoint for cleaning expired files
- Should be called daily via scheduled job

## Configuration

Required environment variables:
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `SUPABASE_SECRET_KEY`: Service role key for storage access
- `CRON_SECRET`: Optional secret for cron job authentication

## Security

- **Row Level Security**: Users can only access their own files
- **Storage Policies**: Supabase storage policies enforce user isolation
- **File Validation**: Server-side validation of file types and sizes
- **Temporary Storage**: Files automatically expire to prevent storage bloat
- **Authentication**: All file operations require user authentication

## Troubleshooting

### Common Issues

1. **Files not uploading**: Check Supabase storage bucket exists and policies are configured
2. **Large files failing**: Verify file size is under 25MB limit
3. **Expired files**: Files older than 24 hours are automatically deleted
4. **Permission errors**: Ensure user is authenticated and owns the files

### Database Setup

Run the migration script to create required tables and storage:
```sql
-- Execute db/migrations/create_workflow_files_table.sql
```

### Storage Bucket

The `workflow-files` bucket is automatically created, but can be manually created in Supabase dashboard if needed.

## Future Enhancements

- Support for cloud storage links (Google Drive, Dropbox)
- Virus scanning for uploaded files
- File preview in configuration modal
- Bulk file operations
- Attachment templates
- File encryption at rest 