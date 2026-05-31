# PACKAGES.md — chainreact-app-9e

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

### AI / LLM
| Package | Version | Purpose |
|---------|---------|---------|
| `@ai-sdk/openai` | latest | Vercel AI SDK OpenAI provider |
| `@anthropic-ai/sdk` | ^0.64.0 | Anthropic Claude API client (lazy-init via `lib/ai/anthropic-client.ts`) |
| `@google/generative-ai` | ^0.24.1 | Google Gemini API client |
| `ai` | ^5.0.56 | Vercel AI SDK core |
| `openai` | latest | OpenAI API client (lazy-init via `lib/ai/openai-client.ts`) |

### Next.js + React core
| Package | Version | Purpose |
|---------|---------|---------|
| `next` | ^15.5.2 | App Router framework |
| `react` | ^19 | UI runtime |
| `react-dom` | ^19 | DOM renderer |
| `react-is` | ^19.1.1 | React type guards |
| `react-markdown` | ^10.1.0 | Markdown rendering (AI assistant, docs) |
| `nextjs-toploader` | ^3.9.17 | Route-change progress bar |
| `server-only` | latest | Server-bundle guard |
| `web-vitals` | ^5.1.0 | CWV measurement |

### UI primitives (Radix)
All `@radix-ui/react-*` — unstyled, accessible primitives consumed by shadcn/ui components in `components/ui/`. Pinned to `latest` (versions resolved per install).

`@radix-ui/react-accordion`, `react-alert-dialog`, `react-aspect-ratio`, `react-avatar`, `react-checkbox`, `react-collapsible`, `react-context-menu`, `react-dialog`, `react-dropdown-menu`, `react-hover-card`, `react-label`, `react-menubar`, `react-navigation-menu`, `react-popover`, `react-progress`, `react-radio-group`, `react-scroll-area`, `react-select`, `react-separator`, `react-slider`, `react-slot`, `react-switch`, `react-tabs`, `react-toast`, `react-toggle`, `react-toggle-group`, `react-tooltip`

### UI helpers / styling
| Package | Version | Purpose |
|---------|---------|---------|
| `class-variance-authority` | ^0.7.1 | Variant API for components |
| `clsx` | ^2.1.1 | Conditional className joiner |
| `tailwind-merge` | ^2.5.5 | Resolves Tailwind class conflicts |
| `tailwindcss-animate` | ^1.0.7 | Tailwind animation utilities |
| `framer-motion` | ^12.23.24 | Animation library |
| `lucide-react` | ^0.454.0 | Icon set |
| `next-themes` | latest | Dark/light theme toggle |
| `sonner` | latest | Toast notifications |
| `vaul` | latest | Drawer primitive |
| `cmdk` | ^1.1.1 | Command palette primitive |
| `embla-carousel-react` | latest | Carousel |
| `react-day-picker` | latest | Date picker |
| `input-otp` | latest | OTP input |
| `react-grid-layout` | ^2.2.2 | Dashboard grid layout |
| `react-resizable` | ^3.1.3 | Resizable panes |
| `react-resizable-panels` | latest | Split-pane primitive |
| `recharts` | latest | Charts |
| `canvas-confetti` | ^1.9.4 | Celebration confetti |

### Forms + validation
| Package | Version | Purpose |
|---------|---------|---------|
| `react-hook-form` | latest | Form state |
| `@hookform/resolvers` | ^5.0.1 | RHF ↔ Zod bridge |
| `zod` | ^3.25.76 | Schema validation (used everywhere — handler configs, API payloads) |

### Workflow builder
| Package | Version | Purpose |
|---------|---------|---------|
| `@xyflow/react` | latest | Node-based workflow canvas |
| `dagre` | ^0.8.5 | Auto-layout graph |
| `jexl` | ^2.3.0 | Expression evaluation in workflow conditions |
| `immer` | latest | Immutable state updates (Zustand) |
| `zustand` | latest | Client state |

### Database / storage
| Package | Version | Purpose |
|---------|---------|---------|
| `@supabase/ssr` | latest | Supabase SSR client (cookies-based auth) |
| `@supabase/supabase-js` | latest | Supabase client |
| `@prisma/client` | latest | Prisma ORM client (limited use) |
| `@upstash/redis` | ^1.37.0 | Redis client (rate limiting, caching) |
| `lru-cache` | ^11.1.0 | In-memory LRU cache |

