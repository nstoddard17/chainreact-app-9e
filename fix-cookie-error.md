# Fix Cookie Parsing Error

The "base64-eyJ..." cookie parsing error indicates corrupted authentication cookies. Here's how to fix it:

## Option 1: Clear All Browser Data (Recommended)
1. Open Chrome/Edge DevTools (F12)
2. Go to Application tab
3. In the left sidebar, under Storage, click "Clear site data"
4. Or manually:
   - Click on Cookies → http://localhost:3000
   - Delete ALL cookies
   - Click on Local Storage → http://localhost:3000
   - Clear all items
   - Click on Session Storage → http://localhost:3000
   - Clear all items

## Option 2: Use Incognito/Private Window
Simply open a new incognito/private browser window and navigate to http://localhost:3000

## Option 3: Clear via Console
Run this in browser console:
```javascript
// Clear all cookies for localhost
document.cookie.split(";").forEach(function(c) { 
  document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
});

// Clear storage
localStorage.clear();
sessionStorage.clear();

// Clear auth-specific items
localStorage.removeItem('supabase.auth.token');
localStorage.removeItem('chainreact-auth');
localStorage.removeItem('auth-storage');

console.log("All cookies and storage cleared! Please refresh the page.");
```

## Option 4: Restart Dev Server
1. Stop the dev server (Ctrl+C)
2. Clear Next.js cache: `rm -rf .next`
3. Start fresh: `npm run dev`

After clearing cookies/cache, the authentication should work properly again.