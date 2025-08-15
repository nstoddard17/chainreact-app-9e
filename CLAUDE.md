# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

ChainReact is a workflow automation platform built with Next.js 15, TypeScript, and Supabase. The application allows users to create, manage, and execute automated workflows that integrate with various third-party services like Gmail, Discord, Notion, Slack, and more.

## Development Commands

### Building and Running
```bash
npm run build           # Build for production
npm run build:analyze   # Build with bundle analysis
npm run dev            # Start development server
npm run dev:turbo      # Start development server with Turbo
npm start              # Start production server
npm run lint           # Run ESLint
```

### Token Management
```bash
npm run refresh-tokens              # Refresh expired integration tokens
npm run refresh-tokens:dry-run      # Test token refresh without changes
npm run refresh-tokens:verbose      # Refresh with detailed logging
npm run refresh-tokens:batch       # Batch refresh (50 tokens, 10 per batch)
npm run fix-integrations           # Fix problematic integrations
```

## Architecture Overview

### Core Structure
- **Next.js App Router**: Full-stack application using React Server Components
- **Supabase Backend**: PostgreSQL database with real-time subscriptions
- **Authentication**: Supabase Auth with OAuth integrations
- **State Management**: Zustand stores for client-side state
- **UI Framework**: Tailwind CSS with Shadcn/UI components
- **Workflow Engine**: Custom execution engine with node-based workflows

### Key Directories

#### `/app` - Next.js App Router
- API routes for all backend functionality
- Page components and layouts
- Route handlers for integrations, webhooks, workflows

#### `/components` - React Components
- **UI Components**: Reusable components in `/ui` (Shadcn/UI based)
- **Feature Components**: Domain-specific components (workflows, integrations, auth)
- **Layout Components**: AppLayout, Sidebar, TopBar

#### `/lib` - Core Logic
- **Database**: Schema definitions and database utilities
- **Integrations**: OAuth providers, token management, API clients
- **Workflows**: Execution engine, node definitions, configuration
- **Auth**: Authentication utilities and middleware
- **Security**: Encryption, token management, compliance

#### `/stores` - State Management
- Zustand stores for different domains (auth, workflows, integrations)
- Client-side caching and data synchronization

#### `/hooks` - Custom React Hooks
- Integration-specific hooks
- Authentication and permissions
- Workflow and execution management

### Database Schema
Key entities managed through Supabase:
- **Users**: User accounts and profiles
- **Integrations**: OAuth connections to third-party services
- **Workflows**: Node-based automation configurations
- **Executions**: Workflow run history and results
- **Organizations**: Team and collaboration features

### Integration System
The platform supports 20+ integrations including:
- **Communication**: Gmail, Slack, Discord, Microsoft Teams
- **Productivity**: Notion, Google Drive, OneDrive, Trello
- **Business**: HubSpot, Stripe, Airtable, Shopify
- **Social**: Facebook, Twitter, LinkedIn, Instagram

Each integration follows a standard pattern:
1. OAuth authentication flow
2. Token management and refresh
3. API client implementation
4. Webhook handling (where supported)

### Workflow Engine
- **Node-based**: Visual workflow builder using @xyflow/react
- **Execution**: Asynchronous execution with retry logic
- **Scheduling**: Cron jobs and delayed execution support
- **Real-time**: Live collaboration and execution monitoring

## Configuration Notes

### Environment Variables
Required for development:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- Integration-specific OAuth credentials (Google, Microsoft, etc.)

### Cursor Rules
The project includes comprehensive Cursor rules in `.cursor/rules/`:
- **howtocoderules.mdc**: Full-stack development standards
- **learningrules.mdc**: Documentation and learning folder management

### Learning Folder
The `/learning` directory serves as the single source of truth for:
- Component templates and documentation
- Implementation walkthroughs
- Change logs and architectural decisions

## Key Patterns

### Error Handling
- Early returns and guard clauses
- Custom error types for integration failures
- Comprehensive logging and monitoring

### Security
- Token encryption using AES-256
- Row-level security (RLS) policies in Supabase
- Input validation with Zod schemas

### Performance
- React Server Components where possible
- Dynamic imports for code splitting
- Image optimization with WebP/AVIF formats
- Caching strategies for integration data

### Testing
Tests should be written using Jest and React Testing Library when implementing new features. Check existing test patterns in the codebase before writing new tests.

## Integration Development

When adding new integrations:
1. Create OAuth configuration in `/lib/integrations/oauthConfig.ts`
2. Implement API client in `/lib/integrations/[provider].ts`
3. Add workflow actions in `/lib/workflows/actions/[provider]/`
4. Create UI components for configuration
5. Add webhook support if available
6. Update available integrations list

## Workflow Node Development

New workflow nodes should:
1. Follow the pattern in `/lib/workflows/availableNodes.ts`
2. Implement proper TypeScript types
3. Include configuration validation
4. Support variable resolution
5. Handle errors gracefully
6. Provide clear user feedback

## Security Considerations

- Never log or expose access tokens
- Use encrypted token storage
- Implement proper scope validation
- Follow OAuth best practices
- Maintain audit logs for sensitive operations