### Integrations
| Package | Version | Purpose |
|---------|---------|---------|
| `@microsoft/microsoft-graph-client` | ^3.0.7 | Outlook / OneDrive / Teams |
| `@slack/web-api` | latest | Slack actions |
| `discord.js` | ^14.22.1 | Discord bot + gateway |
| `googleapis` | ^152.0.0 | Gmail / Drive / Calendar / Sheets |
| `twilio` | ^5.3.7 | SMS notifications |
| `stripe` | latest | Stripe server SDK (lazy-init via `lib/stripe/client.ts`) |
| `@stripe/stripe-js` | ^7.8.0 | Stripe client SDK (checkout) |
| `resend` | ^4.8.0 | Transactional email |
| `@react-email/components` | ^0.5.0 | Email template components |
| `@react-email/render` | ^1.2.0 | Email HTML renderer |

### Networking / WebSocket
| Package | Version | Purpose |
|---------|---------|---------|
| `ws` | ^8.18.3 | WebSocket client/server |
| `bufferutil` | ^4.0.9 | ws perf addon |
| `utf-8-validate` | ^6.0.5 | ws perf addon |
| `node-fetch` | ^3.3.2 | Server-side fetch (legacy paths) |
| `isomorphic-fetch` | ^3.0.0 | Universal fetch shim |
| `form-data` | ^4.0.4 | multipart/form-data builder |

### Document processing
| Package | Version | Purpose |
|---------|---------|---------|
| `cheerio` | ^1.1.2 | HTML parsing |
| `turndown` | ^7.2.2 | HTML → Markdown |
| `dompurify` | ^3.3.1 | HTML sanitization |
| `papaparse` | ^5.5.3 | CSV parser |
| `xlsx` | sheetjs CDN tarball 0.20.3 | XLSX read (CVE-pinned to CDN build) |
| `exceljs` | ^3.4.0 | XLSX write |
| `pdf-parse` | ^1.1.1 | PDF text extraction |
| `qrcode` | ^1.5.4 | QR code generation |
| `puppeteer-core` | ^24.18.0 | Headless Chrome (lightweight) |
| `@sparticuz/chromium` | ^133.0.0 | Chromium binary for Vercel |

### Crypto / utility
| Package | Version | Purpose |
|---------|---------|---------|
| `aes256` | latest | Token encryption at rest |
| `date-fns` | ^4.1.0 | Date manipulation |
| `cron-parser` | ^4.9.0 | Parse cron expressions (scheduler) |
| `node-cron` | ^4.2.1 | In-process cron runner (dev / local) |

### Telemetry
| Package | Version | Purpose |
|---------|---------|---------|
| `@opentelemetry/api` | ^1.9.0 | OTel instrumentation hooks |

### Build helpers
| Package | Version | Purpose |
|---------|---------|---------|
| `autoprefixer` | ^10.4.20 | PostCSS vendor prefix plugin |

### Loose `@types/*` (declared in dependencies)
`@types/dagre`, `@types/dompurify`, `@types/papaparse`, `@types/qrcode`, `@types/ws` — kept under dependencies because some runtime code references them. Consider moving to devDependencies in a future cleanup PR.

---

## Optional dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `puppeteer` | ^24.18.0 | Full puppeteer (local dev / scripts) |
| `pyodide` | ^0.29.0 | In-process Python runtime for AI code execution |

---

## Dev dependencies

### Testing
| Package | Version | Purpose |
|---------|---------|---------|
| `jest` | ^29.7.0 | Unit test runner |
| `jest-environment-jsdom` | ^29.7.0 | DOM env for component tests |
| `jest-fetch-mock` | ^3.0.3 | fetch() mocking |
| `ts-jest` | ^29.3.4 | TS transformer for Jest |
| `@testing-library/dom` | ^10.4.0 | DOM queries |
| `@testing-library/react` | ^16.3.0 | React component testing |
| `@playwright/test` | ^1.52.0 | E2E test runner |
| `playwright` | ^1.52.0 | Browser automation |
| `@axe-core/playwright` | ^4.11.2 | A11y assertions in Playwright |

### Tooling
| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | ^5.8.3 | Compiler |
| `tsx` | ^4.20.3 | TS script runner (used by `scripts/`) |
| `eslint` | ^9.28.0 | Linter |
| `eslint-config-next` | ^15.3.5 | Next.js lint preset |
| `@eslint/eslintrc` | ^3.3.1 | ESLint config compat |
| `cross-env` | ^10.1.0 | Cross-platform env vars in scripts |
| `dotenv` | ^17.4.2 | .env loader for scripts |
| `rimraf` | ^6.1.2 | Cross-platform `rm -rf` |
| `critters` | ^0.0.25 | Critical CSS inliner (Next.js) |
| `tailwindcss` | ^3.4.17 | CSS framework |
| `postcss` | ^8.5.6 | CSS transformer |
| `pg` | ^8.13.1 | Postgres client (scripts only) |

### Dev-only types
`@types/canvas-confetti`, `@types/jest`, `@types/node`, `@types/pg`, `@types/react`, `@types/react-dom`, `@types/uuid`
