# ChainReact Learning Folder

This folder serves as the single source of truth for all template references, component walkthroughs, and "what's happening" logs in the ChainReact application.

## Folder Structure

### `templates/`
All moved template code files. This includes reusable components, UI patterns, and code examples that serve as templates for development.

**Process for adding new templates:**
1. Place the template file in the appropriate subdirectory under `templates/`
2. Preserve the original file path structure when moving
3. Add a top-line comment linking to its documentation: `// See learning/walkthroughs/[ComponentName].md for details`
4. Update any import paths if necessary
5. Create corresponding documentation in `docs/` and walkthrough in `walkthroughs/`

### `docs/`
Markdown documentation explaining template usage, props, and configuration examples. Each doc should include frontmatter with:
- `title`: Component name and brief description
- `date`: Creation/update date
- `component`: Component name for categorization

### `walkthroughs/`
Per-component deep-dive documentation (one MDX or MD per component) describing:
- Internal logic and data flow
- Integration points with other components
- State management patterns
- Performance considerations
- Common use cases and examples

### `logs/`
Running log files where major design or architectural changes are recorded. Uses `[YYYY-MM-DD] – Summary` format for entries.

**Logging Convention:**
- When a component's API changes, append a dated entry to `logs/CHANGELOG.md`
- Include summary of changes and link to relevant PR or issue
- Document breaking changes, new features, and deprecations

### `assets/`
Diagrams, screenshots, and other visual assets referenced in documentation and walkthroughs.

## Adding New Templates

1. **Code Placement**: Move template files to `learning/templates/` preserving their paths
2. **Documentation**: Create corresponding `.md` files in `docs/` with frontmatter
3. **Walkthrough**: Create detailed walkthrough in `walkthroughs/` explaining implementation
4. **Instrumentation**: Add top-line comment in template file pointing to walkthrough
5. **Logging**: Update `logs/CHANGELOG.md` with any significant changes