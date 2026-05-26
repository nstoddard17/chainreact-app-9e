# PACKAGES.md — chainreact-v2

**Living document — update on every `npm install` / `npm uninstall`.**

Source of truth: [package.json](./package.json). This file groups dependencies by purpose so we can quickly answer "do we use X?" without grepping the lockfile.

When in doubt, run `npm ls <pkg>` to confirm a transitive dependency.

---

## How to keep this current

1. After adding/removing a package, update the matching section below.
2. List the package, its declared version range from `package.json`, and a one-line "what it does for us" note.
3. If a package moves between categories (e.g. dev → runtime), move its row too.
4. Don't list transitive deps here — only what's in `package.json`. Use the lockfile / `npm ls` for transitives.

---

## Audit history

| Date | Advisory | Result |
|------|----------|--------|
| 2026-05-14 | TanStack GHSA-g7cv-rxg3-hmpx (42 `@tanstack/*` packages w/ credential-exfil malware) | ✅ Not affected — zero `@tanstack/*` in deps or lockfile |

---

## Runtime dependencies

### Next.js + React core
| Package | Version | Purpose |
|---------|---------|---------|
| `next` | ^15.1.0 | App Router framework |
| `react` | ^19.0.0 | UI runtime |
| `react-dom` | ^19.0.0 | DOM renderer |

### Database / state
| Package | Version | Purpose |
|---------|---------|---------|
| `@supabase/ssr` | ^0.5.2 | Supabase SSR client (cookies-based auth) |
| `@supabase/supabase-js` | ^2.47.0 | Supabase client |
| `zustand` | ^5.0.2 | Client state |

### UI / styling
| Package | Version | Purpose |
|---------|---------|---------|
| `clsx` | ^2.1.1 | Conditional className joiner |
| `tailwind-merge` | ^2.5.5 | Resolves Tailwind class conflicts |
| `class-variance-authority` | ^0.7.1 | Variant API for components |
| `lucide-react` | ^0.469.0 | Icon set |

### Validation
| Package | Version | Purpose |
|---------|---------|---------|
| `zod` | ^3.24.1 | Schema validation |

---

## Dev dependencies

### TypeScript + types
| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | ^5.7.2 | Compiler |
| `@types/node` | ^22.10.2 | Node types |
| `@types/react` | ^19.0.2 | React types |
| `@types/react-dom` | ^19.0.2 | React DOM types |
| `@types/jest` | ^29.5.14 | Jest types |

### Styling pipeline
| Package | Version | Purpose |
|---------|---------|---------|
| `tailwindcss` | ^3.4.17 | CSS framework |
| `postcss` | ^8.4.49 | CSS transformer |
| `autoprefixer` | ^10.4.20 | PostCSS vendor prefix plugin |
| `tailwindcss-animate` | ^1.0.7 | Tailwind animation utilities |

### Linting
| Package | Version | Purpose |
|---------|---------|---------|
| `eslint` | ^9.17.0 | Linter |
| `@eslint/js` | ^9.17.0 | ESLint JS configs |
| `@eslint/eslintrc` | ^3.2.0 | ESLint config compat |
| `@typescript-eslint/eslint-plugin` | ^8.18.2 | TS lint rules |
| `@typescript-eslint/parser` | ^8.18.2 | TS lint parser |
| `eslint-plugin-react` | ^7.37.3 | React lint rules |
| `eslint-plugin-react-hooks` | ^5.1.0 | React Hooks lint rules |
| `@next/eslint-plugin-next` | ^15.1.0 | Next.js lint rules |
| `globals` | ^15.14.0 | ESLint env globals |

### Testing
| Package | Version | Purpose |
|---------|---------|---------|
| `jest` | ^29.7.0 | Unit test runner |
| `jest-environment-jsdom` | ^29.7.0 | DOM env for component tests |
| `ts-jest` | ^29.2.5 | TS transformer for Jest |
| `@testing-library/react` | ^16.1.0 | React component testing |
| `@testing-library/jest-dom` | ^6.6.3 | DOM matcher extensions |
| `@testing-library/user-event` | ^14.5.2 | User-event simulation |
| `@playwright/test` | ^1.49.1 | E2E test runner |
