# Scripts Directory

This directory contains production scripts and utilities for the ChainReact application.

## Organization

```
scripts/
├── trash/              # One-off scripts (migrations, fixes) - can be deleted
├── test-integrations/  # Integration testing framework
└── *.{js,ts,cjs,mjs}  # Production scripts
```

## Production Scripts

### Development Tools
- **build-local.js** - Local production build testing
- **dev-fast.js** - Fast development server with Turbopack
- **logs.cjs** - Log viewer utility (supports multiple commands)

### Provider/Integration Management
- **provider-cli.ts** - CLI for managing integration providers
  - Generate new providers
  - List available providers
  - Test provider implementations
  - Validate provider configurations
- **check-integrations.ts** - Integration health check utility

### Billing & Stripe
- **setup-stripe-prices.ts** - Initial Stripe price configuration
- **setup-stripe-tax.ts** - Stripe tax setup
- **update-stripe-prices.ts** - Update existing Stripe pricing

### Node Validation & Documentation
- **validate-all-nodes.ts** - Validates all workflow nodes for completeness
- **report-node-outputs.ts** - Reports nodes missing output schemas
- **list-node-inventory.ts** - Generates node inventory documentation

### Testing
- **test-integrations/** - Integration testing framework
  - action-tester.ts
  - trigger-tester.ts
  - test-runner.ts
  - test-config.ts
  - report-generator.ts

## Usage

Most scripts can be run with:
```bash
npm run <script-name>
```

Check `package.json` for available script commands.

## Creating New Scripts

### For Production/Recurring Scripts:
Place directly in `/scripts` directory and add to this README.

### For One-Off Scripts (migrations, fixes, debug):
**IMPORTANT:** Place in `/scripts/trash` directory immediately after creation.

Examples of one-off scripts:
- Database migrations
- Schema fixes
- Data transformations
- Bug-specific debug scripts
- Template/workflow cleanup

**Rule:** If the script will only be run once, put it in `/scripts/trash`

## Maintenance

### Regular Tasks:
- **MONTHLY:** Check and clean `/scripts/trash` folder
- **Review scripts** periodically for relevance
- **Update this README** when adding new production scripts
- **Remove scripts** no longer referenced in package.json or documentation

### Trash Folder Cleanup:
```bash
# Check trash folder size
ls scripts/trash | wc -l  # Unix
dir scripts\trash | find /c /v ""  # Windows

# Clean if 5+ files or monthly
```

**ACTION REQUIRED:** If `/scripts/trash` has 5+ files, clean it out:
- Review each script to confirm it's been run
- Delete all one-off scripts
- Keep only the README.md
- Update "Last Cleanup" date in trash/README.md

See [trash/README.md](trash/README.md) for cleanup instructions.

---

**Last Updated:** January 2026
