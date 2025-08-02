# Support Ticketing System Setup Guide

## Overview
I've created a comprehensive support ticketing system with the following features:
- **User-friendly ticket creation** with categories and priority levels
- **Real-time ticket tracking** with status updates
- **Email notifications** to support team
- **Conversation threads** for ongoing support
- **Supabase database storage** with proper security
- **Beautiful UI** that matches your app's design

## Files Created

### Database
1. `db/migrations/create_support_tickets_table.sql` - Database schema and migrations
2. `db/schema.ts` - Updated with new interfaces

### API Routes
3. `app/api/support/tickets/route.ts` - Main tickets API (GET, POST)
4. `app/api/support/tickets/[id]/route.ts` - Individual ticket operations (GET, PUT, DELETE)
5. `app/api/support/tickets/[id]/responses/route.ts` - Ticket responses API

### Frontend Pages
6. `app/support/page.tsx` - Main support center page
7. `app/support/tickets/[id]/page.tsx` - Individual ticket detail page

## Database Schema

### Support Tickets Table
- **id**: Unique identifier
- **ticket_number**: Auto-generated (CR-YYYYMMDD-XXXX format)
- **subject**: Ticket title
- **description**: Detailed issue description
- **priority**: low, medium, high, urgent
- **status**: open, in_progress, waiting_for_user, resolved, closed
- **category**: bug, feature_request, integration_issue, billing, general, technical_support
- **user_email**: User's email for notifications
- **user_name**: User's display name
- **system_info**: Browser and system details
- **error_details**: JSON field for error information
- **attachments**: JSON field for file attachments
- **tags**: Array of tags for categorization
- **internal_notes**: Staff-only notes
- **resolution**: Resolution details
- **timestamps**: created_at, updated_at, resolved_at, closed_at

### Support Ticket Responses Table
- **id**: Unique identifier
- **ticket_id**: Reference to parent ticket
- **user_id**: User who created the response
- **is_staff_response**: Boolean to distinguish staff vs user responses
- **message**: Response content
- **attachments**: JSON field for file attachments
- **internal_notes**: Staff-only notes
- **timestamps**: created_at, updated_at

## Environment Variables Required

Add these to your `.env.local` file:

```bash
# Support Email Configuration
SUPPORT_EMAIL=support@yourdomain.com

# Base URL for admin links
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# Resend API Key (for email notifications)
RESEND_API_KEY=re_...
```

## Setup Instructions

### 1. Run Database Migration
```bash
# Apply the migration to create the support tickets tables
psql -d your_database -f db/migrations/create_support_tickets_table.sql
```

### 2. Configure Email Notifications
- Set up Resend account at https://resend.com
- Add your Resend API key to environment variables
- Configure your support email address

### 3. Update Navigation
Add the support link to your sidebar navigation in `components/layout/Sidebar.tsx`:

```typescript
{
  name: "Support",
  href: "/support",
  icon: HelpCircle,
  minRole: "free"
}
```

## Features

### For Users
- **Create Tickets**: Easy ticket creation with categories and priority
- **Track Progress**: Real-time status updates
- **Add Responses**: Continue conversations with support team
- **View History**: See all past tickets and responses
- **Email Notifications**: Get notified of ticket updates

### For Support Team
- **Email Alerts**: Instant notifications for new tickets and responses
- **Ticket Management**: Full CRUD operations on tickets
- **Status Tracking**: Update ticket status and priority
- **Internal Notes**: Add private notes for team members
- **Admin Panel**: Dedicated admin interface (to be created)

### Ticket Categories
- **Bug Report**: Report software bugs and issues
- **Feature Request**: Request new features
- **Integration Issue**: Problems with third-party integrations
- **Billing**: Payment and subscription issues
- **General**: General questions and inquiries
- **Technical Support**: Technical assistance needed

### Priority Levels
- **Low**: Minor issues, non-urgent
- **Medium**: Standard issues
- **High**: Important issues affecting workflow
- **Urgent**: Critical issues requiring immediate attention

### Status Tracking
- **Open**: New ticket created
- **In Progress**: Support team is working on it
- **Waiting for User**: Waiting for user response
- **Resolved**: Issue has been resolved
- **Closed**: Ticket closed (no further action needed)

## API Endpoints

### Tickets
- `GET /api/support/tickets` - List user's tickets
- `POST /api/support/tickets` - Create new ticket
- `GET /api/support/tickets/[id]` - Get ticket details
- `PUT /api/support/tickets/[id]` - Update ticket
- `DELETE /api/support/tickets/[id]` - Delete ticket

### Responses
- `GET /api/support/tickets/[id]/responses` - Get ticket responses
- `POST /api/support/tickets/[id]/responses` - Add response to ticket

## Security Features

- **Row Level Security**: Users can only access their own tickets
- **Admin Policies**: Admins can access all tickets
- **Input Validation**: Server-side validation for all inputs
- **Rate Limiting**: Built-in protection against spam
- **Email Verification**: Only authenticated users can create tickets

## Email Templates

The system sends professional email notifications for:
- New ticket creation
- User responses to tickets
- Status updates (when implemented)

## Customization Options

### Styling
- Update colors and themes in the components
- Modify the priority and status color schemes
- Customize the ticket card layouts

### Categories and Priorities
- Add new categories in the database schema
- Modify priority levels as needed
- Update the frontend selectors

### Email Templates
- Customize email content in the API routes
- Add more notification types
- Implement status update emails

## Admin Panel (Future Enhancement)

Consider creating an admin panel with:
- **Ticket Dashboard**: Overview of all tickets
- **Staff Management**: Assign tickets to team members
- **Analytics**: Ticket metrics and trends
- **Bulk Operations**: Mass update tickets
- **Knowledge Base**: FAQ and documentation integration

## Testing

### Test Scenarios
1. **Create Ticket**: Test ticket creation with different categories
2. **Add Response**: Test user and staff responses
3. **Status Updates**: Test ticket status changes
4. **Email Notifications**: Verify email delivery
5. **Security**: Test user access restrictions

### Test Data
```sql
-- Insert test ticket
INSERT INTO support_tickets (
  user_id, subject, description, priority, category, user_email
) VALUES (
  'user-uuid', 'Test Ticket', 'This is a test ticket', 'medium', 'general', 'test@example.com'
);
```

## Monitoring and Maintenance

### Database Maintenance
- Monitor ticket volume and performance
- Archive old tickets periodically
- Clean up orphaned responses

### Email Monitoring
- Monitor email delivery rates
- Set up email bounce handling
- Configure email templates

### Performance Optimization
- Add database indexes for common queries
- Implement pagination for large ticket lists
- Cache frequently accessed data

## Support and Troubleshooting

### Common Issues
1. **Email Not Sending**: Check Resend API key and configuration
2. **Database Errors**: Verify migration was applied correctly
3. **Permission Errors**: Check RLS policies and user roles

### Debugging
- Check browser console for frontend errors
- Monitor server logs for API errors
- Verify database connections and permissions

The support ticketing system is now ready to handle user inquiries and provide excellent customer support! 🎉 