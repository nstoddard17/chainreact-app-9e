# ChainReact Development Guide

Fast local development and instant production testing without waiting for Vercel.

---

## 🚀 Quick Start

```bash
# Standard development (recommended for most work)
npm run dev

# Super-fast development with Turbopack (10x faster builds)
npm run dev:fast

# Local production build + serve (test production behavior instantly)
npm run build:local

# Local production with auto-rebuild on changes
npm run build:local:watch
```

---

## 🎯 Which Script Should I Use?

### Standard Development: `npm run dev`
**Use when:**
- Normal feature development
- You need full type checking
- You want all Next.js features enabled

**Speed:** Normal
**Type Checking:** ✅ Enabled
**Hot Reload:** ✅ Enabled

---

### Fast Development: `npm run dev:fast`
**Use when:**
- Iterating quickly on UI/UX
- You don't need immediate type checking
- You want maximum speed

**Speed:** ⚡ 10x faster (Turbopack)
**Type Checking:** ❌ Disabled (run `npm run lint` manually)
**Hot Reload:** ✅ Enabled
**Memory:** 4GB allocated

**Perfect for:**
- Component styling and layout work
- Rapid prototyping
- Working on features where you'll check types later

---

### Local Production Build: `npm run build:local`
**Use when:**
- Testing production behavior locally
- Verifying build passes before deploying
- Testing production optimizations (minification, etc.)
- **Want instant results instead of waiting 2-5min for Vercel**

**Speed:** ⚡ Instant compared to Vercel deployment
**Environment:** Production
**Port:** 3001 (doesn't conflict with dev server)

**Workflow:**
1. Make changes to your code
2. Run `npm run build:local`
3. Server starts on http://localhost:3001
4. Test production behavior immediately
5. Iterate without deploying to Vercel every time

**Time Savings:**
- Vercel deployment: 2-5 minutes
- Local production build: 30-60 seconds
- **Save 1.5-4.5 minutes per test!**

---

### Local Production with Watch: `npm run build:local:watch`
**Use when:**
- Testing production behavior while making changes
- Need auto-rebuild on file changes
- Want production mode but with fast iteration

**Speed:** ⚡ Auto-rebuilds on changes
**Environment:** Production
**Port:** 3001

**Watches:**
- `app/**/*`
- `components/**/*`
- `lib/**/*`
- `stores/**/*`

**Note:** Still slower than dev mode, but faster than deploying to Vercel repeatedly.

---

## 📊 Performance Comparison

| Task | Standard Dev | Fast Dev | Local Prod | Vercel Deploy |
|------|-------------|----------|------------|---------------|
| Initial Start | 10-15s | 3-5s | 30-60s | 2-5min |
| Hot Reload | 1-2s | 0.1-0.5s | N/A | N/A |
| Type Checking | Always | Manual | Build-time | Build-time |
| Production Testing | ❌ | ❌ | ✅ | ✅ |
| Auto-rebuild | ✅ | ✅ | Optional | ❌ |

---

## 🎨 Development Workflow Recommendations

### Feature Development Flow
```bash
# 1. Start fast dev server
npm run dev:fast

# 2. Build features quickly without type checking overhead
# ... code, code, code ...

# 3. When ready to test, run type checking
npm run lint

# 4. Fix any type errors
# ... fix, fix, fix ...

# 5. Test production build locally before pushing
npm run build:local

# 6. If production build passes, commit and push
git add .
git commit -m "feat: new feature"
git push
```

### Bug Fix Flow
```bash
# 1. Use standard dev for full type safety
npm run dev

# 2. Fix bug with type checking enabled
# ... fix bug ...

# 3. Test fix in production mode
npm run build:local

# 4. Verify fix works in production
# ... test on localhost:3001 ...

# 5. Push fix
git push
```

### UI/Styling Flow
```bash
# Use fast dev - no need for type checking when styling
npm run dev:fast

# Iterate on designs super quickly
# ... style, style, style ...

# When done, run build to verify
npm run build:local
```

---

## 🔧 Optimization Features Implemented

### Page-Level Optimizations
✅ Removed duplicate data fetching on all pages
✅ Added lazy loading for integrations panel
✅ Deferred settings data until section is active
✅ Combined team API calls (2 → 1 request)
✅ Added double-fetch prevention guards
✅ Optimized PagePreloader with skip flags

### Code Splitting
✅ Lazy-loaded ~9,500 lines of code:
- AI Assistant Content (1,881 lines)
- Airtable Configuration (3,723 lines)
- Email Rich Text Editor (2,387 lines)
- Admin Content (1,553 lines)

### Route Prefetching
✅ Smart prefetching on hover/focus
✅ Automatic prefetching based on current page
✅ Applied to all navigation links

### Bundle Optimizations
✅ React 19 compiler enabled
✅ CSS optimization enabled
✅ Font optimization enabled
✅ Package imports optimized (date-fns, zod, @xyflow/react)

### PWA Support
✅ Installable as app on mobile/desktop
✅ App shortcuts for common actions
✅ Offline support ready

### Performance Monitoring
✅ Core Web Vitals tracking (LCP, FID, CLS, FCP, TTFB, INP)
✅ Performance tracking utilities
✅ Development logging with ratings

---

## 🐛 Troubleshooting

### Fast Dev Script Issues

**Type errors not showing:**
- This is expected! Run `npm run lint` to see type errors.

**Port already in use:**
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9
```

### Local Production Script Issues

**Port 3001 already in use:**
```bash
# Kill process on port 3001
lsof -ti:3001 | xargs kill -9
```

**Build fails:**
- Fix any type errors first: `npm run lint`
- Check for any missing dependencies: `npm install`

**Watch mode not detecting changes:**
- Make sure you're editing files in watched directories:
  - `app/`, `components/`, `lib/`, `stores/`
- Restart the watch script

---

## 📈 Performance Tips

### Localhost Development Speed
1. **Use Turbopack** - `npm run dev:fast` for 10x faster builds
2. **Close unused apps** - Free up memory for faster builds
3. **Use SSD** - Faster file system = faster builds
4. **Increase Node memory** - Already set to 4GB in fast dev script

### Testing Production Behavior
1. **Always test locally first** - Use `npm run build:local` before deploying
2. **Catch errors early** - Local builds are faster than Vercel failures
3. **Iterate faster** - No waiting for Vercel, test immediately

### General Performance
1. **Keep dependencies updated** - Newer versions are often faster
2. **Clear Next.js cache** - Delete `.next` folder if builds feel slow
3. **Restart dev server** - Sometimes it helps to start fresh

---

## 🎯 Summary

**Daily Development:**
- `npm run dev:fast` - Maximum speed for most work
- `npm run lint` - Check types periodically

**Before Committing:**
- `npm run build:local` - Verify production build
- `npm run lint` - Ensure no type errors

**Production Testing:**
- `npm run build:local` - Test production locally
- http://localhost:3001 - Access local production server

**Time Saved:**
- Per production test: **1.5-4.5 minutes**
- Per day (10 tests): **15-45 minutes**
- Per week (50 tests): **1.25-3.75 hours**

---

## 📚 Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Turbopack Documentation](https://nextjs.org/docs/architecture/turbopack)
- [Web Vitals](https://web.dev/vitals/)
- [ChainReact CLAUDE.md](./CLAUDE.md) - Development guidelines
