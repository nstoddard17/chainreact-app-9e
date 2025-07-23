# OneNote API Testing Instructions

## 🔍 Testing OneNote API with Microsoft Graph Explorer

Since we can't directly access the decrypted tokens, let's test the OneNote API using Microsoft Graph Explorer.

### 📋 Steps to Test:

1. **Go to Microsoft Graph Explorer**: https://developer.microsoft.com/en-us/graph/graph-explorer

2. **Sign in** with the same Microsoft account used for your OneNote integration

3. **Test these endpoints** one by one:

### 🔗 Test Endpoints:

#### 1. OneNote Notebooks (v1.0)
```
GET https://graph.microsoft.com/v1.0/me/onenote/notebooks
```

#### 2. OneNote Notebooks (with expand)
```
GET https://graph.microsoft.com/v1.0/me/onenote/notebooks?$expand=sections&$top=100
```

#### 3. OneNote Sections
```
GET https://graph.microsoft.com/v1.0/me/onenote/sections
```

#### 4. OneNote Pages
```
GET https://graph.microsoft.com/v1.0/me/onenote/pages
```

#### 5. OneNote Beta Notebooks
```
GET https://graph.microsoft.com/beta/me/onenote/notebooks
```

#### 6. OneDrive Root (Fallback)
```
GET https://graph.microsoft.com/v1.0/me/drive/root/children
```

#### 7. OneDrive Search for OneNote files
```
GET https://graph.microsoft.com/v1.0/me/drive/root/search(q='.onetoc2')
```

### 📊 Expected Results:

- **If OneNote API works**: You'll see notebooks, sections, and pages
- **If OneNote API fails**: You'll get 401 or 403 errors
- **OneDrive fallback**: Should show OneNote files (.onetoc2, .one)

### 🎯 What to Look For:

1. **Status Codes**:
   - `200 OK`: API is working
   - `401 Unauthorized`: Authentication issue
   - `403 Forbidden`: Permission issue
   - `404 Not Found`: Endpoint not available

2. **Response Data**:
   - `value` array with notebooks/sections/pages
   - Error messages explaining issues

### 🔧 Testing Our Application:

After testing the API endpoints, test our application:

1. **Open**: http://localhost:3000
2. **Sign in** to your account
3. **Go to Workflows**
4. **Create a new workflow**
5. **Add OneNote action** (Create Page, Create Section, etc.)
6. **Check notebook dropdown**

### 📋 Expected Application Behavior:

- ✅ **If OneNote API works**: Shows all real notebooks
- ✅ **If OneNote API fails**: Uses OneDrive fallback
- ✅ **If no notebooks exist**: Shows virtual notebook
- ✅ **New notebooks**: Appear automatically

### 🎉 Our Improvements Handle:

1. **Multiple API endpoints** with different parameters
2. **Beta API fallback** if v1.0 fails
3. **OneDrive file search** as backup
4. **Virtual notebook creation** if none exist
5. **Automatic notebook detection** for new ones

### 📝 Report Back:

Please test the Graph Explorer endpoints and let me know:
1. Which endpoints work (200 status)
2. Which endpoints fail (401/403 status)
3. What notebooks/files you see
4. Whether the application dropdown shows notebooks

This will help us understand exactly what's happening with your OneNote API access. 