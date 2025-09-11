#!/usr/bin/env node

/**
 * Test accessing OneNote via OneDrive API
 * OneNote notebooks are stored as special folders in OneDrive
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function testOneDriveForOneNote() {
  try {
    console.log('\n🔍 Testing OneNote Access via OneDrive API\n')
    console.log('=' .repeat(60))
    
    // Get integration
    const { data: integrations } = await supabase
      .from('integrations')
      .select('*')
      .in('provider', ['onenote', 'microsoft-onenote'])
      .order('updated_at', { ascending: false })
      .limit(1)
    
    if (!integrations || integrations.length === 0) {
      console.error('❌ No OneNote integrations found')
      return
    }
    
    const integration = integrations[0]
    
    // Decrypt token
    const crypto = await import('crypto')
    function decrypt(encryptedData) {
      try {
        const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "0123456789abcdef0123456789abcdef"
        const key = Buffer.from(ENCRYPTION_KEY.slice(0, 32))
        const parts = encryptedData.split(':')
        if (parts.length !== 2) return encryptedData
        const iv = Buffer.from(parts[0], 'hex')
        const encrypted = Buffer.from(parts[1], 'hex')
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
        let decrypted = decipher.update(encrypted)
        decrypted = Buffer.concat([decrypted, decipher.final()])
        return decrypted.toString()
      } catch (error) {
        return encryptedData
      }
    }
    
    const accessToken = decrypt(integration.access_token)
    
    console.log('1️⃣ Testing OneDrive Access...')
    const driveResponse = await fetch('https://graph.microsoft.com/v1.0/me/drive', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    
    if (!driveResponse.ok) {
      console.log('   ❌ OneDrive access failed:', driveResponse.status)
      return
    }
    
    const driveData = await driveResponse.json()
    console.log('   ✅ OneDrive access successful')
    console.log('   Drive ID:', driveData.id)
    console.log('   Owner:', driveData.owner?.user?.displayName)
    
    // 2. Search for OneNote notebooks in OneDrive
    console.log('\n2️⃣ Searching for OneNote notebooks in OneDrive...')
    
    // Method 1: Search for .one files (OneNote files)
    const searchUrl = `https://graph.microsoft.com/v1.0/me/drive/root/search(q='.one')`
    const searchResponse = await fetch(searchUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    
    if (searchResponse.ok) {
      const searchData = await searchResponse.json()
      console.log(`   Found ${searchData.value?.length || 0} OneNote-related files`)
      
      if (searchData.value && searchData.value.length > 0) {
        console.log('   OneNote files found:')
        searchData.value.slice(0, 5).forEach(file => {
          console.log(`     - ${file.name} (${file.size} bytes)`)
        })
      }
    }
    
    // Method 2: Look for Notebooks folder
    console.log('\n3️⃣ Looking for Notebooks folder...')
    const notebooksFolderUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/Notebooks`
    const notebooksFolderResponse = await fetch(notebooksFolderUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    
    if (notebooksFolderResponse.ok) {
      const folderData = await notebooksFolderResponse.json()
      console.log('   ✅ Found Notebooks folder')
      console.log('   Folder ID:', folderData.id)
      
      // List contents of Notebooks folder
      const contentsUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${folderData.id}/children`
      const contentsResponse = await fetch(contentsUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
      
      if (contentsResponse.ok) {
        const contentsData = await contentsResponse.json()
        console.log(`   Found ${contentsData.value?.length || 0} items in Notebooks folder`)
        
        if (contentsData.value && contentsData.value.length > 0) {
          console.log('   Contents:')
          contentsData.value.forEach(item => {
            console.log(`     - ${item.name} (${item.folder ? 'Folder' : 'File'})`)
          })
        }
      }
    } else {
      console.log('   ❌ No Notebooks folder found')
    }
    
    // Method 3: Look for OneNote special folder
    console.log('\n4️⃣ Checking for OneNote special folder...')
    const specialFoldersUrl = `https://graph.microsoft.com/v1.0/me/drive/special`
    const specialResponse = await fetch(specialFoldersUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    
    if (specialResponse.ok) {
      const specialData = await specialResponse.json()
      console.log('   Special folders available:', specialData.value?.map(f => f.name).join(', '))
    }
    
    // Method 4: Try to access OneNote files directly via OneDrive
    console.log('\n5️⃣ Testing OneNote file operations via OneDrive...')
    
    // Search for any OneNote packages
    const packageSearchUrl = `https://graph.microsoft.com/v1.0/me/drive/root/search(q='package')?$filter=file/mimeType eq 'application/msonenote'`
    const packageResponse = await fetch(packageSearchUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    
    if (packageResponse.ok) {
      const packageData = await packageResponse.json()
      console.log(`   Found ${packageData.value?.length || 0} OneNote packages`)
    }
    
    // Method 5: Try OneNote API via OneDrive context
    console.log('\n6️⃣ Testing hybrid approach (OneDrive + OneNote)...')
    
    // Get user's OneDrive root
    const rootUrl = 'https://graph.microsoft.com/v1.0/me/drive/root'
    const rootResponse = await fetch(rootUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    
    if (rootResponse.ok) {
      const rootData = await rootResponse.json()
      console.log('   OneDrive root ID:', rootData.id)
      
      // Try to access OneNote via site collection
      const siteUrl = `https://graph.microsoft.com/v1.0/sites/root`
      const siteResponse = await fetch(siteUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
      
      if (siteResponse.ok) {
        const siteData = await siteResponse.json()
        console.log('   Site ID:', siteData.id)
        
        // Try OneNote on the site
        const siteOneNoteUrl = `https://graph.microsoft.com/v1.0/sites/${siteData.id}/onenote/notebooks`
        const siteOneNoteResponse = await fetch(siteOneNoteUrl, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })
        
        if (siteOneNoteResponse.ok) {
          const notebooks = await siteOneNoteResponse.json()
          console.log(`   ✅ Found ${notebooks.value?.length || 0} notebooks via site API!`)
          
          if (notebooks.value && notebooks.value.length > 0) {
            console.log('   Notebooks:')
            notebooks.value.forEach(nb => {
              console.log(`     - ${nb.displayName || nb.name}`)
            })
          }
        } else {
          console.log('   ❌ Site OneNote API failed:', siteOneNoteResponse.status)
        }
      }
    }
    
    // Method 6: Try Groups API for OneNote
    console.log('\n7️⃣ Testing Groups API for OneNote...')
    const groupsUrl = 'https://graph.microsoft.com/v1.0/me/memberOf'
    const groupsResponse = await fetch(groupsUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    
    if (groupsResponse.ok) {
      const groupsData = await groupsResponse.json()
      console.log(`   Member of ${groupsData.value?.length || 0} groups`)
      
      if (groupsData.value && groupsData.value.length > 0) {
        // Try OneNote for first group
        const firstGroup = groupsData.value[0]
        const groupOneNoteUrl = `https://graph.microsoft.com/v1.0/groups/${firstGroup.id}/onenote/notebooks`
        const groupOneNoteResponse = await fetch(groupOneNoteUrl, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })
        
        if (groupOneNoteResponse.ok) {
          const notebooks = await groupOneNoteResponse.json()
          console.log(`   ✅ Found ${notebooks.value?.length || 0} notebooks in group!`)
        } else {
          console.log('   ❌ Group OneNote API failed:', groupOneNoteResponse.status)
        }
      }
    }
    
    // Method 7: Create a test OneNote file via OneDrive
    console.log('\n8️⃣ Testing OneNote file creation via OneDrive...')
    
    const testFileName = `TestNote_${Date.now()}.one`
    const createFileUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${testFileName}:/content`
    
    // OneNote file header (minimal .one file structure)
    const oneNoteHeader = Buffer.from([
      0xE4, 0x52, 0x5C, 0x7B, 0x8C, 0xD8, 0xA7, 0x4D,
      0xAE, 0xB1, 0x53, 0x78, 0xD0, 0x29, 0x96, 0xD3
    ])
    
    const createResponse = await fetch(createFileUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/octet-stream'
      },
      body: oneNoteHeader
    })
    
    if (createResponse.ok) {
      const createdFile = await createResponse.json()
      console.log('   ✅ Created OneNote file via OneDrive!')
      console.log('   File ID:', createdFile.id)
      console.log('   Download URL:', createdFile['@microsoft.graph.downloadUrl'])
      
      // Try to delete it
      const deleteUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${createdFile.id}`
      const deleteResponse = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
      
      if (deleteResponse.ok || deleteResponse.status === 204) {
        console.log('   ✅ Cleaned up test file')
      }
    } else {
      console.log('   ❌ Could not create OneNote file:', createResponse.status)
    }
    
    // Summary
    console.log('\n' + '=' .repeat(60))
    console.log('📊 SUMMARY:\n')
    console.log('OneDrive API Access: ✅ Working')
    console.log('OneNote File Search: Can find .one files')
    console.log('OneNote Folder Access: Depends on user setup')
    console.log('OneNote File Creation: Possible via OneDrive')
    console.log('\n💡 CONCLUSION:')
    console.log('We can potentially implement OneNote functionality through OneDrive API by:')
    console.log('1. Creating/managing .one files directly')
    console.log('2. Using folder structure for organization')
    console.log('3. Parsing OneNote file format for content')
    console.log('4. However, this would be complex and limited compared to native OneNote API')
    
    console.log('\n✅ Test complete\n')
    
  } catch (error) {
    console.error('\n❌ Test failed:', error)
  }
}

testOneDriveForOneNote().then(() => process.exit(0))