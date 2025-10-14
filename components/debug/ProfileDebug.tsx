"use client"

import { useAuthStore } from "@/stores/authStore"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RefreshCw, User, Mail, Crown } from "lucide-react"
import { supabase } from "@/utils/supabaseClient"

import { logger } from '@/lib/utils/logger'

export default function ProfileDebug() {
  const { user, profile, initialize } = useAuthStore()

  const refreshProfile = async () => {
    logger.debug("🔄 Manually refreshing profile...")
    await initialize()
  }

  const checkDatabaseProfile = async () => {
    if (!user?.id) return
    
    try {
      logger.debug("🔍 Checking database profile for user:", user.id)
      
      // Try with role column
      logger.debug("1. Trying query with role column...")
      const { data: withRole, error: withRoleError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      
      logger.debug("With role column:", { data: withRole, error: withRoleError })
      
      // Try without role column
      logger.debug("2. Trying query without role column...")
      const { data: withoutRole, error: withoutRoleError } = await supabase
        .from('user_profiles')
        .select('id, first_name, last_name, full_name, company, job_title, username, secondary_email, phone_number, avatar_url, provider, created_at, updated_at')
        .eq('id', user.id)
        .single()
      
      logger.debug("Without role column:", { data: withoutRole, error: withoutRoleError })
      
      // Try minimal query
      logger.debug("3. Trying minimal query...")
      const { data: minimal, error: minimalError } = await supabase
        .from('user_profiles')
        .select('id, full_name, username')
        .eq('id', user.id)
        .single()
      
      logger.debug("Minimal query:", { data: minimal, error: minimalError })
      
      // Try without single() to see if it's a single record issue
      logger.debug("4. Trying without single()...")
      const { data: multiple, error: multipleError } = await supabase
        .from('user_profiles')
        .select('id, full_name, username')
        .eq('id', user.id)
      
      logger.debug("Multiple records query:", { data: multiple, error: multipleError })
      
      alert(`Check console for detailed database profile results. 
      
With role: ${withRoleError ? 'ERROR' : 'SUCCESS'}
Without role: ${withoutRoleError ? 'ERROR' : 'SUCCESS'}
Minimal: ${minimalError ? 'ERROR' : 'SUCCESS'}
Multiple: ${multipleError ? 'ERROR' : 'SUCCESS'}`)
    } catch (error) {
      logger.error("Error checking database profile:", error)
      alert(`Error: ${error}`)
    }
  }

  return (
    <Card className="bg-card rounded-2xl shadow-lg border border-border">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <User className="w-5 h-5" />
          <span>Profile Debug</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium mb-2">User Data</h4>
            <div className="space-y-2 text-sm">
              <div><strong>ID:</strong> {user?.id || 'Not loaded'}</div>
              <div><strong>Email:</strong> {user?.email || 'Not loaded'}</div>
              <div><strong>Name:</strong> {user?.name || 'Not loaded'}</div>
              <div><strong>First Name:</strong> {user?.first_name || 'Not loaded'}</div>
              <div><strong>Last Name:</strong> {user?.last_name || 'Not loaded'}</div>
              <div><strong>Full Name:</strong> {user?.full_name || 'Not loaded'}</div>
            </div>
          </div>
          
          <div>
            <h4 className="font-medium mb-2">Profile Data</h4>
            <div className="space-y-2 text-sm">
              <div><strong>Profile ID:</strong> {profile?.id || 'Not loaded'}</div>
              <div><strong>Username:</strong> {profile?.username || 'Not loaded'}</div>
              <div><strong>Full Name:</strong> {profile?.full_name || 'Not loaded'}</div>
              <div><strong>Company:</strong> {profile?.company || 'Not loaded'}</div>
              <div><strong>Job Title:</strong> {profile?.job_title || 'Not loaded'}</div>
              <div><strong>Provider:</strong> {profile?.provider || 'Not loaded'}</div>
              <div><strong>Role:</strong> 
                {profile?.role ? (
                  <Badge variant="secondary" className="ml-2">
                    <Crown className="w-3 h-3 mr-1" />
                    {profile.role}
                  </Badge>
                ) : (
                  'Not loaded'
                )}
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex space-x-2">
          <Button onClick={refreshProfile} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh Profile
          </Button>
          <Button onClick={checkDatabaseProfile} variant="outline" size="sm">
            <Mail className="w-4 h-4 mr-2" />
            Check Database
          </Button>
        </div>
        
        <div className="text-xs text-muted-foreground">
          Check the browser console for detailed debug information
        </div>
      </CardContent>
    </Card>
  )
} 